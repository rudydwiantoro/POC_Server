let broadcaster = null;

function registerBroadcaster(fn) {
  broadcaster = typeof fn === "function" ? fn : null;
}

function broadcastToChannel(channelId, payload) {
  if (!broadcaster) return;
  broadcaster(channelId, payload);
}

module.exports = { registerBroadcaster, broadcastToChannel };
