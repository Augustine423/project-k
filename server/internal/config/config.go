// Package config loads the control plane's runtime configuration from
// environment variables.
package config

import (
	"fmt"
	"os"
	"strconv"
)

const DefaultMaxRoomParticipants = 10

type Config struct {
	Port                string
	RedisURL            string
	JWTSigningSecret    string
	CORSOrigin          string
	LiveKitAPIKey       string
	LiveKitAPISecret    string
	LiveKitPublicURL    string
	LiveKitInternalURL  string
	MaxRoomParticipants int
	TURNSharedSecret    string
	TURNHost            string
	TURNPort            int
	TURNTLSPort         int
	TURNUseTLS          bool
	ServiceName         string
}

func mustEnv(key string) string {
	v := os.Getenv(key)
	if v == "" {
		panic(fmt.Sprintf("missing required environment variable %s", key))
	}
	return v
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}

func envInt(key string, fallback int) int {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return fallback
	}
	return n
}

func Load() (*Config, error) {
	maxP, err := strconv.Atoi(envOr("MAX_ROOM_PARTICIPANTS", strconv.Itoa(DefaultMaxRoomParticipants)))
	if err != nil || maxP < 2 {
		return nil, fmt.Errorf("MAX_ROOM_PARTICIPANTS must be >= 2")
	}
	return &Config{
		Port:                envOr("PORT", "4000"),
		RedisURL:            envOr("REDIS_URL", "redis://localhost:6379"),
		JWTSigningSecret:    mustEnv("JWT_SIGNING_SECRET"),
		CORSOrigin:          envOr("CORS_ORIGIN", "*"),
		LiveKitAPIKey:       envOr("LIVEKIT_API_KEY", "devkey"),
		LiveKitAPISecret:    envOr("LIVEKIT_API_SECRET", "devsecret"),
		LiveKitPublicURL:    mustEnv("LIVEKIT_URL"),
		LiveKitInternalURL:  envOr("LIVEKIT_INTERNAL_URL", "ws://localhost:7880"),
		MaxRoomParticipants: maxP,
		TURNSharedSecret:    envOr("TURN_SHARED_SECRET", "dev-turn-shared-secret"),
		TURNHost:            envOr("TURN_HOST", "localhost"),
		TURNPort:            envInt("TURN_PORT", 3478),
		TURNTLSPort:         envInt("TURN_TLS_PORT", 5349),
		TURNUseTLS:          envBool("TURN_USE_TLS", false),
		ServiceName:         envOr("SERVICE_NAME", "kzys-control-plane"),
	}, nil
}
