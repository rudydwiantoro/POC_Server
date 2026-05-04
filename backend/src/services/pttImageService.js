const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { pool } = require("../db/pool");

function extByMime(mimeType) {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "bin";
}

async function savePttImageMessage({
  userDbId,
  deviceDbId,
  channelCode,
  mimeType,
  imageBase64,
  noteText,
  gps
}) {
  const channelRes = await pool.query("SELECT id FROM channels WHERE code = $1 LIMIT 1", [channelCode]);
  if (!channelRes.rows[0]) throw new Error("channel_not_found");
  const channelDbId = channelRes.rows[0].id;
  const text = noteText ? String(noteText).trim() : null;
  if (text && text.length > 160) throw new Error("note_too_long");

  const now = new Date();
  const y = String(now.getUTCFullYear());
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const ext = extByMime(mimeType);
  const fileName = `${now.getTime()}-${crypto.randomUUID()}.${ext}`;
  const relDir = path.join("ptt-images", y, m, d);
  const absDir = path.join(__dirname, "..", "..", "uploads", relDir);
  await fs.mkdir(absDir, { recursive: true });
  const relPath = path.join(relDir, fileName).replace(/\\/g, "/");
  await fs.writeFile(path.join(absDir, fileName), Buffer.from(imageBase64, "base64"));

  const id = crypto.randomUUID();
  await pool.query(
    `INSERT INTO ptt_image_messages
      (id, channel_id, speaker_user_id, device_id, image_path, mime_type, note_text, latitude, longitude, accuracy_m, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
    [
      id,
      channelDbId,
      userDbId,
      deviceDbId || null,
      relPath,
      mimeType,
      text,
      gps && Number.isFinite(Number(gps.latitude)) ? Number(gps.latitude) : null,
      gps && Number.isFinite(Number(gps.longitude)) ? Number(gps.longitude) : null,
      gps && Number.isFinite(Number(gps.accuracyM)) ? Number(gps.accuracyM) : null
    ]
  );

  return { id, imageUrl: `/media/${relPath}`, noteText: text, channelId: channelCode };
}

async function getUserPttImages({ username, limit = 20, channelCodes = [], channelId = null }) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const { rows } = await pool.query(
    `
    SELECT pim.id, u.username AS user_id, c.code AS channel_id, pim.image_path, pim.mime_type, pim.note_text, pim.created_at
    FROM ptt_image_messages pim
    INNER JOIN users u ON u.id = pim.speaker_user_id
    INNER JOIN channels c ON c.id = pim.channel_id
    WHERE u.username = $1
      AND ($2::text[] IS NULL OR c.code = ANY($2::text[]))
      AND ($3::text IS NULL OR c.code = $3)
    ORDER BY pim.created_at DESC
    LIMIT $4
    `,
    [username, channelCodes.length ? channelCodes : null, channelId || null, safeLimit]
  );
  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    channelId: r.channel_id,
    imageUrl: `/media/${r.image_path}`,
    mimeType: r.mime_type,
    noteText: r.note_text || "",
    createdAt: r.created_at
  }));
}

module.exports = { savePttImageMessage, getUserPttImages };
