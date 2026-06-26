# Plan: Standardize Local/Production Protocol Handling

## Goal
Ensure local development environment uses `http`/`ws` consistently and avoid SSL/TLS requirement for local testing, while maintaining production readiness (`https`/`wss`).

## Current Context
- Frontend (`App.js`) dynamically detects protocol based on window location.
- Kubernetes environment variables (`LIVEKIT_URL`) currently point to `http` internally.
- Local testing fails because browser security policies block media/websocket connections without valid local SSL.

## Proposed Approach
1. **Frontend**: Refactor `App.js` to rely on an environment variable `REACT_APP_PROTOCOL_MODE` (or simply honor `window.location.hostname === 'localhost'`) to explicitly force `ws`/`http` in local dev.
2. **Configuration**: Define a clear set of environment variables for `API_URL` and `LIVEKIT_URL` that can be overridden in local development.
3. **Infrastructure**: Verify that Kubernetes manifests use the correct `http` internal endpoints (already confirmed, but will re-check).

## Step-by-step Plan
1. **Modify `frontend/src/App.js`**: Replace protocol detection with an explicit `isLocal` flag that disables `wss` attempts entirely in development.
2. **Refactor Environment handling**: Update `frontend/package.json` scripts if needed to support local overrides.
3. **Documentation**: Add a note to `README.md` about the local dev protocol setup.

## Files to change
- `frontend/src/App.js`
- `README.md` (Update Local Run section)

## Verification
- Test local startup via `npm run start` and verify WebSocket connections to `ws://` rather than `wss://`.
- Validate that the browser console no longer shows mixed-content errors or SSL rejection.
