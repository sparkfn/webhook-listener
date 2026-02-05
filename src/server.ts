import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import { WebSocketServer } from "ws";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.PORT ?? 18800);
const DATA_DIR = process.env.DATA_DIR ?? "./data";
const NAMESPACES = (process.env.NAMESPACES ?? "")
  .split(",")
  .map((n) => n.trim())
  .filter(Boolean);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: "/ws" });

// Capture raw body for any content-type.
app.use(
  express.raw({
    type: () => true,
    limit: "100mb"
  })
);

app.use(express.static("public"));

function ensureNamespace(ns: string) {
  if (!NAMESPACES.includes(ns)) {
    return false;
  }
  return true;
}

function namespacePath(ns: string) {
  return path.join(DATA_DIR, ns);
}

function eventsFile(ns: string) {
  return path.join(namespacePath(ns), "events.jsonl");
}

function loadEvents(ns: string) {
  const file = eventsFile(ns);
  if (!fs.existsSync(file)) return [] as EventRecord[];
  const content = fs.readFileSync(file, "utf8");
  if (!content.trim()) return [] as EventRecord[];
  return content
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as EventRecord);
}

function appendEvent(ns: string, event: EventRecord) {
  fs.mkdirSync(namespacePath(ns), { recursive: true });
  fs.appendFileSync(eventsFile(ns), JSON.stringify(event) + "\n");
}

type EventRecord = {
  id: string;
  namespace: string;
  timestamp: string;
  method: string;
  path: string;
  query: Record<string, string | string[]>;
  headers: Record<string, string | string[]>;
  bodyRaw: string;
  bodyJson?: unknown;
  remoteAddress: string;
};

const inMemory: Record<string, EventRecord[]> = {};

for (const ns of NAMESPACES) {
  inMemory[ns] = loadEvents(ns);
}

app.get("/api/namespaces", (_req, res) => {
  res.json({ namespaces: NAMESPACES });
});

app.get("/api/events", (req, res) => {
  const ns = String(req.query.ns ?? "");
  if (!ensureNamespace(ns)) {
    return res.status(404).json({ error: "namespace_not_found" });
  }
  res.json({ events: inMemory[ns] ?? [] });
});

app.all("/hook/:ns", (req, res) => {
  const ns = String(req.params.ns ?? "");
  if (!ensureNamespace(ns)) {
    return res.status(404).json({ error: "namespace_not_found" });
  }

  const bodyBuffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from("", "utf8");
  const bodyRaw = bodyBuffer.toString("utf8");

  let bodyJson: unknown = undefined;
  try {
    bodyJson = bodyRaw ? JSON.parse(bodyRaw) : undefined;
  } catch {
    bodyJson = undefined;
  }

  const event: EventRecord = {
    id: randomUUID(),
    namespace: ns,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    query: req.query as Record<string, string | string[]>,
    headers: req.headers as Record<string, string | string[]>,
    bodyRaw,
    bodyJson,
    remoteAddress: req.socket.remoteAddress ?? ""
  };

  inMemory[ns] = inMemory[ns] ?? [];
  inMemory[ns].push(event);
  appendEvent(ns, event);

  const payload = JSON.stringify({ type: "event", event });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }

  res.status(200).json({ ok: true, id: event.id });
});

wss.on("connection", (ws) => {
  ws.send(JSON.stringify({ type: "hello", namespaces: NAMESPACES }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`server listening on 0.0.0.0:${PORT}`);
});
