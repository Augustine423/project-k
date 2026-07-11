// Package httpapi wires the control plane's REST + WebSocket surface.
package httpapi

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"projectk/server/internal/auth"
	"projectk/server/internal/rooms"
	"projectk/server/internal/webinar"
	"projectk/server/internal/wshub"
)

type Pinger interface {
	Ping(ctx context.Context) error
}

type Handlers struct {
	Rooms   *rooms.Service
	Webinar *webinar.Service
	Hub     *wshub.Hub
	JWT     *auth.Issuer
	Redis   Pinger
	Log     *slog.Logger
}

func NewRouter(h *Handlers, corsOrigin string) http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{corsOrigin},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "Authorization"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	r.Get("/health", h.handleHealth)

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
			r.Get("/{roomID}/webinar/viewer-info", h.handleViewerInfo)

			r.Group(func(r chi.Router) {
				r.Use(h.requireHost)
				r.Post("/{roomID}/end", h.handleEndRoom)
				r.Post("/{roomID}/lock", h.handleSetLocked)
				r.Post("/{roomID}/participants/{participantID}/mute", h.handleMuteParticipant)
				r.Post("/{roomID}/participants/{participantID}/kick", h.handleKickParticipant)
			})

			r.Group(func(r chi.Router) {
				r.Use(h.requireParticipant)
				r.Post("/{roomID}/webinar/publishers/{participantID}/forward", h.handleForwardPublisher)
				r.Post("/{roomID}/chat", h.handleSendChat)
			})
		})
	})

	return r
}
