# webhook-listener

Local webhook inspection tool (like webhook.site) built with Node.js + Express + TypeScript and packaged for Docker.

## Endpoint Shape
- Ingest: `POST /hook/:namespace`
- Example: `http://localhost:18800/hook/alpha`

## Configuration
- `NAMESPACES=alpha,beta,dev` (comma-separated)
- `DATA_DIR=/data` (container path)
- `PORT=18800`

## Run (Docker Compose)
```bash
docker compose up --build
```

## Dev Mode (Docker Compose)
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

## Access
- UI: `http://localhost:18800`
- Webhooks: `http://localhost:18800/hook/<namespace>`

## Data
Events are persisted under `./data/<namespace>/events.jsonl`.
