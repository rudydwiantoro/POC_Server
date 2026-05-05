const express = require("express");
const { issueAccessToken, issueRefreshToken, verifyToken } = require("../services/tokenService");
const { getAllowedChannelsForUser, getUserWithDevice, getUserWithAnyDevice, activateDeviceForUser } = require("../services/accessService");
const { getLicenseStatus } = require("../services/licenseService");
const { getActiveAudioProfile, getVoiceTransportMode } = require("../services/audioProfileService");
const { pool } = require("../db/pool");
const { bypassLicenseValidation, bypassDeviceValidation } = require("../config/env");

const router = express.Router();

router.post("/login", async (req, res) => {
  const { userId, deviceId } = req.body || {};
  if (!userId || (!bypassDeviceValidation && !deviceId)) {
    return res.status(400).json({ error: bypassDeviceValidation ? "userId is required" : "userId and deviceId are required" });
  }

  try {
    let account = null;
    if (bypassDeviceValidation) {
      account = await getUserWithAnyDevice(userId);
      if (account && !account.device_id) {
        const autoLabel = String(deviceId || `auto-${userId}`).trim();
        await activateDeviceForUser(userId, autoLabel, "android");
        account = await getUserWithAnyDevice(userId);
      }
    } else {
      account = await getUserWithDevice(userId, deviceId);
    }
    if (!account) {
      return res.status(403).json({ error: "device_not_activated_on_server" });
    }
    const lic = await getLicenseStatus();
    const audioProfile = await getActiveAudioProfile();
    const voiceTransportMode = await getVoiceTransportMode();
    if (!bypassLicenseValidation && !lic.active && account.role !== "dispatcher") {
      return res.status(403).json({ error: lic.reason || "license_inactive" });
    }
    const totalDeviceRes = await pool.query("SELECT COUNT(1)::int AS total FROM devices");
    if (!bypassLicenseValidation && lic.active && Number(totalDeviceRes.rows[0].total) > Number(lic.maxDevices)) {
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
        },
        audioProfile,
        voiceTransportMode
      }
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Login error:", error);
    return res.status(500).json({ error: "login failed" });
  }
});

router.post("/activation/check", async (req, res) => {
  const { userId, deviceId } = req.body || {};
  if (!userId || (!bypassDeviceValidation && !deviceId)) {
    return res.status(400).json({ error: bypassDeviceValidation ? "userId is required" : "userId and deviceId are required" });
  }
  try {
    let account = null;
    if (bypassDeviceValidation) {
      account = await getUserWithAnyDevice(userId);
      if (account && !account.device_id) {
        const autoLabel = String(deviceId || `auto-${userId}`).trim();
        await activateDeviceForUser(userId, autoLabel, "android");
        account = await getUserWithAnyDevice(userId);
      }
    } else {
      account = await getUserWithDevice(userId, deviceId);
    }
    if (!account) {
      return res.json({ activated: false, reason: "device_not_activated_on_server" });
    }
    const lic = await getLicenseStatus();
    if (!bypassLicenseValidation && !lic.active && account.role !== "dispatcher") {
      return res.json({ activated: false, reason: lic.reason || "license_inactive" });
    }
    return res.json({
      activated: true,
      reason: "ok",
      userId: account.username,
      deviceId: account.device_label,
      role: account.role
    });
  } catch (_error) {
    return res.status(500).json({ error: "activation_check_failed" });
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
