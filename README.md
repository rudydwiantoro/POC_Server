# PoC Server Monorepo (Starter)

Initial scaffold for the PoC Radio backend based on `things_to_do.md`.

## What is included
- Node.js backend scaffold under `backend/`
- REST routes:
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/channels`
- `POST /api/ptt/floor/request_talk`
- `POST /api/ptt/floor/release`
- `GET /api/ptt/floor/state/:channelId`
- `GET /api/ptt/floor/gps/history?channelId=<id>&limit=<n>`
- `POST /api/location/update`
- `GET /api/location/latest`
- `GET /api/dispatch/overview`
- `GET /api/dispatch/tracking/overview`
- `POST /api/dispatch/emergency/override`
- WebSocket signaling endpoint at `/ws/signaling`
- PostgreSQL schema draft at `backend/sql/001_init_schema.sql`

## Run locally
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

## Initialize PostgreSQL schema
After setting `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` in `.env`:

```bash
cd backend
npm run init-db
npm run seed-db
```

Health check:
`GET http://localhost:3100/api/health`

Voice browser test page:
`http://localhost:3100/voice.html`

Dispatcher browser page (desktop):
`http://localhost:3100/dispatcher.html`

## Auth behavior (current)
- `GET /api/health` and `/api/auth/*` are public.
- Other `/api/*` routes require `Authorization: Bearer <accessToken>`.
- `/api/ptt/floor/request_talk` and `/api/ptt/floor/release` require request `userId` to match JWT `userId`.
- `/api/location/update` requires request `deviceId` to match JWT `deviceId`.
- Role + channel policy comes from PostgreSQL (`users`, `channels`, `channel_members`):
- `dispatcher`: access to all channels + emergency override allowed.
- `operator`: access only to assigned channels.
- Floor ownership/session history is persisted in PostgreSQL `ptt_sessions` (active floor = `ended_at IS NULL`).

## Browser voice PoC test (2 tabs or 2 computers)
1. Open `http://localhost:3100/voice.html` in browser A and B.
2. Login with different seeded users in the same channel, for example:
- Browser A: `u1` / `d1` in `engineering`
- Browser B: `supervisor` / `desk1` in `engineering`
3. Click `Connect Voice Session` in both browsers.
4. Press-and-hold `PTT` in one browser, speak, then release.

Notes:
- Microphone audio is only transmitted while floor is granted.
- If one user already holds floor, other user receives `floor_busy`.
- Saat tombol `PTT` ditekan, browser akan coba ambil GPS (jika tersedia) lalu kirim bersama `request_talk`.
- Jika GPS tidak tersedia/ditolak/timeout, request tetap jalan tanpa GPS.

## PTT + GPS (baru)
- WebSocket `request_talk` kini mendukung field opsional:
```json
{
  "type": "request_talk",
  "userId": "u1",
  "deviceId": "d1",
  "channelId": "engineering",
  "gps": {
    "latitude": -8.6502,
    "longitude": 115.2167,
    "accuracyM": 24.5
  }
}
```
- `gps` bersifat opsional.
- Nilai `latitude/longitude` divalidasi server (range koordinat valid).
- Respons `floor_granted` dan REST `POST /api/ptt/floor/request_talk` kini menyertakan `gpsSaved` (`true/false`).

## Penyimpanan DB + Log
- Saat `request_talk` sukses:
- Metadata GPS disimpan di `ptt_sessions.metadata` (`gps`, `gpsCapturedAt`).
- Jika `deviceDbId` tersedia, titik lokasi juga disimpan ke `location_points`.
- Server log mencetak status simpan GPS pada event PTT (`gpsSaved=yes/no`).

## Endpoint QA GPS History
- `GET /api/ptt/floor/gps/history?channelId=engineering&limit=50`
- `channelId` opsional, `limit` default `100`, maksimum `500`.
- Berguna untuk QA verifikasi bahwa sesi PTT tertentu memang membawa koordinat GPS.

## Dispatcher Tracking Screen (desktop)
- `dispatcher.html` adalah versi browser PC untuk dispatcher.
- Menampilkan:
- daftar staff + status stale/active,
- marker posisi GPS terakhir di map,
- info aktivitas PTT terakhir per staff.
- Data ditarik dari `GET /api/dispatch/tracking/overview` (auto refresh 15 detik).

## Suggested next implementation steps
1. Replace in-memory stores with PostgreSQL repositories.
2. Add role/channel permission checks in middleware.
3. Extend WebSocket signaling for presence and dispatcher broadcast.
4. Add TURN/WebRTC session coordination endpoints.
