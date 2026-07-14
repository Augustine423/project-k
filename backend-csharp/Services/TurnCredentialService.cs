using System.Security.Cryptography;
using System.Text;
using Kzys.Backend.Models;

namespace Kzys.Backend.Services;

public sealed class TurnCredentialService
{
    private readonly string _secret;
    private readonly string _host;
    private readonly int _port;
    private readonly int _tlsPort;
    private readonly bool _useTls;
    private static readonly TimeSpan Ttl = TimeSpan.FromHours(24);

    public TurnCredentialService(string secret, string host, int port, int tlsPort, bool useTls)
    {
        _secret = secret;
        _host = host;
        _port = port <= 0 ? 3478 : port;
        _tlsPort = tlsPort <= 0 ? 5349 : tlsPort;
        _useTls = useTls;
    }

    public TurnInfoDto? BuildTurnInfo(string identity, string mediaHost)
    {
        var host = string.IsNullOrWhiteSpace(mediaHost) ? _host : mediaHost;
        var expiry = DateTimeOffset.UtcNow.Add(Ttl).ToUnixTimeSeconds();
        var username = $"{expiry}:{identity}";
        using var hmac = new HMACSHA1(Encoding.UTF8.GetBytes(_secret));
        var credential = Convert.ToBase64String(hmac.ComputeHash(Encoding.UTF8.GetBytes(username)));

        var hostPort = $"{host}:{_port}";
        var urls = new List<string>
        {
            "stun:" + hostPort,
            "turn:" + hostPort + "?transport=udp",
            "turn:" + hostPort + "?transport=tcp",
        };
        if (_useTls)
        {
            urls.Add($"turns:{host}:{_tlsPort}?transport=tcp");
        }

        return new TurnInfoDto
        {
            Urls = urls.ToArray(),
            Username = username,
            Credential = credential,
        };
    }
}

public static class MediaHostHelper
{
    public static string FromRequest(HttpRequest request, string configuredHost)
    {
        if (!string.IsNullOrWhiteSpace(request.Headers.Origin))
        {
            if (Uri.TryCreate(request.Headers.Origin!, UriKind.Absolute, out var origin))
            {
                var host = origin.Host;
                if (!string.IsNullOrEmpty(host) && !IsLoopback(host))
                    return host;
            }
        }
        if (!string.IsNullOrWhiteSpace(configuredHost) && !IsLoopback(configuredHost))
            return configuredHost;
        return "";
    }

    public static string RewriteUrlHost(string url, string mediaHost)
    {
        if (string.IsNullOrWhiteSpace(mediaHost) || string.IsNullOrWhiteSpace(url))
            return url;
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return url;
        if (!IsLoopback(uri.Host))
            return url;
        var builder = new UriBuilder(uri) { Host = mediaHost };
        return builder.Uri.ToString();
    }

    private static bool IsLoopback(string host)
    {
        host = host.Trim('[', ']');
        return host is "localhost" or "127.0.0.1" or "::1";
    }
}
