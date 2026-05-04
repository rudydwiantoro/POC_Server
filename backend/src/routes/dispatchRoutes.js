const express = require("express");
const { canEmergencyOverride, getVisibleChannels } = require("../services/accessService");
const { pool } = require("../db/pool");

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

router.get("/tracking/overview", async (req, res) => {
  try {
    const channels = await getVisibleChannels(req.auth.userDbId, req.auth.role);
    const channelCodes = channels.map((c) => c.id);
    if (!channelCodes.length) {
      return res.json({ generatedAt: new Date().toISOString(), staff: [] });
    }

    const sql = `
      WITH latest_location AS (
        SELECT DISTINCT ON (lp.device_id)
          lp.device_id,
          lp.latitude,
          lp.longitude,
          lp.accuracy_m,
          lp.recorded_at
        FROM location_points lp
        ORDER BY lp.device_id, lp.recorded_at DESC
      ),
      latest_ptt AS (
        SELECT DISTINCT ON (ps.speaker_user_id)
          ps.speaker_user_id,
          c.code AS channel_id,
          ps.started_at,
          ps.ended_at
        FROM ptt_sessions ps
        INNER JOIN channels c ON c.id = ps.channel_id
        ORDER BY ps.speaker_user_id, ps.started_at DESC
      )
      SELECT
        u.username AS user_id,
        u.display_name,
        u.role,
        d.device_label AS device_id,
        ll.latitude,
        ll.longitude,
        ll.accuracy_m,
        ll.recorded_at,
        lp.channel_id,
        lp.started_at AS last_ptt_started_at,
        lp.ended_at AS last_ptt_ended_at
      FROM users u
      INNER JOIN devices d ON d.user_id = u.id
      LEFT JOIN latest_location ll ON ll.device_id = d.id
      LEFT JOIN latest_ptt lp ON lp.speaker_user_id = u.id
      WHERE u.id IN (
        SELECT DISTINCT cm.user_id
        FROM channel_members cm
        INNER JOIN channels c2 ON c2.id = cm.channel_id
        WHERE c2.code = ANY($1::text[])
      )
      ORDER BY u.username ASC
    `;

    const { rows } = await pool.query(sql, [channelCodes]);
    const staff = rows.map((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      role: r.role,
      deviceId: r.device_id,
      lastKnownLocation: r.latitude == null || r.longitude == null
        ? null
        : {
            latitude: Number(r.latitude),
            longitude: Number(r.longitude),
            accuracyM: r.accuracy_m == null ? null : Number(r.accuracy_m),
            recordedAt: r.recorded_at
          },
      lastPtt: r.channel_id
        ? {
            channelId: r.channel_id,
            startedAt: r.last_ptt_started_at,
            endedAt: r.last_ptt_ended_at
          }
        : null
    }));

    return res.json({ generatedAt: new Date().toISOString(), staff });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load tracking overview" });
  }
});

module.exports = router;
