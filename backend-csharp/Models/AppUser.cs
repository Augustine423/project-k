namespace Kzys.Backend.Models;

public class AppUser
{
    public string Id { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    /// <summary>Meeting display name shown in rooms.</summary>
    public string? Username { get; set; }
    /// <summary>Optional profile / full name from signup.</summary>
    public string? FullName { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
