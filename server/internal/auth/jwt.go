// Package auth issues and verifies the short-lived JWTs participants use to
// prove, to both this control plane and (via the Janus room "pin"/secret
// handed out alongside it) implicitly to Janus, that they were legitimately
// admitted to a specific room.
package auth

import (
	"fmt"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Role is a plain string here (rather than importing the rooms package's
// Role type) specifically to avoid an import cycle: rooms depends on auth
// to issue tokens, so auth cannot depend back on rooms. Callers on both
// sides convert to/from their own typed Role as needed.
type Role string

type Claims struct {
	RoomID        string `json:"roomId"`
	ParticipantID string `json:"participantId"`
	Role          Role   `json:"role"`
	jwt.RegisteredClaims
}

type Issuer struct {
	secret []byte
	ttl    time.Duration
}

func NewIssuer(secret string) *Issuer {
	return &Issuer{secret: []byte(secret), ttl: 12 * time.Hour}
}

func (i *Issuer) Issue(roomID, participantID string, role Role) (string, error) {
	claims := Claims{
		RoomID:        roomID,
		ParticipantID: participantID,
		Role:          role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(i.ttl)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(i.secret)
}

func (i *Issuer) Verify(tokenString string) (*Claims, error) {
	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenString, claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method %v", t.Header["alg"])
		}
		return i.secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, fmt.Errorf("invalid token")
	}
	return claims, nil
}
