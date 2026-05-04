const crypto = require("crypto");
const { pool } = require("../db/pool");

async function savePttTextMessage({ userDbId, channelCode, messageText }) {
  const text = String(messageText || "").trim();
  if (!text) {
    throw new Error("message_empty");
  }
  if (text.length > 160) {
    throw new Error("message_too_long");
  }

  const channelRes = await pool.query("SELECT id FROM channels WHERE code = $1 LIMIT 1", [channelCode]);
  if (!channelRes.rows[0]) {
    throw new Error("channel_not_found");
  }

  const id = crypto.randomUUID();
  await pool.query(
    `
    INSERT INTO ptt_text_messages (id, channel_id, speaker_user_id, message_text, created_at)
    VALUES ($1, $2, $3, $4, NOW())
    `,
    [id, channelRes.rows[0].id, userDbId, text]
  );

  return {
    id,
    channelId: channelCode,
    text
  };
}

async function getLatestPttTextMessage({ channelCode }) {
  const { rows } = await pool.query(
    `
    SELECT
      tm.id,
      c.code AS channel_id,
      u.username AS user_id,
      tm.message_text,
      tm.created_at
    FROM ptt_text_messages tm
    INNER JOIN channels c ON c.id = tm.channel_id
    INNER JOIN users u ON u.id = tm.speaker_user_id
    WHERE c.code = $1
    ORDER BY tm.created_at DESC
    LIMIT 1
    `,
    [channelCode]
  );

  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    channelId: rows[0].channel_id,
    userId: rows[0].user_id,
    text: rows[0].message_text,
    createdAt: rows[0].created_at
  };
}

module.exports = { savePttTextMessage, getLatestPttTextMessage };
