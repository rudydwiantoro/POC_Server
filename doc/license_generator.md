# License Generator Notes

Dokumen ini menjelaskan cara pakai generator license dan aktivasi device untuk PoC Server.

## 1) Prasyarat

Isi `.env` backend:

```env
LICENSE_SECRET_KEY=your_secret_key_here
LICENSE_CLIENT_KEY=CLIENT_A
GENERATOR_ADMIN_USER=superadmin
GENERATOR_ADMIN_PASS=strong_password_here
COMPANY_NAME=MyCompany
SERVER_NAME=MyServer
```

Lalu restart backend.

## 2) Akses Generator UI

Generator UI yang direkomendasikan:

- `http://localhost:3100/license-generator.html`

Login dengan:

- Username: nilai `GENERATOR_ADMIN_USER`
- Password: nilai `GENERATOR_ADMIN_PASS`

## 3) Generate Server License Key

Di menu `Generate Server Key`, isi:

- `companyName`
- `serverName`
- `maxServers`
- `maxDevices`
- `maxOnlineDevices`
- `expiresAt` (format ISO, contoh `2030-12-31T23:59:59Z`)
- `clientKey` (harus sama dengan `LICENSE_CLIENT_KEY`)
- `secretKey` opsional:
  - kosong: pakai `LICENSE_SECRET_KEY` dari server
  - isi manual: dipakai untuk signing key

Klik `Generate Server Key`, lalu copy hasil key.

## 4) Pasang License Key di Dispatcher

Masuk ke dispatcher:

- `http://localhost:3100/dispatcher.html`

Bagian `About & License`:

1. Paste `License Key`
2. Klik `Save License Key`

Jika valid, status license akan aktif sesuai payload key.

## 5) Generate Device Activation Key

Di menu `Generate Device Key`, isi:

- `userId` (contoh `u1`)
- `deviceId` (contoh `d1-new`)
- `clientKey` (harus sama dengan `LICENSE_CLIENT_KEY`)
- `secretKey` opsional (sama konsep dengan server key)

Klik `Generate Device Key`, lalu copy hasil key.

## 6) Aktivasi Device di Server

Di dispatcher, bagian `About & License -> Device Activation`:

1. Isi `User ID`
2. Isi `Device ID`
3. Paste `Device Key`
4. Klik `Activate Device`

Jika sukses, device terdaftar di server dan bisa login dari mobile.

## 7) Alur Mobile

Mobile tidak input/decrypt license key.

Alurnya:

1. App cek `POST /api/auth/activation/check`
2. Jika device sudah aktif + license server valid, login lanjut
3. Jika belum aktif, server balas `device_not_activated_on_server`

## 8) Troubleshooting

- `invalid_license_signature` atau `invalid_device_key_signature`
  - biasanya `secretKey` saat generate tidak sama dengan server.
- `license_client_key_mismatch` atau `device_key_client_mismatch`
  - `clientKey` tidak sama dengan `LICENSE_CLIENT_KEY`.
- `license_company_mismatch` / `license_server_mismatch`
  - payload license tidak cocok dengan `COMPANY_NAME` / `SERVER_NAME`.
- `device_not_activated_on_server`
  - device belum diaktivasi lewat panel dispatcher.

