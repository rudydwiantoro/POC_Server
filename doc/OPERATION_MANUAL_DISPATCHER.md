# Operation Manual Dispatcher (Desktop)

Dokumen ini untuk operator/dispatcher harian (non-developer).

## 1. Tujuan Layar Dispatcher
Layar dispatcher dipakai untuk:
- monitor posisi staff dari GPS,
- melihat aktivitas PTT terakhir,
- memantau staff keluar area kerja (geofence),
- mengatur permission menu per role/user (jika punya hak admin).

URL:
- `http://localhost:3100/dispatcher.html`

## 2. Login
1. Buka URL dispatcher.
2. Isi `User ID` dan `Device ID`.
3. Klik `Login & Enter Console`.

Contoh akun:
- Dispatcher: `supervisor / desk1`

Jika login gagal:
- pastikan user-device benar,
- cek server/backend aktif.

## 2.1 Guide Untuk User Baru Install APK
Di dispatcher tersedia panel `Guide & Device Setting`.

Langkah cepat:
1. Klik `Get Server Setting Otomatis`.
2. Klik `Copy HTTP Base URL` dan `Copy WS URL`.
3. Di HP user: buka app -> `Server Config`.
4. Paste URL hasil copy, lalu `Save`.
5. Kembali ke login app dan masuk dengan `User ID` + `Device ID`.

Alternatif onboarding cepat:
- Scan QR `autoconfig` yang muncul di panel (mengarahkan ke config URL server).
- Atau copy `Config URL` / `Config JSON` dari panel guide.

## 3. Membaca Tampilan
Panel kiri:
- filter channel,
- daftar staff dikelompokkan per channel.

Panel tengah:
- peta posisi staff.
- marker menampilkan:
- badge role (`HQ` dispatcher, `ST` operator),
- warna channel (contoh engineering/security/housekeeping).

Panel kanan:
- KPI (`Active`, `Offline`, `With GPS`, `Talking Now`),
- `Recent Operations` (event GPS, PTT, geofence).
- `Selected Staff Action`:
- tombol `Talk`,
- daftar voice history terakhir + audio player replay.

## 4. Tracking Staff
1. Pilih channel di `Channel Group` (atau `All Channels`).
2. Klik nama staff di panel kiri.
3. Peta akan fokus ke posisi staff.
4. Popup marker menampilkan:
- device,
- waktu GPS terakhir,
- akurasi GPS,
- channel PTT terakhir.
5. Untuk replay pembicaraan:
- klik staff pada list atau marker map,
- buka panel `Selected Staff Action`,
- atur filter jika perlu:
- `Channel`,
- `From` (jam awal),
- `To` (jam akhir),
- `Limit`,
- klik `Apply Filter`,
- pilih rekaman berdasarkan jam,
- klik `Play`.

## 4.1 Tombol Talk
Setelah staff dipilih, klik `Talk` untuk membuka `voice.html` di tab baru dengan channel staff tersebut.
Ini dipakai dispatcher untuk masuk komunikasi cepat pada channel yang sama.

## 4.2 Dispatcher TTS Broadcast (Kantor -> Lapangan)
Fitur ini hanya untuk akun role `dispatcher`.

Tujuan:
- dispatcher mengetik teks di office,
- browser dispatcher membacakan teks secara lokal,
- pesan dikirim ke channel sebagai text bertanda `[TTS]`.

Langkah:
1. Di panel kanan, buka `Dispatcher TTS Broadcast`.
2. Pilih `Channel`.
3. Isi `Text` (maks 160 karakter).
4. Klik `Speak Local + Broadcast`.

Catatan:
- Audio dibacakan di browser dispatcher (local TTS).
- Penerima menerima isi pesan melalui channel sebagai `ptt_text` bertanda `[TTS]`.

## 5. Geofence Alert
Geofence area kerja default:
- Hotel Area
- Bandara Area
- Mall Area

Perilaku alert:
- Jika staff keluar dari semua geofence aktif:
- event muncul sebagai `GEOFENCE` di `Recent Operations`,
- browser mengeluarkan bunyi beep.

Catatan:
- Jika beep tidak terdengar, klik halaman sekali (beberapa browser butuh user interaction untuk audio).

## 6. Edit Geofence (Butuh Permission)
Syarat:
- menu `geofence_admin` aktif untuk akun login.

Langkah:
1. Di panel `Geofence Editor`, pilih area (`hotel/bandara/mall`).
2. Drag marker center di peta untuk geser titik pusat.
3. Ubah nilai `Radius (m)`.
4. Klik `Save Geofences`.
5. Tunggu status sukses di panel info.

## 7. Setup Permission Per Role (Butuh Permission)
Syarat:
- menu `role_permission_admin` aktif.

Langkah:
1. Buka panel `Role Menu Permission`.
2. Pilih role.
3. Centang menu yang boleh diakses.
4. Klik `Save Role Permission`.

## 8. Setup Permission Per User (Butuh Permission)
Syarat:
- menu `user_permission_admin` aktif.

Langkah:
1. Buka panel `User Menu Permission`.
2. Pilih user.
3. Atur per menu:
- `inherit`: ikut role,
- `allow`: paksa boleh,
- `deny`: paksa tidak boleh.
4. Klik `Save User Permission`.

## 9. Daftar Menu Permission
- `tracking`
- `ptt_history`
- `geofence_admin`
- `user_permission_admin`
- `role_permission_admin`
- `emergency_override`

## 10. SOP Harian Singkat
1. Login dispatcher.
2. Cek KPI dan staff offline/stale.
3. Pantau event `GEOFENCE`.
4. Follow up staff yang keluar area kerja.
5. Update geofence jika area operasional berubah.

## 11. Troubleshooting Cepat
- Login gagal: verifikasi user/device.
- Marker tidak muncul: pastikan staff sudah kirim GPS.
- Geofence tidak tersimpan: cek permission admin.
- Tidak ada bunyi alert: klik halaman untuk aktifkan audio browser.
