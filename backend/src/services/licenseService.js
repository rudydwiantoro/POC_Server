const crypto = require("crypto");
const { pool } = require("../db/pool");
const {
  companyName,
  serverName,
  serverInstanceCount,
  licenseSecretKey,
  licenseClientKey,
  licenseParamA,
  licenseParamB,
  licenseParamC
} = require("../config/env");

function getLicenseSecret() {
  if (licenseSecretKey) return String(licenseSecretKey);
  return `${licenseParamA}|${licenseParamB}|${licenseParamC}`;
}

function signPayload(payloadObj) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const secret = getLicenseSecret();
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function verifyLicenseKey(licenseKey) {
  const parts = String(licenseKey || "").split(".");
  if (parts.length !== 2) throw new Error("invalid_license_format");
  const [payloadB64, sig] = parts;
  const secret = getLicenseSecret();
  const expected = crypto.createHmac("sha256", secret).update(payloadB64).digest("base64url");
  if (sig !== expected) throw new Error("invalid_license_signature");
  const parsed = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  return parsed;
}

async function getCurrentLicense() {
  const { rows } = await pool.query("SELECT * FROM server_license WHERE id = 1 LIMIT 1");
  return rows[0] || null;
}

async function setLicenseKey(licenseKey) {
  const l = verifyLicenseKey(licenseKey);
  if (!l.companyName || !l.serverName || !l.expiresAt) throw new Error("invalid_license_payload");
  if (String(l.companyName) !== String(companyName)) throw new Error("license_company_mismatch");
  if (String(l.serverName) !== String(serverName)) throw new Error("license_server_mismatch");
  if (licenseClientKey && String(l.clientKey || "") !== String(licenseClientKey)) {
    throw new Error("license_client_key_mismatch");
  }
  if (Number(serverInstanceCount) > Number(l.maxServers || 0)) throw new Error("license_max_servers_exceeded");
  const exp = new Date(l.expiresAt);
  if (Number.isNaN(exp.getTime())) throw new Error("invalid_license_expiry");
  await pool.query(
    `
    INSERT INTO server_license (id, license_key, company_name, server_name, max_servers, max_devices, max_online_devices, expires_at, created_at, updated_at)
    VALUES (1, $1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE
    SET license_key = EXCLUDED.license_key,
        company_name = EXCLUDED.company_name,
        server_name = EXCLUDED.server_name,
        max_servers = EXCLUDED.max_servers,
        max_devices = EXCLUDED.max_devices,
        max_online_devices = EXCLUDED.max_online_devices,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    `,
    [licenseKey, l.companyName, l.serverName, Number(l.maxServers), Number(l.maxDevices), Number(l.maxOnlineDevices), exp.toISOString()]
  );
  return await getLicenseStatus();
}

async function getLicenseStatus() {
  const row = await getCurrentLicense();
  if (!row) {
    return { active: false, reason: "license_not_set", companyName, serverName };
  }
  const expired = new Date(row.expires_at).getTime() <= Date.now();
  return {
    active: !expired,
    reason: expired ? "license_expired" : "ok",
    companyName: row.company_name,
    serverName: row.server_name,
    maxServers: row.max_servers,
    maxDevices: row.max_devices,
    maxOnlineDevices: row.max_online_devices,
    expiresAt: row.expires_at
  };
}

async function assertLicenseActive() {
  const st = await getLicenseStatus();
  if (!st.active) throw new Error(st.reason || "license_inactive");
  return st;
}

module.exports = { signPayload, verifyLicenseKey, setLicenseKey, getLicenseStatus, assertLicenseActive };
