// Minimal LiveKit companion: mint join tokens + host admin (kick / end room).
package main

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
)

type config struct {
	Port              string
	APIKey            string
	APISecret         string
	LiveKitPublicWS   string
	LiveKitHTTP       string
	TurnSharedSecret  string
	TurnHost          string
	TurnPort          string
	CORSOrigin        string
}

type turnInfo struct {
	URLs       []string `json:"urls"`
	Username   string   `json:"username"`
	Credential string   `json:"credential"`
}

type participantDTO struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	Role        string `json:"role"`
}

type sessionDTO struct {
	RoomID       string         `json:"roomId"`
	Identity     string         `json:"identity"`
	DisplayName  string         `json:"displayName"`
	IsHost       bool           `json:"isHost"`
	LiveKitURL   string         `json:"liveKitUrl"`
	LiveKitToken string         `json:"liveKitToken"`
	Turn         turnInfo       `json:"turn"`
	Participant  participantDTO `json:"participant"`
}

var roomHosts sync.Map // roomID -> host identity

func main() {
	cfg := loadConfig()
	roomClient := lksdk.NewRoomServiceClient(cfg.LiveKitHTTP, cfg.APIKey, cfg.APISecret)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("POST /api/rooms", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			DisplayName string `json:"displayName"`
		}
		if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.DisplayName) == "" {
			writeErr(w, http.StatusBadRequest, "displayName required")
			return
		}
		roomID := "room-" + randomID(6)
		identity := "p-" + randomID(6)
		roomHosts.Store(roomID, identity)
	 sess, err := mintSession(cfg, roomID, identity, strings.TrimSpace(body.DisplayName), true)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		writeJSON(w, http.StatusOK, sess)
	})
	mux.HandleFunc("POST /api/rooms/{roomId}/join", func(w http.ResponseWriter, r *http.Request) {
		roomID := r.PathValue("roomId")
		var body struct {
			DisplayName string `json:"displayName"`
		}
		if err := readJSON(r, &body); err != nil || strings.TrimSpace(body.DisplayName) == "" {
			writeErr(w, http.StatusBadRequest, "displayName required")
			return
		}
		identity := "p-" + randomID(6)
		hostIdentity, isHost := roomHosts.Load(roomID)
		_ = hostIdentity
		sess, err := mintSession(cfg, roomID, identity, strings.TrimSpace(body.DisplayName), isHost && hostIdentity == identity)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, err.Error())
			return
		}
		sess.IsHost = false
		sess.Participant.Role = "participant"
		writeJSON(w, http.StatusOK, sess)
	})
	mux.HandleFunc("POST /api/rooms/{roomId}/participants/{identity}/kick", func(w http.ResponseWriter, r *http.Request) {
		roomID := r.PathValue("roomId")
		target := r.PathValue("identity")
		var body struct {
			RequesterIdentity string `json:"requesterIdentity"`
		}
		if err := readJSON(r, &body); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid body")
			return
		}
		if !isHost(cfg, roomClient, roomID, body.RequesterIdentity) {
			writeErr(w, http.StatusForbidden, "host only")
			return
		}
		if err := roomClient.RemoveParticipant(context.Background(), &livekit.RoomParticipantIdentity{
			Room: roomID, Identity: target,
		}); err != nil {
			writeErr(w, http.StatusBadGateway, err.Error())
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("POST /api/rooms/{roomId}/end", func(w http.ResponseWriter, r *http.Request) {
		roomID := r.PathValue("roomId")
		var body struct {
			RequesterIdentity string `json:"requesterIdentity"`
		}
		if err := readJSON(r, &body); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid body")
			return
		}
		if !isHost(cfg, roomClient, roomID, body.RequesterIdentity) {
			writeErr(w, http.StatusForbidden, "host only")
			return
		}
		if _, err := roomClient.DeleteRoom(context.Background(), &livekit.DeleteRoomRequest{Room: roomID}); err != nil {
			writeErr(w, http.StatusBadGateway, err.Error())
			return
		}
		roomHosts.Delete(roomID)
		w.WriteHeader(http.StatusNoContent)
	})

	addr := ":" + cfg.Port
	log.Printf("livekit token server listening on %s", addr)
	if err := http.ListenAndServe(addr, withCORS(cfg.CORSOrigin, mux)); err != nil {
		log.Fatal(err)
	}
}

func loadConfig() config {
	return config{
		Port:             env("PORT", "8080"),
		APIKey:           env("LIVEKIT_API_KEY", "devkey"),
		APISecret:        env("LIVEKIT_API_SECRET", "dev-livekit-local-secret-32chars-min"),
		LiveKitPublicWS:  env("LIVEKIT_PUBLIC_URL", "ws://localhost:7880"),
		LiveKitHTTP:      env("LIVEKIT_HTTP_URL", "http://livekit:7880"),
		TurnSharedSecret: env("TURN_SHARED_SECRET", "dev-turn-shared-secret"),
		TurnHost:         env("TURN_HOST", "localhost"),
		TurnPort:         env("TURN_PORT", "3478"),
		CORSOrigin:       env("CORS_ORIGIN", "*"),
	}
}

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func mintSession(cfg config, roomID, identity, displayName string, isHost bool) (sessionDTO, error) {
	canPub := true
	canSub := true
	at := auth.NewAccessToken(cfg.APIKey, cfg.APISecret)
	grant := &auth.VideoGrant{
		RoomJoin:     true,
		Room:         roomID,
		CanPublish:   &canPub,
		CanSubscribe: &canSub,
	}
	role := "participant"
	if isHost {
		role = "host"
		at.SetMetadata(`{"role":"host"}`)
	}
	at.SetVideoGrant(grant).
		SetIdentity(identity).
		SetName(displayName).
		SetValidFor(6 * time.Hour)

	token, err := at.ToJWT()
	if err != nil {
		return sessionDTO{}, err
	}

	turn := buildTurn(cfg)
	return sessionDTO{
		RoomID:       roomID,
		Identity:     identity,
		DisplayName:  displayName,
		IsHost:       isHost,
		LiveKitURL:   cfg.LiveKitPublicWS,
		LiveKitToken: token,
		Turn:         turn,
		Participant: participantDTO{
			ID:          identity,
			DisplayName: displayName,
			Role:        role,
		},
	}, nil
}

func buildTurn(cfg config) turnInfo {
	expiry := time.Now().Add(24 * time.Hour).Unix()
	username := fmt.Sprintf("%d:%s", expiry, identityShort())
	mac := hmac.New(sha1.New, []byte(cfg.TurnSharedSecret))
	mac.Write([]byte(username))
	credential := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	host := cfg.TurnHost
	port := cfg.TurnPort
	return turnInfo{
		URLs: []string{
			fmt.Sprintf("turn:%s:%s?transport=udp", host, port),
			fmt.Sprintf("turn:%s:%s?transport=tcp", host, port),
			"stun:stun.l.google.com:19302",
		},
		Username:   username,
		Credential: credential,
	}
}

func isHost(cfg config, client *lksdk.RoomServiceClient, roomID, requester string) bool {
	if host, ok := roomHosts.Load(roomID); ok && host == requester {
		return true
	}
	participants, err := client.ListParticipants(context.Background(), &livekit.ListParticipantsRequest{Room: roomID})
	if err != nil {
		return false
	}
	for _, p := range participants.Participants {
		if p.Identity == requester && strings.Contains(p.Metadata, `"role":"host"`) {
			return true
		}
	}
	return false
}

func randomID(nBytes int) string {
	b := make([]byte, nBytes)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func identityShort() string {
	return randomID(4)
}

func readJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	return json.NewDecoder(r.Body).Decode(dst)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func withCORS(origin string, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin == "*" {
			w.Header().Set("Access-Control-Allow-Origin", "*")
		} else {
			w.Header().Set("Access-Control-Allow-Origin", origin)
		}
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
