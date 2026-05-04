#!/usr/bin/env node
const crypto = require("crypto");

function readArg(name, fallback = "") {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function toInt(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function signPayload(payloadObj, secretKey) {
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString("base64url");
  const sig = crypto.createHmac("sha256", secretKey).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

function main() {
  const companyName = readArg("company");
  const serverName = readArg("server");
  const maxServers = toInt(readArg("maxServers", "1"), 1);
  const maxDevices = toInt(readArg("maxDevices", "100"), 100);
  const maxOnlineDevices = toInt(readArg("maxOnline", "20"), 20);
  const expiresAt = readArg("expiresAt");
  const secretKey = readArg("secretKey");
  const clientKey = readArg("clientKey");

  if (!companyName || !serverName || !expiresAt || !secretKey || !clientKey) {
    console.error("Usage: node generate-license.js --company=... --server=... --maxServers=1 --maxDevices=100 --maxOnline=20 --expiresAt=2030-12-31T23:59:59Z --secretKey=... --clientKey=...");
    process.exit(1);
  }

  const exp = new Date(expiresAt);
  if (Number.isNaN(exp.getTime())) {
    console.error("Invalid expiresAt. Use ISO format, e.g. 2030-12-31T23:59:59Z");
    process.exit(1);
  }

  const payload = {
    companyName,
    serverName,
    maxServers,
    maxDevices,
    maxOnlineDevices,
    expiresAt: exp.toISOString(),
    clientKey
  };

  const licenseKey = signPayload(payload, secretKey);
  console.log(licenseKey);
}

main();
