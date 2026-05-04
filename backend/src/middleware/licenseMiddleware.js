const { assertLicenseActive } = require("../services/licenseService");

async function requireActiveLicense(_req, res, next) {
  const req = _req;
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
