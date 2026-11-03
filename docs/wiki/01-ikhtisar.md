# 01. Iktisar

ZidStoreAPI adalah control plane untuk penjualan dan manajemen lisensi tunnel VPN yang berjalan di edge. Sistem ini menangani pembuatan kunci lisensi, pengecekan kredibilitas kunci, bind kunci ke IP, audit log, serta pemberian script instalasi. Operator menggunakan bot Telegram, sementara akun yang teregistrasi diinstal di VPS pelanggan lewat skrip yang diunduh dari endpoint Control Plane.

## Apa yang Ada di Control Plane

- **API lisensi**: Express server di src/index.js, rute di src/routes/api.js.
- **Database SQLite**: src/database/init.js membuat skema api_keys, vpn_accounts, audit_log.
- **Bot operator**: src/bot/telegram.js menghandle interaksi Telegram berbasis RBAC.
- **Tooling operator**: src/utils/helpers.js memuat fungsi bantu.
- **Infrastruktur operasi**: deploy.sh, package.json, .env.example, README.md.

## Apa Saja Komponen Utama

Tabel berikut memetakan komponen ke berkas.

| Komponen | Berkas | Tanggung Jawab |
|----------|--------|----------------|
| Server Express | src/index.js | Port www (3000 default), trust proxy, rate limiter, logging, startup cleanup, graceful shutdown |
| Router API | src/routes/api.js | Semua endpoint lisensi dan resource |
| Database | src/database/init.js | better-sqlite3, pragma, tabel, index, model |
| Bot Telegram | src/bot/telegram.js | Handler, state machine, inline keyboard, paginasi |
| Utility | src/utils/helpers.js | Key, IP validation, date, install command |
| Edge API | resources/bot/api.js | Express daemon di VPS, spawn script, parser output |
| Bot pelanggan | resources/bot/app.js | Telegraf multi-server, SQLite database.db lokal |
| Deployment | deploy.sh | NodeSource, PM2, Nginx, Certbot, crontab |
| Konfigurasi | .env.example | Template variabel lingkungan |

## Masalah yang Dipecahkan

### 1. Lisensi Terpusat, Instalasi Terdesentralisasi

Operator membuat satu kunci per IP. VPS pelanggan menginstal skrip dari endpoint Control Plane. API core menentukan kredibilitas, masa berlaku, dan IP terikat sebelum script diizinkan diunduh.

### 2. Pembajakan Script Installer

Endpoint GET /?key= memvalidasi key di sisi server, mengecek kebiasaan, mencatat akses, lalu meredirect ke raw GitHub. Skrip selalu mendapatkan versi terbaru, sehingga multi-server dapat berjalan dari satu lisensi yang terikat IP.

### 3. Pemantauan IP yang Akurat

Registrasi hanya mengizinkan satu IP per kunci aktif. GET /api/key memverifikasi bahwa IP klien cocok dengan apiKey.ip_address sebelum memberikan key mentah. Ini mencegah pengguna mengirim key dengan IP yang berbeda.

### 4. Pengelolaan Hutan Akun

Tabel vpn_accounts merujuk api_keys melalui foreign key. Menghapus IP menghapus seluruh akun VPN terkait, mencegah orphan record.

### 5. Audit Tindakan Login

Semua peristiwa penting dicatat melalui AuditLog.log, termasuk percobaan key invalid, key expired, download script, register, renew, change IP, delete IP, dan error server.

## Prinsip Desain

- **Separation of concerns**: kontrol lisensi dan bot berada di proses terpisah dari edge microservice di VPS.
- **Audit logging**: setiap aksi penting dimasukkan ke audit_log.
- **Rate limiting**: generalLimiter dan apiLimiter membatasi request per menit.
- **Zero external auth complexity**: autentikasi berbasis kunci dan IP terkandung di dashboard; Telegram bekerja dengan ID dan ROLE admin.
- **Language choice**: Node.js dengan Express, SQLite untuk deployment sederhana tanpa koneksi pool.

## Apa yang BUKAN Proyek Ini

ZidStoreAPI bukanlah:

- Bot VPN yang dijalankan di VPS pelanggan.
- Penyedia jaringan VPN atau server proxy.
- Halaman promosi atau dashboard pengguna.
- Klien yang berfungsi tanpa control plane.

Pelanggan menggunakan endpoint API untuk memvalidasi key dan mendapatkan install command, bukan menggunakan bot Telegram sebagai jaringan VPN. Bot Telegram hanya alat operator untuk mengelola IP, kunci, dan statistik.

## Prinsip Keamanan

- **Binding IP-Key**: setiap key terkait dengan satu IP terdaftar. GET /api/key dan GET /api/exp berbasis binding ini.
- **Trust proxy**: app.set('trust proxy', 1) memastikan req.ip mencerminkan header X-Forwarded-For dari Nginx.
- **RBAC Telegram**: ALLOWED_USER_ID 6200639382 wajib; ADMIN via TELEGRAM_ADMIN_ID juga diizinkan.
- **Input validation**: validateIp dan validateDays membatasi format IP dan rentang hari.
- **Path traversal protection**: /resources/* memeriksa fullPath sebelum fs.existsSync dan sendFile.
- **Session cleanup**: ApiKey.deactivateExpired berjalan di startup.

## Tabel Rujukan Berkas Penting

| Berkas | Baris Penting |
|--------|---------------|
| src/index.js | 16-18 port dan aplikasi; 20-21 trust proxy; 23-38 rate limiter; 47-53 logging; 83-112 startup; 114-125 shutdown |
| src/routes/api.js | 12-44 download script; 47-72 validate; 75-101 key plain; 104-124 exp; 127-168 register; 171-187 stats; 190-219 resources |
| src/database/init.js | 5 DB_PATH; 15-17 pragma; 20-58 skema dan index; 61-153 ApiKey; 155-185 VpnAccount; 187-192 AuditLog |
| src/bot/telegram.js | 9 ALLOWED_USER_ID; 11-13 isAuthorized; 63-99 sendPaginated; 133-199 callback_query |
| src/utils/helpers.js | 2-10 generateApiKey; 12-18 formatDate; 20-22 generateInstallCommand; 24-27 validateIp; 29-31 validateDays; 33-36 isAdmin |
| resources/bot/api.js | 9 ansiRegex; 11-16 stripAnsi; 18-33 extractJson; 246-259 checkPassword; 1693-1696 PORT |
| resources/bot/app.js | 28-31 BOT_TOKEN dan ADMIN; 44-54 Server table; 61-80 command; 322-357 server select |
| deploy.sh | 115-122 NodeSource; 124-130 PM2; 169-175 PM2 start; 197-321 Nginx SSL; 323-329 crontab |
