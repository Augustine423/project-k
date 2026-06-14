# KZYS Project: Hybrid Video Conferencing Platform (C# & React)

KZYS is a high-performance, production-grade video conferencing platform designed for low-latency live meetings and broadcasts.

## 🏗️ Architecture

The platform is designed around a decoupled, ultra-low latency model:
- **Control Plane & Signaling (C# / ASP.NET Core):** Manages sessions, users, active rooms, real-time SignalR signaling, and chat message delivery.
- **Data Plane (C / Janus Gateway):** Manages media processing, selective forwarding (SFU), UDP, and WebRTC streaming.
- **Frontend (React 18):** A premium, glassmorphic UI styled with CSS variables. Features full conference layout management, micro-animations, a slide-out chat system, participant drawers, and simulated multi-party rooms.

---

## 📂 Project Structure

- `backend-csharp/`: Core ASP.NET Core API and SignalR Hub for Signaling/Chat.
- `frontend/`: React SPA with premium UI components.
- `janus-gateway/`: Reference media-gateway plugin structures for sub-ms video distribution.
- `k8s/`: Kubernetes manifests (Deployment, Ingress, Kustomize setup).
- `.github/workflows/`: Automated multi-service CI/CD pipelines.

---

## ⚙️ Run Locally

### 1. Start C# Backend
Make sure you have .NET 8 SDK installed.
```bash
cd backend-csharp
dotnet run
```
Runs at `http://localhost:8080` (SignalR Hub on `/meetinghub`).

### 2. Start Frontend
```bash
cd frontend
npm install
npm run start
```
Runs at `http://localhost:3000`.

---

## 🚀 Low-Latency Janus Integration

Janus achieves sub-second processing by running a Selective Forwarding Unit (SFU) in native C. The React client is structured to separate **Publishers** (sending local WebRTC camera/audio tracks) from **Subscribers** (receiving individual downstream peer feeds), enabling sub-millisecond network turnaround times.
