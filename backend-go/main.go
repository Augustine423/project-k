package main

import (
	"context"
	"log"
	"net"
	"net/http"

	"github.com/grpc-ecosystem/grpc-gateway/v2/runtime"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"kzys-project/pb" // Ensure this is generated
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
	// 1. Start gRPC Server (for C-backend communication)
	go func() {
		lis, _ := net.Listen("tcp", ":50051")
		s := grpc.NewServer()
		pb.RegisterMediaOrchestratorServer(s, &server{})
		log.Println("gRPC Server running on :50051")
		s.Serve(lis)
	}()

	// 2. Start gRPC-Gateway (for React/Flutter REST/JSON calls)
	ctx := context.Background()
	mux := runtime.NewServeMux()
	opts := []grpc.DialOption{grpc.WithTransportCredentials(insecure.NewCredentials())}
	
	err := pb.RegisterMediaOrchestratorHandlerFromEndpoint(ctx, mux, "localhost:50051", opts)
	if err != nil {
		log.Fatalf("Failed to start gateway: %v", err)
	}

	log.Println("gRPC-Gateway running on :8080")
	http.ListenAndServe(":8080", mux)
}
