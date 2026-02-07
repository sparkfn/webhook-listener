import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import express from "express";
import Busboy from "busboy";
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

app.set("trust proxy", true);

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
  fullUrl: string;
  query: Record<string, string | string[]>;
  queryStrings: Array<{ name: string; value: string }>;
  headers: Record<string, string | string[]>;
  bodyRaw: string;
  bodyJson?: unknown;
  formValues?: Array<{ name: string; value: string }>;
  formFiles?: Array<{ name: string; filename: string; mimeType: string }>;
  remoteAddress: string;
  host?: string;
  userAgent?: string;
  contentLength?: string;
  sizeBytes: number;
  durationMs: number;
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

app.delete("/api/events", (req, res) => {
  const ns = String(req.query.ns ?? "");
  if (!ensureNamespace(ns)) {
    return res.status(404).json({ error: "namespace_not_found" });
  }
  // Clear in-memory
  inMemory[ns] = [];
  // Clear on disk
  const file = eventsFile(ns);
  if (fs.existsSync(file)) {
    fs.writeFileSync(file, "");
  }
  // Broadcast clear event to all clients
  const payload = JSON.stringify({ type: "clear", namespace: ns });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(payload);
    }
  }
  res.json({ ok: true });
});

function parseQueryList(urlPath: string) {
  const url = new URL(urlPath, "http://local");
  const list: Array<{ name: string; value: string }> = [];
  url.searchParams.forEach((value, name) => {
    list.push({ name, value });
  });
  return list;
}

function parseUrlEncoded(bodyRaw: string) {
  const params = new URLSearchParams(bodyRaw);
  const list: Array<{ name: string; value: string }> = [];
  for (const [name, value] of params.entries()) {
    list.push({ name, value });
  }
  return list;
}

function parseMultipart(
  bodyBuffer: Buffer,
  contentType: string
): Promise<{
  fields: Array<{ name: string; value: string }>;
  files: Array<{ name: string; filename: string; mimeType: string }>;
}> {
  return new Promise((resolve, reject) => {
    const fields: Array<{ name: string; value: string }> = [];
    const files: Array<{ name: string; filename: string; mimeType: string }> = [];
    const bb = Busboy({ headers: { "content-type": contentType } });
    bb.on("field", (name, value) => {
      fields.push({ name, value });
    });
    bb.on("file", (name, file, info) => {
      files.push({ name, filename: info.filename, mimeType: info.mimeType });
      file.resume();
    });
    bb.on("error", reject);
    bb.on("finish", () => resolve({ fields, files }));
    bb.end(bodyBuffer);
  });
}

app.all("/hook/:ns", async (req, res) => {
  const start = process.hrtime.bigint();
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

  const contentType = String(req.headers["content-type"] ?? "");
  let formValues: Array<{ name: string; value: string }> | undefined = undefined;
  let formFiles: Array<{ name: string; filename: string; mimeType: string }> | undefined =
    undefined;

  if (contentType.includes("application/x-www-form-urlencoded")) {
    formValues = parseUrlEncoded(bodyRaw);
  } else if (contentType.includes("multipart/form-data")) {
    try {
      const parsed = await parseMultipart(bodyBuffer, contentType);
      formValues = parsed.fields;
      formFiles = parsed.files;
    } catch {
      formValues = undefined;
      formFiles = undefined;
    }
  }

  const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
  const host = String(req.headers["host"] ?? "");
  const fullUrl = host ? `${req.protocol}://${host}${req.originalUrl}` : req.originalUrl;

  const event: EventRecord = {
    id: randomUUID(),
    namespace: ns,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.originalUrl,
    fullUrl,
    query: req.query as Record<string, string | string[]>,
    queryStrings: parseQueryList(req.originalUrl),
    headers: req.headers as Record<string, string | string[]>,
    bodyRaw,
    bodyJson,
    formValues,
    formFiles,
    remoteAddress: req.ip ?? req.socket.remoteAddress ?? "",
    host,
    userAgent: String(req.headers["user-agent"] ?? ""),
    contentLength: String(req.headers["content-length"] ?? ""),
    sizeBytes: bodyBuffer.length,
    durationMs
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

wss.on("connection", (ws: import("ws").WebSocket) => {
  ws.send(JSON.stringify({ type: "hello", namespaces: NAMESPACES }));
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`server listening on 0.0.0.0:${PORT}`);
});
