const express = require("express");
const { issueAccessToken, issueRefreshToken, verifyToken } = require("../services/tokenService");
const { getAllowedChannelsForUser, getUserWithDevice } = require("../services/accessService");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { userId, deviceId } = req.body || {};
  if (!userId || !deviceId) {
    return res.status(400).json({ error: "userId and deviceId are required" });
  }

  try {
    const account = await getUserWithDevice(userId, deviceId);
    if (!account) {
      return res.status(401).json({ error: "invalid userId/deviceId" });
    }

    const payload = {
      userId: account.username,
      deviceId: account.device_label,
      role: account.role,
      userDbId: account.user_id,
      deviceDbId: account.device_id
    };
    const channelIds = await getAllowedChannelsForUser(account.user_id, account.role);

    return res.json({
      accessToken: issueAccessToken(payload),
      refreshToken: issueRefreshToken(payload),
      user: { userId: payload.userId, deviceId: payload.deviceId, role: payload.role, channelIds }
    });
  } catch (error) {
    return res.status(500).json({ error: "login failed" });
  }
});

router.post("/refresh", (req, res) => {
  const { refreshToken } = req.body || {};
  if (!refreshToken) {
    return res.status(400).json({ error: "refreshToken is required" });
  }

  try {
    const payload = verifyToken(refreshToken);
    return res.json({ accessToken: issueAccessToken(payload) });
  } catch (error) {
    return res.status(401).json({ error: "invalid refresh token" });
  }
});

module.exports = router;
