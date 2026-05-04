-- Migration for existing environments:
-- add table for short text messages in PTT screen.

CREATE TABLE IF NOT EXISTS ptt_text_messages (
  id UUID PRIMARY KEY,
  channel_id UUID NOT NULL REFERENCES channels(id),
  speaker_user_id UUID NOT NULL REFERENCES users(id),
  message_text VARCHAR(160) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ptt_text_messages_channel_time
  ON ptt_text_messages(channel_id, created_at DESC);
