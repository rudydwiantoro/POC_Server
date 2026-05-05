# PoC Radio Android (Starter)

## Open Project
Open `pocserver/android` in Android Studio (Hedgehog or newer).

## Build APK
1. Wait Gradle sync.
2. `Build` -> `Build Bundle(s) / APK(s)` -> `Build APK(s)`.
3. Install generated APK on device.

## App Flow
1. Open app -> `Server Config`:
- HTTP Base URL: `http://<server-ip>:3100` or `https://<domain>`
- WS URL: `ws://<server-ip>:3100/ws/signaling` or `wss://<domain>/ws/signaling`
2. Login with valid seeded pair (example):
- `u1` / `d1`
- `supervisor` / `desk1`
3. In main screen:
- Connect signaling
- Hold PTT button to request/release floor

## Battery-Friendly Design (Current)
- Uses a foreground service while connected to signaling.
- Keeps persistent low-priority notification.
- Avoids continuous polling; events are WebSocket-driven.

## Current Scope
- Login + server config page
- Signaling connect/disconnect
- PTT floor request/release
- Basic connection and floor status

This is a starter APK flow aligned to the existing backend.
