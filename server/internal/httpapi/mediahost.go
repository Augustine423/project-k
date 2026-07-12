package httpapi

import (
	"net/http"
	"net/url"
	"strings"
)

func isLoopbackHost(host string) bool {
	host = strings.Trim(host, "[]")
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

// mediaHostFromRequest picks the LAN-reachable host for LiveKit/TURN URLs.
// Prefers the browser Origin (phone on Wi‑Fi) over loopback env defaults.
func mediaHostFromRequest(r *http.Request, configured string) string {
	if origin := r.Header.Get("Origin"); origin != "" {
		if u, err := url.Parse(origin); err == nil {
			if host := u.Hostname(); host != "" && !isLoopbackHost(host) {
				return host
			}
		}
	}
	if configured != "" && !isLoopbackHost(configured) {
		return configured
	}
	return ""
}
