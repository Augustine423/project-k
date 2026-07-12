// Package httpapi wires the control plane's REST + WebSocket surface.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"projectk/server/internal/auth"
	"projectk/server/internal/redisstore"
	"projectk/server/internal/rooms"
	"projectk/server/internal/wshub"
)

type Pinger interface {
	Ping(ctx context.Context) error
}

type Handlers struct {
	Rooms       *rooms.Service
	Hub         *wshub.Hub
	JWT         *auth.Issuer
	Redis       *redisstore.Store
	Log         *slog.Logger
	ServiceName string
	MediaHost   string
}

func NewRouter(h *Handlers, corsOrigin string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)

	corsOpts := cors.Options{
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           300,
	}
	if corsOrigin == "*" {
		corsOpts.AllowOriginFunc = func(_ *http.Request, _ string) bool { return true }
	} else {
		corsOpts.AllowedOrigins = strings.Split(corsOrigin, ",")
	}
	r.Use(cors.Handler(corsOpts))

	r.Get("/health", h.handleHealth)
	r.Get("/ready", h.handleReady)

	// WebSocket sessions are long-lived; do not wrap them in the 15s HTTP
	// timeout middleware or the control plane will drop chat/presence events.
	r.Get("/ws/rooms/{roomID}", h.handleWebsocket)

	r.Group(func(r chi.Router) {
		r.Use(middleware.Timeout(15 * time.Second))

		r.Route("/api/rooms", func(r chi.Router) {
			r.Post("/", h.handleCreateRoom)
			r.Post("/{roomID}/join", h.handleJoinRoom)
			r.Get("/{roomID}", h.handleGetRoom)
			r.Get("/{roomID}/participants", h.handleListParticipants)

			r.Group(func(r chi.Router) {
				r.Use(h.requireHost)
				r.Post("/{roomID}/end", h.handleEndRoom)
				r.Post("/{roomID}/lock", h.handleSetLocked)
				r.Post("/{roomID}/participants/{participantID}/mute", h.handleMuteParticipant)
				r.Post("/{roomID}/participants/{participantID}/kick", h.handleKickParticipant)
			})
		})
	})

	return r
}
