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

INSERT INTO recycle_policies (target_key, retention_days, enabled, updated_at)
VALUES
  ('ptt_voice_messages', 30, TRUE, NOW()),
  ('location_points_log', 30, TRUE, NOW()),
  ('ptt_text_messages', 30, TRUE, NOW()),
  ('ptt_image_messages', 30, TRUE, NOW())
ON CONFLICT (target_key) DO NOTHING;
