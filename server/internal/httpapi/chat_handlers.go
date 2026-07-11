package httpapi

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"projectk/server/internal/wshub"
)

type sendChatRequest struct {
	DisplayName string `json:"displayName"`
	Message     string `json:"message"`
}

// handleSendChat fans a chat message out to everyone currently connected to
// the room's WebSocket event stream. Phase 1 scope: broadcast-only, no
// history persistence -- a participant who joins late won't see earlier
// messages. Persisting to a Redis list/stream keyed by room is the natural
// Phase 2 extension (see docs/ARCHITECTURE.md).
func (h *Handlers) handleSendChat(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	claims := claimsFromContext(r.Context())

	var req sendChatRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Message == "" {
		writeError(w, http.StatusBadRequest, "message is required")
		return
	}

	h.Hub.Broadcast(roomID, wshub.Event{
		Type: "chat.message",
		Data: map[string]any{
			"participantId": claims.ParticipantID,
			"displayName":   req.DisplayName,
			"message":       req.Message,
			"at":            time.Now().UTC(),
		},
	})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
