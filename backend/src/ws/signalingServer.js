const WebSocket = require("ws");
const { getActiveHolder, requestTalk, releaseTalk } = require("../services/pttSessionService");
const { canAccessChannel, getUserByUsername, getUserWithDevice } = require("../services/accessService");
const { savePttTextMessage } = require("../services/pttTextService");
const { registerBroadcaster } = require("./signalBus");
const { getLicenseStatus } = require("../services/licenseService");
const { setDeviceOnline, setDeviceOffline, getOnlineDeviceCount, isDeviceOnline } = require("./onlineState");
const { bypassLicenseValidation } = require("../config/env");

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
    clients.set(ws, { userId: null, channelId: null, deviceId: null });
    send(ws, { type: "connected", ts: new Date().toISOString() });

    ws.on("message", async (raw) => {
      try {
        const msg = JSON.parse(String(raw));
        const state = clients.get(ws);
        if (!state) return;

        if (msg.type === "join_channel") {
          const lic = await getLicenseStatus();
          if (!bypassLicenseValidation && !lic.active) {
            send(ws, { type: "error", message: lic.reason || "license inactive" });
            return;
          }
          state.userId = msg.userId || state.userId;
          state.channelId = msg.channelId || state.channelId;
          state.deviceId = msg.deviceId || state.deviceId;
          const alreadyOnline = state.deviceId ? isDeviceOnline(state.deviceId) : false;
          if (!bypassLicenseValidation && !alreadyOnline && state.deviceId && getOnlineDeviceCount() >= Number(lic.maxOnlineDevices || 0)) {
            send(ws, { type: "error", message: "license_max_online_devices_exceeded" });
            return;
          }
          if (state.deviceId) setDeviceOnline(state.deviceId);
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
          let account = null;
          if (msg.deviceId) {
            account = await getUserWithDevice(msg.userId, msg.deviceId);
          }
          if (!account) {
            account = await getUserByUsername(msg.userId);
          }
          if (!account) {
            send(ws, { type: "error", message: "unknown user" });
            return;
          }
          const result = await requestTalk(msg.channelId, {
            userId: account.username,
            userDbId: account.user_id,
            deviceDbId: account.device_id || null,
            gps: msg.gps || null
          });
          if (msg.gps) {
            console.log(`[PTT] request_talk user=${account.username} channel=${msg.channelId} gpsSaved=${result.gpsSaved ? "yes" : "no"}`);
          }
          if (result.ok) {
            broadcastToChannel(clients, msg.channelId, {
              type: "floor_granted",
              channelId: msg.channelId,
              holder: result.holder,
              gpsSaved: result.gpsSaved || false
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

        if (msg.type === "ptt_text") {
          const text = String(msg.text || "").trim();
          if (!state.channelId || !state.userId) {
            send(ws, { type: "error", message: "join_channel required before ptt_text" });
            return;
          }
          if (!text) {
            send(ws, { type: "error", message: "text is required" });
            return;
          }
          if (text.length > 160) {
            send(ws, { type: "error", message: "text max length is 160 chars" });
            return;
          }
          const account = await getUserByUsername(state.userId);
          if (!account) {
            send(ws, { type: "error", message: "unknown user" });
            return;
          }
          const allowed = await canAccessChannel(account.user_id, account.role, state.channelId);
          if (!allowed) {
            send(ws, { type: "error", message: "no access to this channel" });
            return;
          }
          await savePttTextMessage({
            userDbId: account.user_id,
            channelCode: state.channelId,
            messageText: text
          });
          broadcastToChannel(clients, state.channelId, {
            type: "ptt_text",
            channelId: state.channelId,
            userId: state.userId,
            text,
            createdAt: new Date().toISOString()
          });
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
      if (state && state.deviceId) {
        setDeviceOffline(state.deviceId);
      }
      clients.delete(ws);
    });
  });

  registerBroadcaster((channelId, payload) => {
    broadcastToChannel(clients, channelId, payload);
  });

  return wss;
}

module.exports = { createSignalingServer };
