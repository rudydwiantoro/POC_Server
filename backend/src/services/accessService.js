const { pool } = require("../db/pool");
const crypto = require("crypto");

async function getUserWithDevice(username, deviceLabel) {
  const sql = `
    SELECT
      u.id AS user_id,
      u.username,
      u.display_name,
      u.role,
      d.id AS device_id,
      d.device_label,
      d.beacon_enabled,
      d.beacon_interval_min,
      d.beacon_distance_km,
      d.beacon_mode,
      d.beacon_batch_size,
      d.beacon_batch_max_wait_min,
      d.beacon_normal_send_min
    FROM users u
    INNER JOIN devices d ON d.user_id = u.id
    WHERE u.username = $1 AND d.device_label = $2
    LIMIT 1
  `;
  const { rows } = await pool.query(sql, [username, deviceLabel]);
  return rows[0] || null;
}

async function getOrCreateUserWithDevice(username, deviceLabel, platform = "android") {
  const existing = await getUserWithDevice(username, deviceLabel);
  if (existing) return existing;
  const userRes = await pool.query(
    `
    SELECT id AS user_id, username, display_name, role
    FROM users
    WHERE username = $1
    LIMIT 1
    `,
    [username]
  );
  const u = userRes.rows[0];
  if (!u) return null;
  const newDevId = crypto.randomUUID();
  const devIdRes = await pool.query(
    `
    INSERT INTO devices (id, user_id, device_label, platform)
    VALUES ($1, $2, $3, $4)
    RETURNING id AS device_id, device_label
    `,
    [newDevId, u.user_id, deviceLabel, platform]
  );
  return {
    user_id: u.user_id,
    username: u.username,
    display_name: u.display_name,
    role: u.role,
    device_id: devIdRes.rows[0].device_id,
    device_label: devIdRes.rows[0].device_label,
    beacon_enabled: false,
    beacon_interval_min: 15,
    beacon_distance_km: 1,
    beacon_mode: "normal",
    beacon_batch_size: 50,
    beacon_batch_max_wait_min: 120,
    beacon_normal_send_min: 60
  };
}

async function getUserByUsername(username) {
  const sql = `
    SELECT id AS user_id, username, role
    FROM users
    WHERE username = $1
    LIMIT 1
  `;
  const { rows } = await pool.query(sql, [username]);
  return rows[0] || null;
}

async function getAllowedChannelsForUser(userId, role) {
  if (role === "dispatcher") {
    const { rows } = await pool.query(
      "SELECT code FROM channels ORDER BY code ASC"
    );
    return rows.map((r) => r.code);
  }

  const sql = `
    SELECT c.code
    FROM channel_members cm
    INNER JOIN channels c ON c.id = cm.channel_id
    WHERE cm.user_id = $1
    ORDER BY c.code ASC
  `;
  const { rows } = await pool.query(sql, [userId]);
  return rows.map((r) => r.code);
}

async function canAccessChannel(userId, role, channelCode) {
  if (role === "dispatcher") return true;
  const sql = `
    SELECT 1
    FROM channel_members cm
    INNER JOIN channels c ON c.id = cm.channel_id
    WHERE cm.user_id = $1 AND c.code = $2
    LIMIT 1
  `;
  const { rowCount } = await pool.query(sql, [userId, channelCode]);
  return rowCount > 0;
}

async function getVisibleChannels(userId, role) {
  if (role === "dispatcher") {
    const { rows } = await pool.query(
      "SELECT code, name, is_emergency FROM channels ORDER BY code ASC"
    );
    return rows.map((r) => ({ id: r.code, name: r.name, emergency: r.is_emergency }));
  }

  const sql = `
    SELECT c.code, c.name, c.is_emergency
    FROM channel_members cm
    INNER JOIN channels c ON c.id = cm.channel_id
    WHERE cm.user_id = $1
    ORDER BY c.code ASC
  `;
  const { rows } = await pool.query(sql, [userId]);
  return rows.map((r) => ({ id: r.code, name: r.name, emergency: r.is_emergency }));
}

function canEmergencyOverride(role) {
  return role === "dispatcher";
}

module.exports = {
  getUserWithDevice,
  getOrCreateUserWithDevice,
  getUserByUsername,
  getAllowedChannelsForUser,
  canAccessChannel,
  getVisibleChannels,
  canEmergencyOverride,
  async getDeviceBeaconSetting(deviceDbId) {
    const { rows } = await pool.query(
      `
      SELECT beacon_enabled, beacon_interval_min, beacon_distance_km
      , beacon_mode, beacon_batch_size, beacon_batch_max_wait_min, beacon_normal_send_min
      FROM devices
      WHERE id = $1
      LIMIT 1
      `,
      [deviceDbId]
    );
    if (!rows[0]) return null;
    return {
      enabled: Boolean(rows[0].beacon_enabled),
      intervalMin: Number(rows[0].beacon_interval_min) || 15,
      distanceKm: Number(rows[0].beacon_distance_km) || 1,
      mode: rows[0].beacon_mode === "eco" ? "eco" : "normal",
      batchSize: Number(rows[0].beacon_batch_size) || 50,
      batchMaxWaitMin: Number(rows[0].beacon_batch_max_wait_min) || 120,
      normalSendMin: Number(rows[0].beacon_normal_send_min) || 60
    };
  },
  async updateDeviceBeaconSetting(deviceLabel, input) {
    const enabled = Boolean(input.enabled);
    const intervalMin = Math.max(1, Math.min(120, Number(input.intervalMin) || 15));
    const distanceKm = Math.max(0.1, Math.min(50, Number(input.distanceKm) || 1));
    const mode = input.mode === "eco" ? "eco" : "normal";
    const batchSize = Math.max(10, Math.min(500, Number(input.batchSize) || 50));
    const batchMaxWaitMin = Math.max(10, Math.min(720, Number(input.batchMaxWaitMin) || 120));
    const normalSendMin = Math.max(5, Math.min(240, Number(input.normalSendMin) || 60));
    const { rows } = await pool.query(
      `
      UPDATE devices
      SET beacon_enabled = $2, beacon_interval_min = $3, beacon_distance_km = $4,
          beacon_mode = $5, beacon_batch_size = $6, beacon_batch_max_wait_min = $7, beacon_normal_send_min = $8
      WHERE device_label = $1
      RETURNING device_label, beacon_enabled, beacon_interval_min, beacon_distance_km,
                beacon_mode, beacon_batch_size, beacon_batch_max_wait_min, beacon_normal_send_min
      `,
      [deviceLabel, enabled, intervalMin, distanceKm, mode, batchSize, batchMaxWaitMin, normalSendMin]
    );
    if (!rows[0]) return null;
    return {
      deviceId: rows[0].device_label,
      enabled: Boolean(rows[0].beacon_enabled),
      intervalMin: Number(rows[0].beacon_interval_min),
      distanceKm: Number(rows[0].beacon_distance_km),
      mode: rows[0].beacon_mode === "eco" ? "eco" : "normal",
      batchSize: Number(rows[0].beacon_batch_size) || 50,
      batchMaxWaitMin: Number(rows[0].beacon_batch_max_wait_min) || 120,
      normalSendMin: Number(rows[0].beacon_normal_send_min) || 60
    };
  },
  async listDevicesForAdmin() {
    const { rows } = await pool.query(
      `
      SELECT d.device_label, u.username, d.platform, d.beacon_enabled, d.beacon_interval_min, d.beacon_distance_km,
             d.beacon_mode, d.beacon_batch_size, d.beacon_batch_max_wait_min, d.beacon_normal_send_min
      FROM devices d
      INNER JOIN users u ON u.id = d.user_id
      ORDER BY u.username ASC, d.device_label ASC
      `
    );
    return rows.map((r) => ({
      deviceId: r.device_label,
      userId: r.username,
      platform: r.platform,
      beaconEnabled: Boolean(r.beacon_enabled),
      beaconIntervalMin: Number(r.beacon_interval_min) || 15,
      beaconDistanceKm: Number(r.beacon_distance_km) || 1,
      beaconMode: r.beacon_mode === "eco" ? "eco" : "normal",
      beaconBatchSize: Number(r.beacon_batch_size) || 50,
      beaconBatchMaxWaitMin: Number(r.beacon_batch_max_wait_min) || 120,
      beaconNormalSendMin: Number(r.beacon_normal_send_min) || 60
    }));
  }
};
