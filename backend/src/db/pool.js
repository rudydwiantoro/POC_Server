const { Pool } = require("pg");
const { db } = require("../config/env");

const pool = new Pool({
  host: db.host,
  port: db.port,
  user: db.user,
  password: db.password,
  database: db.database,
  // Keep a small pool for PoC and evict idle clients to reduce stale-connection issues.
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000
});

pool.on("error", (error) => {
  // Prevent process crash on idle client/network errors from postgres.
  // eslint-disable-next-line no-console
  console.error("[DB] Unexpected idle client error:", error.message);
});

module.exports = { pool };
