package httpapi

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"projectk/server/internal/webinar"
)

type forwardStreamRequest struct {
	Mid  string `json:"mid"`
	Type string `json:"type"`
}

type forwardPublisherRequest struct {
	Streams []forwardStreamRequest `json:"streams"`
}

// handleForwardPublisher lets an on-stage publisher (host or panelist)
// report the mids Janus assigned to their own published streams, so the
// control plane can fan them out to the room's broadcast edge node. Only
// the publisher themselves or the host may trigger this for a given
// participant ID.
func (h *Handlers) handleForwardPublisher(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	participantID := chi.URLParam(r, "participantID")

	claims := claimsFromContext(r.Context())
	if claims.ParticipantID != participantID && !hostRoles[claims.Role] {
		writeError(w, http.StatusForbidden, "cannot forward another participant's stream")
		return
	}

	var req forwardPublisherRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	room, err := h.Rooms.GetRoom(r.Context(), roomID)
	if err != nil || room == nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}

	streams := make([]webinar.PublisherStream, 0, len(req.Streams))
	for _, s := range req.Streams {
		streams = append(streams, webinar.PublisherStream{Mid: s.Mid, Type: s.Type})
	}

	if err := h.Webinar.ForwardPublisher(r.Context(), *room, participantID, streams); err != nil {
		h.Log.Error("webinar forward publisher failed", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to start broadcast forwarding")
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleViewerInfo returns which edge node/mountpoint a webinar viewer
// should subscribe to for this room's broadcast.
func (h *Handlers) handleViewerInfo(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	room, err := h.Rooms.GetRoom(r.Context(), roomID)
	if err != nil || room == nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	info, err := h.Webinar.ViewerJoinInfo(r.Context(), *room)
	if err != nil {
		h.Log.Error("webinar viewer info failed", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to resolve broadcast")
		return
	}
	writeJSON(w, http.StatusOK, info)
}
