const express = require("express");
const { issueAccessToken, issueRefreshToken, verifyToken } = require("../services/tokenService");
const { getAllowedChannelsForUser, getOrCreateUserWithDevice } = require("../services/accessService");
const { getLicenseStatus } = require("../services/licenseService");
const { pool } = require("../db/pool");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { userId, deviceId } = req.body || {};
  if (!userId || !deviceId) {
    return res.status(400).json({ error: "userId and deviceId are required" });
  }

  try {
    const account = await getOrCreateUserWithDevice(userId, deviceId, "android");
    if (!account) {
      return res.status(401).json({ error: "invalid userId/deviceId" });
    }
    const lic = await getLicenseStatus();
    if (!lic.active && account.role !== "dispatcher") {
      return res.status(403).json({ error: lic.reason || "license_inactive" });
    }
    const totalDeviceRes = await pool.query("SELECT COUNT(1)::int AS total FROM devices");
    if (lic.active && Number(totalDeviceRes.rows[0].total) > Number(lic.maxDevices)) {
      return res.status(403).json({ error: "license_max_devices_exceeded" });
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
      user: {
        userId: payload.userId,
        deviceId: payload.deviceId,
        role: payload.role,
        channelIds,
        beacon: {
          enabled: Boolean(account.beacon_enabled),
          intervalMin: Number(account.beacon_interval_min) || 15,
          distanceKm: Number(account.beacon_distance_km) || 1,
          mode: account.beacon_mode === "eco" ? "eco" : "normal",
          batchSize: Number(account.beacon_batch_size) || 50,
          batchMaxWaitMin: Number(account.beacon_batch_max_wait_min) || 120,
          normalSendMin: Number(account.beacon_normal_send_min) || 60
        },
        license: {
          companyName: lic.companyName || "-",
          serverName: lic.serverName || "-",
          expiresAt: lic.expiresAt || null
        }
      }
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
