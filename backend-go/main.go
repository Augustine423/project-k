package main

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"net"
	"net/http"

	"google.golang.org/grpc"

	"github.com/kzys/backend-go/pb"
)

type server struct {
	pb.UnimplementedMediaOrchestratorServer
}

// Implement gRPC logic
func (s *server) PrepareMediaSession(ctx context.Context, req *pb.SessionRequest) (*pb.SessionResponse, error) {
	log.Printf("REST request received for room: %s", req.RoomId)
	return &pb.SessionResponse{
		SdpAnswer:           "v=0...",
		MediaServerEndpoint: "udp://127.0.0.1:5000",
	}, nil
}

func main() {
	// Start gRPC server for internal C-backend communication.
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatalf("failed to listen on gRPC port: %v", err)
	}

	s := grpc.NewServer()
	pb.RegisterMediaOrchestratorServer(s, &server{})
	log.Println("gRPC server running on :50051")

	go func() {
		if err := s.Serve(lis); err != nil && !errors.Is(err, net.ErrClosed) {
			log.Printf("gRPC server error: %v", err)
		}
	}()

	// Simple REST endpoint used by the frontend.
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/session/prepare", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		var req pb.SessionRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "invalid request body", http.StatusBadRequest)
			return
		}

		resp, err := (&server{}).PrepareMediaSession(r.Context(), &req)
		if err != nil {
			http.Error(w, "failed to prepare session", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	})

	log.Println("REST API running on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("failed to serve REST API: %v", err)
	}
}
