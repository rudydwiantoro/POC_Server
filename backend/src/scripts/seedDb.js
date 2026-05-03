const { pool } = require("../db/pool");

async function run() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`
      INSERT INTO channels (id, code, name, is_emergency) VALUES
      ('00000000-0000-0000-0000-000000000101', 'housekeeping', 'Housekeeping', false),
      ('00000000-0000-0000-0000-000000000102', 'engineering', 'Engineering', false),
      ('00000000-0000-0000-0000-000000000103', 'security', 'Security', false),
      ('00000000-0000-0000-0000-000000000104', 'all-call', 'All-Call', true)
      ON CONFLICT (id) DO UPDATE
      SET code = EXCLUDED.code, name = EXCLUDED.name, is_emergency = EXCLUDED.is_emergency
    `);

    await client.query(`
      INSERT INTO users (id, username, display_name, role) VALUES
      ('10000000-0000-0000-0000-000000000001', 'u1', 'Engineering User', 'operator'),
      ('10000000-0000-0000-0000-000000000002', 'hk1', 'Housekeeping User', 'operator'),
      ('10000000-0000-0000-0000-000000000003', 'sec1', 'Security User', 'operator'),
      ('10000000-0000-0000-0000-000000000004', 'supervisor', 'Dispatcher Supervisor', 'dispatcher')
      ON CONFLICT (id) DO UPDATE
      SET username = EXCLUDED.username, display_name = EXCLUDED.display_name, role = EXCLUDED.role
    `);

    await client.query(`
      INSERT INTO devices (id, user_id, device_label, platform) VALUES
      ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'd1', 'android'),
      ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'hk-device', 'android'),
      ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'sec-device', 'android'),
      ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004', 'desk1', 'web')
      ON CONFLICT (id) DO UPDATE
      SET user_id = EXCLUDED.user_id, device_label = EXCLUDED.device_label, platform = EXCLUDED.platform
    `);

    await client.query(`
      INSERT INTO channel_members (channel_id, user_id, can_talk) VALUES
      ('00000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000001', true),
      ('00000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000002', true),
      ('00000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000003', true),
      ('00000000-0000-0000-0000-000000000101', '10000000-0000-0000-0000-000000000004', true),
      ('00000000-0000-0000-0000-000000000102', '10000000-0000-0000-0000-000000000004', true),
      ('00000000-0000-0000-0000-000000000103', '10000000-0000-0000-0000-000000000004', true),
      ('00000000-0000-0000-0000-000000000104', '10000000-0000-0000-0000-000000000004', true)
      ON CONFLICT (channel_id, user_id) DO UPDATE
      SET can_talk = EXCLUDED.can_talk
    `);

    await client.query("COMMIT");
    // eslint-disable-next-line no-console
    console.log("Database seed completed.");
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
  console.error("Failed to seed database:", error.message);
  process.exit(1);
});
