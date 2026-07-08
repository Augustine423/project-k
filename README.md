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
- `k8s/`: Kubernetes manifests (Deployments, Services, Secrets, optional Ingress).
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

---

## 🔄 Project Workflow

### 1. User Joins a Meeting (Lobby → Room)

```
User opens browser
  └─> Enters display name + room ID (or generates one)
        └─> Clicks "Enter Conference"
              └─> React mounts the Room component
```

### 2. Camera & Mic Preview

Before connecting to the SFU, the frontend immediately requests the user's camera and microphone:

- If permission is granted → shows live camera preview
- If denied → falls back to an animated canvas placeholder

### 3. LiveKit Token Request

```
React (Room component)
  └─> GET /api/livekit/token?roomId=...&userId=...
        └─> C# Backend (LiveKitController)
              └─> Generates a signed JWT using LIVEKIT_API_KEY + LIVEKIT_API_SECRET
                    └─> Returns { token: "..." }
```

### 4. SFU Connection & Media Publishing

```
Frontend receives token
  └─> room.connect(livekitUrl, token)   ← LiveKit SFU (port 7880)
        └─> createLocalTracks({ audio, video })
              └─> localParticipant.publishTrack(track)
                    └─> Remote participants receive tracks via TrackSubscribed event
```

LiveKit handles all media routing — each participant only receives the tracks they need (Selective Forwarding).

### 5. Real-Time Chat (SignalR)

```
Frontend
  └─> Connects to SignalR Hub (/api/meetinghub)
        └─> Calls JoinRoom(roomId, userId)
              └─> MeetingHub adds connection to SignalR group
                    └─> Broadcasts PeerJoined to room
                          └─> User sends chat → SendChat(message)
                                └─> Hub broadcasts ReceiveChat to all group members
```

### 6. NAT Traversal (TURN)

When direct peer-to-WebRTC connections fail (e.g. behind strict firewalls):

```
WebRTC client
  └─> GET /api/v1/turn/credentials
        └─> TurnController returns Coturn credentials
              └─> Client uses TURN relay (UDP/TCP port 30478/30479)
```

### 7. Participant Leave / Disconnect

```
User clicks Leave (or closes browser tab)
  └─> LiveKit room.disconnect()  ← stops media tracks
  └─> SignalR connection closes
        └─> MeetingHub.OnDisconnectedAsync fires
              └─> Removes user from room group
                    └─> Broadcasts PeerLeft to remaining participants
```

### 8. CI/CD Pipeline

```
git push → main branch
  └─> GitHub Actions: docker-build.yml
        └─> Builds 3 Docker images in parallel:
              ├─ kyawzayarsoe/backend-go:latest
              ├─ kyawzayarsoe/backend-csharp:latest
              └─ kyawzayarsoe/frontend:latest
                    └─> Pushed to Docker Hub
```

### 9. Kubernetes Deployment

```
kubectl apply -f k8s/
  ├─> kzys-frontend        (LoadBalancer — public HTTP)
  ├─> kzys-backend-csharp   (ClusterIP — rooms + tokens)
  ├─> livekit-sfu           (ClusterIP — WebRTC SFU)
  └─> kzys-redis            (ClusterIP — room state)
```

Then open the app:

```bash
kubectl get svc kzys-frontend
# http://<EXTERNAL-IP>/
```

### Request Flow Summary

```
Browser
  │
  ├─ GET  /                        → Nginx → React SPA
  ├─ GET  /api/livekit/token       → C# Backend → LiveKit JWT
  ├─ GET  /api/v1/turn/credentials → C# Backend → Coturn creds
  ├─ WSS  /api/meetinghub          → C# Backend → SignalR (chat)
  └─ WSS  /rtc/                    → LiveKit SFU (media)
```
