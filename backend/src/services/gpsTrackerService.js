const crypto = require("crypto");
const { pool } = require("../db/pool");

function clamp(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.max(min, Math.min(max, v));
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gps_trackers (
      id UUID PRIMARY KEY,
      device_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      auth_key TEXT,
      beacon_mode TEXT NOT NULL DEFAULT 'standard',
      keep_interval_sec INTEGER NOT NULL DEFAULT 30,
      submit_interval_sec INTEGER NOT NULL DEFAULT 300,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gps_tracker_points (
      id BIGSERIAL PRIMARY KEY,
      tracker_id UUID NOT NULL REFERENCES gps_trackers(id) ON DELETE CASCADE,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      accuracy_m DOUBLE PRECISION,
      battery_level DOUBLE PRECISION,
      recorded_at TIMESTAMPTZ NOT NULL
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_gps_tracker_points_tracker_time
    ON gps_tracker_points(tracker_id, recorded_at DESC)
  `);
}

async function listTrackers() {
  await ensureSchema();
  const { rows } = await pool.query(`
    SELECT device_id, name, enabled, auth_key, beacon_mode, keep_interval_sec, submit_interval_sec, created_at, updated_at
    FROM gps_trackers
    ORDER BY device_id ASC
  `);
  return rows.map((r) => ({
    deviceId: r.device_id,
    name: r.name,
    enabled: Boolean(r.enabled),
    authKey: r.auth_key || "",
    beaconMode: r.beacon_mode === "eco" ? "eco" : "standard",
    keepIntervalSec: Number(r.keep_interval_sec) || 30,
    submitIntervalSec: Number(r.submit_interval_sec) || 300,
    createdAt: r.created_at,
    updatedAt: r.updated_at
  }));
}

async function createTracker({ deviceId, name, enabled = true, authKey = "", beaconMode = "standard", keepIntervalSec = 30, submitIntervalSec = 300 }) {
  await ensureSchema();
  const id = crypto.randomUUID();
  await pool.query(
    `
    INSERT INTO gps_trackers (id, device_id, name, enabled, auth_key, beacon_mode, keep_interval_sec, submit_interval_sec, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())
    `,
    [
      id,
      String(deviceId).trim(),
      String(name).trim(),
      Boolean(enabled),
      String(authKey || "").trim() || null,
      String(beaconMode) === "eco" ? "eco" : "standard",
      clamp(keepIntervalSec, 5, 3600, 30),
      clamp(submitIntervalSec, 10, 7200, 300)
    ]
  );
}

async function updateTracker(deviceId, updates) {
  await ensureSchema();
  const fields = [];
  const vals = [];
  if (typeof updates.name === "string" && updates.name.trim()) {
    vals.push(updates.name.trim());
    fields.push(`name = $${vals.length}`);
  }
  if (typeof updates.enabled === "boolean") {
    vals.push(Boolean(updates.enabled));
    fields.push(`enabled = $${vals.length}`);
  }
  if (typeof updates.authKey === "string") {
    vals.push(updates.authKey.trim() || null);
    fields.push(`auth_key = $${vals.length}`);
  }
  if (typeof updates.beaconMode === "string") {
    vals.push(updates.beaconMode === "eco" ? "eco" : "standard");
    fields.push(`beacon_mode = $${vals.length}`);
  }
  if (updates.keepIntervalSec != null) {
    vals.push(clamp(updates.keepIntervalSec, 5, 3600, 30));
    fields.push(`keep_interval_sec = $${vals.length}`);
  }
  if (updates.submitIntervalSec != null) {
    vals.push(clamp(updates.submitIntervalSec, 10, 7200, 300));
    fields.push(`submit_interval_sec = $${vals.length}`);
  }
  if (!fields.length) return false;
  vals.push(String(deviceId).trim());
  const { rowCount } = await pool.query(
    `UPDATE gps_trackers SET ${fields.join(", ")}, updated_at = NOW() WHERE device_id = $${vals.length}`,
    vals
  );
  return rowCount > 0;
}

async function deleteTracker(deviceId) {
  await ensureSchema();
  const { rowCount } = await pool.query(`DELETE FROM gps_trackers WHERE device_id = $1`, [String(deviceId).trim()]);
  return rowCount > 0;
}

async function resolveTracker(deviceId, authKey) {
  await ensureSchema();
  const { rows } = await pool.query(`SELECT id, enabled, auth_key FROM gps_trackers WHERE device_id = $1 LIMIT 1`, [String(deviceId).trim()]);
  const tracker = rows[0];
  if (!tracker) throw new Error("tracker_not_registered");
  if (!tracker.enabled) throw new Error("tracker_disabled");
  const requiredKey = String(tracker.auth_key || "").trim();
  if (requiredKey && String(authKey || "").trim() !== requiredKey) throw new Error("tracker_auth_invalid");
  return tracker;
}

async function ingestTrackerBeacon({ deviceId, lat, lon, accuracy = null, battery = null, timestamp = null, authKey = "" }) {
  const tracker = await resolveTracker(deviceId, authKey);
  await pool.query(
    `
    INSERT INTO gps_tracker_points (tracker_id, latitude, longitude, accuracy_m, battery_level, recorded_at)
    VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
    `,
    [tracker.id, Number(lat), Number(lon), accuracy == null ? null : Number(accuracy), battery == null ? null : Number(battery), timestamp || new Date().toISOString()]
  );
}

async function ingestTrackerBeaconBatch({ deviceId, authKey = "", points = [] }) {
  const tracker = await resolveTracker(deviceId, authKey);
  if (!Array.isArray(points) || !points.length) throw new Error("points_required");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const p of points) {
      if (!p || typeof p.lat !== "number" || typeof p.lon !== "number") continue;
      await client.query(
        `
        INSERT INTO gps_tracker_points (tracker_id, latitude, longitude, accuracy_m, battery_level, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6::timestamptz)
        `,
        [
          tracker.id,
          Number(p.lat),
          Number(p.lon),
          p.accuracy == null ? null : Number(p.accuracy),
          p.battery == null ? null : Number(p.battery),
          p.timestamp || new Date().toISOString()
        ]
      );
    }
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function getTrackerHistory(deviceId, { from = null, to = null, limit = 2000 } = {}) {
  await ensureSchema();
  const lim = Math.max(10, Math.min(5000, Number(limit) || 2000));
  const { rows } = await pool.query(
    `
    SELECT gp.latitude, gp.longitude, gp.accuracy_m, gp.battery_level, gp.recorded_at
    FROM gps_tracker_points gp
    INNER JOIN gps_trackers gt ON gt.id = gp.tracker_id
    WHERE gt.device_id = $1
      AND ($2::timestamptz IS NULL OR gp.recorded_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR gp.recorded_at <= $3::timestamptz)
    ORDER BY gp.recorded_at ASC
    LIMIT $4
    `,
    [String(deviceId).trim(), from, to, lim]
  );
  return rows.map((r) => ({
    lat: Number(r.latitude),
    lon: Number(r.longitude),
    accuracy: r.accuracy_m == null ? null : Number(r.accuracy_m),
    battery: r.battery_level == null ? null : Number(r.battery_level),
    timestamp: r.recorded_at
  }));
}

module.exports = {
  listTrackers,
  createTracker,
  updateTracker,
  deleteTracker,
  ingestTrackerBeacon,
  ingestTrackerBeaconBatch,
  getTrackerHistory
};

