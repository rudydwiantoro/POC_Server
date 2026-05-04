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
