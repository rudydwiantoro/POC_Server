const { signPayload } = require("../services/licenseService");

function readArg(name, fallback = "") {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  return hit.slice(name.length + 3);
}

function main() {
  const companyName = readArg("company");
  const serverName = readArg("server");
  const maxServers = Number(readArg("maxServers", "1"));
  const maxDevices = Number(readArg("maxDevices", "100"));
  const maxOnlineDevices = Number(readArg("maxOnline", "20"));
  const expiresAt = readArg("expiresAt");

  if (!companyName || !serverName || !expiresAt) {
    // eslint-disable-next-line no-console
    console.error("Usage: node src/scripts/generateLicenseKey.js --company=... --server=... --maxServers=1 --maxDevices=100 --maxOnline=20 --expiresAt=2030-12-31T23:59:59Z");
    process.exit(1);
  }

  const payload = {
    companyName,
    serverName,
    maxServers,
    maxDevices,
    maxOnlineDevices,
    expiresAt
  };
  const key = signPayload(payload);
  // eslint-disable-next-line no-console
  console.log(key);
}

main();
