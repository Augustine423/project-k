# Staging — ALB frontend, NLB media, ClusterIP internals

Namespace: `meetingmax-staging`

```text
Internet
  │
  ├─ ALB / GCE Ingress :443  →  kzys-web ClusterIP :80   (HPA 2–10, spread nodes)
  │     nginx  /          UI
  │     nginx  /api /ws   →  kzys-control-plane ClusterIP :4000  (HPA 2–8)
  │     nginx  /livekit   →  kzys-livekit ClusterIP :7880   (signal only)
  │
  ├─ NLB  kzys-coturn-nlb     :3478 TCP/UDP + :20000 UDP  →  coturn (HPA 2–4)
  └─ NLB  kzys-livekit-nlb    :7881 TCP + :50000 UDP      →  livekit media (HPA 2–6)

ClusterIP only: redis (1 pod, in-cluster), control-plane, livekit signal, web
```

GKE HTTP(S) Load Balancer = ALB analogue.  
GKE `Service type: LoadBalancer` L4 = NLB analogue.

## Replicas / HPA (not Redis)

| Deploy | Min | Max | Spread |
|---|---|---|---|
| `kzys-web` | 2 | 10 | anti-affinity hostname |
| `kzys-control-plane` | 2 | 8 | anti-affinity |
| `livekit` | 2 | 6 | anti-affinity (prefer 1 pod/node) |
| `coturn` | 2 | 4 | anti-affinity |
| `redis` | **1** | **1** | in-cluster; no HPA, no Memorystore |

HPA uses **CPU ~65–70%** and **memory ~75%** (`40-hpa.yaml`). Needs metrics-server (on by default on GKE/EKS).

LiveKit ICE still advertises `LIVEKIT_MEDIA_IP` = media NLB IP. That is staging-best-effort with several pods. Production ICE is one SFU per node with that node's public IP.

## Redis (staging: in-cluster)

Staging does **not** use cloud Redis. Keep `REDIS_URL=redis://redis:6379` and LiveKit `redis.address: redis:6379`. Size the single Redis pod if memory spikes. Swap to Memorystore/ElastiCache later by changing those two URLs only.

Redis is a shared dependency for room state, cross-pod WebSocket event fanout, and LiveKit coordination. The single staging Redis pod is a single point of failure; increasing control-plane or LiveKit replicas does not make Redis highly available. Use a managed or explicitly HA Redis deployment, with persistence/failover appropriate to the service, before relying on production multi-pod availability.

Each control-plane pod also keeps its own in-memory WebSocket connection map. This is expected: Redis Pub/Sub distributes events and each pod writes to its own connected sockets; the publishing pod suppresses its own Pub/Sub echo after local delivery. Disconnect grace timers are process-local, while presence is checked in Redis; a pod restart can cancel a timer, so reconnect, expiration, and stale participant cleanup still need operational validation.

## Capacity configuration

The staging ConfigMap intentionally limits rooms to 500 participants and interactive publishing to 50. Compose/local configuration defaults are higher (10,000 participant admission and 10,000 interactive publishers), but these are configured limits—not measured or guaranteed capacity. A large mostly-listening room has very different SFU, network, Redis, and browser costs from a room where many participants publish HD video. Do not infer capacity from the configured admission cap.

## Node autoscaling (cluster, not this folder)

HPA only creates **pods**. If nodes are full, pods stay Pending until the **cluster autoscaler** adds VMs:

- **GKE:** node-pool autoscaling / node auto-provisioning. Use a larger **media** pool for LiveKit/Coturn.
- **EKS:** Cluster Autoscaler or Karpenter.

Scale-out: traffic → HPA more pods → Pending → new nodes.  
Scale-in: load drops → HPA to min → unused nodes drain after the cloud delay.

## Apply

```powershell
cd MeetingMax\k8s\staging
kubectl apply -f 00-namespace.yaml
kubectl apply -f 02-secrets.example.yaml   # or a real 02-secrets.yaml
kubectl apply -f .
```

Wait for EXTERNAL-IPs:

```powershell
kubectl -n meetingmax-staging get ingress,svc,hpa
```

Patch `01-configmap.yaml` then re-apply:

| Key | Set to |
|---|---|
| `PUBLIC_HOST` | Ingress / ALB address (or DNS) |
| `LIVEKIT_PUBLIC_URL` | `wss://<PUBLIC_HOST>/livekit` |
| `TURN_HOST` | Coturn NLB EXTERNAL-IP |
| `LIVEKIT_MEDIA_IP` | LiveKit media NLB EXTERNAL-IP |

```powershell
kubectl -n meetingmax-staging rollout restart deploy/coturn deploy/livekit deploy/kzys-web deploy/kzys-control-plane
```

Open `https://<PUBLIC_HOST>/` (Ingress TLS). If you have no cert yet, HTTP Ingress still serves `:80`.

## AWS ALB (optional)

Swap `31-frontend.alb-ingress.yaml` class to `alb` and point at `kzys-web:80`. Keep Coturn / LiveKit media as `type: LoadBalancer` (NLB). Do not put UDP TURN on the ALB.
