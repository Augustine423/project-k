# KZYS Project: Hybrid Video Conferencing Platform

KZYS is a production-grade video conferencing platform leveraging a hybrid architecture:
- **Control Plane (Go):** Manages signaling, user auth, and REST/gRPC API.
- **Data Plane (C):** High-performance UDP/WebRTC media processing.
- **Frontend (React):** Modern web interface for session management.

## Project Structure
- `.github/workflows/`: CI/CD (Docker builds).
- `api/proto/`: Source of truth (gRPC contracts).
- `backend-go/`: Signaling microservice (REST/gRPC).
- `backend-c/`: Media orchestration microservice.
- `deployments/k8s/`: Kubernetes manifests.
- `frontend/`: React SPA.

## Workflow
1. **API:** Frontend calls Go Gateway (REST).
2. **Orchestration:** Go service sends Protobuf commands to C Service (gRPC).
3. **Media:** Clients exchange media via UDP (WebRTC) facilitated by C Service.
4. **CI/CD:** Push to `main` triggers GitHub Action to build and push Docker images.

## Deployment
1. Generate Protobuf bindings:
   `protoc -I api/proto --go_out=. --go-grpc_out=. api/proto/kzys.proto`
2. Deploy to K8s:
   `kubectl apply -f deployments/k8s/`
