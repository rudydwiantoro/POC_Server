const { pool } = require("../db/pool");

async function getUserWithDevice(username, deviceLabel) {
  const sql = `
    SELECT
      u.id AS user_id,
      u.username,
      u.display_name,
      u.role,
      d.id AS device_id,
      d.device_label
    FROM users u
    INNER JOIN devices d ON d.user_id = u.id
    WHERE u.username = $1 AND d.device_label = $2
    LIMIT 1
  `;
  const { rows } = await pool.query(sql, [username, deviceLabel]);
  return rows[0] || null;
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
  getUserByUsername,
  getAllowedChannelsForUser,
  canAccessChannel,
  getVisibleChannels,
  canEmergencyOverride
};
