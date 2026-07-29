# Scalability audit (10k+ control plane)

This document tracks code-level readiness for **10,000+ concurrent joins per room** (webinar-style).

## Patched (this change set)

| Area | Before | After |
|------|--------|-------|
| Participant roster | Full `HGETALL` on every list/stats call | O(1) `HLEN` count + paginated `ListParticipantsPage` |
| WS join fanout | `participant.joined` to every client | Count-only `room.participant_count` above `LARGE_ROOM_EVENT_THRESHOLD` (default 200) |
| Media stats | Loaded all participants | Uses `HLEN` + small media hash only |
| `/media` hot path | `ListParticipants` scan | Single `GetParticipant` |
| Mode queue | Enqueued, never consumed | `RoomModeApplyWorker` background consumer |
| WS backpressure | Drop when queue full (16) | Bounded 64, drop-oldest |
| Frontend people list | Render all DOM nodes | Paginated API + load-more; live list only ≤200 |
| Frontend chat | Unbounded memory | Capped at 500 messages |
| LiveKit client | Track all remotes | Large rooms: track remotes with publications only |

## CI verification (GitHub Actions)

- **Unit tests** (`backend-unit`): Redis-backed store tests (cap, pagination, stats, search)
- **Load test** (`load-test`): k6 join storm (400 VUs) + pagination smoke against control plane + Redis

Run locally only if you choose — CI is the source of truth per project request.

## Remaining infra (not code-only)

- LiveKit SFU cluster sizing for 10k media subscribers
- TURN/UDP reachability at scale
- PostgreSQL for multi-replica control plane (SQLite is dev-only)
- Geo routing / LiveKit webhooks (future)

## Environment knobs

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAX_ROOM_PARTICIPANTS` | 10000 | Hard join cap |
| `LARGE_ROOM_EVENT_THRESHOLD` | 200 | Switch WS to count-only events |
| `PARTICIPANTS_PAGE_SIZE` | 50 | API default page size |
| `PARTICIPANTS_SEARCH_SCAN_CAP` | 3000 | Max hash keys scanned for search |
