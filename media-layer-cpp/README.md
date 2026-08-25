# Kzys Media Layer

This folder is the independent media-engine boundary for the project.

It is intentionally separated from the C# control plane and the web frontend.
The goal is to keep media logic, packet routing, and capacity policy isolated so
the rest of the application can evolve independently.

The coordinator logic in this folder is intentionally stateless: it takes room
snapshots, device hints, and node snapshots as inputs and returns join / routing
decisions as outputs. Any live media worker that actually carries RTP/RTCP will
still keep short-lived transport state while a call is active.

## What belongs here

- room/session state for the media plane
- join authorization contract
- publisher/listener policy
- node assignment and load hints
- RTP/RTCP-aware media routing logic
- graceful drain and reconnect policy
- load-test hooks and benchmarks for media capacity

## What does not belong here

- UI
- auth forms
- billing
- dashboard logic
- deployment manifests
- infra automation

## Current status

This is the initial scaffold for the media layer. It defines the boundary,
interfaces, and a small in-process room allocator so the core design can be
iterated separately from the existing app.

The next step is to add packet-level transport and SFU worker logic behind the
interfaces in `include/kzys/media/`, while keeping the planner itself stateless.
