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
  beacon_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  beacon_interval_min INTEGER NOT NULL DEFAULT 15,
  beacon_distance_km DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  beacon_mode TEXT NOT NULL DEFAULT 'normal',
  beacon_batch_size INTEGER NOT NULL DEFAULT 50,
  beacon_batch_max_wait_min INTEGER NOT NULL DEFAULT 120,
  beacon_normal_send_min INTEGER NOT NULL DEFAULT 60,
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

CREATE TABLE IF NOT EXISTS ptt_messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES ptt_sessions(id),
  channel_id UUID NOT NULL REFERENCES channels(id),
  speaker_user_id UUID NOT NULL REFERENCES users(id),
  device_id UUID REFERENCES devices(id),
  audio_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ptt_text_messages (
  id UUID PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES channels(id),
  speaker_user_id UUID NOT NULL REFERENCES users(id),
  message_text VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ptt_image_messages (
  id UUID PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES channels(id),
  speaker_user_id UUID NOT NULL REFERENCES users(id),
  device_id UUID REFERENCES devices(id),
  image_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  note_text VARCHAR(160),
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  accuracy_m DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_location_points_device_time
  ON location_points(device_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptt_sessions_channel_time
  ON ptt_sessions(channel_id, started_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ptt_sessions_one_active_per_channel
  ON ptt_sessions(channel_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_ptt_messages_speaker_time
  ON ptt_messages(speaker_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptt_text_messages_channel_time
  ON ptt_text_messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptt_image_messages_channel_time
  ON ptt_image_messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptt_image_messages_speaker_time
  ON ptt_image_messages(speaker_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS server_license (
  id INTEGER PRIMARY KEY,
  license_key TEXT NOT NULL,
  company_name TEXT NOT NULL,
  server_name TEXT NOT NULL,
  max_servers INTEGER NOT NULL,
  max_devices INTEGER NOT NULL,
  max_online_devices INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recycle_policies (
  target_key TEXT PRIMARY KEY,
  retention_days INTEGER NOT NULL CHECK (retention_days >= 1),
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recycle_cleanup_logs (
  id BIGSERIAL PRIMARY KEY,
  target_key TEXT NOT NULL,
  deleted_rows INTEGER NOT NULL DEFAULT 0,
  deleted_files INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backward-compatible patching for existing DBs created before beacon fields existed.
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS beacon_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS beacon_interval_min INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS beacon_distance_km DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  ADD COLUMN IF NOT EXISTS beacon_mode TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS beacon_batch_size INTEGER NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS beacon_batch_max_wait_min INTEGER NOT NULL DEFAULT 120,
  ADD COLUMN IF NOT EXISTS beacon_normal_send_min INTEGER NOT NULL DEFAULT 60;

INSERT INTO recycle_policies (target_key, retention_days, enabled, updated_at)
VALUES
  ('ptt_voice_messages', 30, TRUE, NOW()),
  ('location_points_log', 30, TRUE, NOW()),
  ('ptt_text_messages', 30, TRUE, NOW()),
  ('ptt_image_messages', 30, TRUE, NOW())
ON CONFLICT (target_key) DO NOTHING;
