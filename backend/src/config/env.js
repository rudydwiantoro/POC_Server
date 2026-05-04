const dotenv = require("dotenv");

dotenv.config();

module.exports = {
  port: Number(process.env.PORT || 3100),
  jwtSecret: process.env.JWT_SECRET || "replace_me_in_dev",
  publicBaseUrl: process.env.PUBLIC_BASE_URL || "",
  db: {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "pocserver"
  }
};
