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

CREATE INDEX IF NOT EXISTS idx_ptt_image_messages_channel_time
  ON ptt_image_messages(channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ptt_image_messages_speaker_time
  ON ptt_image_messages(speaker_user_id, created_at DESC);
