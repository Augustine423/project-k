# KZYS Project: Hybrid Video Conferencing Platform (Go & React)

KZYS is a high-performance, production-grade video conferencing platform designed for low-latency live meetings and broadcasts, powered by an SFU-based architecture.

## 🏗️ Architecture

The platform is designed around a modern, scalable, Kubernetes-native model:

- **Control Plane & Signaling (Go):** High-performance signaling server using LiveKit Server SDK to manage room state, user authentication, and LiveKit tokens.
- **Data Plane (LiveKit SFU):** A purpose-built, Go-based Selective Forwarding Unit (SFU) for scalable video streaming.
- **Frontend (React 18):** A premium, glassmorphic UI integrated with the `livekit-client` SDK for sub-second, multi-party video conferencing.

---

## 📂 Project Structure

- `backend-go/`: High-performance Go signaling service for room orchestration and authentication.
- `frontend/`: React SPA with premium UI components, leveraging LiveKit SFU for media.
- `k8s/`: Kubernetes manifests (Deployment, Ingress, Kustomize setup, Secret management).
- `.github/workflows/`: Automated CI/CD pipelines to build and push container images.

---

## ⚙️ Run Locally

### 1. Start Go Backend
Make sure you have Go 1.22+ installed.
```bash
cd backend-go
go run main.go
```
Runs at `http://localhost:8080`.

### 2. Start Frontend
```bash
cd frontend
npm install
npm run start
```
Runs at `http://localhost:3000`.

---

## 🚀 Scalable SFU Integration

KZYS leverages the LiveKit SFU, which allows for unlimited user scaling via adaptive streaming and dynacast technology. By offloading media distribution to a dedicated Go-based SFU, the platform ensures low latency even as the number of participants grows.
