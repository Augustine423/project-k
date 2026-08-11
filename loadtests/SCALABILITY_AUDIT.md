# Interactive scale roadmap (vs Zoom / Google Meet)

Target tiers this codebase is moving toward:

| Tier | Join cap | Interactive cam/mic | Our stack |
|------|----------|----------------------|-----------|
| Zoom Pro / Meet Starter | 100 | 100 | ✅ software ready |
| Zoom Business / Meet Plus | 300 / 500 | 300 / 500 | ✅ config default 300 publishers, 1000 joins |
| Zoom Large / Meet Enterprise | 1000 | 500–1000 (degraded) | ⚠️ needs 6+ SFU nodes + Postgres HA |
| Webinar / live stream | 10k–100k view-only | N/A | 🔜 webinar mode + egress |

## Architecture (LiveKit SFU — same class as Zoom/Meet backend)

```text
Browser ──HTTPS──► nginx (web LB) ──► control-plane (tokens, TURN creds, room state)
                 └── /livekit ──────► LiveKit cluster (Redis-coordinated SFU)
                                      └── one room = one SFU node (up to ~100–150 publishers/node)
TURN (coturn) ──► NAT traversal when direct UDP fails
Redis ──► room roster, LiveKit node registry, scaling metrics
```

**Reference tech:** [LiveKit distributed SFU](https://docs.livekit.io/transport/self-hosting/distributed/), simulcast + paginated gallery (`galleryVideoPolicy.ts`), TURN REST credentials, Redis-backed control plane.

## Patched (interactive scale upgrade)

| Area | Before | After |
|------|--------|-------|
| `INTERACTIVE_MAX_PUBLISHERS` | 50 | **300** (Zoom Business class) |
| `MAX_ROOM_PARTICIPANTS` (k8s) | 500 | **1000** |
| Webinar flip threshold | 45 listeners | **400** listeners / ratio **8.0** |
| LiveKit replicas | 1 | **3** + HPA 1–6 |
| LiveKit UDP ports | 101 | **1000** (50000–50999) |
| Coturn relay ports | 101 | **1000** (20000–20999) |
| LiveKit node selector | none | **sysload** (least-loaded node) |
| SFU desired pods metric | active rooms only | **publisher-weighted** load |
| Redis (k8s) | 512 Mi | **1 Gi** |
| Gallery client tier | up to 200 | **up to 300** publishers |

## CI verification

- **Unit tests** (`backend-unit`): Redis-backed store tests
- **Load test** (`load-test`): k6 join storm (400 VUs) — control plane only
- **Gap:** add LiveKit publisher load test before claiming 300 interactive cameras in prod

## Remaining to beat Zoom/Meet at 500+ interactive video

1. **GKE media node pool** — 3–6× `c2-standard-8` (or GPU-less compute), label `project-k.io/media-node=true`
2. **Postgres** — multi-replica control plane (SQLite breaks with scale-out)
3. **Redis HA** — Sentinel or Memorystore for LiveKit coord + control plane
4. **Per-node RTC** (staging NLB with 1 pod, or one SFU IP per node — see `k8s/staging` / `k8s/local`)
5. **Coturn pool** — 2+ coturn pods on separate nodes
6. **LiveKit Cloud fallback** — optional hybrid for rooms &gt; single-node SFU cap (~3000 per LiveKit docs self-hosted)
7. **Geo DNS** — region-aware signaling (LiveKit `regionaware` node selector)
8. **Observability** — Prometheus + Grafana for SFU CPU, packet loss, join latency

## Environment knobs

| Variable | Default (new) | Purpose |
|----------|---------------|---------|
| `MAX_ROOM_PARTICIPANTS` | 1000 (k8s) / 10000 (code) | Hard join cap |
| `INTERACTIVE_MAX_PUBLISHERS` | 300 | Max cam/mic publishers (interactive) |
| `WEBINAR_ENTER_LISTENERS` | 400 | Delay auto-webinar switch |
| `WEBINAR_ENTER_RATIO` | 8.0 | listeners:publisher ratio before webinar |
| `LARGE_ROOM_EVENT_THRESHOLD` | 500 | WS count-only events |
| `SFU_PUBLISHERS_PER_NODE` | 100 | HPA / metrics hint |
| `KZYS_SFU_STANDBY_POOL` | 2 | Minimum warm SFU nodes |

## Realistic capacity (current k8s manifests)

| Test | Software cap | Needs (infra) |
|------|--------------|---------------|
| Join / chat / WS | 1000 | 1 control-plane + Redis |
| Interactive video | 300 publishers | 3 SFU nodes × ~100 publishers |
| One room max cameras | ~100–150 | Single SFU node CPU limit (LiveKit constraint) |
| 300 in one room | 300 | **Not yet** — split across rooms or add SFU mesh (LiveKit Cloud) |

**Bottom line:** Software limits now match **Zoom Business (300 interactive)**. Hardware must follow: **3+ media nodes** for lab proof, **6+** for sustained 300 cameras in one room (LiveKit keeps one room on one node).
