const { assertLicenseActive } = require("../services/licenseService");
const { bypassLicenseValidation } = require("../config/env");

async function requireActiveLicense(_req, res, next) {
  const req = _req;
  if (bypassLicenseValidation) return next();
  // Dispatcher must be able to enter dispatch console to set the first license key.
  if (req.baseUrl === "/api/dispatch" && req.auth && req.auth.role === "dispatcher") {
    return next();
  }
  if (req.path === "/admin/license" || req.path === "/about") {
    return next();
  }
  try {
    await assertLicenseActive();
    return next();
  } catch (error) {
    return res.status(403).json({ error: error.message || "license_inactive" });
  }
}

module.exports = { requireActiveLicense };
