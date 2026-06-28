package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/livekit/protocol/auth"
)

var (
	apiKey    = os.Getenv("LIVEKIT_API_KEY")
	apiSecret = os.Getenv("LIVEKIT_API_SECRET")
)

func timeoutSeconds(name string, fallback int) time.Duration {
	if v := os.Getenv(name); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			return time.Duration(n) * time.Second
		}
	}
	return time.Duration(fallback) * time.Second
}

func getJoinToken(room, identity string) (string, error) {
	at := auth.NewAccessToken(apiKey, apiSecret)
	at.SetIdentity(identity).
		SetValidFor(time.Hour).
		AddGrant(&auth.VideoGrant{
			RoomJoin: true,
			Room:     room,
		})
	return at.ToJWT()
}

func main() {
	readTimeout := timeoutSeconds("KZYS_READ_TIMEOUT_SECONDS", 30)
	writeTimeout := timeoutSeconds("KZYS_WRITE_TIMEOUT_SECONDS", 30)

	mux := http.NewServeMux()
	mux.HandleFunc("/api/livekit/token", func(w http.ResponseWriter, r *http.Request) {
		room := r.URL.Query().Get("roomId")
		user := r.URL.Query().Get("userId")

		token, err := getJoinToken(room, user)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"token": "%s"}`, token)
	})

	srv := &http.Server{
		Addr:         ":8080",
		Handler:      mux,
		ReadTimeout:  readTimeout,
		WriteTimeout: writeTimeout,
		IdleTimeout:  120 * time.Second,
	}

	log.Printf("KZYS Signaling Server starting on :8080 (read=%s write=%s)...", readTimeout, writeTimeout)
	log.Fatal(srv.ListenAndServe())
}
