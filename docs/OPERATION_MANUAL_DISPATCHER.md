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

## 4. Tracking Staff
1. Pilih channel di `Channel Group` (atau `All Channels`).
2. Klik nama staff di panel kiri.
3. Peta akan fokus ke posisi staff.
4. Popup marker menampilkan:
- device,
- waktu GPS terakhir,
- akurasi GPS,
- channel PTT terakhir.

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
