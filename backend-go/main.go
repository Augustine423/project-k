package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"kzys/backend/pb"
)

// ── gRPC server (receives StreamStatusUpdate from backend-c) ──────────────────

type grpcServer struct {
	pb.UnimplementedMediaOrchestratorServer
}

func (s *grpcServer) PrepareMediaSession(_ context.Context, req *pb.SessionRequest) (*pb.SessionResponse, error) {
	log.Printf("[gRPC] PrepareMediaSession room=%s user=%s", req.RoomId, req.UserId)
	return &pb.SessionResponse{SdpAnswer: "v=0", MediaServerEndpoint: "udp://127.0.0.1:5000"}, nil
}

func (s *grpcServer) StreamStatusUpdate(_ context.Context, req *pb.StatusRequest) (*pb.StatusResponse, error) {
	log.Printf("[gRPC] StreamStatusUpdate room=%s user=%s status=%s", req.RoomId, req.UserId, req.Status)
	hub.broadcast(req.RoomId, map[string]string{"type": "status", "user_id": req.UserId, "status": req.Status})
	return &pb.StatusResponse{Acknowledged: true}, nil
}

// ── gRPC client to backend-c ──────────────────────────────────────────────────

var cClient pb.MediaOrchestratorClient

func init() {
	conn, err := grpc.NewClient("kzys-backend-c:50051",
		grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		log.Printf("[warn] cannot dial backend-c: %v", err)
		return
	}
	cClient = pb.NewMediaOrchestratorClient(conn)
	log.Println("gRPC client → backend-c ready")
}

func prepareSession(ctx context.Context, req *pb.SessionRequest) (*pb.SessionResponse, error) {
	if cClient != nil {
		return cClient.PrepareMediaSession(ctx, req)
	}
	// fallback when backend-c is not available
	return &pb.SessionResponse{
		SdpAnswer:           "v=0",
		MediaServerEndpoint: "udp://127.0.0.1:5000",
	}, nil
}

// ── WebSocket signaling hub ───────────────────────────────────────────────────

type client struct {
	conn   *websocket.Conn
	roomID string
	userID string
	send   chan []byte
}

type sigHub struct {
	mu      sync.RWMutex
	rooms   map[string][]*client
}

var hub = &sigHub{rooms: make(map[string][]*client)}

func (h *sigHub) join(c *client) {
	h.mu.Lock()
	h.rooms[c.roomID] = append(h.rooms[c.roomID], c)
	h.mu.Unlock()
}

func (h *sigHub) leave(c *client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	list := h.rooms[c.roomID]
	for i, x := range list {
		if x == c {
			h.rooms[c.roomID] = append(list[:i], list[i+1:]...)
			break
		}
	}
}

func (h *sigHub) broadcast(roomID string, msg interface{}) {
	data, _ := json.Marshal(msg)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.rooms[roomID] {
		select {
		case c.send <- data:
		default:
		}
	}
}

func (h *sigHub) sendTo(roomID, targetUser string, msg interface{}) {
	data, _ := json.Marshal(msg)
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, c := range h.rooms[roomID] {
		if c.userID == targetUser {
			select {
			case c.send <- data:
			default:
			}
		}
	}
}

// ── HTTP handlers ─────────────────────────────────────────────────────────────

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

func wsHandler(w http.ResponseWriter, r *http.Request) {
	roomID := r.URL.Query().Get("room_id")
	userID := r.URL.Query().Get("user_id")
	if roomID == "" || userID == "" {
		http.Error(w, "room_id and user_id required", http.StatusBadRequest)
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := &client{conn: conn, roomID: roomID, userID: userID, send: make(chan []byte, 64)}
	hub.join(c)
	defer func() {
		hub.leave(c)
		conn.Close()
		hub.broadcast(roomID, map[string]string{"type": "peer_left", "user_id": userID})
	}()

	// notify others
	hub.broadcast(roomID, map[string]string{"type": "peer_joined", "user_id": userID})

	// writer
	go func() {
		for msg := range c.send {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				break
			}
		}
	}()

	// reader — relay signaling messages (offer/answer/ice/chat)
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg map[string]interface{}
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		msg["from"] = userID
		// targeted messages (offer/answer/ice) go to specific peer; chat broadcasts
		if target, ok := msg["to"].(string); ok && target != "" {
			hub.sendTo(roomID, target, msg)
		} else {
			hub.broadcast(roomID, msg)
		}
	}
}

func cors(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func sessionHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req pb.SessionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	resp, err := prepareSession(r.Context(), &req)
	if err != nil {
		http.Error(w, "session failed", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(resp)
}

func turnHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]interface{}{
		"urls":       "turn:kzys-coturn:3478",
		"username":   "kzys",
		"credential": "kzyspass123",
	})
}

// ── main ──────────────────────────────────────────────────────────────────────

func main() {
	// gRPC server (for backend-c callbacks)
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("listen: %v", err)
	}
	s := grpc.NewServer()
	pb.RegisterMediaOrchestratorServer(s, &grpcServer{})
	go func() {
		log.Println("gRPC server :50051")
		if err := s.Serve(lis); err != nil && !errors.Is(err, net.ErrClosed) {
			log.Printf("gRPC error: %v", err)
		}
	}()

	// REST + WebSocket
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/session/prepare", cors(sessionHandler))
	mux.HandleFunc("/v1/turn/credentials", cors(turnHandler))
	mux.HandleFunc("/ws", wsHandler)

	log.Println("REST+WS :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("http: %v", err)
	}
}
