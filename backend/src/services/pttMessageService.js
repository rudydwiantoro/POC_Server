const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { pool } = require("../db/pool");

function extByMime(mimeType) {
  if (mimeType === "audio/webm") return "webm";
  if (mimeType === "audio/ogg") return "ogg";
  if (mimeType === "audio/mp4") return "m4a";
  return "bin";
}

async function savePttMessage({
  userDbId,
  deviceDbId,
  channelCode,
  mimeType,
  audioBase64,
  durationMs
}) {
  const channelRes = await pool.query("SELECT id FROM channels WHERE code = $1 LIMIT 1", [channelCode]);
  if (!channelRes.rows[0]) {
    throw new Error("channel_not_found");
  }
  const channelDbId = channelRes.rows[0].id;
  const sessionRes = await pool.query(
    `
    SELECT id FROM ptt_sessions
    WHERE channel_id = $1 AND speaker_user_id = $2
    ORDER BY started_at DESC
    LIMIT 1
    `,
    [channelDbId, userDbId]
  );
  const sessionId = sessionRes.rows[0] ? sessionRes.rows[0].id : null;

  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const ext = extByMime(mimeType);
  const fileName = `${now.getTime()}-${crypto.randomUUID()}.${ext}`;
  const relDir = path.join("ptt", y, m, d);
  const absDir = path.join(__dirname, "..", "..", "uploads", relDir);
  await fs.mkdir(absDir, { recursive: true });
  const absFile = path.join(absDir, fileName);
  await fs.writeFile(absFile, Buffer.from(audioBase64, "base64"));

  const relPath = path.join(relDir, fileName).replace(/\\/g, "/");
  const id = crypto.randomUUID();
  await pool.query(
    `
    INSERT INTO ptt_messages (id, session_id, channel_id, speaker_user_id, device_id, audio_path, mime_type, duration_ms, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
    `,
    [id, sessionId, channelDbId, userDbId, deviceDbId || null, relPath, mimeType, durationMs || null]
  );
  return { id, audioUrl: `/media/${relPath}` };
}

async function getUserPttMessages({
  username,
  limit = 20,
  channelCodes = [],
  channelId = null,
  from = null,
  to = null
}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const hasFrom = fromDate && !Number.isNaN(fromDate.getTime());
  const hasTo = toDate && !Number.isNaN(toDate.getTime());
  const sql = `
    SELECT
      pm.id,
      u.username AS user_id,
      c.code AS channel_id,
      pm.audio_path,
      pm.mime_type,
      pm.duration_ms,
      pm.created_at
    FROM ptt_messages pm
    INNER JOIN users u ON u.id = pm.speaker_user_id
    INNER JOIN channels c ON c.id = pm.channel_id
    WHERE u.username = $1
      AND ($2::text[] IS NULL OR c.code = ANY($2::text[]))
      AND ($3::text IS NULL OR c.code = $3)
      AND ($4::timestamptz IS NULL OR pm.created_at >= $4::timestamptz)
      AND ($5::timestamptz IS NULL OR pm.created_at <= $5::timestamptz)
    ORDER BY pm.created_at DESC
    LIMIT $6
  `;
  const { rows } = await pool.query(sql, [
    username,
    channelCodes.length ? channelCodes : null,
    channelId || null,
    hasFrom ? fromDate.toISOString() : null,
    hasTo ? toDate.toISOString() : null,
    safeLimit
  ]);
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    channelId: r.channel_id,
    audioUrl: `/media/${r.audio_path}`,
    mimeType: r.mime_type,
    durationMs: r.duration_ms,
    createdAt: r.created_at
  }));
}

module.exports = { savePttMessage, getUserPttMessages };
