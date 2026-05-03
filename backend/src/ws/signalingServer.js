const WebSocket = require("ws");
const { getActiveHolder, requestTalk, releaseTalk } = require("../services/pttSessionService");
const { getUserByUsername } = require("../services/accessService");

function send(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function broadcastToChannel(clients, channelId, payload, excludeWs = null) {
  for (const [client, state] of clients.entries()) {
    if (client === excludeWs) continue;
    if (state.channelId === channelId) {
      send(client, payload);
    }
  }
}

function sendToUserInChannel(clients, channelId, userId, payload) {
  for (const [client, state] of clients.entries()) {
    if (state.channelId === channelId && state.userId === userId) {
      send(client, payload);
      return true;
    }
  }
  return false;
}

function createSignalingServer(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer, path: "/ws/signaling" });
  const clients = new Map();

  wss.on("connection", (ws) => {
    clients.set(ws, { userId: null, channelId: null });
    send(ws, { type: "connected", ts: new Date().toISOString() });

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        const state = clients.get(ws);
        if (!state) return;

        if (msg.type === "join_channel") {
          state.userId = msg.userId || state.userId;
          state.channelId = msg.channelId || state.channelId;
          const peers = [];
          for (const [client, peerState] of clients.entries()) {
            if (client === ws) continue;
            if (peerState.channelId === state.channelId && peerState.userId) {
              peers.push(peerState.userId);
            }
          }
          send(ws, { type: "join_ack", channelId: state.channelId, userId: state.userId, peers });
          broadcastToChannel(
            clients,
            state.channelId,
            { type: "peer_joined", channelId: state.channelId, userId: state.userId },
            ws
          );
          return;
        }

        if (msg.type === "request_talk") {
          const account = await getUserByUsername(msg.userId);
          if (!account) {
            send(ws, { type: "error", message: "unknown user" });
            return;
          }
          const result = await requestTalk(msg.channelId, {
            userId: account.username,
            userDbId: account.user_id
          });
          if (result.ok) {
            broadcastToChannel(clients, msg.channelId, {
              type: "floor_granted",
              channelId: msg.channelId,
              holder: result.holder
            });
          } else if (result.reason === "busy") {
            send(ws, { type: "floor_busy", channelId: msg.channelId, holder: result.holder });
          } else {
            send(ws, { type: "error", message: "channel not found" });
          }
          return;
        }

        if (msg.type === "release_talk") {
          const account = await getUserByUsername(msg.userId);
          if (!account) {
            send(ws, { type: "error", message: "unknown user" });
            return;
          }
          await releaseTalk(msg.channelId, account.user_id);
          broadcastToChannel(clients, msg.channelId, {
            type: "floor_released",
            channelId: msg.channelId,
            holder: null
          });
          return;
        }

        if (msg.type === "floor_state") {
          const holder = await getActiveHolder(msg.channelId);
          send(ws, { type: "floor_state", channelId: msg.channelId, holder });
          return;
        }

        if (msg.type === "webrtc_offer" || msg.type === "webrtc_answer" || msg.type === "webrtc_ice") {
          if (!state.channelId || !state.userId) {
            send(ws, { type: "error", message: "join_channel required before WebRTC signaling" });
            return;
          }

          const payload = { ...msg, fromUserId: state.userId, channelId: state.channelId };
          if (msg.toUserId) {
            sendToUserInChannel(clients, state.channelId, msg.toUserId, payload);
          } else {
            broadcastToChannel(clients, state.channelId, payload, ws);
          }
        }
      } catch (_error) {
        send(ws, { type: "error", message: "invalid signaling payload" });
      }
    });

    ws.on("close", () => {
      const state = clients.get(ws);
      if (state && state.channelId && state.userId) {
        broadcastToChannel(clients, state.channelId, {
          type: "peer_left",
          channelId: state.channelId,
          userId: state.userId
        });
      }
      clients.delete(ws);
    });
  });

  return wss;
}

module.exports = { createSignalingServer };
