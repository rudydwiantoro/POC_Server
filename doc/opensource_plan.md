# Open Source Distribution Plan (Limited Device License)

Dokumen ini membahas strategi jika project ingin dibuka sebagai open source, tetapi penggunaan production dibatasi (misalnya maksimal 2 device).

## 1. Realita Dasar (Penting)
- Jika source code full dibuka, **tidak ada cara 100%** mencegah orang menghapus logika license dari fork mereka.
- Yang bisa dilakukan:
  - buat model lisensi legal yang jelas,
  - pisahkan capability inti (license authority) di layanan terkontrol,
  - hardening binary agar bypass tidak trivially mudah,
  - buat value resmi (support, update, signature, trust).

## 2. Model Bisnis yang Cocok
Pilihan umum:
- Open Core:
  - core fitur tetap open source,
  - fitur enterprise (license manager, advanced admin, audit, OTA policy, HA) closed.
- Source Available License:
  - code bisa dibaca, tapi penggunaan komersial dibatasi oleh license terms.
- Dual License:
  - AGPL/GPL untuk komunitas,
  - commercial license untuk pelanggan bisnis.

Rekomendasi praktis:
- Untuk target “free sampai 2 device”, gunakan **Open Core + License Service terpusat**.

## 3. Strategi Batas 2 Device
Jangan hanya mengandalkan env var lokal.

Gunakan kombinasi:
1. Server-side enforcement:
- hitung `active devices` di DB.
- tolak login/join channel saat > limit.
- lakukan check pada endpoint kritikal:
  - `/api/auth/login`
  - `/ws/signaling` join
  - upload PTT/message endpoint

2. License token signed:
- payload: `plan`, `maxDevices`, `expiresAt`, `customerId`.
- signature asymmetric (Ed25519/RSA) supaya verify key bisa public, sign key tetap private.

3. Optional online attestation (recommended):
- server self-check ke License Authority (host Anda) periodik.
- jika offline terlalu lama, masuk grace mode terbatas.

4. Grace policy:
- contoh: free tier tetap jalan 2 device tanpa internet.
- enterprise butuh revalidation per 7-30 hari.

## 4. Arsitektur yang Sulit Dibypass
Pisahkan komponen:
- Repo open source:
  - app logic, UI, signaling dasar.
- Service tertutup (host Anda):
  - key issuance,
  - revocation list,
  - signed plan/token.

Prinsip:
- enforcement final tetap terjadi di server runtime, bukan di client.
- client checks hanya UX, bukan security boundary.

## 5. “Compile Biar Source Tidak Kelihatan” (Ekspektasi Realistis)
Untuk backend Node.js:
- Obfuscation/bundling bisa menunda analisis, bukan mencegah.
- Opsi:
  - bundle/minify (`esbuild`, `ncc`) untuk distribusi,
  - obfuscation selektif pada modul non-kritis.
- Hindari menyimpan secret signing key di binary yang dikirim ke user.

Untuk Android:
- aktifkan `minifyEnabled true` + R8/ProGuard.
- gunakan resource shrinking.
- pindahkan logic sensitif ke server.
- kalau perlu, gunakan NDK untuk sebagian logic check (tetap bisa direverse, tapi effort lebih tinggi).

Untuk web frontend:
- minify + split chunk.
- jangan taruh secret di frontend.

Kesimpulan:
- compile/obfuscate = **friction layer**, bukan proteksi utama.

## 6. Anti-Tamper & Integrity Layer
Tambahkan lapisan ini untuk menaikkan effort bypass:
- binary signing verification di CI/CD.
- checksum build manifest.
- server challenge-response untuk instance ID.
- optional watermark build (`edition`, `build-id`) untuk tracing distribusi bocor.

## 7. Legal & Licensing Layer
Teknis saja tidak cukup.

Wajib:
- LICENSE file yang tegas.
- Terms untuk commercial use.
- CLA (opsional) jika menerima kontribusi.
- Trademark policy (nama/logo tidak boleh dipakai ulang tanpa izin).

## 8. Paket Distribusi yang Disarankan
1. Community Edition (Open Source):
- maksimal 2 device.
- feature set dasar.
- tanpa SLA.

2. Pro/Enterprise:
- device limit custom.
- advanced module + support.
- signed license + remote attestation.

## 9. Rencana Implementasi Bertahap
Phase 1 (cepat):
- enforce max device full server-side.
- hapus bypass default dari production env.
- tambah signed license payload sederhana.

Phase 2:
- pisahkan License Authority service.
- add revocation + grace period + telemetry dasar.

Phase 3:
- hardening build pipeline (obfuscation, signature, integrity check).
- legal pack lengkap (license text, terms, trademark).

## 10. Risiko yang Perlu Diterima
- Fork yang menghapus license logic tetap mungkin terjadi pada open source penuh.
- Value jual utama harus datang dari:
  - managed service,
  - support,
  - security updates,
  - trust/compliance,
  - operational excellence.

## 11. Rekomendasi Final
Jika target Anda adalah:
- “share code ke publik”
- “tetap ada batas free 2 device”
- “commercial tetap terlindungi”

Maka kombinasi paling sehat:
- Open Core + server-side enforcement + signed license + service authority terpisah + legal terms jelas.

Itu jauh lebih kuat dan maintainable dibanding mengandalkan “code disembunyikan”.
