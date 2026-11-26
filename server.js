import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";
import Anthropic from "@anthropic-ai/sdk";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3000;

// Load .env locally if present (Railway injects env vars automatically)
const envPath = path.join(__dirname, ".env");
if (!process.env.ANTHROPIC_API_KEY && fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
    }
  }
}

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const DEFAULT_PROMPT =
  "Based on the images find the answer for the question. " +
  "This is for a Claude certificate course for students. " +
  "Provide the exact answer clearly first, followed by a concise explanation. " +
  "Use web search if needed to verify up-to-date Anthropic/Claude API, SDK, or course details.";

function readJsonBody(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Payload too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

async function handleAskClaude(req, res) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "ANTHROPIC_API_KEY is not configured on the server." }));
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (err) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err.message }));
    return;
  }

  const images = Array.isArray(body.images) ? body.images : [];
  if (images.length === 0) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "No images provided." }));
    return;
  }

  const userPrompt = (body.prompt || "").trim() || DEFAULT_PROMPT;
  const contentBlocks = images.map((img) => ({
    type: "image",
    source: {
      type: "base64",
      media_type: img.mediaType || "image/jpeg",
      data: img.data,
    },
  }));
  contentBlocks.push({ type: "text", text: userPrompt });

  const client = new Anthropic({ apiKey });
  const candidateModels = ["claude-sonnet-5-5", "claude-sonnet-4-5", "claude-3-7-sonnet-latest"];

  let response = null;
  let lastError = null;
  for (const model of candidateModels) {
    try {
      response = await client.messages.create({
        model,
        max_tokens: 2048,
        tools: [
          {
            type: "web_search_20250305",
            name: "web_search",
            max_uses: 5,
          },
        ],
        messages: [{ role: "user", content: contentBlocks }],
      });
      break;
    } catch (err) {
      lastError = err;
      // Retry with fallback model only if model is not found
      if (err?.status !== 404) {
        break;
      }
    }
  }

  if (!response) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: lastError?.message || "Claude request failed." }));
    return;
  }

  const textParts = [];
  for (const block of response.content || []) {
    if (block.type === "text" && block.text) {
      textParts.push(block.text);
    }
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(
    JSON.stringify({
      answer: textParts.join("\n\n") || "No text answer returned.",
      model: response.model,
    })
  );
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "POST" && url.pathname === "/api/ask") {
    handleAskClaude(req, res).catch((err) => {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || "Internal server error" }));
    });
    return;
  }

  let reqPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    });
    res.end(data);
  });
});

// Room registry: Map<roomCode, Set<WebSocket>>
const rooms = new Map();

function safeSend(ws, obj) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "/", `http://${request.headers.host}`);
  if (url.pathname !== "/ws") {
    socket.destroy();
    return;
  }

  const roomCode = (url.searchParams.get("room") || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const role = url.searchParams.get("role");

  if (!roomCode || roomCode.length < 2 || roomCode.length > 16 || (role !== "camera" && role !== "remote")) {
    socket.write("HTTP/1.1 400 Bad Request\r\n\r\n");
    socket.destroy();
    return;
  }

  wss.handleUpgrade(request, socket, head, (ws) => {
    wss.emit("connection", ws, roomCode, role);
  });
});

wss.on("connection", (ws, roomCode, role) => {
  if (!rooms.has(roomCode)) {
    rooms.set(roomCode, new Set());
  }
  const room = rooms.get(roomCode);

  if (role === "camera") {
    for (const existing of room) {
      if (existing._role === "camera") {
        try {
          existing.close(1000, "Replaced by new camera");
        } catch {
          // Ignore
        }
      }
    }
  }

  ws._role = role;
  ws._roomCode = roomCode;
  room.add(ws);

  const existingRoles = new Set();
  for (const peer of room) {
    if (peer === ws) continue;
    existingRoles.add(peer._role);
    safeSend(peer, { type: "peer-joined", role });
  }

  safeSend(ws, { type: "room-state", peers: Array.from(existingRoles) });

  ws.on("message", (raw) => {
    let data;
    try {
      data = JSON.parse(String(raw));
    } catch {
      return;
    }

    if (data.type === "ping") {
      safeSend(ws, { type: "pong" });
      return;
    }

    const targetRole = role === "camera" ? "remote" : "camera";
    const payload = { ...data, from: role };
    for (const peer of room) {
      if (peer !== ws && peer._role === targetRole) {
        safeSend(peer, payload);
      }
    }
  });

  const cleanup = () => {
    room.delete(ws);
    for (const peer of room) {
      safeSend(peer, { type: "peer-left", role });
    }
    if (room.size === 0) {
      rooms.delete(roomCode);
    }
  };

  ws.on("close", cleanup);
  ws.on("error", cleanup);
});

server.listen(PORT, () => {
  console.log(`Live Shutter server listening on port ${PORT}`);
});
