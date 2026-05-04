CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id),
  device_label TEXT NOT NULL,
  platform TEXT NOT NULL,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS channels (
  id UUID PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS channel_members (
  channel_id UUID NOT NULL REFERENCES channels(id),
  user_id UUID NOT NULL REFERENCES users(id),
  can_talk BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (channel_id, user_id)
);

CREATE TABLE IF NOT EXISTS ptt_sessions (
  id UUID PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES channels(id),
  speaker_user_id UUID NOT NULL REFERENCES users(id),
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS location_points (
  id BIGSERIAL PRIMARY KEY,
  device_id UUID NOT NULL REFERENCES devices(id),
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy_m DOUBLE PRECISION,
  recorded_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY,
  channel_id UUID REFERENCES channels(id),
  alert_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS geofences (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  center_lat DOUBLE PRECISION NOT NULL,
  center_lon DOUBLE PRECISION NOT NULL,
  radius_m DOUBLE PRECISION NOT NULL,
  color TEXT NOT NULL DEFAULT '#2ca58d',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS role_menu_permissions (
  role TEXT NOT NULL,
  menu_key TEXT NOT NULL,
  can_access BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (role, menu_key)
);

CREATE TABLE IF NOT EXISTS user_menu_permissions (
  user_id UUID NOT NULL REFERENCES users(id),
  menu_key TEXT NOT NULL,
  can_access BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, menu_key)
);

CREATE INDEX IF NOT EXISTS idx_location_points_device_time
  ON location_points(device_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptt_sessions_channel_time
  ON ptt_sessions(channel_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptt_sessions_one_active_per_channel
  ON ptt_sessions(channel_id)
  WHERE ended_at IS NULL;
