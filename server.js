import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3000;

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

const server = http.createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  let reqPath = url.pathname === "/" ? "/index.html" : url.pathname;

  // Prevent directory traversal
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

  // Replace any stale camera socket in this room
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

