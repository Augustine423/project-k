# KZYS Video Meeting Project

Minimal VideoRoom adaptation from Janus for Zoom/Teams-like application.

## Project Structure:
```
kzys-project/
├── .github/workflows/     # GitHub Actions CI/CD
│   └── docker-build.yml
├── backend/               # C backend (WebSocket server, media routing)
│   ├── Dockerfile
│   ├── videoroom-core.c
│   ├── videoroom-config.h
│   ├── websocket-server.c
│   ├── media-router.c
│   └── Makefile
├── frontend/              # Web frontend
│   ├── Dockerfile
│   ├── test-frontend.html
│   ├── webrtc-integration.js
│   └── package.json
├── k8s/                   # Kubernetes manifests
│   ├── backend-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── ingress.yaml
│   └── kustomization.yaml
├── docker-compose.yml     # Development setup
├── docker-compose.prod.yml # Production setup
└── README.md
```

## Based on Janus VideoRoom Plugin:
- Multi-party video conferencing
- SFU (Selective Forwarding Unit) architecture
- Publish/Subscribe pattern
- WebRTC media routing

## GitHub Actions CI/CD:
Automatically builds and pushes Docker images to Docker Hub on push to main branch.

### Setup Secrets in GitHub Repository:
1. Go to Repository → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `DOCKER_USERNAME`: `kyawzayarsoe`
   - `DOCKER_PASSWORD`: `Kakeruaura1!`

### Docker Images on Docker Hub:
- Backend: `kyawzayarsoe/kzys-backend:latest`
- Frontend: `kyawzayarsoe/kzys-frontend:latest`

## Deployment Options:

### 1. Docker Compose (Development):
```bash
docker-compose up --build
```

### 2. Docker Compose (Production - pre-built images):
```bash
docker-compose -f docker-compose.prod.yml up
```

### 3. Kubernetes:
```bash
kubectl apply -k k8s/
```

## Access:
- Frontend: http://localhost (or LoadBalancer IP in K8s)
- WebSocket: ws://[host]/ws

## Manual Build:
```bash
# Backend
cd backend
make

# Frontend
cd frontend
npx serve .  # or use any static server
```
