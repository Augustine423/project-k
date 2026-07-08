# KZYS — Janus VideoRoom (dev test)

Video conferencing with **Janus Gateway VideoRoom** SFU, C# backend (rooms + chat), React UI.

## Stack

| Component | Role |
|-----------|------|
| `frontend/` | React lobby + room UI, `janus.js` + `useJanusVideoRoom.js` (from `janus-gateway/html/demos/videoroom.js`) |
| `backend-csharp/` | Room create/validate, Janus room provisioning, SignalR chat, TURN creds |
| `janus` (k8s) | Janus VideoRoom SFU |
| `kzys-coturn` | TURN relay (NodePort 30478) |
| `kzys-redis` | Room registry + SignalR backplane |

## Deploy (GKE)

```bash
kubectl apply -f k8s/
kubectl get svc kzys-frontend   # EXTERNAL-IP
# http://<EXTERNAL-IP>/
```

Rebuild images after code changes:

```bash
docker build -t kyawzayarsoe/frontend:latest -f frontend/Dockerfile .
docker build -t kyawzayarsoe/backend-csharp:latest -f backend-csharp/Dockerfile backend-csharp
kubectl rollout restart deployment/kzys-frontend deployment/kzys-backend-csharp deployment/janus
```

## API flow

1. `POST /api/rooms/create` → creates KZYS room + Janus VideoRoom (admin API)
2. `GET /api/janus/config?roomId=&joinKey=` → WebSocket URL, numeric Janus room id, ICE servers
3. Browser → Janus VideoRoom plugin: join → publish → subscribe (same as official demo)
4. SignalR `/api/meetinghub` → chat only

## Reference

Video logic source: `janus-gateway/html/demos/videoroom.js`
