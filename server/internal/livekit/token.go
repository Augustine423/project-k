// Package livekit issues participant access tokens for the LiveKit SFU.
// Symmetrical multiparty: every participant can publish and subscribe (Zoom/Teams style).
package livekit

import (
	"fmt"
	"time"

	"github.com/livekit/protocol/auth"
)

type TokenIssuer struct {
	apiKey    string
	apiSecret string
	publicURL string
	ttl       time.Duration
}

func NewTokenIssuer(apiKey, apiSecret, publicURL string) *TokenIssuer {
	return &TokenIssuer{
		apiKey:    apiKey,
		apiSecret: apiSecret,
		publicURL: publicURL,
		ttl:       6 * time.Hour,
	}
}

func (t *TokenIssuer) PublicURL() string {
	return t.publicURL
}

// Issue creates a JWT that lets the browser join roomName as identity with
// full publish + subscribe (symmetrical conference).
func (t *TokenIssuer) Issue(roomName, identity, displayName string) (string, error) {
	at := auth.NewAccessToken(t.apiKey, t.apiSecret)
	grant := &auth.VideoGrant{
		RoomJoin: true,
		Room:     roomName,
	}
	grant.SetCanPublish(true)
	grant.SetCanSubscribe(true)
	grant.SetCanPublishData(true)

	at.SetVideoGrant(grant).
		SetIdentity(identity).
		SetName(displayName).
		SetValidFor(t.ttl)

	token, err := at.ToJWT()
	if err != nil {
		return "", fmt.Errorf("livekit token: %w", err)
	}
	return token, nil
}
