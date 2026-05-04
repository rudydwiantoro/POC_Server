const express = require("express");
const { latestLocations, locationHistory } = require("../services/inMemoryStore");
const { pool } = require("../db/pool");

const router = express.Router();

router.post("/update", async (req, res) => {
  const { deviceId, lat, lon, accuracy, timestamp } = req.body || {};
  if (!deviceId || typeof lat !== "number" || typeof lon !== "number") {
    return res.status(400).json({ error: "deviceId, lat, lon are required" });
  }
  if (req.auth.deviceId !== deviceId) {
    return res.status(403).json({ error: "token deviceId does not match request deviceId" });
  }

  const point = {
    deviceId,
    lat,
    lon,
    accuracy: typeof accuracy === "number" ? accuracy : null,
    timestamp: timestamp || new Date().toISOString()
  };

  latestLocations.set(deviceId, point);
  const history = locationHistory.get(deviceId) || [];
  history.push(point);
  locationHistory.set(deviceId, history.slice(-500));
  try {
    await pool.query(
      `
      INSERT INTO location_points (device_id, latitude, longitude, accuracy_m, recorded_at)
      VALUES ($1, $2, $3, $4, $5::timestamptz)
      `,
      [req.auth.deviceDbId, lat, lon, typeof accuracy === "number" ? accuracy : null, point.timestamp]
    );
  } catch (_error) {
    // do not fail caller if DB write fails temporarily
  }

  return res.json({ success: true, point });
});

router.get("/latest", (_req, res) => {
  return res.json({ devices: Array.from(latestLocations.values()) });
});

router.get("/history/:deviceId", async (req, res) => {
  try {
    const deviceId = String(req.params.deviceId || "");
    const from = req.query.from ? String(req.query.from) : null;
    const to = req.query.to ? String(req.query.to) : null;
    const limit = Math.max(10, Math.min(5000, Number(req.query.limit) || 1000));
    const { rows } = await pool.query(
      `
      SELECT d.device_label AS device_id, lp.latitude, lp.longitude, lp.accuracy_m, lp.recorded_at
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
        accuracy: r.accuracy_m == null ? null : Number(r.accuracy_m),
        timestamp: r.recorded_at
      }))
    });
  } catch (_error) {
    return res.status(500).json({ error: "failed to load location history" });
  }
});

module.exports = router;
