const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

module.exports = {
  port: Number(process.env.PORT || 3100),
  cleanupEnabled: process.env.CLEANUP_ENABLED !== "false",
  cleanupIntervalMinutes: Number(process.env.CLEANUP_INTERVAL_MINUTES || 60),
  cleanupDefaultRetentionDays: Number(process.env.CLEANUP_DEFAULT_RETENTION_DAYS || 30),
  jwtSecret: process.env.JWT_SECRET || "replace_me_in_dev",
  generatorAdminUser: process.env.GENERATOR_ADMIN_USER || "superadmin",
  generatorAdminPass: process.env.GENERATOR_ADMIN_PASS || "superadmin123",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",
  companyName: process.env.COMPANY_NAME || "Unlicensed Company",
  serverName: process.env.SERVER_NAME || "PoC Server",
  serverInstanceCount: Number(process.env.SERVER_INSTANCE_COUNT || 1),
  licenseSecretKey: process.env.LICENSE_SECRET_KEY || "",
  licenseClientKey: process.env.LICENSE_CLIENT_KEY || "",
  licenseParamA: process.env.LICENSE_PARAM_A || "A",
  licenseParamB: process.env.LICENSE_PARAM_B || "B",
  licenseParamC: process.env.LICENSE_PARAM_C || "C",
  bypassLicenseValidation: process.env.BYPASS_LICENSE_VALIDATION === "true",
  bypassDeviceValidation: process.env.BYPASS_DEVICE_VALIDATION === "true",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "pocserver"
  }
};
