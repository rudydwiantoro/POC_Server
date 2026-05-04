const fs = require("fs/promises");
const path = require("path");
const { pool } = require("../db/pool");
const { cleanupDefaultRetentionDays } = require("../config/env");

const POLICY_KEYS = [
  "ptt_voice_messages",
  "location_points_log",
  "ptt_text_messages",
  "ptt_image_messages"
];

function ensurePositiveDays(raw, fallbackDays) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return fallbackDays;
  return Math.floor(n);
}

async function ensureDefaultPolicies() {
  const days = ensurePositiveDays(cleanupDefaultRetentionDays, 30);
  for (const key of POLICY_KEYS) {
    await pool.query(
      `
      INSERT INTO recycle_policies (target_key, retention_days, enabled, updated_at)
      VALUES ($1, $2, TRUE, NOW())
      ON CONFLICT (target_key) DO NOTHING
      `,
      [key, days]
    );
  }
}

async function writeRecycleLog(targetKey, deletedRows, deletedFiles, note) {
  await pool.query(
    `
    INSERT INTO recycle_cleanup_logs (target_key, deleted_rows, deleted_files, note, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    `,
    [targetKey, deletedRows, deletedFiles, note || null]
  );
}

async function cleanVoiceMessages(retentionDays) {
  const client = await pool.connect();
  let deletedRows = 0;
  let deletedFiles = 0;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
      DELETE FROM ptt_messages
      WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
      RETURNING audio_path
      `,
      [retentionDays]
    );
    deletedRows = rows.length;
    await client.query("COMMIT");

    const uploadsRoot = path.join(__dirname, "..", "..", "uploads");
    for (const row of rows) {
      try {
        const absPath = path.join(uploadsRoot, row.audio_path || "");
        await fs.unlink(absPath);
        deletedFiles += 1;
      } catch (error) {
        if (!error || error.code !== "ENOENT") {
          // eslint-disable-next-line no-console
          console.error("[Recycle] failed to delete voice file:", error.message);
        }
      }
    }
    await writeRecycleLog("ptt_voice_messages", deletedRows, deletedFiles, null);
  } catch (error) {
    await client.query("ROLLBACK");
    await writeRecycleLog("ptt_voice_messages", 0, 0, `error: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

async function cleanLocationLogs(retentionDays) {
  const result = await pool.query(
    `
    DELETE FROM location_points
    WHERE recorded_at < NOW() - ($1::int * INTERVAL '1 day')
    `,
    [retentionDays]
  );
  await writeRecycleLog("location_points_log", result.rowCount || 0, 0, null);
}

async function cleanTextMessages(retentionDays) {
  const result = await pool.query(
    `
    DELETE FROM ptt_text_messages
    WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
    `,
    [retentionDays]
  );
  await writeRecycleLog("ptt_text_messages", result.rowCount || 0, 0, null);
}

async function cleanImageMessages(retentionDays) {
  const client = await pool.connect();
  let deletedRows = 0;
  let deletedFiles = 0;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      `
      DELETE FROM ptt_image_messages
      WHERE created_at < NOW() - ($1::int * INTERVAL '1 day')
      RETURNING image_path
      `,
      [retentionDays]
    );
    deletedRows = rows.length;
    await client.query("COMMIT");

    const uploadsRoot = path.join(__dirname, "..", "..", "uploads");
    for (const row of rows) {
      try {
        const absPath = path.join(uploadsRoot, row.image_path || "");
        await fs.unlink(absPath);
        deletedFiles += 1;
      } catch (error) {
        if (!error || error.code !== "ENOENT") {
          // eslint-disable-next-line no-console
          console.error("[Recycle] failed to delete image file:", error.message);
        }
      }
    }
    await writeRecycleLog("ptt_image_messages", deletedRows, deletedFiles, null);
  } catch (error) {
    await client.query("ROLLBACK");
    await writeRecycleLog("ptt_image_messages", 0, 0, `error: ${error.message}`);
    throw error;
  } finally {
    client.release();
  }
}

async function runRecycleCleanupOnce() {
  await ensureDefaultPolicies();
  const { rows } = await pool.query(
    `
    SELECT target_key, retention_days, enabled
    FROM recycle_policies
    WHERE enabled = TRUE
    `
  );
  for (const policy of rows) {
    const days = ensurePositiveDays(policy.retention_days, 30);
    if (policy.target_key === "ptt_voice_messages") {
      await cleanVoiceMessages(days);
    } else if (policy.target_key === "location_points_log") {
      await cleanLocationLogs(days);
    } else if (policy.target_key === "ptt_text_messages") {
      await cleanTextMessages(days);
    } else if (policy.target_key === "ptt_image_messages") {
      await cleanImageMessages(days);
    }
  }
}

module.exports = {
  runRecycleCleanupOnce,
  ensureDefaultPolicies
};
