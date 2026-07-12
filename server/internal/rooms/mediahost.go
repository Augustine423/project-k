package rooms

import (
	"net"
	"net/url"
	"strings"
)

func isLoopbackHost(host string) bool {
	host = strings.Trim(host, "[]")
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func rewriteURLHost(raw, host string) string {
	if host == "" || isLoopbackHost(host) {
		return raw
	}
	u, err := url.Parse(raw)
	if err != nil || !isLoopbackHost(u.Hostname()) {
		return raw
	}
	port := u.Port()
	if port != "" {
		u.Host = net.JoinHostPort(host, port)
	} else {
		u.Host = host
	}
	return u.String()
}
