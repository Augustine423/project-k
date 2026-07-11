// Package turn issues short-lived TURN REST API credentials (the same
// "time-limited shared secret" mechanism coturn implements natively via
// --static-auth-secret), so we never hand out a permanent TURN account to
// clients -- each credential expires on its own a few hours after issuance.
package turn

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base64"
	"fmt"
	"time"
)

type Issuer struct {
	SharedSecret string
	Host         string
	Port         string
	TTL          time.Duration
}

func NewIssuer(sharedSecret, host, port string) *Issuer {
	return &Issuer{SharedSecret: sharedSecret, Host: host, Port: port, TTL: 6 * time.Hour}
}

type Credentials struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username"`
	Credential string   `json:"credential"`
}

// IssueFor mints a credential scoped to participantID, expiring after TTL.
func (i *Issuer) IssueFor(participantID string) Credentials {
	expiry := time.Now().Add(i.TTL).Unix()
	username := fmt.Sprintf("%d:%s", expiry, participantID)

	mac := hmac.New(sha1.New, []byte(i.SharedSecret))
	mac.Write([]byte(username))
	password := base64.StdEncoding.EncodeToString(mac.Sum(nil))

	turnURL := fmt.Sprintf("turn:%s:%s", i.Host, i.Port)
	stunURL := fmt.Sprintf("stun:%s:%s", i.Host, i.Port)

	return Credentials{
		URLs:       []string{stunURL, turnURL, turnURL + "?transport=tcp"},
		Username:   username,
		Credential: password,
	}
}
