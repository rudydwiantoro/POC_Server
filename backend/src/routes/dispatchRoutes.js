const express = require("express");
const { canEmergencyOverride, getVisibleChannels } = require("../services/accessService");
const { pool } = require("../db/pool");

const router = express.Router();
const MENU_KEYS = [
  "tracking",
  "ptt_history",
  "geofence_admin",
  "user_permission_admin",
  "role_permission_admin",
  "emergency_override"
];

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
      WITH user_channels AS (
        SELECT
          cm.user_id,
          ARRAY_AGG(c.code ORDER BY c.code) AS channels
        FROM channel_members cm
        INNER JOIN channels c ON c.id = cm.channel_id
        GROUP BY cm.user_id
      ),
      latest_location AS (
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
        uc.channels,
        ll.latitude,
        ll.longitude,
        ll.accuracy_m,
        ll.recorded_at,
        lp.channel_id,
        lp.started_at AS last_ptt_started_at,
        lp.ended_at AS last_ptt_ended_at
      FROM users u
      INNER JOIN devices d ON d.user_id = u.id
      LEFT JOIN user_channels uc ON uc.user_id = u.id
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
      channels: Array.isArray(r.channels) ? r.channels : [],
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

router.get("/menu-permissions/me", async (req, res) => {
  try {
    const roleRes = await pool.query(
      `SELECT menu_key, can_access FROM role_menu_permissions WHERE role = $1`,
      [req.auth.role]
    );
    const userRes = await pool.query(
      `SELECT menu_key, can_access FROM user_menu_permissions WHERE user_id = $1`,
      [req.auth.userDbId]
    );

    const roleMap = new Map(roleRes.rows.map((r) => [r.menu_key, r.can_access]));
    const userMap = new Map(userRes.rows.map((r) => [r.menu_key, r.can_access]));
    const permissions = {};
    for (const key of MENU_KEYS) {
      const byRole = roleMap.has(key) ? Boolean(roleMap.get(key)) : true;
      const byUser = userMap.has(key) ? Boolean(userMap.get(key)) : null;
      permissions[key] = byUser == null ? byRole : byUser;
    }
    return res.json({ role: req.auth.role, userId: req.auth.userId, permissions });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load menu permissions" });
  }
});

router.get("/admin/menu-permissions/roles", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  try {
    const usersRes = await pool.query(`SELECT DISTINCT role FROM users ORDER BY role ASC`);
    const rowsRes = await pool.query(
      `SELECT role, menu_key, can_access FROM role_menu_permissions ORDER BY role, menu_key`
    );
    const out = {};
    for (const r of usersRes.rows) {
      out[r.role] = Object.fromEntries(MENU_KEYS.map((k) => [k, true]));
    }
    for (const r of rowsRes.rows) {
      if (!out[r.role]) out[r.role] = Object.fromEntries(MENU_KEYS.map((k) => [k, true]));
      out[r.role][r.menu_key] = Boolean(r.can_access);
    }
    return res.json({ menuKeys: MENU_KEYS, roles: out });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load role permissions" });
  }
});

router.put("/admin/menu-permissions/roles/:role", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  const targetRole = String(req.params.role || "");
  const permissions = req.body && req.body.permissions ? req.body.permissions : {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const key of MENU_KEYS) {
      const val = permissions[key];
      if (typeof val !== "boolean") continue;
      await client.query(
        `
        INSERT INTO role_menu_permissions (role, menu_key, can_access, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (role, menu_key)
        DO UPDATE SET can_access = EXCLUDED.can_access, updated_at = NOW()
        `,
        [targetRole, key, val]
      );
    }
    await client.query("COMMIT");
    return res.json({ success: true, role: targetRole });
  } catch (_error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "failed to save role permissions" });
  } finally {
    client.release();
  }
});

router.get("/admin/menu-permissions/users", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  try {
    const usersRes = await pool.query(
      `SELECT id, username, display_name, role FROM users ORDER BY username ASC`
    );
    const permsRes = await pool.query(
      `
      SELECT u.username, ump.menu_key, ump.can_access
      FROM user_menu_permissions ump
      INNER JOIN users u ON u.id = ump.user_id
      ORDER BY u.username, ump.menu_key
      `
    );
    const users = usersRes.rows.map((u) => ({
      userId: u.username,
      displayName: u.display_name,
      role: u.role,
      permissions: Object.fromEntries(MENU_KEYS.map((k) => [k, null]))
    }));
    const idx = new Map(users.map((u) => [u.userId, u]));
    for (const r of permsRes.rows) {
      const item = idx.get(r.username);
      if (item) item.permissions[r.menu_key] = Boolean(r.can_access);
    }
    return res.json({ menuKeys: MENU_KEYS, users });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load user permissions" });
  }
});

router.put("/admin/menu-permissions/users/:userId", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  const username = String(req.params.userId || "");
  const permissions = req.body && req.body.permissions ? req.body.permissions : {};
  try {
    const userRes = await pool.query(`SELECT id FROM users WHERE username = $1 LIMIT 1`, [username]);
    if (!userRes.rows[0]) return res.status(404).json({ error: "user not found" });
    const dbUserId = userRes.rows[0].id;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const key of MENU_KEYS) {
        const val = permissions[key];
        if (val === null) {
          await client.query(
            `DELETE FROM user_menu_permissions WHERE user_id = $1 AND menu_key = $2`,
            [dbUserId, key]
          );
          continue;
        }
        if (typeof val !== "boolean") continue;
        await client.query(
          `
          INSERT INTO user_menu_permissions (user_id, menu_key, can_access, updated_at)
          VALUES ($1, $2, $3, NOW())
          ON CONFLICT (user_id, menu_key)
          DO UPDATE SET can_access = EXCLUDED.can_access, updated_at = NOW()
          `,
          [dbUserId, key, val]
        );
      }
      await client.query("COMMIT");
    } catch (_error) {
      await client.query("ROLLBACK");
      throw _error;
    } finally {
      client.release();
    }
    return res.json({ success: true, userId: username });
  } catch (_error) {
    return res.status(500).json({ error: "failed to save user permissions" });
  }
});

router.get("/geofences", async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, center_lat, center_lon, radius_m, color, updated_at FROM geofences ORDER BY id`
    );
    if (!rows.length) {
      return res.json({
        geofences: [
          { id: "hotel", name: "Hotel Area", center: { lat: -8.6542, lon: 115.2191 }, radiusM: 700, color: "#2ca58d" },
          { id: "bandara", name: "Bandara Area", center: { lat: -8.7467, lon: 115.1668 }, radiusM: 1800, color: "#2a9fff" },
          { id: "mall", name: "Mall Area", center: { lat: -8.6905, lon: 115.1808 }, radiusM: 900, color: "#c48f2a" }
        ]
      });
    }
    return res.json({
      geofences: rows.map((r) => ({
        id: r.id,
        name: r.name,
        center: { lat: Number(r.center_lat), lon: Number(r.center_lon) },
        radiusM: Number(r.radius_m),
        color: r.color
      }))
    });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load geofences" });
  }
});

router.put("/geofences", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  const geofences = Array.isArray(req.body && req.body.geofences) ? req.body.geofences : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM geofences");
    for (const g of geofences) {
      if (!g || !g.id || !g.name || !g.center) continue;
      await client.query(
        `
        INSERT INTO geofences (id, name, center_lat, center_lon, radius_m, color, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        `,
        [String(g.id), String(g.name), Number(g.center.lat), Number(g.center.lon), Number(g.radiusM), String(g.color || "#2ca58d")]
      );
    }
    await client.query("COMMIT");
    return res.json({ success: true, count: geofences.length });
  } catch (_error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "failed to save geofences" });
  } finally {
    client.release();
  }
});

module.exports = router;
