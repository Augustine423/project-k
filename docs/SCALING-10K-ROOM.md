# Scaling to 10,000 participants per room

All numbers are planning estimates, not measurements. Validate with `lk load-test` (section 6) before relying on them.

## 1. Key constraint: one room = one SFU node

LiveKit places a room on a single node. Raising `max_participants` to 10,000 does not make a node able to carry 10,000 interactive participants. Capacity per room is limited by one node's CPU and NIC.

So 10,000 per room is only feasible as a **tiered room**:

| Tier | Who | Transport | Latency | Cap per room |
|---|---|---|---|---|
| Presenters | camera/mic/screen on | WebRTC publish | ~100–250 ms | 50–100 (≈25 with all cameras on) |
| Interactive attendees | mic on request, camera off | WebRTC | ~100–250 ms | up to ~500 total in room |
| View-only attendees | subscribe only (`canPublish=false`) | WebRTC (≤ ~1,500) then HLS/CDN | 150–250 ms WebRTC / 2–6 s LL-HLS | up to 10,000 |

The ~100–250 ms target applies to WebRTC tiers only. HLS cannot meet it.

## 2. CPU and bandwidth model (per 8 vCPU, 10 Gbps node)

SFU cost is dominated by **egress**: each published track is forwarded once per subscriber.

- Ingress per publisher: camera simulcast ≈ 1.5–2.5 Mbps (3 layers), audio ≈ 40 kbps.
- Egress per viewer in a 16-tile gallery: ≈ 6–12 Mbps (mixed low/medium layers), plus ≈ 0.2 Mbps audio.
- Egress per viewer in speaker view (1 large + 3 thumbs): ≈ 2–4 Mbps.
- Egress per viewer, audio only: ≈ 0.1–0.3 Mbps.

| Scenario | Rough per-node capacity |
|---|---|
| 16-tile gallery, everyone on camera | ~100–150 participants |
| Speaker view, 5 presenters | ~800–1,500 viewers |
| Audio-only attendees (webinar listeners) | ~3,000–5,000 |

For a 10,000-viewer webinar over WebRTC, egress would be roughly 10,000 × 2–4 Mbps = 20–40 Gbps. That needs 4+ nodes, which a single room cannot use. Beyond ~1,500 viewers per room use egress/HLS (section 4).

Network egress cost is usually the dominant cloud bill. Use the node network class (`c6in`/`c7gn`) and monitor NIC saturation, not only CPU.

## 3. Cloud scaling design (`k8s/scaling/`)

| File | Purpose |
|---|---|
| `00-livekit-config.yaml` | `max_participants: 10000`, congestion control with pausing, sysload-based node selection (70%), Prometheus on `:6789` |
| `10-livekit-deployment.yaml` | SFU on dedicated nodes: `hostNetwork`, one pod per node, no CPU limit (avoids CFS throttling latency), 1 h drain, PDB |
| `20-control-plane-scaling.yaml` | HPA 3–40 on CPU/memory with slow scale-down (sticky WebSockets), PDB, resource patch |
| `30-keda-livekit.yaml` | KEDA scaling on CPU, **published video/audio tracks per pod**, and **subscribed tracks per pod** |
| `40-node-autoscaling.yaml` | Karpenter pools (on-demand network-optimised SFU nodes, spot app nodes) plus overprovisioning headroom |
| `50-egress-broadcast.yaml` | Egress workers (RoomComposite → HLS/CDN) with KEDA scaling |
| `60-loadtest-job.yaml` | `lk load-test` job |

Scaling by camera/mic state: the KEDA triggers use per-pod published-track counts (target ≈ 400 video / 800 audio per node) and subscribed-track counts (≈ 6,000 per node). Turning cameras on raises both and adds nodes; turning them off lets them scale in after a 15 min cooldown. `expireAfter: Never` and the 1 h `terminationGracePeriodSeconds` keep running meetings from being moved.

Caveats:
- Autoscaling adds nodes for **new rooms**. A running room cannot move to a new node, so a single room must be capped to fit one node (section 1).
- Node provisioning takes ~60–120 s. The overprovision pod keeps one node's headroom warm.
- Metric names (`livekit_track_published_total`, etc.) must be checked against the deployed LiveKit version.
- On non-AWS clouds replace the Karpenter manifests with equivalent node pools.

### Redis-backed nodes

LiveKit nodes coordinate room placement and signalling through Redis. `k8s/deployment.yaml` now points at the 3-pod Sentinel setup in `k8s/redis-ha.yaml` (AOF persistence, PDB, quorum 2); apply that file with it. The control plane and LiveKit connect through Sentinel (`serviceName=mymaster`), and the control-plane rate limiter runs on the same Redis.

- Use a managed Redis with HA (e.g. ElastiCache or Memorystore with replica and automatic failover), or Redis Sentinel, with 2+ GB memory.
- The control plane also uses it for Pub/Sub event relay, so give it a separate logical DB or instance from LiveKit if traffic is high.
- Keep Redis in the same region/zone as the SFU nodes (a few ms RTT).

### Networking

- Expose UDP 7882 and TCP 7881 per node directly (hostNetwork, public IPs); signalling (7880) goes through an ingress with WebSocket support and a long idle timeout.
- Deploy TURN/TLS on 443 for restrictive networks. Expect 5–15% of users to need it, which raises egress cost.
- Use regional clusters (or LiveKit multi-region) to keep client RTT low. Media latency is mostly network RTT plus jitter buffer, so the 100–250 ms target depends on users being near an SFU.

## 4. Large audiences: egress/broadcast

Beyond ~500 interactive and ~1,500 WebRTC viewers:

1. Presenters publish via WebRTC.
2. A RoomComposite egress (`50-egress-broadcast.yaml`) renders the room and pushes HLS (or RTMP) to a CDN.
3. Extra view-only attendees watch the HLS stream, with the CDN absorbing 10,000+ viewers at flat SFU cost.
4. "Raise hand → promote" moves a viewer to the WebRTC tier by issuing a new token with `canPublish=true`.

Trade-off: 2–6 s latency for the HLS tier, and each composite egress needs ~4 CPU.

## 5. Application-side behaviour (implemented)

- `RoomPlanManager.GetTierLimits`: separate `MaxPublishers` / `MaxInteractive` caps per room size (up to 10,000 participants).
- Attendees in large rooms get `canPublish=false`. `POST /api/rooms/{id}/participants/{pid}/promote|demote` changes publish rights through LiveKit `UpdateParticipant`, bounded atomically in Redis.
- `POST /api/rooms/{id}/media-token` re-issues a LiveKit token for an existing seat and re-reads the promoted state, so a reconnecting or refreshed presenter keeps publish rights. The client calls it before every manual (re)connect.
- Admission: joins past `MAX_WEBRTC_PARTICIPANTS` are rejected, or get `delivery="hls"` + `hlsUrl` when `HLS_BASE_URL` is set. The web client plays that with hls.js (native HLS on Safari).
- Rate limits are fixed-window counters in Redis, shared by every control-plane pod. Join is limited per IP (`RATE_LIMIT_JOIN_PER_MIN`, default 600, generous for shared NATs) and per room (`RATE_LIMIT_JOIN_ROOM_PER_MIN`, default 3000). Promote is limited per token and per room. Create and media are per token/IP. If Redis is unavailable the limiter fails open.
- Client: speaker-focused layout for view-only attendees, audio-only for off-page speakers, screen share only when video is wanted, simulcast/dynacast/adaptive stream on.

## 6. Verification with `lk load-test`

```bash
lk load-test --url wss://livekit.example.com --api-key $KEY --api-secret $SECRET \
  --room load-test-interactive --video-publishers 50 --audio-publishers 100 \
  --subscribers 450 --duration 10m --num-per-second 5
```

Run a ramp and record, per node:

| Signal | Pass criterion |
|---|---|
| CPU (sysload) | < 70% at target load |
| NIC egress | < 70% of line rate |
| Packet loss / jitter reported by `lk load-test` | < 1% / < 30 ms |
| Join time at 5 joins/s | < 3 s |
| Scale-out | new SFU node serving new rooms within ~2 min |

Repeat with the speaker-view profile (`--video-publishers 5 --subscribers 1500`) and a mixed profile with cameras toggling. Run the load generator from a separate node pool or region so it does not compete with the SFU.

## 7. Rollout order

1. Apply Redis HA and the node pools.
2. Apply `00`, `10`, `20`, then `30` (after Prometheus is scraping LiveKit).
3. Run the load tests and tune the KEDA thresholds from measured per-node capacity.
4. Implement the application changes in section 5, then re-test.
5. Enable `50` for audiences above the WebRTC cap.
