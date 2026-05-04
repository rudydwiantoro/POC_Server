const fs = require("fs");
const path = require("path");
const { pool } = require("../db/pool");

async function run() {
  const sqlRoot = path.join(__dirname, "..", "..", "sql");
  const sqlPath = path.join(sqlRoot, "001_init_schema.sql");
  const baseSql = fs.readFileSync(sqlPath, "utf8");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(baseSql);
    await client.query("COMMIT");
    // eslint-disable-next-line no-console
    console.log("Database schema initialized successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
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
