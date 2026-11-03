# ZidStoreAPI: Dokumentasi Wiki Teknis

ZidStoreAPI adalah backend control plane untuk pengelolaan lisensi VPN tunnel yang terpusat. Sistem ini menggabungkan Express server dengan SQLite, bot Telegram operator (RBAC), edge microservice yang berjalan di VPS pelanggan, dan rangkaian skrip CLI Linux untuk manajemen akun VPN. Dokumentasi ini code-cited: setiap klaim teknis merujuk ke berkas dan nomor baris riil di repositori.

## Peta Navigasi Halaman Wiki

| Halaman | Topik Utama |
|---------|-------------|
| [01-ikhtisar.md](./01-ikhtisar.md) | Definisi proyek, masalah yang dipecahkan, prinsip desain |
| [02-arsitektur.md](./02-arsitektur.md) | Topologi Control Plane vs Edge Node, aliran data end-to-end |
| [03-api-dan-lisensi.md](./03-api-dan-lisensi.md) | Endpoint API lisensi, rate limiting, trust proxy |
| [04-database-dan-model.md](./04-database-dan-model.md) | Skema SQLite, model ApiKey/VpnAccount/AuditLog |
| [05-bot-telegram-control-plane.md](./05-bot-telegram-control-plane.md) | Bot operator, RBAC, state machine, paginasi |
| [06-edge-bot-dan-api.md](./06-edge-bot-dan-api.md) | Microservice edge port 5888, bot pelanggan |
| [07-cli-management-suite.md](./07-cli-management-suite.md) | Skrip CLI di resources/src-bin |
| [08-konfigurasi-dan-deploy.md](./08-konfigurasi-dan-deploy.md) | .env, deploy.sh, PM2, Nginx, SSL |
| [09-jebakan-dan-keamanan.md](./09-jebakan-dan-keamanan.md) | Jebakan nyata dan mitigasi |

## Jalur Baca yang Disarankan

1. Pendatang baru: 01-ikhtisar.md lalu 02-arsitektur.md.
2. Operator API: 03-api-dan-lisensi.md lalu 04-database-dan-model.md.
3. Operator Telegram: 05-bot-telegram-control-plane.md.
4. Engineer VPS edge: 06-edge-bot-dan-api.md lalu 07-cli-management-suite.md.
5. DevOps: 08-konfigurasi-dan-deploy.md.
6. Insiden dan keamanan: 09-jebakan-dan-keamanan.md.

## Kalau Mau Tahu X, Buka Halaman Y

| Yang Ingin Diketahui | Halaman |
|----------------------|---------|
| Apa proyek ZidStoreAPI secara keseluruhan | 01-ikhtisar.md |
| Aliran registrasi IP sampai instalasi script di VPS | 02-arsitektur.md |
| Endpoint GET /?key= dan redirect GitHub raw | 03-api-dan-lisensi.md |
| Validasi ketat IP matching di GET /api/key | 03-api-dan-lisensi.md |
| Pengecekan masa aktif GET /api/exp | 03-api-dan-lisensi.md |
| Statistik agregat GET /api/stats | 03-api-dan-lisensi.md |
| Penyajian file statis /resources/* dengan proteksi traversal | 03-api-dan-lisensi.md |
| Konfigurasi trust proxy dan rate limiter | 03-api-dan-lisensi.md |
| Skema tabel api_keys, vpn_accounts, audit_log | 04-database-dan-model.md |
| Method ApiKey.create, findByKey, deleteByIp, renewByIp | 04-database-dan-model.md |
| Cascade delete vpn_accounts sebelum api_keys | 04-database-dan-model.md |
| RBAC ALLOWED_USER_ID 6200639382 | 05-bot-telegram-control-plane.md |
| State machine userStates multi-step | 05-bot-telegram-control-plane.md |
| Paginasi sendPaginated dengan edit in-place | 05-bot-telegram-control-plane.md |
| Microservice daemon port 5888 | 06-edge-bot-dan-api.md |
| Autentikasi checkPassword via /root/.key | 06-edge-bot-dan-api.md |
| Parser regex ANSI escape sequence | 06-edge-bot-dan-api.md |
| Bot pelanggan multi-server via database.db lokal | 06-edge-bot-dan-api.md |
| Skrip apicreate, apicheck, apidelete, apirenew | 07-cli-management-suite.md |
| limitip dan limitipssh multi-login detection | 07-cli-management-suite.md |
| quota monitoring trafik downlink | 07-cli-management-suite.md |
| exp cron daily auto-removal | 07-cli-management-suite.md |
| menu dan ft TUI validasi lisensi | 07-cli-management-suite.md |
| Variabel lingkungan .env.example | 08-konfigurasi-dan-deploy.md |
| Alur deploy.sh satu perintah VPS | 08-konfigurasi-dan-deploy.md |
| PM2 process management | 08-konfigurasi-dan-deploy.md |
| Nginx reverse proxy dan Let's Encrypt | 08-konfigurasi-dan-deploy.md |
| Jebakan IP mismatch karena trust proxy | 09-jebakan-dan-keamanan.md |
| Jebakan parsing output CLI dengan karakter ANSI | 09-jebakan-dan-keamanan.md |
| Jebakan orphan records pada penghapusan IP | 09-jebakan-dan-keamanan.md |
| Risiko chmod 777 dan privilege escalation | 09-jebakan-dan-keamanan.md |
| Bypass domain via /etc/hosts lokal | 09-jebakan-dan-keamanan.md |

## Peta Berkas Inti Project

| Path | Tanggung Jawab Utama |
|------|----------------------|
| src/index.js | Express server, rate limiting, logging, middleware, startup cleanup, bot start |
| src/routes/api.js | Routing endpoint lisensi, download script, registrasi IP, statistik, resources |
| src/database/init.js | SQLite skema, model ApiKey, VpnAccount, AuditLog |
| src/bot/telegram.js | Bot operator Telegram, RBAC, inline keyboard, paginasi |
| src/utils/helpers.js | generateApiKey, validateIp, validateDays, formatDate, generateInstallCommand, isAdmin |
| resources/bot/api.js | Edge microservice daemon port 5888, spawn shell, parser ANSI/JSON |
| resources/bot/app.js | Bot Telegraf pelanggan multi-server |
| resources/src-bin/* | Skrip CLI manajemen pengguna Linux |
| deploy.sh | Deployer satu perintah VPS, PM2, Nginx, Certbot |
| package.json | Dependensi dan skrip npm |
| .env.example | Template variabel lingkungan |
| README.md | Dokumentasi publik ringkas |