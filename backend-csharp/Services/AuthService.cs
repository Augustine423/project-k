using Kzys.Backend.Data;
using Kzys.Backend.Models;
using Microsoft.EntityFrameworkCore;

namespace Kzys.Backend.Services;

public sealed record AuthUserDto(
    string Id,
    string Email,
    string? Username,
    string? FullName,
    bool NeedsUsername);

public sealed record AuthSessionDto(
    string Token,
    AuthUserDto User);

public interface IAuthService
{
    Task<AuthSessionDto> SignUpAsync(string email, string password, string? fullName, CancellationToken ct);
    Task<AuthSessionDto> SignInAsync(string email, string password, CancellationToken ct);
    Task<AuthUserDto?> GetMeAsync(string userId, CancellationToken ct);
    Task<AuthUserDto> SetUsernameAsync(string userId, string username, CancellationToken ct);
    Task<bool> AccountExistsAsync(string email, CancellationToken ct);
    Task ResetPasswordAsync(string email, string newPassword, CancellationToken ct);
}

public sealed class AuthService : IAuthService
{
    private readonly AppDbContext _db;
    private readonly AuthTokenService _tokens;

    public AuthService(AppDbContext db, AuthTokenService tokens)
    {
        _db = db;
        _tokens = tokens;
    }

    public async Task<AuthSessionDto> SignUpAsync(string email, string password, string? fullName, CancellationToken ct)
    {
        var normalized = NormalizeEmail(email);
        if (string.IsNullOrWhiteSpace(normalized))
            throw new AuthServiceException("Email is required.");
        if (string.IsNullOrWhiteSpace(password) || password.Length < 8)
            throw new AuthServiceException("Password must be at least 8 characters.");

        if (await _db.Users.AnyAsync(u => u.Email == normalized, ct))
            throw new AuthServiceException("An account with this email already exists.");

        var now = DateTime.UtcNow;
        var user = new AppUser
        {
            Id = Guid.NewGuid().ToString("N"),
            Email = normalized,
            PasswordHash = PasswordHasher.Hash(password),
            FullName = string.IsNullOrWhiteSpace(fullName) ? null : fullName.Trim(),
            Username = null,
            CreatedAt = now,
            UpdatedAt = now,
        };

        _db.Users.Add(user);
        await _db.SaveChangesAsync(ct);
        return ToSession(user);
    }

    public async Task<AuthSessionDto> SignInAsync(string email, string password, CancellationToken ct)
    {
        var normalized = NormalizeEmail(email);
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalized, ct);
        if (user is null || !PasswordHasher.Verify(password, user.PasswordHash))
            throw new AuthServiceException("Invalid email or password.");

        return ToSession(user);
    }

    public async Task<AuthUserDto?> GetMeAsync(string userId, CancellationToken ct)
    {
        var user = await _db.Users.AsNoTracking().FirstOrDefaultAsync(u => u.Id == userId, ct);
        return user is null ? null : ToDto(user);
    }

    public async Task<AuthUserDto> SetUsernameAsync(string userId, string username, CancellationToken ct)
    {
        var cleaned = username.Trim();
        if (cleaned.Length < 2)
            throw new AuthServiceException("Username must be at least 2 characters.");
        if (cleaned.Length > 64)
            throw new AuthServiceException("Username must be 64 characters or fewer.");

        var taken = await _db.Users.AnyAsync(
            u => u.Username != null && u.Username.ToLower() == cleaned.ToLower() && u.Id != userId,
            ct);
        if (taken)
            throw new AuthServiceException("That username is already taken.");

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct)
            ?? throw new AuthServiceException("Account not found.");

        user.Username = cleaned;
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
        return ToDto(user);
    }

    public async Task<bool> AccountExistsAsync(string email, CancellationToken ct)
    {
        var normalized = NormalizeEmail(email);
        return await _db.Users.AnyAsync(u => u.Email == normalized, ct);
    }

    public async Task ResetPasswordAsync(string email, string newPassword, CancellationToken ct)
    {
        var normalized = NormalizeEmail(email);
        if (string.IsNullOrWhiteSpace(newPassword) || newPassword.Length < 8)
            throw new AuthServiceException("Password must be at least 8 characters.");

        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email == normalized, ct)
            ?? throw new AuthServiceException("No account found for this email.");

        user.PasswordHash = PasswordHasher.Hash(newPassword);
        user.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    private AuthSessionDto ToSession(AppUser user)
    {
        return new AuthSessionDto(_tokens.Issue(user.Id, user.Email), ToDto(user));
    }

    private static AuthUserDto ToDto(AppUser user) =>
        new(user.Id, user.Email, user.Username, user.FullName, string.IsNullOrWhiteSpace(user.Username));

    private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();
}

public sealed class AuthServiceException : Exception
{
    public AuthServiceException(string message) : base(message) { }
}
