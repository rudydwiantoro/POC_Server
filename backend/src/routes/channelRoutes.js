const express = require("express");
const { canAccessChannel, getVisibleChannels } = require("../services/accessService");

const router = express.Router();

router.get("/", async (req, res) => {
  try {
    const channels = await getVisibleChannels(req.auth.userDbId, req.auth.role);
    return res.json({ channels });
  } catch (_error) {
    return res.status(500).json({ error: "failed to list channels" });
  }
});

router.get("/:channelId/members", async (req, res) => {
  const { channelId } = req.params;
  const allowed = await canAccessChannel(req.auth.userDbId, req.auth.role, channelId);
  if (!allowed) {
    return res.status(403).json({ error: "no access to this channel" });
  }
  return res.json({
    channelId,
    onlineMembers: []
  });
});

module.exports = router;
