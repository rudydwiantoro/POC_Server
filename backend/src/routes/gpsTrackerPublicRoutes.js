const express = require("express");
const { ingestTrackerBeacon, ingestTrackerBeaconBatch } = require("../services/gpsTrackerService");

const router = express.Router();

router.post("/beacon", async (req, res) => {
  try {
    const { deviceId, lat, lon, accuracy, battery, timestamp, authKey } = req.body || {};
    if (!deviceId || typeof lat !== "number" || typeof lon !== "number") {
      return res.status(400).json({ error: "deviceId, lat, lon are required" });
    }
    await ingestTrackerBeacon({ deviceId, lat, lon, accuracy, battery, timestamp, authKey });
    return res.json({ success: true, receivedAt: new Date().toISOString() });
  } catch (error) {
    if (error.message === "tracker_not_registered") return res.status(404).json({ error: "tracker_not_registered" });
    if (error.message === "tracker_disabled") return res.status(403).json({ error: "tracker_disabled" });
    if (error.message === "tracker_auth_invalid") return res.status(403).json({ error: "tracker_auth_invalid" });
    return res.status(500).json({ error: "tracker_beacon_failed" });
  }
});

router.post("/beacon-batch", async (req, res) => {
  try {
    const { deviceId, authKey, points } = req.body || {};
    if (!deviceId) return res.status(400).json({ error: "deviceId is required" });
    await ingestTrackerBeaconBatch({ deviceId, authKey, points });
    return res.json({ success: true, count: Array.isArray(points) ? points.length : 0, receivedAt: new Date().toISOString() });
  } catch (error) {
    if (error.message === "tracker_not_registered") return res.status(404).json({ error: "tracker_not_registered" });
    if (error.message === "tracker_disabled") return res.status(403).json({ error: "tracker_disabled" });
    if (error.message === "tracker_auth_invalid") return res.status(403).json({ error: "tracker_auth_invalid" });
    if (error.message === "points_required") return res.status(400).json({ error: "points_required" });
    return res.status(500).json({ error: "tracker_beacon_batch_failed" });
  }
});

module.exports = router;
