const fs = require("fs");
const path = require("path");
const { pool } = require("../db/pool");

async function run() {
  const sqlPath = path.join(__dirname, "..", "..", "sql", "001_init_schema.sql");
  const sql = fs.readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query(sql);
    // eslint-disable-next-line no-console
    console.log("Database schema initialized successfully.");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to initialize database schema:", error.message);
  process.exit(1);
});
