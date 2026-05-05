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
   Opsi recycle/cleanup:
   - `CLEANUP_ENABLED=true`
   - `CLEANUP_INTERVAL_MINUTES=60`
   - `CLEANUP_DEFAULT_RETENTION_DAYS=30`
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
- Admin settings (license/device activation): `http://localhost:3100/admin.html`
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
- dispatcher local TTS broadcast (`Speak Local + Broadcast`, tagged `[TTS]`)

## API Summary
Auth:
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/activation/check`

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
- `GET /api/dispatch/about`
- `GET /api/dispatch/overview`
- `POST /api/dispatch/dispatcher/tts-broadcast` (dispatcher-only)
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
- `GET /api/dispatch/admin/license`
- `PUT /api/dispatch/admin/license`
- `POST /api/dispatch/admin/devices/activate`
- `GET /api/dispatch/staff/:userId/messages?limit=<n>`
- `GET /api/dispatch/staff/:userId/messages?limit=<n>&channelId=<id>&from=<iso>&to=<iso>`

Generator:
- `POST /api/generator/login`
- `POST /api/generator/generate/server-key`
- `POST /api/generator/generate/device-key`

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
- `recycle_policies`
- `recycle_cleanup_logs`

Recycle policy default:
- Target `ptt_voice_messages`, `location_points_log`, `ptt_text_messages`, `ptt_image_messages`
- Data/file lebih lama dari `retention_days` akan dihapus otomatis oleh scheduler backend.
- Nilai hari bisa diubah per target di tabel `recycle_policies`.

Jika upgrade dari schema lama:
```bash
cd backend
npm run init-db
```
`init-db` menjalankan satu file schema utama:
- `sql/001_init_schema.sql`

Lanjutkan dengan:
```bash
npm run seed-db
```

## License Key
- License di-set dari admin panel (dispatcher), bukan dari mobile.
- License key **digenerate dari aplikasi terpisah** (external license generator), bukan di server PoC ini.
- Server PoC hanya melakukan verifikasi/dekripsi signature lalu menyimpan key yang valid.
- Rekomendasi validasi key menggunakan:
  - `LICENSE_SECRET_KEY` (secret utama untuk HMAC)
  - `LICENSE_CLIENT_KEY` (identitas client/customer)
- Kompatibilitas legacy masih didukung dengan kombinasi:
  - `LICENSE_PARAM_A`
  - `LICENSE_PARAM_B`
  - `LICENSE_PARAM_C`
- Key juga membawa:
  - `companyName`
  - `serverName`
  - `maxServers`
  - `maxDevices`
  - `maxOnlineDevices`
  - `expiresAt`
  - `clientKey`

## Mobile Activation Flow
- Mobile tidak perlu input/decrypt license key.
- Device cukup validasi ke server saat aktivasi/login:
  - `POST /api/auth/activation/check`
- Login hanya diizinkan untuk kombinasi `userId + deviceId` yang sudah terdaftar di server.
- Jika device belum terdaftar, server akan balas `device_not_activated_on_server`.

External generator tersedia di:
- CLI: `tools/license-generator/generate-license.js`
- Panel HTML: `tools/license-generator/license-generator.html`
- Superadmin Panel UI: `tools/license-generator/index.html`
- Hosted UI dari server: `http://localhost:3100/license-generator.html`

Credential superadmin generator (di `.env` backend):
- `GENERATOR_ADMIN_USER`
- `GENERATOR_ADMIN_PASS`

Aktivasi device dari dispatcher:
- isi `userId`, `deviceId`, `deviceKey` di panel `About & License -> Device Activation`
- klik `Activate Device`

Contoh generate (external app / machine admin):
```bash
node tools/license-generator/generate-license.js --company=MyCo --server=MyServer --maxServers=1 --maxDevices=300 --maxOnline=120 --expiresAt=2030-12-31T23:59:59Z --secretKey=YOUR_SECRET --clientKey=CLIENT_A
```

## Operation Manual
Manual operasional dispatcher tersedia di:
- [docs/OPERATION_MANUAL_DISPATCHER.md](/d:/learn/pocserver/docs/OPERATION_MANUAL_DISPATCHER.md)
