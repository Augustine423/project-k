package httpapi

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"

	"projectk/server/internal/rooms"
	"projectk/server/internal/wshub"
)

type createRoomRequest struct {
	MaxUsers    int    `json:"maxUsers"`
	DisplayName string `json:"displayName"`
	PIN         string `json:"pin"`
}

func (h *Handlers) handleCreateRoom(w http.ResponseWriter, r *http.Request) {
	var req createRoomRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DisplayName == "" {
		writeError(w, http.StatusBadRequest, "displayName is required")
		return
	}

	ticket, err := h.Rooms.CreateRoom(r.Context(), rooms.CreateRoomInput{
		MaxUsers:    req.MaxUsers,
		DisplayName: req.DisplayName,
		PIN:         req.PIN,
		MediaHost:   mediaHostFromRequest(r, h.MediaHost),
	})
	if err != nil {
		h.Log.Error("create room failed", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to create room")
		return
	}
	writeJSON(w, http.StatusCreated, ticket)
}

type joinRoomRequest struct {
	DisplayName string `json:"displayName"`
	PIN         string `json:"pin"`
}

func (h *Handlers) handleJoinRoom(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	var req joinRoomRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DisplayName == "" {
		writeError(w, http.StatusBadRequest, "displayName is required")
		return
	}

	ticket, err := h.Rooms.JoinRoom(r.Context(), rooms.JoinRoomInput{
		RoomID:      roomID,
		DisplayName: req.DisplayName,
		PIN:         req.PIN,
		MediaHost:   mediaHostFromRequest(r, h.MediaHost),
	})
	switch {
	case errors.Is(err, rooms.ErrRoomNotFound):
		writeError(w, http.StatusNotFound, "room not found")
		return
	case errors.Is(err, rooms.ErrRoomLocked):
		writeError(w, http.StatusForbidden, "room is locked")
		return
	case errors.Is(err, rooms.ErrBadPIN):
		writeError(w, http.StatusForbidden, "incorrect pin")
		return
	case errors.Is(err, rooms.ErrRoomFull):
		writeError(w, http.StatusConflict, "room is full")
		return
	case err != nil:
		h.Log.Error("join room failed", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to join room")
		return
	}

	h.Hub.Broadcast(roomID, wshub.Event{Type: "participant.joined", Data: ticket.Participant})
	writeJSON(w, http.StatusOK, ticket)
}

func (h *Handlers) handleGetRoom(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	room, err := h.Rooms.GetRoom(r.Context(), roomID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load room")
		return
	}
	if room == nil {
		writeError(w, http.StatusNotFound, "room not found")
		return
	}
	writeJSON(w, http.StatusOK, room)
}

func (h *Handlers) handleListParticipants(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	participants, err := h.Rooms.ListParticipants(r.Context(), roomID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list participants")
		return
	}
	writeJSON(w, http.StatusOK, participants)
}

func (h *Handlers) handleEndRoom(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	if err := h.Rooms.EndRoom(r.Context(), roomID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to end room")
		return
	}
	h.Hub.Broadcast(roomID, wshub.Event{Type: "room.ended", Data: nil})
	writeJSON(w, http.StatusOK, map[string]bool{"ended": true})
}

type setLockedRequest struct {
	Locked bool `json:"locked"`
}

func (h *Handlers) handleSetLocked(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	var req setLockedRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.Rooms.SetLocked(r.Context(), roomID, req.Locked); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update room")
		return
	}
	h.Hub.Broadcast(roomID, wshub.Event{Type: "room.locked", Data: req.Locked})
	writeJSON(w, http.StatusOK, map[string]bool{"locked": req.Locked})
}

type muteRequest struct {
	Mid  string `json:"mid"`
	Mute bool   `json:"mute"`
}

func (h *Handlers) handleMuteParticipant(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	participantID := chi.URLParam(r, "participantID")
	var req muteRequest
	if err := decodeJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := h.Rooms.MuteParticipant(r.Context(), roomID, participantID, req.Mid, req.Mute); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update participant")
		return
	}
	h.Hub.Broadcast(roomID, wshub.Event{Type: "participant.muted", Data: map[string]any{
		"participantId": participantID, "mid": req.Mid, "mute": req.Mute,
	}})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

func (h *Handlers) handleKickParticipant(w http.ResponseWriter, r *http.Request) {
	roomID := chi.URLParam(r, "roomID")
	participantID := chi.URLParam(r, "participantID")
	if err := h.Rooms.KickParticipant(r.Context(), roomID, participantID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to remove participant")
		return
	}
	h.Hub.Broadcast(roomID, wshub.Event{Type: "participant.kicked", Data: map[string]string{
		"participantId": participantID,
	}})
	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}
