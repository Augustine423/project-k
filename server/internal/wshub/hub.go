// Package wshub pushes realtime, app-level events to clients in a room --
// presence (join/leave), host-control actions (muted/kicked/locked), chat.
// This is deliberately separate from the Janus WebSocket the browser also
// holds open: that one carries WebRTC signaling/media negotiation only,
// this one carries "room state changed" notifications so the UI can react
// instantly instead of polling the REST API.
//
// Phase 1 scope: single in-memory hub per control-plane instance. Once the
// control plane itself runs as multiple replicas (Phase 2), broadcast needs
// to go through Redis pub/sub instead of the local map so an event
// published on instance A reaches a client connected to instance B -- the
// Hub's public API is already shaped so that swap is a drop-in change
// inside Broadcast() only.
package wshub

import (
	"encoding/json"
	"log/slog"
	"sync"

	"github.com/gorilla/websocket"
)

type Event struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

type client struct {
	conn          *websocket.Conn
	send          chan []byte
	roomID        string
	participantID string
}

type Hub struct {
	mu              sync.RWMutex
	rooms           map[string]map[*client]bool
	log             *slog.Logger
	onClientMessage func(roomID, participantID string, payload []byte)
}

func New(log *slog.Logger) *Hub {
	return &Hub{
		rooms: make(map[string]map[*client]bool),
		log:   log,
	}
}

// SetClientMessageHandler is called for each inbound WS frame from a browser.
// Used for client→server actions such as chat.send (server still broadcasts
// chat.message to the whole room).
func (h *Hub) SetClientMessageHandler(fn func(roomID, participantID string, payload []byte)) {
	h.onClientMessage = fn
}

// Serve upgrades the connection and pumps events for roomID/participantID
// until the client disconnects. Intended to be called from an HTTP handler.
func (h *Hub) Serve(conn *websocket.Conn, roomID, participantID string) {
	c := &client{conn: conn, send: make(chan []byte, 16), roomID: roomID, participantID: participantID}

	h.mu.Lock()
	if h.rooms[roomID] == nil {
		h.rooms[roomID] = make(map[*client]bool)
	}
	h.rooms[roomID][c] = true
	h.mu.Unlock()

	go h.writePump(c)
	h.readPump(c)
}

func (h *Hub) readPump(c *client) {
	defer h.disconnect(c)
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			return
		}
		if h.onClientMessage != nil {
			h.onClientMessage(c.roomID, c.participantID, data)
		}
	}
}

func (h *Hub) writePump(c *client) {
	for msg := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
			return
		}
	}
}

func (h *Hub) disconnect(c *client) {
	h.mu.Lock()
	delete(h.rooms[c.roomID], c)
	if len(h.rooms[c.roomID]) == 0 {
		delete(h.rooms, c.roomID)
	}
	h.mu.Unlock()
	close(c.send)
	_ = c.conn.Close()
}

// Broadcast sends an event to every client currently connected to roomID.
func (h *Hub) Broadcast(roomID string, evt Event) {
	data, err := json.Marshal(evt)
	if err != nil {
		h.log.Error("marshal ws event", "err", err)
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for c := range h.rooms[roomID] {
		select {
		case c.send <- data:
		default:
			h.log.Warn("dropping slow ws client", "room", roomID, "participant", c.participantID)
		}
	}
}
