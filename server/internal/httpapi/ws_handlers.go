package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	// Local dev / early-stage CORS: the room/participant token itself is
	// the real access control (verified below), so we don't need to be
	// strict about the WS handshake's Origin here.
	CheckOrigin: func(r *http.Request) bool { return true },
}

// handleWebsocket authenticates via the participant JWT (passed as
// ?token=... since browsers can't set custom headers on the WS handshake),
// then hands the connection to the Hub for the lifetime of the session.
func (h *Handlers) handleWebsocket(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	token := r.URL.Query().Get("token")

	claims, err := h.JWT.Verify(token)
	if err != nil || claims.RoomID != roomID {
		writeError(w, http.StatusUnauthorized, "invalid or mismatched token")
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.Log.Warn("ws upgrade failed", "err", err)
		return
	}

	h.Hub.Serve(conn, roomID, claims.ParticipantID)
}
