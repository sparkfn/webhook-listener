# Project Decision Record (PDR)

## Summary
Build a self-hosted, dockerized webhook inspection tool (like webhook.site) with a Node.js/TypeScript Express backend, a simple frontend, and a reverse proxy container (Caddy). The tool exposes multiple namespaces (endpoints) defined by Docker Compose environment variables, captures inbound requests with full payloads/headers, streams events live via WebSocket, and stores all events on disk under `./data` with no limits.

## Goals
- Docker-first deployment with compose, volumes, and fixed port mapping.
- Node.js + Express + TypeScript backend.
- Support multiple namespaces/endpoints defined via env.
- Simple UI for selecting namespaces and viewing incoming events and payloads.
- Live updates via WebSocket.
- Persist events to disk under `./data`.
- No auth; intended for private/dev use.
- Proxy container mapping `18800:80` and `14433:443`, listening on `0.0.0.0`.

## Non-Goals
- No authentication/authorization.
- No rate limits or retention limits.
- No multi-tenant billing or access controls.
- No TLS termination in this stack (external proxy will handle FQDN/HTTPS).

## Requirements (Confirmed)
1. Docker project.
2. Node.js Express + TypeScript.
3. Multiple namespaces/endpoints (query-based is acceptable; final shape to be defined in implementation).
4. Frontend to create/select namespaces (limited to env-defined namespaces).
5. Reverse proxy (Caddy) mapped to `18800:80` and `14433:443`.
6. UI similar to webhook.site: list of events, detailed payload, headers, metadata.
7. UI can switch between namespaces.
8. No auth.
9. Namespaces are configured via docker compose env.
10. Persist to `./data` (bind/volume).
11. Live updates via WebSocket.
12. Listen on `0.0.0.0` (external proxy handles FQDN/HTTPS).

## Key Decisions
- **Namespace model:** Namespaces are derived from an env variable (e.g. `NAMESPACES=alpha,beta`). The backend only accepts requests for those namespaces.
- **Endpoint format:** Implementation will pick a stable URL shape (likely `/hook?ns=xxxx` or `/hook/xxxx`) and document it. (User allowed “anything”.)
- **Storage:** Append-only JSONL per namespace under `./data/<namespace>/events.jsonl` plus a small index for quick listing.
- **Transport:** REST ingestion + WebSocket broadcast for real-time UI updates.
- **UI:** Single-page, minimal design that mirrors webhook.site’s left event list + right payload/headers panel.
- **Proxy:** Caddy container in front for local port mapping; actual HTTPS handled by external proxy.

## Architecture Overview
- **web**: Express + TS API server
  - Ingests webhook requests
  - Persists events to disk
  - Broadcasts events via WebSocket
  - Serves the frontend
- **proxy**: Caddy
  - Listens on `0.0.0.0:80` and `0.0.0.0:443`
  - Forwards to `web:18800`

## Data Model (Event)
- id (uuid)
- namespace
- timestamp
- method
- path
- query
- headers
- body (raw + parsed if JSON)
- remoteAddress

## Risks / Open Questions
- Final endpoint URL shape to be decided in implementation and documented.
- UI scope/UX polish vs. time budget.
- File growth without limits (expected for dev tool).

## Milestones
1. Compose + container scaffolding + Caddy proxy.
2. Express TS server with ingestion endpoint + filesystem persistence.
3. WebSocket event broadcast.
4. Frontend UI (list + detail + namespace switch).
5. Basic docs for usage and environment variables.

---

# Evaluation (Post-Requirements Clarification)

## Fit to Requirements
- The proposed stack (Docker + Node/TS + Express + Caddy) matches the specified constraints.
- Namespaces are env-defined, no dynamic creation beyond that.
- Storage is on disk under `./data` with no limits and no auth.
- WebSocket streaming satisfies live update requirement.
- UI mirrors webhook.site’s event list + payload view and supports switching namespaces.

## Remaining Decisions to Confirm (Implementation Phase)
- Exact endpoint URL shape (e.g., `/hook?ns=xxxx` vs `/hook/xxxx`).
- Event file layout and any index strategy for faster UI listing.
- Any optional filters/search in the UI (out of scope unless requested).

## Conclusion
The clarified requirements are internally consistent and directly implementable. The PDR above provides a concrete blueprint aligned to the requested behavior, with only the endpoint URL shape left as a small implementation choice.
