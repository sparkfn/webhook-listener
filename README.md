# webhook-listener

A self-hosted, dockerized webhook inspection tool (similar to webhook.site) that lets you receive, inspect, and debug webhooks locally or in development environments.

## What It Does

webhook-listener provides a simple way to:
- **Receive webhooks** from external services (GitHub, Stripe, Slack, etc.) without needing to expose your local machine to the internet
- **Inspect webhook payloads** in real-time with full request details (headers, body, query params, form data)
- **Test integrations** during development by providing multiple isolated endpoints (namespaces)
- **Debug webhook issues** by seeing exactly what's being sent to your server
- **Stream events live** via WebSocket for immediate feedback

## Use Cases

- **Local development**: Test webhooks from SaaS services without deploying to production
- **Integration testing**: Verify webhook payloads match expected formats
- **Debugging**: Inspect failed webhook deliveries to identify issues
- **Multi-environment testing**: Use different namespaces for different projects or environments
- **Learning**: Understand webhook structures from different providers

## Quick Start

### 1. Clone the repository

```bash
git clone https://github.com/jaaacki/webhook-listener.git
cd webhook-listener
```

### 2. Configure namespaces

Copy `.env.example` to `.env` and edit the `NAMESPACES` variable:

```bash
cp .env.example .env
# Then edit .env to set your desired namespaces:
# NAMESPACES=alpha,beta,dev,prod
```

Namespaces act as isolated webhook endpoints. For example, with the above configuration:
- `http://localhost:18800/hook/alpha` - for project alpha
- `http://localhost:18800/hook/beta` - for project beta
- `http://localhost:18800/hook/dev` - for development testing
- `http://localhost:18800/hook/prod` - for production testing

### 3. Start the service

```bash
docker compose up --build
```

### 4. Access the UI

Open your browser to:
- **Web UI**: http://localhost:18800
- **Webhook endpoints**: http://localhost:18800/hook/\<namespace\>

## Configuration

### Environment Variables

Configure these in your `.env` file (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `NAMESPACES` | `""` | Comma-separated list of allowed namespaces (e.g., `alpha,beta,dev`) |
| `DATA_DIR` | `./data` (code), `/data` (Dockerfile) | Directory path for event persistence. The Dockerfile sets `/data`; without Docker the code defaults to `./data` (relative). |
| `PORT` | `18800` | Port for the webhook listener service |

### Example Configuration

```bash
# .env
NAMESPACES=github,stripe,slack,test
```

`DATA_DIR` and `PORT` are set in `docker-compose.yml` and typically do not need changing.

## Usage

### Sending Webhooks

Configure your external service to send webhooks to:

```
<ANY METHOD> http://your-server:18800/hook/<namespace>
```

The endpoint accepts any HTTP method (`GET`, `POST`, `PUT`, `DELETE`, etc.).

**Examples:**

```bash
# Simple JSON payload
curl -X POST http://localhost:18800/hook/alpha \
  -H "Content-Type: application/json" \
  -d '{"event": "user.created", "data": {"id": 123}}'

# Form data
curl -X POST http://localhost:18800/hook/beta \
  -F "username=john" \
  -F "email=john@example.com"

# Multipart with file upload
curl -X POST http://localhost:18800/hook/dev \
  -F "document=@/path/to/file.pdf"

# With custom headers
curl -X POST http://localhost:18800/hook/prod \
  -H "X-Webhook-Signature: sha256=abc123" \
  -H "X-Custom-Header: custom-value" \
  -d '{"test": true}'
```

### Web UI Features

The web interface provides:

- **Real-time event list**: View incoming webhooks as they arrive
- **Detailed inspection**: See full request details including:
  - HTTP method and full URL
  - Request headers
  - Query string parameters
  - Form values and file uploads
  - Raw request body (with optional JSON formatting)
  - Response size and processing time
- **Namespace switching**: Switch between different webhook endpoints
- **Live updates**: Events appear instantly via WebSocket
- **Event clearing**: Clear events for a namespace to start fresh
- **Dark/Light theme**: Toggle between visual themes

## API Endpoints

### Webhook Reception

```
ANY /hook/:namespace
```

Accepts any HTTP method (`GET`, `POST`, `PUT`, `DELETE`, etc.) and captures the full request.

**Response:**
```json
{
  "ok": true,
  "id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### Event Listing

```
GET /api/events?ns=<namespace>
```

Returns all captured events for a namespace.

**Response:**
```json
{
  "events": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "namespace": "alpha",
      "timestamp": "2024-02-08T12:00:00.000Z",
      "method": "POST",
      "path": "/hook/alpha",
      "fullUrl": "http://localhost:18800/hook/alpha",
      "query": {},
      "queryStrings": [],
      "headers": {
        "content-type": "application/json",
        "user-agent": "curl/7.68.0"
      },
      "bodyRaw": "{\"event\":\"test\"}",
      "bodyJson": {"event": "test"},
      "remoteAddress": "172.18.0.1",
      "host": "localhost:18800",
      "userAgent": "curl/7.68.0",
      "contentLength": "16",
      "sizeBytes": 16,
      "durationMs": 0.123
    }
  ]
}
```

### Delete Events

```
DELETE /api/events?ns=<namespace>
```

Clears all events for a namespace (both in-memory and on disk).

**Response:**
```json
{
  "ok": true
}
```

### Namespace List

```
GET /api/namespaces
```

Returns all configured namespaces.

**Response:**
```json
{
  "namespaces": ["alpha", "beta", "dev", "prod"]
}
```

### WebSocket

Connect to `ws://localhost:18800/ws` for real-time event updates.

**Messages:**
```json
// Initial connection
{"type": "hello", "namespaces": ["alpha", "beta", "dev"]}

// New event
{"type": "event", "event": {...}}

// Events cleared
{"type": "clear", "namespace": "alpha"}
```

## Data Persistence

Events are persisted to disk in JSONL format:

```
./data/<namespace>/events.jsonl
```

Each line is a JSON object representing one event. Events are loaded into memory on startup for fast querying.

**Example event file:**
```jsonl
{"id":"uuid1","namespace":"alpha","timestamp":"2024-02-08T12:00:00.000Z","method":"POST","path":"/hook/alpha",...}
{"id":"uuid2","namespace":"alpha","timestamp":"2024-02-08T12:01:00.000Z","method":"GET","path":"/hook/alpha",...}
```

## Development

### Dev Mode

Run with hot-reloading and additional debugging:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

### Project Structure

```
webhook-listener/
├── src/
│   └── server.ts           # Express server + WebSocket logic
├── public/
│   └── index.html          # Single-page web UI
├── data/                   # Event persistence (created at runtime)
│   └── <namespace>/
│       └── events.jsonl
├── docker-compose.yml      # Production configuration
├── docker-compose.dev.yml  # Development overrides
├── Dockerfile              # Container image
├── Caddyfile               # Reverse proxy config
└── PDR.md                  # Project Decision Record
```

### Tech Stack

- **Backend**: Node.js + Express + TypeScript
- **Frontend**: Vanilla JavaScript (no build tools required)
- **WebSocket**: `ws` library for real-time updates
- **Proxy**: Caddy for reverse proxy
- **Container**: Docker + Docker Compose

## Security Considerations

This tool is designed for private development use and has no built-in authentication or authorization.

- **No authentication**: Anyone who can access your server can view all webhooks
- **No encryption**: Use a reverse proxy with TLS/SSL for production use
- **No rate limiting**: Be careful when exposing to the public internet
- **Suitable for**: Local development, private networks, behind VPNs, or behind auth proxies

## Troubleshooting

### Webhooks not appearing

1. **Check namespace**: Ensure you're using a namespace that's configured in `NAMESPACES`
2. **Check logs**: View container logs with `docker compose logs -f web`
3. **Verify URL**: Ensure the webhook URL is correct and accessible
4. **Check firewall**: Ensure port 18800 is open on your server

### Events not persisting

1. **Check data directory**: Ensure `DATA_DIR` is writable by the container
2. **Check disk space**: Ensure sufficient disk space is available
3. **Check permissions**: Verify the container has write permissions to the data directory

### WebSocket not connecting

1. **Check status indicator**: Look at the "live/offline" pill in the UI
2. **Check browser console**: Look for WebSocket connection errors
3. **Verify proxy**: If using a reverse proxy, ensure WebSocket upgrades are allowed

### Large payloads failing

The default body size limit is 100MB. To change it, modify `src/server.ts`:

```typescript
app.use(
  express.raw({
    type: () => true,
    limit: "200mb" // Increase as needed
  })
);
```

## Common Webhook Examples

### GitHub Webhooks

```bash
curl -X POST http://localhost:18800/hook/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -H "X-GitHub-Delivery: 12345678-1234-1234-1234-123456789012" \
  -d '{"ref":"refs/heads/main","repository":{"full_name":"owner/repo"}}'
```

### Stripe Webhooks

```bash
curl -X POST http://localhost:18800/hook/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=abc123..." \
  -d '{"id":"evt_1234567890","type":"payment_intent.succeeded"}'
```

### Slack Webhooks

```bash
curl -X POST http://localhost:18800/hook/slack \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello from Slack!","username":"webhook-bot"}'
```

## Architecture

For detailed architectural decisions and design rationale, see [PDR.md](PDR.md).

### Key Components

- **Ingestion Layer**: Express middleware captures all incoming requests
- **Persistence Layer**: Append-only JSONL files for reliable event storage
- **Broadcast Layer**: WebSocket server pushes events to connected UI clients
- **UI Layer**: Single-page application with event list and detail view

## Limitations

- No built-in authentication or authorization
- No event filtering or search (yet)
- No rate limiting
- Unlimited storage (events persist indefinitely)
- Single-tenant design (no multi-user isolation)

## Contributing

Contributions are welcome! The project is intentionally simple and well-documented.
