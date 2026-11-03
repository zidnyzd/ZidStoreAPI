# 07. CLI Management Suite

Skrip di resources/src-bin adalah rangkaian manajemen akun VPN di VPS pelanggan. Skrip ini dipanggil oleh edge API (resources/bot/api.js) dan juga bisa dipakai langsung di terminal VPS.

## Skrip Inti

| Skrip | Baris | Fungsi |
|-------|-------|--------|
| apicreate | 912 | Pembuatan akun dan update file .db per-protokol di /etc/xray/ dan /etc/ssh/ |
| apicheck | 250 | Pemeriksaan status akun per protokol |
| apidelete | 157 | Penghapusan akun per protokol |
| apirenew | 332 | Perpanjangan akun per protokol |
| limitip | 96 | Inspeksi access.log Xray, korelasi multi-login, notifikasi Telegram |
| limitipssh | 110 | Inspeksi auth.log SSH, multi-login, auto-kill |
| quota | 140 | Pemantauan trafik downlink via Xray stats API, threshold enforcement |
| exp | 74 | Cron daily auto-removal akun kedaluwarsa |
| autokill | 104 | Multi-login detection SSH/Dropbear dengan auto-lock |
| menu | 198 | TUI interaktif di terminal VPS |
| ft | 169 | TUI alternatif di terminal VPS |

## apicreate

Skrip berada di resources/src-bin/apicreate (912 baris). Fungsinya:

- Menerima argumen protokol (vmess, vless, trojan, shadowsocks, ssh) dan parameter.
- Membuat akun di /etc/xray/<protocol>/config.json dan /etc/xray/<protocol>/.<protocol>.db.
- Menghasilkan output JSON yang diparse edge API.
- Memvalidasi lisensi aktif via /root/.key ke https://zds.web.id/api/exp?key= (4-5).
- Output akun kini juga memuat `Slowdns Host` + `SlowDns Public Key` dari `/etc/slowdns/domain` + `/etc/slowdns/server.pub` (lihat addssh baris 61-73 dan 170-171, apicreate baris 28-36 dan 774).

## apicheck

resources/src-bin/apicheck (250 baris). Membaca database per-protokol dan menampilkan status akun. Output diparse sebagai JSON oleh edge API check handlers (resources/bot/api.js:642-705).

## apidelete

resources/src-bin/apidelete (157 baris). Menghapus akun dari config.json dan database per-protokol, lalu restart layanan terkait.

## apirenew

resources/src-bin/apirenew (332 baris). Memperbarui masa aktif dan quota akun per protokol, lalu restart layanan.

## limitip

resources/src-bin/limitip (96 baris). Perilaku:

- Membaca user database dari /etc/xray/<protocol>/.<protocol>.db (baris 8).
- Membaca 100 baris terakhir access.log (baris 24).
- Filter IP dalam 3 detik terakhir (baris 34).
- Korelasi user ke IP, hitung jumlah IP unik (baris 58).
- Jika jumlah melebihi limit, kirim notifikasi Telegram (baris 69-82).
- Berjalan loop dengan sleep ${1}m (baris 92).

## limitipssh

resources/src-bin/limitipssh (110 baris). Inspeksi auth.log /var/log/auth.log atau /var/log/secure, deteksi multi-login SSH, auto-lock via passwd -l.

## quota

resources/src-bin/quota (140 baris). Perilaku:

- Membuat direktori usage per protokol jika belum ada (baris 4-15).
- Membaca users dari config.json dengan grep '^###' (baris 37).
- Mengambil downlink via xray api stats --server=127.0.0.1:<port> -name "user>>>$user>>>traffic>>>downlink" (baris 40-44).
- Menambahkan penggunaan ke file usage (baris 46-56).
- Reset stats setelah baca (baris 58).
- Jika usage melebihi limit, hapus akun dari config.json dan .db, hapus file usage dan log, kirim notifikasi Telegram, restart layanan (baris 64-113).
- Loop setiap 30 detik (baris 126-139).

Port Xray API: vmess 20001, vless 20002, trojan 20003, shadowsocks 20004 (baris 130-139).

## exp

resources/src-bin/exp (74 baris). Cron harian yang:

- Membaca user dari .db per protokol (baris 11).
- Membandingkan tanggal expired dengan hari ini (baris 12-17).
- Jika expired, hapus dari config.json dan .db, hapus file usage, restart layanan (baris 19-42).
- Menangani akun SSH via /etc/ssh/.ssh.db dan userdel (baris 60-73).

## autokill

resources/src-bin/autokill (104 baris). Perilaku:

- Membaca /var/log/auth.log atau /var/log/secure (baris 3-10).
- Parse log SSH dan Dropbear untuk mendapatkan PID, user, IP (baris 21-64).
- resolve_real_ip memakai ws.py port mapping untuk IP 127.0.0.1 (baris 33-40).
- Menghitung jumlah IP per user dari /etc/ssh/.ssh.db (baris 70-75).
- Jika melebihi limit, kirim notifikasi Telegram dan lock akun via passwd -l (baris 77-99).

## menu dan ft

resources/src-bin/menu (198 baris) dan resources/src-bin/ft (169 baris). TUI interaktif di terminal VPS. Memvalidasi lisensi aktif via /root/.key ke https://zds.web.id/api/exp?key= (baris 4-5). Menampilkan domain dan script key (menu:126, menu:141, ft:110, ft:126). Keduanya kini menampilkan baris `SLOWDNS` berisi domain SlowDNS (menu:127, ft:111; dari `/etc/slowdns/domain`, fallback `/etc/xray/dns`). ft juga menampilkan status layanan DNSTT (`DNSTT SERVICE STATUS`, ft:123). Keduanya mencantumkan string versi `V1.0.3 LTS` (menu:144, ft:129).

## menusetting (System Settings)

resources/src-bin/menusetting menyediakan menu System Settings. Item "9. Change SlowDNS domain" memanggil fungsi `change_ns` (baris 293-423) dengan perilaku:

- Validasi subdomain baru: huruf kecil, angka, tanda hubung, maksimal 63 karakter, dan tidak boleh diawali `ns-`.
- Sinkronisasi record Cloudflare otomatis lewat API (POST /api/slowdns/register).
- Menulis `/etc/slowdns/domain` dan `/etc/xray/dns`.
- Menulis ulang unit `dnstt-server` lalu me-restart.
- Subdomain yang sudah dipakai VPS lain ditolak dengan pesan jelas (409 sub_taken); pilih subdomain lain.
- Bila API membalas error lain, perubahan dibatalkan; bila API tidak memberi respons (gangguan jaringan), domain turunan tetap dipakai dengan peringatan (fail-open).
- Record DNS lama tidak dihapus otomatis, melainkan ditampilkan sebagai catatan.

Menu System Settings mendaftarkan item tersebut pada baris 619 dan memanggil `change_ns` pada baris 639.

## backuprestore

resources/src-bin/backuprestore.js (148 baris). Skrip Node.js untuk backup dan restore database. Tidak dijelaskan mendalam di sini; rujuk berkas langsung.

## Rujukan Berkas:baris

| Berkas | Baris | Rujukan |
|--------|-------|---------|
| resources/src-bin/apicreate | 4-5 | validasi lisensi via /root/.key dan /api/exp |
| resources/src-bin/apicheck | 1-250 | pemeriksaan akun |
| resources/src-bin/apidelete | 1-157 | penghapusan akun |
| resources/src-bin/apirenew | 1-332 | perpanjangan akun |
| resources/src-bin/limitip | 8 | baca user database |
| resources/src-bin/limitip | 24 | tail 100 access.log |
| resources/src-bin/limitip | 34 | filter 3 detik terakhir |
| resources/src-bin/limitip | 58 | hitung IP unik |
| resources/src-bin/limitip | 69-82 | notifikasi Telegram |
| resources/src-bin/limitip | 92 | loop sleep ${1}m |
| resources/src-bin/quota | 4-15 | mkdir usage |
| resources/src-bin/quota | 37 | grep '^###' config.json |
| resources/src-bin/quota | 40-44 | xray api stats downlink |
| resources/src-bin/quota | 46-56 | update usage file |
| resources/src-bin/quota | 58 | reset stats |
| resources/src-bin/quota | 64-113 | threshold enforcement dan hapus akun |
| resources/src-bin/quota | 130-139 | port 20001-20004, loop 30s |
| resources/src-bin/exp | 11 | baca user |
| resources/src-bin/exp | 12-17 | bandingkan expired |
| resources/src-bin/exp | 19-42 | hapus dan restart |
| resources/src-bin/exp | 60-73 | SSH removal |
| resources/src-bin/autokill | 3-10 | log file selection |
| resources/src-bin/autokill | 21-64 | parse log SSH/Dropbear |
| resources/src-bin/autokill | 33-40 | resolve_real_ip |
| resources/src-bin/autokill | 70-75 | hitung IP per user |
| resources/src-bin/autokill | 77-99 | notifikasi dan lock |
| resources/src-bin/menu | 4-5 | validasi lisensi |
| resources/src-bin/menu | 126-140 | tampilkan domain dan key |
| resources/src-bin/ft | 4-5 | validasi lisensi |
| resources/src-bin/ft | 110-124 | tampilkan domain dan key |
| resources/bot/api.js | 270-329 | /createssh |
| resources/bot/api.js | 340-403 | /createvmess |
| resources/bot/api.js | 415-478 | /createvless |
| resources/bot/api.js | 489-551 | /createtrojan |
| resources/bot/api.js | 563-615 | /createshadowsocks |