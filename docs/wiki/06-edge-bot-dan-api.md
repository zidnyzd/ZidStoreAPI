# 06. Edge Bot dan API

Ada dua komponen yang berjalan di VPS pelanggan: bot Telegram pelanggan (Telegraf) dan microservice edge API (Express). Kedua komponen ini mengontrol akun VPN lokal di VPS pelanggan melalui skrip CLI.

## Arsitektur Edge

- **Edge API**: resources/bot/api.js, daemon Express di port 5888.
- **Bot pelanggan**: resources/bot/app.js, bot Telegraf untuk mengelola akun per server (multi-server).
- **Skrip CLI**: resources/src-bin/apicreate, apicheck, apidelete, apirenew, trial*, menu, ft, limitip, autokill, quota, exp.
- **Data lokal**: database.db (SQLite Telegraf), /root/.key, /root/.vars, /etc/xray/*, /etc/ssh/*.

## Microservice Edge API (resources/bot/api.js)

### Konfigurasi dan Utilitas

- PORT default 5888 (src/routes? resources/bot/api.js:1693-1696).
- Middleware checkPassword diterapkan ke semua rute (resources/bot/api.js:246-259). Membaca kata sandi dari /root/.key (resources/bot/api.js:249). Jika auth query tidak cocok, mengembalikan halaman HTML akses ditolak (resources/bot/api.js:251-253).
- Regex ANSI: `\x1B\[[0-9;?]*[ -\/]*[@-~]` (resources/bot/api.js:9).
- stripAnsi menghapus ANSI, OSC, DCS/SOS/PM/APC sequences, dan carriage return (resources/bot/api.js:11-16).
- extractJson mencari { pertama dan } terakhir, lalu JSON.parse (resources/bot/api.js:18-33).

### Parser Kunci Nilai dan Trial

- parseKeyValuePairs memproses output baris demi baris, menghilangkan garis kotak, membagi dengan :, mengumpulkan pasangan (resources/bot/api.js:40-57).
- buildTrialResponse mengekstrak field untuk ssh/vmess/vless/trojan, melempar error jika field kritis hilang (resources/bot/api.js:59-166).
- postProcessTrialData melengkapi domain, expired, mengekstrak uuid dari link, validasi kritis (resources/bot/api.js:168-244).

### Endpoint Create

Semua endpoint create memakai spawn("/bin/bash", ["-c", `apicreate <protocol> ...`]) (resources/bot/api.js:270-329, 340-403, 415-478, 489-551, 563-615). Alur:

1. Validasi parameter wajib.
2. Spawn apicreate dengan argumen user, exp/quota, iplimit, dan password khusus ssh.
3. Kumpulkan stdout/stderr.
4. Jika kode tidak 0, kembalikan 500 dengan detail output.
5. Coba extractJson. Jika status success, kembalikan data terstruktur.
6. Jika gagal parse, coba parseKeyValuePairs + buildTrialResponse sebagai fallback (vmess/vless/trojan/ssh). Shadowsocks hanya mengandalkan extractJson.

### Endpoint Check

Check semua protokol via apicheck (resources/bot/api.js:617-843). Pola: spawn apicheck <protocol>, ambil output, hapus koma ekstra sebelum JSON.parse, kembalikan hasil.

### Endpoint Delete

Delete via apidelete (resources/bot/api.js:845-997). Sama pola spawn, bersihkan koma ekstra, parse JSON.

### Endpoint Renew

Renew via apirenew (resources/bot/api.js:1099-1366). Untuk vmess/vless/trojan/shadowsocks butuh user, exp, quota, iplimit. Untuk ssh butuh user, exp, iplimit.

### Endpoint Trial

Trial via script trial* (resources/bot/api.js:1368-1691). Menerima minutes, user opsional, auth opsional. Validasi menit 1-1440, username hanya alfanumerik. Spawn trial<protocol> dengan env TERM=xterm. Kirim username dan menit lewat stdin. Kumpulkan output, coba JSON dulu, kalau gagal fallback key-value parser dengan postProcessTrialData menggunakan request domain dari header Host atau hostname.

## Bot Pelanggan (resources/bot/app.js)

### Inisialisasi

- Menggunakan Telegraf, Scenes, session (resources/bot/app.js:2).
- Koneksi sqlite3 ke database.db lokal (resources/bot/app.js:35-41).
- Membuat tabel Server jika belum ada: id, domain, auth (resources/bot/app.js:44-54).
- userState menyimpan state percakapan (resources/bot/app.js:57).
- Memuat modul create/check/renew/delete per protokol (resources/bot/app.js:4-26).
- Membaca BOT_TOKEN dan ADMIN dari /root/.bot/.vars.json (resources/bot/app.js:28-31).

### Menu dan Navigasi

- /start dan /menu memanggil sendMainMenu (resources/bot/app.js:61-70, 82-125).
- Menu utama menampilkan opsi Service Create/Delete/Renew/Check (resources/bot/app.js:83-93).
- handleServiceAction menampilkan submenu per aksi (resources/bot/app.js:128-186).
- Admin menu untuk tambah/hapus/list/reset server (resources/bot/app.js:70-81, 188-215, 516-626).

### Alur Operasi

1. Pengguna pilih aksi (create/delete/renew/check) -> handleServiceAction (resources/bot/app.js:217-231).
2. Pengguna pilih protokol -> startSelectServer memilih server dari tabel Server (resources/bot/app.js:238-319, 321-357).
3. Simpan state userState[chat.id] dengan step dan serverId (resources/bot/app.js:351).
4. Jika aksi check, langsung panggil modul check dan kirim hasil (resources/bot/app.js:359-382).
5. Jika create/delete/renew, bot meminta username lalu parameter lain sesuai protokol (resources/bot/app.js:385-479).
6. Setelah semua parameter terkumpul, panggil modul create/check/renew/delete dengan serverId, kirim hasil ke pengguna, hapus userState (resources/bot/app.js:451-479).

Modul-modul tersebut (createvmess, etc.) kemungkinan besar memanggil edge API dengan auth dari tabel Server. Bot pelanggan ini berbeda dari bot kontrol plane.

### Admin Server Management

- /admin cek adminIds (resources/bot/app.js:71-81).
- addserver: tanya domain, lalu auth, insert ke tabel Server (resources/bot/app.js:480-513, 571-581).
- deleteserver: tampilkan list server untuk dihapus, konfirmasi, delete (resources/bot/app.js:516-569).
- listserver: tampilkan semua server (resources/bot/app.js:583-610).
- resetdb: DELETE FROM Server (resources/bot/app.js:612-626).

## Perbedaan Kedua Bot

| Aspek | Bot Kontrol Plane (src/bot/telegram.js) | Bot Pelanggan (resources/bot/app.js) |
|-------|------------------------------------------|----------------------------------------|
| Lokasi | VPS Control Plane | VPS Pelanggan |
| Tujuan | Registrasi IP, buat/kembalikan kunci, statistik | Buat/cari/hapus/perbarui akun VPN di VPS itu sendiri |
| Database | data/zidstore.db (api_keys, vpn_accounts, audit_log) | database.db lokal (tabel Server) |
| Otorisasi | ALLOWED_USER_ID + TELEGRAM_ADMIN_ID | ADMIN dari /root/.bot/.vars.json |
| Aksi | Registrasi lisensi, perpanjangan, pemindahan IP, hapus IP | Operasional akun Xray/SSH per protokol |
| Remote call | Langsung ke DB Control Plane | Panggil edge API port 5888 di server terpilih |

## Rujukan Berkas:baris

| Berkas | Baris | Rujukan |
|--------|-------|---------|
| resources/bot/api.js | 9-16 | ansiRegex, stripAnsi |
| resources/bot/api.js | 18-33 | extractJson |
| resources/bot/api.js | 40-57 | parseKeyValuePairs |
| resources/bot/api.js | 59-166 | buildTrialResponse |
| resources/bot/api.js | 168-244 | postProcessTrialData |
| resources/bot/api.js | 246-259 | checkPassword |
| resources/bot/api.js | 261-615 | create handlers |
| resources/bot/api.js | 617-843 | check handlers |
| resources/bot/api.js | 845-996 | delete handlers |
| resources/bot/api.js | 1099-1366 | renew handlers |
| resources/bot/api.js | 1368-1691 | trial handlers |
| resources/bot/api.js | 1693-1696 | PORT 5888 |
| resources/bot/app.js | 28-41 | bot, sqlite3, db |
| resources/bot/app.js | 44-54 | tabel Server |
| resources/bot/app.js | 61-80 | start, menu, admin |
| resources/bot/app.js | 82-125 | sendMainMenu |
| resources/bot/app.js | 128-186 | handleServiceAction |
| resources/bot/app.js | 188-215 | sendAdminMenu |
| resources/bot/app.js | 217-319 | action create/delete/renew/check protokol |
| resources/bot/app.js | 321-357 | startSelectServer |
| resources/bot/app.js | 358-479 | action selection, text handler |
| resources/bot/app.js | 480-513 | addserver flow |
| resources/bot/app.js | 516-569 | deleteserver flow |
| resources/bot/app.js | 571-581 | addserver action |
| resources/bot/app.js | 583-610 | listserver |
| resources/bot/app.js | 612-626 | resetdb |
| resources/bot/app.js | 628-633 | bot.launch |