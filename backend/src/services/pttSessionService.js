const crypto = require("crypto");
const { pool } = require("../db/pool");

async function getChannelByCode(channelCode) {
  const { rows } = await pool.query(
    "SELECT id, code FROM channels WHERE code = $1 LIMIT 1",
    [channelCode]
  );
  return rows[0] || null;
}

async function getActiveHolder(channelCode) {
  const sql = `
    SELECT u.username AS user_id, ps.started_at AS granted_at
    FROM ptt_sessions ps
    INNER JOIN channels c ON c.id = ps.channel_id
    INNER JOIN users u ON u.id = ps.speaker_user_id
    WHERE c.code = $1 AND ps.ended_at IS NULL
    ORDER BY ps.started_at DESC
    LIMIT 1
  `;
  const { rows } = await pool.query(sql, [channelCode]);
  if (!rows[0]) return null;
  return {
    userId: rows[0].user_id,
    grantedAt: rows[0].granted_at
  };
}

async function requestTalk(channelCode, speaker) {
  const channel = await getChannelByCode(channelCode);
  if (!channel) {
    return { ok: false, reason: "channel_not_found" };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const activeRes = await client.query(
      `
      SELECT ps.id, u.username AS user_id, ps.started_at AS granted_at
      FROM ptt_sessions ps
      INNER JOIN users u ON u.id = ps.speaker_user_id
      WHERE ps.channel_id = $1 AND ps.ended_at IS NULL
      ORDER BY ps.started_at DESC
      LIMIT 1
      FOR UPDATE
      `,
      [channel.id]
    );

    const current = activeRes.rows[0] || null;
    if (current && current.user_id !== speaker.userId) {
      await client.query("COMMIT");
      return {
        ok: false,
        reason: "busy",
        holder: { userId: current.user_id, grantedAt: current.granted_at }
      };
    }

    if (!current) {
      await client.query(
        `
        INSERT INTO ptt_sessions (id, channel_id, speaker_user_id, started_at, metadata)
        VALUES ($1, $2, $3, NOW(), '{}'::jsonb)
        `,
        [crypto.randomUUID(), channel.id, speaker.userDbId]
      );
    }

    const holderRes = await client.query(
      `
      SELECT u.username AS user_id, ps.started_at AS granted_at
      FROM ptt_sessions ps
      INNER JOIN users u ON u.id = ps.speaker_user_id
      WHERE ps.channel_id = $1 AND ps.ended_at IS NULL
      ORDER BY ps.started_at DESC
      LIMIT 1
      `,
      [channel.id]
    );
    await client.query("COMMIT");

    return {
      ok: true,
      holder: {
        userId: holderRes.rows[0].user_id,
        grantedAt: holderRes.rows[0].granted_at
      }
    };
  } catch (error) {
    await client.query("ROLLBACK");
    if (error && error.code === "23505") {
      const holder = await getActiveHolder(channelCode);
      return { ok: false, reason: "busy", holder };
    }
    throw error;
  } finally {
    client.release();
  }
}

async function releaseTalk(channelCode, userDbId) {
  const channel = await getChannelByCode(channelCode);
  if (!channel) return { released: true };

  await pool.query(
    `
    UPDATE ptt_sessions
    SET ended_at = NOW()
    WHERE channel_id = $1 AND speaker_user_id = $2 AND ended_at IS NULL
    `,
    [channel.id, userDbId]
  );
  return { released: true };
}

module.exports = {
  getActiveHolder,
  requestTalk,
  releaseTalk
};
