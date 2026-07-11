package httpapi

import (
	"encoding/json"
	"time"

	"projectk/server/internal/wshub"
)

type wsClientMessage struct {
	Type string          `json:"type"`
	Data json.RawMessage `json:"data"`
}

type wsChatSendData struct {
	DisplayName string `json:"displayName"`
	Message     string `json:"message"`
}

// HandleWSClientMessage processes inbound frames on the per-room app WebSocket
// (browser → control plane). Today: chat.send. REST /chat remains for
// compatibility but the web UI uses this path.
func (h *Handlers) HandleWSClientMessage(roomID, participantID string, payload []byte) {
	var msg wsClientMessage
	if err := json.Unmarshal(payload, &msg); err != nil {
		h.Log.Warn("invalid ws client message", "err", err)
		return
	}

	switch msg.Type {
	case "chat.send":
		var data wsChatSendData
		if err := json.Unmarshal(msg.Data, &data); err != nil || data.Message == "" {
			return
		}
		displayName := data.DisplayName
		if displayName == "" {
			displayName = "Guest"
		}
		h.Hub.Broadcast(roomID, wshub.Event{
			Type: "chat.message",
			Data: map[string]any{
				"participantId": participantID,
				"displayName":   displayName,
				"message":       data.Message,
				"at":            time.Now().UTC(),
			},
		})
	default:
		h.Log.Debug("ignored ws client message", "type", msg.Type)
	}
}
