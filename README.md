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
5. Opsional untuk auto device setting (APK):
- set `PUBLIC_BASE_URL=https://your-domain.com` di `.env` jika domain publik berbeda dari host request.
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
- staff action panel: click user/marker -> `Talk` + last voice message history (playback)

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
- `POST /api/ptt/floor/messages/upload`
- `POST /api/ptt/floor/messages/text`
- `GET /api/ptt/floor/messages/text/latest?channelId=<id>`
- `POST /api/ptt/floor/messages/image`

Location:
- `POST /api/location/update`
- `GET /api/location/latest`
- `GET /api/location/history/:deviceId?from=<iso>&to=<iso>&limit=<n>`

Dispatch:
- `GET /api/dispatch/overview`
- `GET /api/dispatch/tracking/overview`
- `GET /api/dispatch/tracking/route?deviceId=<id>&from=<iso>&to=<iso>&limit=<n>`
- `GET /api/dispatch/geofences`
- `PUT /api/dispatch/geofences`
- `GET /api/dispatch/menu-permissions/me`
- `GET /api/dispatch/admin/menu-permissions/roles`
- `PUT /api/dispatch/admin/menu-permissions/roles/:role`
- `GET /api/dispatch/admin/menu-permissions/users`
- `PUT /api/dispatch/admin/menu-permissions/users/:userId`
- `GET /api/dispatch/admin/devices`
- `PUT /api/dispatch/admin/devices/:deviceId/beacon`
  - payload supports: `enabled`, `intervalMin`, `distanceKm`, `mode` (`normal|eco`),
    `batchSize`, `batchMaxWaitMin`, `normalSendMin`
- `POST /api/dispatch/emergency/override`
- `GET /api/dispatch/staff/:userId/messages?limit=<n>`
- `GET /api/dispatch/staff/:userId/messages?limit=<n>&channelId=<id>&from=<iso>&to=<iso>`

Public config:
- `GET /api/public/server-config` (untuk auto-fetch HTTP Base URL + WS URL dari APK/dispatcher guide)
- `GET /.well-known/poc-radio-server-config.json` (config URL standar yang bisa di-scan/copy untuk onboarding device)

## VPS Setup Untuk AutoConfig
Supaya fitur autoconfig berjalan di HP user:
1. Pastikan domain publik aktif (contoh `https://radio.company.com`).
2. Aktifkan HTTPS (Let's Encrypt) di reverse proxy.
3. Set env backend:
```env
PUBLIC_BASE_URL=https://radio.company.com
```
4. Restart backend (`pm2 restart pocserver` atau setara).
5. Pastikan endpoint berikut bisa diakses dari internet:
- `https://radio.company.com/api/public/server-config`
- `https://radio.company.com/.well-known/poc-radio-server-config.json`
6. Cek output `wsUrl` harus `wss://.../ws/signaling` (bukan `ws://`) saat pakai HTTPS.

Verifikasi cepat:
```bash
curl https://radio.company.com/api/public/server-config
curl https://radio.company.com/.well-known/poc-radio-server-config.json
```

## DB Notes
Additional tables:
- `geofences`
- `role_menu_permissions`
- `user_menu_permissions`
- `ptt_messages`
- `ptt_text_messages`
- `ptt_image_messages`

Jika upgrade dari schema lama:
```bash
cd backend
npm run init-db
```
`init-db` sekarang otomatis menjalankan:
- `sql/001_init_schema.sql`
- seluruh file `sql/migrations/*.sql` (urut nama file)

Lanjutkan dengan:
```bash
npm run seed-db
```

## Operation Manual
Manual operasional dispatcher tersedia di:
- [docs/OPERATION_MANUAL_DISPATCHER.md](/d:/learn/pocserver/docs/OPERATION_MANUAL_DISPATCHER.md)
