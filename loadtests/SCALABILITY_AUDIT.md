# Scalability notes

Configuration limits and architecture notes are not capacity benchmarks. This repository does not establish that a room can sustain a particular number of participants, publishers, or end-to-end latency.

## Architecture (LiveKit SFU — same class as Zoom/Meet backend)

```text
Browser ──HTTPS──► nginx (web LB) ──► control-plane (tokens, TURN creds, room state)
                 └── /livekit ──────► LiveKit cluster (Redis-coordinated SFU)
                                      └── one room = one SFU node (up to ~100–150 publishers/node)
TURN (coturn) ──► NAT traversal when direct UDP fails
Redis ──► room roster, LiveKit node registry, scaling metrics
```

**Reference tech:** [LiveKit distributed SFU](https://docs.livekit.io/transport/self-hosting/distributed/), simulcast + paginated gallery (`galleryVideoPolicy.ts`), TURN REST credentials, Redis-backed control plane.

## Environment knobs

The values below describe configuration, not validated capacity. Defaults vary by deployment profile: local/Compose use a 10,000 participant admission cap and 10,000 interactive publisher cap; staging deliberately uses 500 participants and 50 interactive publishers.

| Variable | Code/Compose default | Staging | Purpose |
|----------|---------------------|---------|---------|
| `MAX_ROOM_PARTICIPANTS` | 10000 | 500 | Admission cap; not a tested room capacity |
| `INTERACTIVE_MAX_PUBLISHERS` | 10000 | 50 | Interactive audio/video publishing permission cap |
| `WEBINAR_MAX_PUBLISHERS` | 50 | 20 | Webinar publishing permission cap |
| `WEBINAR_ENTER_LISTENERS` | 10000 | 400 | Automatic webinar-mode threshold |
| `WEBINAR_ENTER_RATIO` | 8.0 | 8.0 | Listener-to-publisher ratio before webinar mode |
| `LARGE_ROOM_EVENT_THRESHOLD` | 500 | 200 | Above this, use count-only presence events |
| `PARTICIPANTS_PAGE_SIZE` | 50 | 50 | Default participant roster page size |
| `SFU_PUBLISHERS_PER_NODE` | 100 | 50 | Scaling metric hint, not a guaranteed node capacity |
| `KZYS_SFU_STANDBY_POOL` | 1 | 2 | Minimum warm SFU node target |

The kind-local ConfigMap overrides `KZYS_SFU_STANDBY_POOL` to 0.

## Capacity expectations and limits

A room with 10,000 mostly-listening attendees is a different workload from one where thousands publish HD video. Mic/camera-off defaults and selective subscriptions can reduce media traffic, but do not eliminate the per-attendee signaling, WebSocket, presence, Redis, and browser costs. Interactive publisher limits and admission limits must be chosen for the available SFU, TURN, network, Redis, and control-plane infrastructure.

No 10,000-attendee or publisher capacity is established by these manifests or configuration values. The existing join-storm scenario exercises the control plane, not LiveKit media capacity. Avoid claiming a production capacity or end-to-end latency target until representative end-to-end measurements have been made in the intended infrastructure.
