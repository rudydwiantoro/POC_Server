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
- `POST /api/location/update`
- `GET /api/location/latest`
- `GET /api/dispatch/overview`
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

## Suggested next implementation steps
1. Replace in-memory stores with PostgreSQL repositories.
2. Add role/channel permission checks in middleware.
3. Extend WebSocket signaling for presence and dispatcher broadcast.
4. Add TURN/WebRTC session coordination endpoints.
