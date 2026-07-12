// Package turn mints short-lived STUN/TURN ICE server entries using the
// coturn REST API (use-auth-secret). Credentials expire and cannot be replayed.
package turn

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"strconv"
	"time"
)

const defaultTTL = 24 * time.Hour

// IceServer is passed to browsers as part of the join ticket (Phase A:
// "Join Never Fails" — redundant with LiveKit-configured TURN, but ensures
// the client has ICE servers even if SFU config is misaligned).
type IceServer struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username,omitempty"`
	Credential string   `json:"credential,omitempty"`
}

type Issuer struct {
	secret   string
	host     string
	port     int
	tlsPort  int
	realm    string
	useTLS   bool
}

func NewIssuer(secret, host string, port, tlsPort int, useTLS bool) *Issuer {
	if port == 0 {
		port = 3478
	}
	if tlsPort == 0 {
		tlsPort = 5349
	}
	return &Issuer{
		secret:  secret,
		host:    host,
		port:    port,
		tlsPort: tlsPort,
		realm:   "kzys",
		useTLS:  useTLS,
	}
}

// IceServers returns STUN + TURN URLs with time-limited credentials for identity.
func (i *Issuer) IceServers(identity string) []IceServer {
	expiry := time.Now().Add(defaultTTL).Unix()
	username := strconv.FormatInt(expiry, 10) + ":" + identity
	mac := hmac.New(sha1.New, []byte(i.secret))
	_, _ = mac.Write([]byte(username))
	credential := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	hostPort := fmt.Sprintf("%s:%d", i.host, i.port)
	servers := []IceServer{
		{URLs: []string{"stun:" + hostPort}},
		{
			URLs: []string{
				"turn:" + hostPort + "?transport=udp",
				"turn:" + hostPort + "?transport=tcp",
			},
			Username:   username,
			Credential: credential,
		},
	}

	if i.useTLS {
		tlsHostPort := fmt.Sprintf("%s:%d", i.host, i.tlsPort)
		servers = append(servers, IceServer{
			URLs:       []string{"turns:" + tlsHostPort + "?transport=tcp"},
			Username:   username,
			Credential: credential,
		})
	}

	return servers
}
