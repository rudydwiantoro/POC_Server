const express = require("express");
const { canAccessChannel } = require("../services/accessService");
const { getActiveHolder, requestTalk, releaseTalk } = require("../services/pttSessionService");

const router = express.Router();

router.post("/request_talk", async (req, res) => {
  try {
    const { channelId, userId } = req.body || {};
    if (!channelId || !userId) {
      return res.status(400).json({ error: "channelId and userId are required" });
    }
    if (req.auth.userId !== userId) {
      return res.status(403).json({ error: "token userId does not match request userId" });
    }
    const allowed = await canAccessChannel(req.auth.userDbId, req.auth.role, channelId);
    if (!allowed) {
      return res.status(403).json({ error: "no access to this channel" });
    }

    const result = await requestTalk(channelId, {
      userId: req.auth.userId,
      userDbId: req.auth.userDbId
    });
    if (!result.ok && result.reason === "channel_not_found") {
      return res.status(404).json({ error: "channel not found" });
    }
    if (!result.ok && result.reason === "busy") {
      return res.status(409).json({
        granted: false,
        holder: result.holder
      });
    }
    return res.json({ granted: true, holder: result.holder });
  } catch (_error) {
    return res.status(500).json({ error: "failed to request talk" });
  }
});

router.post("/release", async (req, res) => {
  try {
    const { channelId, userId } = req.body || {};
    if (!channelId || !userId) {
      return res.status(400).json({ error: "channelId and userId are required" });
    }
    if (req.auth.userId !== userId) {
      return res.status(403).json({ error: "token userId does not match request userId" });
    }
    const allowed = await canAccessChannel(req.auth.userDbId, req.auth.role, channelId);
    if (!allowed) {
      return res.status(403).json({ error: "no access to this channel" });
    }
    return res.json(await releaseTalk(channelId, req.auth.userDbId));
  } catch (_error) {
    return res.status(500).json({ error: "failed to release talk" });
  }
});

router.get("/state/:channelId", async (req, res) => {
  try {
    const { channelId } = req.params;
    const allowed = await canAccessChannel(req.auth.userDbId, req.auth.role, channelId);
    if (!allowed) {
      return res.status(403).json({ error: "no access to this channel" });
    }
    const holder = await getActiveHolder(channelId);
    return res.json({ holder });
  } catch (_error) {
    return res.status(500).json({ error: "failed to fetch floor state" });
  }
});

module.exports = router;
