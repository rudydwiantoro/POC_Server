const { pool } = require("../db/pool");

const DEFAULT_PROFILE_ID = "clean_radio";
const DEFAULT_VOICE_TRANSPORT_MODE = "storeforward";
const PROFILE_CLEAN_RADIO = "clean_radio";
const PROFILE_CLASSIC_HT = "classic_ht";

function getDefaultProfiles() {
  return {
    [PROFILE_CLEAN_RADIO]: {
      id: PROFILE_CLEAN_RADIO,
      name: "Clean Radio",
      bandPassLowHz: 300,
      bandPassHighHz: 3400,
      compressorRatio: 3,
      saturationDrivePct: 6,
      noiseEnabled: false,
      noiseLevelDb: -42,
      rogerBeepEnabled: false,
      rogerBeepHz: 1000,
      rogerBeepMs: 120
    },
    [PROFILE_CLASSIC_HT]: {
      id: PROFILE_CLASSIC_HT,
      name: "Classic HT",
      bandPassLowHz: 300,
      bandPassHighHz: 3400,
      compressorRatio: 3,
      saturationDrivePct: 10,
      noiseEnabled: true,
      noiseLevelDb: -42,
      rogerBeepEnabled: true,
      rogerBeepHz: 1000,
      rogerBeepMs: 120
    }
  };
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, Number(n)));
}

function normalizeProfile(input) {
  const src = input || {};
  return {
    id: String(src.id || PROFILE_CLEAN_RADIO),
    name: String(src.name || "Custom"),
    bandPassLowHz: clamp(src.bandPassLowHz ?? 300, 50, 1200),
    bandPassHighHz: clamp(src.bandPassHighHz ?? 3400, 1200, 12000),
    compressorRatio: clamp(src.compressorRatio ?? 3, 1, 20),
    saturationDrivePct: clamp(src.saturationDrivePct ?? 6, 0, 50),
    noiseEnabled: Boolean(src.noiseEnabled),
    noiseLevelDb: clamp(src.noiseLevelDb ?? -42, -80, -10),
    rogerBeepEnabled: Boolean(src.rogerBeepEnabled),
    rogerBeepHz: clamp(src.rogerBeepHz ?? 1000, 300, 3000),
    rogerBeepMs: clamp(src.rogerBeepMs ?? 120, 40, 500)
  };
}

async function readRawSetting() {
  const { rows } = await pool.query(
    "SELECT value_json FROM app_settings WHERE key = $1 LIMIT 1",
    ["audio_dsp_profile"]
  );
  return rows[0] ? rows[0].value_json : null;
}

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getAudioProfileConfig() {
  await ensureTable();
  const defaults = getDefaultProfiles();
  const raw = await readRawSetting();
  if (!raw || typeof raw !== "object") {
    return {
      voiceTransportMode: DEFAULT_VOICE_TRANSPORT_MODE,
      activeProfileId: DEFAULT_PROFILE_ID,
      profiles: defaults,
      updatedAt: null
    };
  }
  const p = raw.profiles || {};
  return {
    voiceTransportMode: raw.voiceTransportMode === "webrtc" ? "webrtc" : DEFAULT_VOICE_TRANSPORT_MODE,
    activeProfileId: String(raw.activeProfileId || DEFAULT_PROFILE_ID),
    profiles: {
      [PROFILE_CLEAN_RADIO]: normalizeProfile(p[PROFILE_CLEAN_RADIO] || defaults[PROFILE_CLEAN_RADIO]),
      [PROFILE_CLASSIC_HT]: normalizeProfile(p[PROFILE_CLASSIC_HT] || defaults[PROFILE_CLASSIC_HT])
    },
    updatedAt: raw.updatedAt || null
  };
}

async function saveAudioProfileConfig(nextConfig) {
  await ensureTable();
  const defaults = getDefaultProfiles();
  const rawProfiles = (nextConfig && nextConfig.profiles) || {};
  const active = String(nextConfig && nextConfig.activeProfileId ? nextConfig.activeProfileId : DEFAULT_PROFILE_ID);
  const payload = {
    voiceTransportMode: String(nextConfig && nextConfig.voiceTransportMode) === "webrtc" ? "webrtc" : DEFAULT_VOICE_TRANSPORT_MODE,
    activeProfileId: active === PROFILE_CLASSIC_HT ? PROFILE_CLASSIC_HT : PROFILE_CLEAN_RADIO,
    profiles: {
      [PROFILE_CLEAN_RADIO]: normalizeProfile(rawProfiles[PROFILE_CLEAN_RADIO] || defaults[PROFILE_CLEAN_RADIO]),
      [PROFILE_CLASSIC_HT]: normalizeProfile(rawProfiles[PROFILE_CLASSIC_HT] || defaults[PROFILE_CLASSIC_HT])
    },
    updatedAt: new Date().toISOString()
  };
  await pool.query(
    `
    INSERT INTO app_settings (key, value_json, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE
    SET value_json = EXCLUDED.value_json, updated_at = NOW()
    `,
    ["audio_dsp_profile", JSON.stringify(payload)]
  );
  return payload;
}

async function getActiveAudioProfile() {
  const cfg = await getAudioProfileConfig();
  const active = cfg.activeProfileId === PROFILE_CLASSIC_HT ? PROFILE_CLASSIC_HT : PROFILE_CLEAN_RADIO;
  return cfg.profiles[active];
}

async function getVoiceTransportMode() {
  const cfg = await getAudioProfileConfig();
  return cfg.voiceTransportMode === "webrtc" ? "webrtc" : DEFAULT_VOICE_TRANSPORT_MODE;
}

module.exports = {
  PROFILE_CLEAN_RADIO,
  PROFILE_CLASSIC_HT,
  DEFAULT_PROFILE_ID,
  DEFAULT_VOICE_TRANSPORT_MODE,
  getAudioProfileConfig,
  saveAudioProfileConfig,
  getActiveAudioProfile,
  getVoiceTransportMode
};
