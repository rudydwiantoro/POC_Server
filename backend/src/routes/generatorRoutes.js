const express = require("express");
const { createHmac } = require("crypto");
const { issueAccessToken, verifyToken } = require("../services/tokenService");
const { generatorAdminUser, generatorAdminPass, licenseSecretKey } = require("../config/env");

const router = express.Router();

function toB64Url(v) {
  return Buffer.from(JSON.stringify(v)).toString("base64url");
}

function signPayload(payloadObj, secret) {
  const payload = toB64Url(payloadObj);
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function requireGeneratorAuth(req, res, next) {
  try {
    const header = String(req.headers.authorization || "");
    if (!header.startsWith("Bearer ")) return res.status(401).json({ error: "missing_token" });
    const token = header.slice("Bearer ".length);
    const payload = verifyToken(token);
    if (!payload || payload.scope !== "generator_admin") {
      return res.status(403).json({ error: "invalid_scope" });
    }
    req.generatorAuth = payload;
    return next();
  } catch (_err) {
    return res.status(401).json({ error: "invalid_token" });
  }
}

router.post("/login", (req, res) => {
  const username = req.body && req.body.username ? String(req.body.username) : "";
  const password = req.body && req.body.password ? String(req.body.password) : "";
  if (!username || !password) return res.status(400).json({ error: "username and password are required" });
  if (username !== String(generatorAdminUser) || password !== String(generatorAdminPass)) {
    return res.status(401).json({ error: "invalid_credentials" });
  }
  const token = issueAccessToken({ scope: "generator_admin", username });
  return res.json({ success: true, accessToken: token });
});

router.post("/generate/server-key", requireGeneratorAuth, (req, res) => {
  try {
    const companyName = String(req.body && req.body.companyName ? req.body.companyName : "").trim();
    const serverName = String(req.body && req.body.serverName ? req.body.serverName : "").trim();
    const maxServers = Number(req.body && req.body.maxServers ? req.body.maxServers : 1);
    const maxDevices = Number(req.body && req.body.maxDevices ? req.body.maxDevices : 100);
    const maxOnlineDevices = Number(req.body && req.body.maxOnlineDevices ? req.body.maxOnlineDevices : 20);
    const clientKey = String(req.body && req.body.clientKey ? req.body.clientKey : "").trim();
    const expiresAtRaw = String(req.body && req.body.expiresAt ? req.body.expiresAt : "").trim();
    const secretKey = String(req.body && req.body.secretKey ? req.body.secretKey : "").trim() || String(licenseSecretKey || "");
    if (!companyName || !serverName || !clientKey || !expiresAtRaw) {
      return res.status(400).json({ error: "companyName, serverName, clientKey, expiresAt are required" });
    }
    if (!secretKey) return res.status(400).json({ error: "secret_key_required" });
    const exp = new Date(expiresAtRaw);
    if (Number.isNaN(exp.getTime())) return res.status(400).json({ error: "invalid_expires_at" });
    const payload = { companyName, serverName, maxServers, maxDevices, maxOnlineDevices, expiresAt: exp.toISOString(), clientKey };
    const licenseKey = signPayload(payload, secretKey);
    return res.json({ success: true, licenseKey });
  } catch (_err) {
    return res.status(500).json({ error: "generate_server_key_failed" });
  }
});

router.post("/generate/device-key", requireGeneratorAuth, (req, res) => {
  try {
    const userId = String(req.body && req.body.userId ? req.body.userId : "").trim();
    const deviceId = String(req.body && req.body.deviceId ? req.body.deviceId : "").trim();
    const clientKey = String(req.body && req.body.clientKey ? req.body.clientKey : "").trim();
    const secretKey = String(req.body && req.body.secretKey ? req.body.secretKey : "").trim() || String(licenseSecretKey || "");
    if (!userId || !deviceId || !clientKey) {
      return res.status(400).json({ error: "userId, deviceId, clientKey are required" });
    }
    if (!secretKey) return res.status(400).json({ error: "secret_key_required" });
    const payload = { userId, deviceId, clientKey, issuedAt: new Date().toISOString() };
    const deviceKey = signPayload(payload, secretKey);
    return res.json({ success: true, deviceKey });
  } catch (_err) {
    return res.status(500).json({ error: "generate_device_key_failed" });
  }
});

module.exports = router;
