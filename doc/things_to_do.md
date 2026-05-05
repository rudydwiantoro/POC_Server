# Things To Do - PoC Radio (Android PTToC) + HT Voice Style

## 1. Product Scope (MVP)
- Build Android APK that works like HT radio (push-to-talk).
- Support channel/group communication:
- `Housekeeping`
- `Engineering`
- `Security`
- `All-Call`
- Add dispatcher dashboard for office monitoring and communication.

## 2. Core Backend Services
- Auth service:
- Login device/user
- JWT token issue and refresh
- Role and channel permission mapping
- Signaling service (WebSocket):
- Online/offline presence
- Channel join/leave
- Floor control (`request_talk`, `grant`, `release`)
- Media layer:
- WebRTC voice transport
- Opus codec
- TURN server (`coturn`) for NAT/firewall
- Dispatch API:
- Channel management
- Emergency priority/override
- Session metadata logging

## 3. GPS Tracking
- Android app sends location every 10-30 seconds (adaptive interval).
- Backend endpoint stores:
- latest location
- location history
- accuracy and timestamp
- Dispatcher map shows live staff device positions.
- Add optional geofence alerts.

## 4. Database (PostgreSQL)
- Create tables:
- `users`
- `devices`
- `channels`
- `channel_members`
- `ptt_sessions`
- `location_points`
- `alerts`
- Add indexing for realtime queries (`device_id`, `timestamp`, `channel_id`).

## 5. Android App Features
- PTT button: press-hold-talk, release-stop.
- Channel selector and online member indicator.
- Reconnect handling for unstable network.
- Background service support for PoC devices.
- GPS capture using `FusedLocationProvider`.

## 6. HT-Style Voice Simulation
- Implement DSP chain:
- Band-pass filter (`300 Hz - 3400 Hz`)
- Compressor (`3:1`)
- Mild saturation (`5-10% drive`)
- Optional low-level radio noise (`-42 dB`)
- Optional roger beep (~`1000 Hz`, `120 ms`) on TX end
- Create two profiles:
- `Clean Radio`
- `Classic HT`

## 7. Security and Operations
- HTTPS everywhere.
- Token-based auth + device binding.
- Event idempotency for signaling events.
- Audit logs for talk sessions and command actions.
- Data retention policy for GPS history.

## 8. MVP Timeline (4 Weeks)
- Week 1:
- Auth + channel model + WebSocket signaling
- Week 2:
- Basic one-speaker-per-channel PTT
- Week 3:
- GPS ingest API + live map in dispatcher
- Week 4:
- Hardening: reconnect, emergency channel, logging, basic reporting

## 9. Next Technical Deliverables
- API contract draft:
- `/api/auth/*`
- `/api/channels/*`
- `/api/ptt/floor/*`
- `/api/location/update`
- `/api/dispatch/*`
- Minimal architecture diagram (app, signaling, media, DB, dashboard).
- Initial repository scaffold for backend + Android client.
