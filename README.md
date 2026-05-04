# PoC Server Monorepo

Backend PoC Radio + Web Dispatcher Tracking.

## Quick Start (Developer)
1. Masuk backend:
```bash
cd backend
```
2. Install dependency:
```bash
npm install
```
3. Siapkan env:
```bash
cp .env.example .env
```
4. Isi koneksi DB di `.env` (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`).
5. Init schema + seed:
```bash
npm run init-db
npm run seed-db
```
6. Run server:
```bash
npm run dev
```

Health:
- `GET http://localhost:3100/api/health`

## Web Pages
- Voice test: `http://localhost:3100/voice.html`
- Dispatcher desktop: `http://localhost:3100/dispatcher.html`
- API console: `http://localhost:3100/index.html`

## Seed Accounts
- `u1 / d1` (operator engineering)
- `hk1 / hk-device` (operator housekeeping)
- `sec1 / sec-device` (operator security)
- `supervisor / desk1` (dispatcher)

## Feature Summary
- PTT floor control + WebRTC signaling (`/ws/signaling`)
- PTT request supports optional GPS payload
- GPS persistence to `ptt_sessions.metadata` and `location_points`
- Dispatcher desktop map:
- role badge marker
- channel color marker
- staff grouping by channel
- geofence editor (drag center + radius + save)
- geofence out-of-area alert + sound
- role/user menu permission setup

## API Summary
Auth:
- `POST /api/auth/login`
- `POST /api/auth/refresh`

Channels/PTT:
- `GET /api/channels`
- `POST /api/ptt/floor/request_talk`
- `POST /api/ptt/floor/release`
- `GET /api/ptt/floor/state/:channelId`
- `GET /api/ptt/floor/gps/history?channelId=<id>&limit=<n>`

Location:
- `POST /api/location/update`
- `GET /api/location/latest`

Dispatch:
- `GET /api/dispatch/overview`
- `GET /api/dispatch/tracking/overview`
- `GET /api/dispatch/geofences`
- `PUT /api/dispatch/geofences`
- `GET /api/dispatch/menu-permissions/me`
- `GET /api/dispatch/admin/menu-permissions/roles`
- `PUT /api/dispatch/admin/menu-permissions/roles/:role`
- `GET /api/dispatch/admin/menu-permissions/users`
- `PUT /api/dispatch/admin/menu-permissions/users/:userId`
- `POST /api/dispatch/emergency/override`

## DB Notes
Additional tables:
- `geofences`
- `role_menu_permissions`
- `user_menu_permissions`

Jika upgrade dari schema lama:
```bash
cd backend
npm run init-db
```

## Operation Manual
Manual operasional dispatcher tersedia di:
- [docs/OPERATION_MANUAL_DISPATCHER.md](/d:/learn/pocserver/docs/OPERATION_MANUAL_DISPATCHER.md)
