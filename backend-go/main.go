package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/server-sdk-go/v2/livekit"
)

// Simple env vars for LiveKit creds
var (
	apiKey    = os.Getenv("LIVEKIT_API_KEY")
	apiSecret = os.Getenv("LIVEKIT_API_SECRET")
)

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
	http.HandleFunc("/api/livekit/token", func(w http.ResponseWriter, r *http.Request) {
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

	log.Println("KZYS Signaling Server starting on :8080...")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
