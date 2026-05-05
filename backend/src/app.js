const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const channelRoutes = require("./routes/channelRoutes");
const pttRoutes = require("./routes/pttRoutes");
const locationRoutes = require("./routes/locationRoutes");
const gpsTrackerPublicRoutes = require("./routes/gpsTrackerPublicRoutes");
const dispatchRoutes = require("./routes/dispatchRoutes");
const generatorRoutes = require("./routes/generatorRoutes");
const { requireAuth } = require("./middleware/authMiddleware");
const { requireActiveLicense } = require("./middleware/licenseMiddleware");
const { publicBaseUrl } = require("./config/env");
const { getLicenseStatus } = require("./services/licenseService");

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "12mb" }));
  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use("/media", express.static(path.join(__dirname, "..", "uploads")));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "pocserver-backend" });
  });

  app.get("/api/public/server-config", (req, res) => {
    const hostBase = `${req.protocol}://${req.get("host")}`;
    const baseUrl = publicBaseUrl || hostBase;
    const wsUrl = baseUrl.replace(/^http/i, "ws").replace(/\/+$/, "") + "/ws/signaling";
    return res.json({
      version: 1,
      appName: "PoC Radio",
      httpBaseUrl: baseUrl,
      wsUrl,
      healthUrl: `${baseUrl.replace(/\/+$/, "")}/api/health`,
      generatedAt: new Date().toISOString()
    });
  });

  app.get("/api/public/about", async (_req, res) => {
    const lic = await getLicenseStatus();
    return res.json({
      companyName: lic.companyName || "Unknown",
      serverName: lic.serverName || "Unknown",
      expiresAt: lic.expiresAt || null,
      active: Boolean(lic.active)
    });
  });

  app.get("/.well-known/poc-radio-server-config.json", (req, res) => {
    const hostBase = `${req.protocol}://${req.get("host")}`;
    const baseUrl = publicBaseUrl || hostBase;
    const wsUrl = baseUrl.replace(/^http/i, "ws").replace(/\/+$/, "") + "/ws/signaling";
    return res.json({
      version: 1,
      appName: "PoC Radio",
      httpBaseUrl: baseUrl,
      wsUrl,
      healthUrl: `${baseUrl.replace(/\/+$/, "")}/api/health`,
      fetchedFrom: "/.well-known/poc-radio-server-config.json",
      generatedAt: new Date().toISOString()
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/generator", generatorRoutes);
  app.use("/api/channels", requireAuth, requireActiveLicense, channelRoutes);
  app.use("/api/ptt/floor", requireAuth, requireActiveLicense, pttRoutes);
  app.use("/api/location", requireAuth, requireActiveLicense, locationRoutes);
  app.use("/api/public/gps-tracker", requireActiveLicense, gpsTrackerPublicRoutes);
  app.use("/api/dispatch", requireAuth, requireActiveLicense, dispatchRoutes);

  return app;
}

module.exports = { createApp };
