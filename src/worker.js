import { DurableObject } from "cloudflare:workers";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket upgrade", { status: 426 });
      }

      const roomCode = (url.searchParams.get("room") || "")
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      const role = url.searchParams.get("role");

      if (!roomCode || roomCode.length < 2 || roomCode.length > 16) {
        return new Response("Invalid room code", { status: 400 });
      }
      if (role !== "camera" && role !== "remote") {
        return new Response("Invalid role", { status: 400 });
      }

      const id = env.ROOMS.idFromName(roomCode);
      const stub = env.ROOMS.get(id);
      return stub.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

/**
 * Durable Object that coordinates WebRTC signaling for a single room.
 * Supports one "camera" peer and one or more "remote" viewer peers.
 */
export class SignalingRoom extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    const role = url.searchParams.get("role");

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // If a new camera connects, close any stale camera socket in this room.
    if (role === "camera") {
      for (const existing of this.ctx.getWebSockets()) {
        const meta = existing.deserializeAttachment();
        if (meta?.role === "camera") {
          try {
            existing.close(1000, "Replaced by new camera");
          } catch {
            // Ignore already-closed sockets
          }
        }
      }
    }

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ role });

    // Notify existing peers that this role joined, and tell the newcomer who is already here.
    const existingRoles = new Set();
    for (const peer of this.ctx.getWebSockets()) {
      if (peer === server) continue;
      const peerMeta = peer.deserializeAttachment();
      if (peerMeta?.role) {
        existingRoles.add(peerMeta.role);
        this.safeSend(peer, { type: "peer-joined", role });
      }
    }

    this.safeSend(server, {
      type: "room-state",
      peers: Array.from(existingRoles),
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string") return;

    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "ping") {
      this.safeSend(ws, { type: "pong" });
      return;
    }

    const senderMeta = ws.deserializeAttachment();
    const senderRole = senderMeta?.role;
    if (!senderRole) return;

    // Relay signaling messages to peers of the opposite role.
    const targetRole = senderRole === "camera" ? "remote" : "camera";
    const payload = { ...data, from: senderRole };

    for (const peer of this.ctx.getWebSockets()) {
      if (peer === ws) continue;
      const peerMeta = peer.deserializeAttachment();
      if (peerMeta?.role === targetRole) {
        this.safeSend(peer, payload);
      }
    }
  }

  async webSocketClose(ws) {
    this.notifyLeave(ws);
  }

  async webSocketError(ws) {
    this.notifyLeave(ws);
  }

  notifyLeave(ws) {
    const meta = ws.deserializeAttachment();
    if (!meta?.role) return;

    for (const peer of this.ctx.getWebSockets()) {
      if (peer === ws) continue;
      this.safeSend(peer, { type: "peer-left", role: meta.role });
    }
  }

  safeSend(ws, obj) {
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      // Ignore closed socket send errors
    }
  }
}

