// Package config loads the control plane's runtime configuration from
// environment variables. Everything here is provided by infra/docker-compose.yml
// (local dev) or the equivalent Kubernetes ConfigMap/Secret in later phases.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// JanusNode describes one media node the control plane can route rooms to.
// Populated from the JANUS_NODES env var, format per node separated by commas:
//
//	nodeId|adminURL|internalWsURL|publicWsURL
//
// adminURL is only reachable from the control plane (internal network).
// publicWsURL is what browsers connect to directly for WebRTC signaling.
type JanusNode struct {
	ID            string
	AdminURL      string
	InternalWsURL string
	PublicWsURL   string
}

type Config struct {
	Port              string
	RedisURL          string
	JWTSigningSecret  string
	TURNSharedSecret  string
	TURNHost          string
	TURNPort          string
	JanusAdminSecret  string
	JanusVideoRoomKey string
	CORSOrigin        string
	JanusNodes        []JanusNode
	// StreamingPortRangeStart/End bound the ports the webinar fan-out
	// allocator (internal/webinar) hands out for rtp_forward targets on
	// edge nodes; must match JANUS_STREAMING_PORT_RANGE on those nodes.
	StreamingPortRangeStart int
	StreamingPortRangeEnd   int
}

func parsePortRange(raw string) (int, int, error) {
	parts := strings.SplitN(raw, "-", 2)
	if len(parts) != 2 {
		return 0, 0, fmt.Errorf("invalid port range %q: expected start-end", raw)
	}
	start, err := strconv.Atoi(strings.TrimSpace(parts[0]))
	if err != nil {
		return 0, 0, fmt.Errorf("invalid port range %q: %w", raw, err)
	}
	end, err := strconv.Atoi(strings.TrimSpace(parts[1]))
	if err != nil {
		return 0, 0, fmt.Errorf("invalid port range %q: %w", raw, err)
	}
	return start, end, nil
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

func parseJanusNodes(raw string) ([]JanusNode, error) {
	var nodes []JanusNode
	for _, entry := range strings.Split(raw, ",") {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}
		parts := strings.Split(entry, "|")
		if len(parts) != 4 {
			return nil, fmt.Errorf("invalid JANUS_NODES entry %q: expected id|adminURL|internalWsURL|publicWsURL", entry)
		}
		nodes = append(nodes, JanusNode{
			ID:            parts[0],
			AdminURL:      parts[1],
			InternalWsURL: parts[2],
			PublicWsURL:   parts[3],
		})
	}
	if len(nodes) == 0 {
		return nil, fmt.Errorf("JANUS_NODES must contain at least one node")
	}
	return nodes, nil
}

func Load() (*Config, error) {
	nodes, err := parseJanusNodes(mustEnv("JANUS_NODES"))
	if err != nil {
		return nil, err
	}
	streamStart, streamEnd, err := parsePortRange(envOr("JANUS_STREAMING_PORT_RANGE", "15000-15200"))
	if err != nil {
		return nil, err
	}
	return &Config{
		Port:                    envOr("PORT", "4000"),
		RedisURL:                envOr("REDIS_URL", "redis://localhost:6379"),
		JWTSigningSecret:        mustEnv("JWT_SIGNING_SECRET"),
		TURNSharedSecret:        mustEnv("TURN_SHARED_SECRET"),
		TURNHost:                envOr("TURN_HOST", "localhost"),
		TURNPort:                envOr("TURN_PORT", "3478"),
		JanusAdminSecret:        mustEnv("JANUS_ADMIN_SECRET"),
		JanusVideoRoomKey:       mustEnv("JANUS_VIDEOROOM_ADMIN_KEY"),
		CORSOrigin:              envOr("CORS_ORIGIN", "*"),
		JanusNodes:              nodes,
		StreamingPortRangeStart: streamStart,
		StreamingPortRangeEnd:   streamEnd,
	}, nil
}
