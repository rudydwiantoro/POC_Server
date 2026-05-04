const express = require("express");
const { canAccessChannel } = require("../services/accessService");
const { getActiveHolder, requestTalk, releaseTalk, getPttGpsHistory } = require("../services/pttSessionService");
const { savePttMessage } = require("../services/pttMessageService");
const { savePttTextMessage, getLatestPttTextMessage } = require("../services/pttTextService");

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
      userDbId: req.auth.userDbId,
      deviceDbId: req.auth.deviceDbId,
      gps: req.body ? req.body.gps : null
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
    return res.json({ granted: true, holder: result.holder, gpsSaved: result.gpsSaved || false });
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

router.get("/gps/history", async (req, res) => {
  try {
    const channelId = req.query.channelId ? String(req.query.channelId) : null;
    if (channelId) {
      const allowed = await canAccessChannel(req.auth.userDbId, req.auth.role, channelId);
      if (!allowed) {
        return res.status(403).json({ error: "no access to this channel" });
      }
    }
    const limit = req.query.limit ? Number(req.query.limit) : 100;
    const sessions = await getPttGpsHistory({ channelId, limit });
    return res.json({ count: sessions.length, sessions });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load gps history" });
  }
});

router.post("/messages/upload", async (req, res) => {
  try {
    const { userId, deviceId, channelId, mimeType, audioBase64, durationMs } = req.body || {};
    if (!userId || !deviceId || !channelId || !mimeType || !audioBase64) {
      return res.status(400).json({ error: "userId, deviceId, channelId, mimeType, audioBase64 are required" });
    }
    if (req.auth.userId !== userId) {
      return res.status(403).json({ error: "token userId does not match request userId" });
    }
    if (req.auth.deviceId !== deviceId) {
      return res.status(403).json({ error: "token deviceId does not match request deviceId" });
    }
    const allowed = await canAccessChannel(req.auth.userDbId, req.auth.role, channelId);
    if (!allowed) {
      return res.status(403).json({ error: "no access to this channel" });
    }
    const saved = await savePttMessage({
      userDbId: req.auth.userDbId,
      deviceDbId: req.auth.deviceDbId,
      channelCode: channelId,
      mimeType,
      audioBase64,
      durationMs: typeof durationMs === "number" ? durationMs : null
    });
    return res.json({ success: true, message: saved });
  } catch (error) {
    if (error.message === "channel_not_found") {
      return res.status(404).json({ error: "channel not found" });
    }
    return res.status(500).json({ error: "failed to upload ptt message" });
  }
});

router.post("/messages/text", async (req, res) => {
  try {
    const { userId, channelId, text } = req.body || {};
    if (!userId || !channelId || !text) {
      return res.status(400).json({ error: "userId, channelId, text are required" });
    }
    if (req.auth.userId !== userId) {
      return res.status(403).json({ error: "token userId does not match request userId" });
    }
    const allowed = await canAccessChannel(req.auth.userDbId, req.auth.role, channelId);
    if (!allowed) {
      return res.status(403).json({ error: "no access to this channel" });
    }
    const saved = await savePttTextMessage({
      userDbId: req.auth.userDbId,
      channelCode: channelId,
      messageText: text
    });
    return res.json({ success: true, message: saved });
  } catch (error) {
    if (error.message === "message_empty" || error.message === "message_too_long") {
      return res.status(400).json({ error: error.message });
    }
    if (error.message === "channel_not_found") {
      return res.status(404).json({ error: "channel not found" });
    }
    return res.status(500).json({ error: "failed to save text message" });
  }
});

router.get("/messages/text/latest", async (req, res) => {
  try {
    const channelId = req.query.channelId ? String(req.query.channelId) : "";
    if (!channelId) {
      return res.status(400).json({ error: "channelId is required" });
    }
    const allowed = await canAccessChannel(req.auth.userDbId, req.auth.role, channelId);
    if (!allowed) {
      return res.status(403).json({ error: "no access to this channel" });
    }
    const message = await getLatestPttTextMessage({ channelCode: channelId });
    return res.json({ message });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load latest text message" });
  }
});

module.exports = router;
