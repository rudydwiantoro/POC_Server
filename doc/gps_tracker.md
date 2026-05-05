# GPS Tracker Beacon (No Login)

Dokumen ini menjelaskan mode device tracker tanpa login (beacon-only).

## Ringkasan
- Device tracker **tidak login user**.
- Device hanya kirim beacon GPS ke endpoint publik:
  - `POST /api/public/gps-tracker/beacon`
- Device harus terdaftar dulu di Admin (`GPS Tracker` tab).

## Payload Beacon
Contoh:
```json
{
  "deviceId": "gps-unit-01",
  "authKey": "optional-secret",
  "lat": -8.65,
  "lon": 115.21,
  "accuracy": 12.5,
  "battery": 78,
  "timestamp": "2026-05-05T12:00:00Z"
}
```

Response sukses:
```json
{ "success": true, "receivedAt": "..." }
```

Batch endpoint (eco mode):
- `POST /api/public/gps-tracker/beacon-batch`
- payload:
```json
{
  "deviceId": "gps-unit-01",
  "authKey": "optional-secret",
  "points": [
    { "lat": -8.65, "lon": 115.21, "accuracy": 10, "battery": 80, "timestamp": "2026-05-05T12:00:00Z" }
  ]
}
```

## Admin GPS Tracker
Menu: `Admin Settings -> GPS Tracker`

Fitur:
- Create tracker (`deviceId`, `name`, `authKey`, `enabled`)
- Set mode beacon:
  - `standard`: kirim data setiap `submit interval`
  - `eco`: simpan titik lokal tiap `keep interval`, kirim batch tiap `submit interval`
- Update tracker
- Delete tracker
- Refresh tracker list
- Load history/route per device (`from`, `to`, `limit`)

## Endpoint Admin
- `GET /api/dispatch/admin/gps-trackers`
- `POST /api/dispatch/admin/gps-trackers`
- `PUT /api/dispatch/admin/gps-trackers/:deviceId`
- `DELETE /api/dispatch/admin/gps-trackers/:deviceId`
- `GET /api/dispatch/admin/gps-trackers/:deviceId/history`

Semua endpoint admin di atas butuh role `dispatcher`.

## APK Terpisah (Testing)
Folder project:
- `gps-tracker-android/`

Isi app:
- Setting `Server URL`
- Setting `Device ID`
- Setting `Auth Key` (optional)
- Switch `ON/OFF` beacon
- Mode `standard/eco`
- Keep interval (detik, untuk eco)
- Submit interval (menit)
- Background foreground service kirim beacon tiap ~30 detik

## Build
```bash
cd gps-tracker-android
./gradlew assembleDebug
```
