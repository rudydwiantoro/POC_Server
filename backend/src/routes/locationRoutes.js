const express = require("express");
const { latestLocations, locationHistory } = require("../services/inMemoryStore");

const router = express.Router();

router.post("/update", (req, res) => {
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

  return res.json({ success: true, point });
});

router.get("/latest", (_req, res) => {
  return res.json({ devices: Array.from(latestLocations.values()) });
});

module.exports = router;
