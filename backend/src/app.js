const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const channelRoutes = require("./routes/channelRoutes");
const pttRoutes = require("./routes/pttRoutes");
const locationRoutes = require("./routes/locationRoutes");
const dispatchRoutes = require("./routes/dispatchRoutes");
const { requireAuth } = require("./middleware/authMiddleware");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "1mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "pocserver-backend" });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/channels", requireAuth, channelRoutes);
  app.use("/api/ptt/floor", requireAuth, pttRoutes);
  app.use("/api/location", requireAuth, locationRoutes);
  app.use("/api/dispatch", requireAuth, dispatchRoutes);

  return app;
}

module.exports = { createApp };
