const express = require("express");
const { canEmergencyOverride, getVisibleChannels } = require("../services/accessService");

const router = express.Router();

router.get("/overview", async (req, res) => {
  try {
    const channels = await getVisibleChannels(req.auth.userDbId, req.auth.role);
    return res.json({
      channels,
      activeTalkSessions: [],
      alerts: []
    });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load dispatch overview" });
  }
});

router.post("/emergency/override", (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  const { channelId = "all-call", message = "Emergency override requested" } = req.body || {};
  return res.json({
    acknowledged: true,
    channelId,
    message,
    at: new Date().toISOString()
  });
});

module.exports = router;
