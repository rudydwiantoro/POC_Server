const crypto = require("crypto");
const { pool } = require("../db/pool");

function normalizeGps(rawGps) {
  if (!rawGps || typeof rawGps !== "object") return null;
  const latitude = Number(rawGps.latitude);
  const longitude = Number(rawGps.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  let accuracyM = null;
  if (rawGps.accuracyM !== undefined && rawGps.accuracyM !== null) {
    const accuracy = Number(rawGps.accuracyM);
    accuracyM = Number.isFinite(accuracy) && accuracy >= 0 ? accuracy : null;
  }

  return { latitude, longitude, accuracyM };
}

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
  const gps = normalizeGps(speaker.gps);

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
      const metadata = gps
        ? { gps, gpsCapturedAt: new Date().toISOString() }
        : {};
      await client.query(
        `
        INSERT INTO ptt_sessions (id, channel_id, speaker_user_id, started_at, metadata)
        VALUES ($1, $2, $3, NOW(), $4::jsonb)
        `,
        [crypto.randomUUID(), channel.id, speaker.userDbId, JSON.stringify(metadata)]
      );
    } else if (current.user_id === speaker.userId && gps) {
      await client.query(
        `
        UPDATE ptt_sessions
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $2::jsonb
        WHERE id = $1
        `,
        [current.id, JSON.stringify({ gps, gpsCapturedAt: new Date().toISOString() })]
      );
    }

    if (gps && speaker.deviceDbId) {
      await client.query(
        `
        INSERT INTO location_points (device_id, latitude, longitude, accuracy_m, recorded_at)
        VALUES ($1, $2, $3, $4, NOW())
        `,
        [speaker.deviceDbId, gps.latitude, gps.longitude, gps.accuracyM]
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
      },
      gpsSaved: Boolean(gps)
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
  releaseTalk,
  async getPttGpsHistory({ channelId = null, limit = 100 } = {}) {
    const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));
    const params = [];
    let whereSql = "WHERE ps.metadata ? 'gps'";
    if (channelId) {
      params.push(channelId);
      whereSql += ` AND c.code = $${params.length}`;
    }
    params.push(safeLimit);

    const sql = `
      SELECT
        ps.id AS session_id,
        c.code AS channel_id,
        u.username AS user_id,
        d.device_label AS device_id,
        ps.started_at,
        ps.ended_at,
        ps.metadata->'gps' AS gps,
        COALESCE(ps.metadata->>'gpsCapturedAt', ps.started_at::text) AS gps_captured_at
      FROM ptt_sessions ps
      INNER JOIN channels c ON c.id = ps.channel_id
      INNER JOIN users u ON u.id = ps.speaker_user_id
      LEFT JOIN devices d ON d.user_id = u.id
      ${whereSql}
      ORDER BY ps.started_at DESC
      LIMIT $${params.length}
    `;
    const { rows } = await pool.query(sql, params);
    return rows.map((r) => ({
      sessionId: r.session_id,
      channelId: r.channel_id,
      userId: r.user_id,
      deviceId: r.device_id || null,
      startedAt: r.started_at,
      endedAt: r.ended_at,
      gpsCapturedAt: r.gps_captured_at,
      gps: r.gps
    }));
  }
};
