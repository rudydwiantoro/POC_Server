const express = require("express");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const crypto = require("crypto");
const {
  canEmergencyOverride,
  getVisibleChannels,
  listDevicesForAdmin,
  updateDeviceBeaconSetting,
  activateDeviceForUser
} = require("../services/accessService");
const { pool } = require("../db/pool");
const { getUserPttMessages } = require("../services/pttMessageService");
const { getUserPttImages } = require("../services/pttImageService");
const { getLicenseStatus, setLicenseKey, verifyDeviceActivationKey } = require("../services/licenseService");
const { bypassDeviceValidation } = require("../config/env");
const { getAudioProfileConfig, saveAudioProfileConfig, getActiveAudioProfile, getVoiceTransportMode } = require("../services/audioProfileService");

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

router.get("/about", async (req, res) => {
  try {
    const lic = await getLicenseStatus();
    const audioProfile = await getActiveAudioProfile();
    const voiceTransportMode = await getVoiceTransportMode();
    return res.json({
      companyName: lic.companyName || "-",
      serverName: lic.serverName || "-",
      expiresAt: lic.expiresAt || null,
      active: Boolean(lic.active),
      deviceId: req.auth.deviceId,
      userId: req.auth.userId,
      audioProfile,
      voiceTransportMode
    });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load about info" });
  }
});

router.get("/admin/audio-profile", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  try {
    return res.json(await getAudioProfileConfig());
  } catch (_error) {
    return res.status(500).json({ error: "failed to load audio profile config" });
  }
});

router.put("/admin/audio-profile", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  try {
    const saved = await saveAudioProfileConfig(req.body || {});
    return res.json({ success: true, config: saved });
  } catch (_error) {
    return res.status(500).json({ error: "failed to save audio profile config" });
  }
});

router.get("/admin/license", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  try {
    return res.json(await getLicenseStatus());
  } catch (_error) {
    return res.status(500).json({ error: "failed to load license" });
  }
});

router.put("/admin/license", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  try {
    const key = req.body && req.body.licenseKey ? String(req.body.licenseKey) : "";
    if (!key) return res.status(400).json({ error: "licenseKey is required" });
    const saved = await setLicenseKey(key);
    return res.json({ success: true, license: saved });
  } catch (error) {
    return res.status(400).json({ error: error.message || "invalid license key" });
  }
});

router.post("/admin/backup", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  let sqlFilePath = "";
  try {
    const tRes = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `);
    const tableNames = tRes.rows.map((r) => r.table_name);
    const data = {};
    for (const tableName of tableNames) {
      const q = `SELECT * FROM "${tableName}"`;
      const rows = await pool.query(q);
      data[tableName] = rows.rows;
    }

    function sqlValue(v) {
      if (v === null || v === undefined) return "NULL";
      if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
      if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
      if (v instanceof Date) return `'${v.toISOString().replace(/'/g, "''")}'`;
      if (Buffer.isBuffer(v)) return `'\\\\x${v.toString("hex")}'`;
      if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
      return `'${String(v).replace(/'/g, "''")}'`;
    }

    const sqlLines = [];
    sqlLines.push("-- Auto generated database backup");
    sqlLines.push(`-- Generated at: ${new Date().toISOString()}`);
    sqlLines.push("");
    sqlLines.push("BEGIN;");
    sqlLines.push("");
    for (const tableName of tableNames) {
      const rows = data[tableName] || [];
      sqlLines.push(`-- Table: ${tableName}`);
      if (!rows.length) {
        sqlLines.push("");
        continue;
      }
      const cols = Object.keys(rows[0]);
      const colSql = cols.map((c) => `"${c}"`).join(", ");
      for (const r of rows) {
        const valSql = cols.map((c) => sqlValue(r[c])).join(", ");
        sqlLines.push(`INSERT INTO "${tableName}" (${colSql}) VALUES (${valSql});`);
      }
      sqlLines.push("");
    }
    sqlLines.push("COMMIT;");
    sqlLines.push("");

    const backupDir = path.join(__dirname, "..", "..", "..", "backup", "db");
    fs.mkdirSync(backupDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const sqlFileName = `db-backup-${stamp}.sql`;
    sqlFilePath = path.join(backupDir, sqlFileName);
    fs.writeFileSync(sqlFilePath, sqlLines.join("\n"), "utf8");

    const zipFileName = `db-backup-${stamp}.zip`;
    const zipFilePath = path.join(backupDir, zipFileName);
    execFileSync(
      "powershell",
      [
        "-NoProfile",
        "-Command",
        `Compress-Archive -LiteralPath '${sqlFilePath.replace(/'/g, "''")}' -DestinationPath '${zipFilePath.replace(/'/g, "''")}' -Force`
      ],
      { stdio: "ignore" }
    );
    return res.json({
      success: true,
      fileName: zipFileName,
      filePath: zipFilePath,
      sqlFileName,
      sqlFilePath: "(packed inside zip)",
      totalTables: tableNames.length
    });
  } catch (error) {
    return res.status(500).json({ error: "failed_to_backup_db", detail: error.message });
  } finally {
    // Keep only one artifact on disk: ZIP.
    if (sqlFilePath && fs.existsSync(sqlFilePath)) {
      try {
        fs.unlinkSync(sqlFilePath);
      } catch (_e) {}
    }
  }
});

router.get("/admin/backup/list", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  try {
    const backupDir = path.join(__dirname, "..", "..", "..", "backup", "db");
    if (!fs.existsSync(backupDir)) {
      return res.json({ backupDir, files: [] });
    }
    const files = fs.readdirSync(backupDir)
      .map((name) => {
        const fullPath = path.join(backupDir, name);
        const st = fs.statSync(fullPath);
        return {
          name,
          path: fullPath,
          size: st.size,
          modifiedAt: st.mtime.toISOString()
        };
      })
      .filter((f) => f.name.toLowerCase().endsWith(".zip"))
      .sort((a, b) => (a.modifiedAt < b.modifiedAt ? 1 : -1));
    return res.json({ backupDir, files });
  } catch (error) {
    return res.status(500).json({ error: "failed_to_list_backups", detail: error.message });
  }
});

router.post("/admin/devices/activate", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  try {
    const userId = req.body && req.body.userId ? String(req.body.userId).trim() : "";
    const deviceId = req.body && req.body.deviceId ? String(req.body.deviceId).trim() : (bypassDeviceValidation ? `auto-${userId}` : "");
    const deviceKey = req.body && req.body.deviceKey ? String(req.body.deviceKey).trim() : "";
    const platform = req.body && req.body.platform ? String(req.body.platform).trim() : "android";
    if (!userId || !deviceId || (!bypassDeviceValidation && !deviceKey)) {
      return res.status(400).json({ error: bypassDeviceValidation ? "userId is required" : "userId, deviceId, deviceKey are required" });
    }
    if (!bypassDeviceValidation) {
      const parsed = verifyDeviceActivationKey(deviceKey);
      if (String(parsed.userId || "") !== userId) return res.status(400).json({ error: "device_key_user_mismatch" });
      if (String(parsed.deviceId || "") !== deviceId) return res.status(400).json({ error: "device_key_device_mismatch" });
    }
    const activated = await activateDeviceForUser(userId, deviceId, platform);
    if (!activated) return res.status(404).json({ error: "user_not_found" });
    return res.json({ success: true, activated: { userId, deviceId, platform } });
  } catch (error) {
    return res.status(400).json({ error: error.message || "invalid_device_key" });
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
      ),
      latest_image AS (
        SELECT DISTINCT ON (pim.speaker_user_id)
          pim.speaker_user_id,
          pim.created_at AS last_image_at
        FROM ptt_image_messages pim
        ORDER BY pim.speaker_user_id, pim.created_at DESC
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
        lp.ended_at AS last_ptt_ended_at,
        li.last_image_at
      FROM users u
      INNER JOIN devices d ON d.user_id = u.id
      LEFT JOIN user_channels uc ON uc.user_id = u.id
      LEFT JOIN latest_location ll ON ll.device_id = d.id
      LEFT JOIN latest_ptt lp ON lp.speaker_user_id = u.id
      LEFT JOIN latest_image li ON li.speaker_user_id = u.id
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
        : null,
      lastImageAt: r.last_image_at || null
    }));

    return res.json({ generatedAt: new Date().toISOString(), staff });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load tracking overview" });
  }
});

router.get("/tracking/route", async (req, res) => {
  try {
    const deviceId = req.query.deviceId ? String(req.query.deviceId) : "";
    if (!deviceId) return res.status(400).json({ error: "deviceId is required" });
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const limit = Math.max(10, Math.min(5000, Number(req.query.limit) || 2000));
    const { rows } = await pool.query(
      `
      SELECT lp.latitude, lp.longitude, lp.recorded_at
      FROM location_points lp
      INNER JOIN devices d ON d.id = lp.device_id
      WHERE d.device_label = $1
        AND ($2::timestamptz IS NULL OR lp.recorded_at >= $2::timestamptz)
        AND ($3::timestamptz IS NULL OR lp.recorded_at <= $3::timestamptz)
      ORDER BY lp.recorded_at ASC
      LIMIT $4
      `,
      [deviceId, from, to, limit]
    );
    return res.json({
      deviceId,
      count: rows.length,
      points: rows.map((r) => ({
        lat: Number(r.latitude),
        lon: Number(r.longitude),
        at: r.recorded_at
      }))
    });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load route" });
  }
});

router.get("/admin/devices", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  try {
    const devices = await listDevicesForAdmin();
    return res.json({ devices });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load devices" });
  }
});

router.put("/admin/devices/:deviceId/beacon", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) {
    return res.status(403).json({ error: "dispatcher role required" });
  }
  try {
    const deviceId = String(req.params.deviceId || "");
    const updated = await updateDeviceBeaconSetting(deviceId, req.body || {});
    if (!updated) return res.status(404).json({ error: "device not found" });
    return res.json({ success: true, device: updated });
  } catch (_error) {
    return res.status(500).json({ error: "failed to update beacon setting" });
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

router.get("/admin/users", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) return res.status(403).json({ error: "dispatcher role required" });
  try {
    const { rows } = await pool.query(`
      SELECT u.id, u.username, u.display_name, u.role,
             COALESCE(array_agg(d.device_label ORDER BY d.device_label) FILTER (WHERE d.device_label IS NOT NULL), '{}') AS devices
      FROM users u
      LEFT JOIN devices d ON d.user_id = u.id
      GROUP BY u.id, u.username, u.display_name, u.role
      ORDER BY u.username ASC
    `);
    return res.json({ users: rows.map((r) => ({ id: r.id, userId: r.username, displayName: r.display_name, role: r.role, devices: r.devices || [] })) });
  } catch (_e) {
    return res.status(500).json({ error: "failed to load users" });
  }
});

router.post("/admin/users", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) return res.status(403).json({ error: "dispatcher role required" });
  const userId = String(req.body?.userId || "").trim();
  const displayName = String(req.body?.displayName || "").trim();
  const role = String(req.body?.role || "operator").trim();
  const deviceId = String(req.body?.deviceId || "").trim();
  if (!userId || !displayName) return res.status(400).json({ error: "userId and displayName are required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const userDbId = crypto.randomUUID();
    await client.query(`INSERT INTO users (id, username, display_name, role) VALUES ($1, $2, $3, $4)`, [userDbId, userId, displayName, role]);
    if (deviceId) {
      await client.query(`INSERT INTO devices (id, user_id, device_label, platform) VALUES ($1, $2, $3, $4)`, [crypto.randomUUID(), userDbId, deviceId, "android"]);
    }
    await client.query("COMMIT");
    return res.json({ success: true, userId });
  } catch (e) {
    await client.query("ROLLBACK");
    return res.status(400).json({ error: e.message || "failed to create user" });
  } finally {
    client.release();
  }
});

router.put("/admin/users/:userId", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) return res.status(403).json({ error: "dispatcher role required" });
  const username = String(req.params.userId || "").trim();
  const displayName = String(req.body?.displayName || "").trim();
  const role = String(req.body?.role || "").trim();
  if (!username) return res.status(400).json({ error: "userId is required" });
  try {
    const sets = [];
    const vals = [];
    if (displayName) { vals.push(displayName); sets.push(`display_name = $${vals.length}`); }
    if (role) { vals.push(role); sets.push(`role = $${vals.length}`); }
    if (!sets.length) return res.status(400).json({ error: "nothing to update" });
    vals.push(username);
    const r = await pool.query(`UPDATE users SET ${sets.join(", ")} WHERE username = $${vals.length}`, vals);
    if (!r.rowCount) return res.status(404).json({ error: "user not found" });
    return res.json({ success: true, userId: username });
  } catch (_e) {
    return res.status(500).json({ error: "failed to update user" });
  }
});

router.delete("/admin/users/:userId", async (req, res) => {
  if (!canEmergencyOverride(req.auth.role)) return res.status(403).json({ error: "dispatcher role required" });
  const username = String(req.params.userId || "").trim();
  if (!username) return res.status(400).json({ error: "userId is required" });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ur = await client.query(`SELECT id FROM users WHERE username = $1 LIMIT 1`, [username]);
    if (!ur.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "user not found" });
    }
    const uid = ur.rows[0].id;
    await client.query(`DELETE FROM user_menu_permissions WHERE user_id = $1`, [uid]);
    await client.query(`DELETE FROM channel_members WHERE user_id = $1`, [uid]);
    await client.query(`DELETE FROM devices WHERE user_id = $1`, [uid]);
    await client.query(`DELETE FROM users WHERE id = $1`, [uid]);
    await client.query("COMMIT");
    return res.json({ success: true, userId: username });
  } catch (_e) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "failed to delete user" });
  } finally {
    client.release();
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

router.get("/staff/:userId/messages", async (req, res) => {
  try {
    const userId = String(req.params.userId || "");
    const channels = await getVisibleChannels(req.auth.userDbId, req.auth.role);
    const channelCodes = channels.map((c) => c.id);
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const channelId = req.query.channelId ? String(req.query.channelId) : null;
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const messages = await getUserPttMessages({
      username: userId,
      limit,
      channelCodes,
      channelId,
      from,
      to
    });
    const images = await getUserPttImages({
      username: userId,
      limit,
      channelCodes,
      channelId
    });
    return res.json({ count: messages.length + images.length, messages, images });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load staff message history" });
  }
});

module.exports = router;
