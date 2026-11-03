# 02. Arsitektur

ZidStoreAPI berjalan dalam topologi dua lapisan: Control Plane (sentral) dan Edge Node VPS (pelanggan). Kedua lapisan ini terpisah secara jaringan, kecuali edge API yang berada di VPS pelanggan dapat dihubungi lewat bridge HTTPS yang diautentikasi.

## Topologi Teks: Control Plane vs Edge Node VPS

```
Internet
   |
   | HTTPS + WSS
   v
[ Nginx Reverse Proxy (VPS Control Plane) ]
   | proxy_pass 127.0.0.1:3000
   | X-Real-IP / X-Forwarded-For
   v
[ Express API :3000 ]
   |--- trust proxy 1
   |--- Rate Limiter
   |--- sqlite://./data/zidstore.db
   |--- Telegram Bot (polling node-telegram-bot-api)
   |
   +-- GET /?key= ... 302 -> https://raw.githubusercontent.com/zidnyzd/ScriptTunnel/main/zidstoretunnel
   +-- /api/validate, /api/key, /api/exp, /api/register, /api/stats, /resources/*

[ Edge Node VPS Pelanggan ]
   | port 5888 (edge API, bridge HTTPS)
   | spawn -> /usr/bin/{trialvmess,trialvless,trialtrojan,trialshadowsocks,trialssh,apicreate,apicheck,apidelete,apirenew}
   | fs -> /etc/xray/* /etc/ssh/* /root/.key /root/.vars
   |
   +-- Bot pelanggan (Telegraf)
       | database.db lokal: tabel Server (domain, auth)
       | callback_query -> edge API ?auth=...
```

## Aliran Data End-to-End

1. Operator menekan tombol menu di Telegram: register IP (src/bot/telegram.js).
2. Bot menerima input IP dan durasi hari, membuat kunci baru lewat ApiKey.create (src/database/init.js).
3. Bot mengembalikan URL instalasi: https://<DOMAIN>/?key=<key> (src/utils/helpers.js).
4. VPS pelanggan menjalankan `curl -L -k -sS https://<DOMAIN>/?key=<key> -o zidstoretunnel`.
5. Endpoint GET /?key= memverifikasi key, IP klien, masa berlaku, lalu menambah usage_count dan meredirect ke raw GitHub (src/routes/api.js).
6. VPS pelanggan menjalankan zidstoretunnel, yang memvalidasi key lewat GET /api/exp dengan baca /root/.key lokal.
7. Jika valid, script menginstal layanan VPN di VPS dan mendaftar akun di database lokal Xray atau SSH.
8. API lisensi hanya menyimpan data kontrol: api_keys dan vpn_accounts. Data account di VPS pelanggan disimpan di berkas konfigurasi Xray/SSH.

## Hubungan Antar Komponen

- **Express Server**: antarmuka publik. Menjembatani Telegram, client VPS, dan database.
- **SQLite Database**: satu berkas data/zidstore.db berisi api_keys, vpn_accounts, audit_log. Diaktifkan WAL dan foreign_keys ON (src/database/init.js).
- **Telegram Bot Handler**: polling satu instance. Menggunakan node-telegram-bot-api. Tidak kompatibel dengan webhook jika menggunakan pool.
- **Edge Microservice**: Express port 5888 di VPS. Autentikasi berbasis kata sandi di /root/.key. Menjalankan CLI via spawn dan mem-parsing output stdout/stderr.

## Rujukan Berkas:baris

| Berkas | Baris | Rujukan |
|--------|-------|---------|
| src/index.js | 16-18 | app, PORT |
| src/index.js | 20-21 | app.set trust proxy 1 |
| src/index.js | 23-38 | generalLimiter, apiLimiter |
| src/index.js | 47-53 | request logging ke console |
| src/index.js | 83-112 | listen, startup cleanup expired, bot start, audit |
| src/index.js | 114-125 | SIGTERM, SIGINT graceful shutdown |
| src/routes/api.js | 12-44 | GET /?key= validasi, increment, redirect 302 |
| src/routes/api.js | 47-72 | GET /api/validate JSON response |
| src/routes/api.js | 75-101 | GET /api/key validasi strict IP matching |
| src/routes/api.js | 104-124 | GET /api/exp masa aktif teks |
| src/routes/api.js | 127-168 | POST /api/register generate key, audit, duplikasi cek |
| src/routes/api.js | 171-187 | GET /api/stars prepared statements agregat |
| src/routes/api.js | 190-219 | GET /resources/* path traversal protection |
| src/database/init.js | 5-11 | DB_PATH, mkdir recursive |
| src/database/init.js | 15-17 | pragma WAL, foreign_keys ON |
| src/database/init.js | 20-58 | CREATE TABLE dan CREATE INDEX |
| src/database/init.js | 61-153 | ApiKey model |
| src/database/init.js | 155-185 | VpnAccount model |
| src/database/init.js | 187-192 | AuditLog model |
| src/bot/telegram.js | 8-13 | ALLOWED_USER_ID, isAuthorized |
| src/bot/telegram.js | 62-99 | sendPaginated |
| src/bot/telegram.js | 133-199 | setupHandlers callback_query |
| src/bot/telegram.js | 201-248 | /start, /help |
| src/bot/telegram.js | 250-259 | /register |
| src/bot/telegram.js | 261-284 | /renew |
| src/bot/telegram.js | 286-333 | /change |
| src/bot/telegram.js | 335-368 | /delete |
| src/bot/telegram.js | 370-389 | /key |
| src/bot/telegram.js | 391-410 | /list |
| src/bot/telegram.js | 412-433 | /revoke |
| src/bot/telegram.js | 435-457 | /stats |
| src/bot/telegram.js | 459-684 | message handler |
| src/utils/helpers.js | 2-10 | generateApiKey |
| src/utils/helpers.js | 12-18 | formatDate |
| src/utils/helpers.js | 20-22 | generateInstallCommand |
| src/utils/helpers.js | 24-27 | validateIp |
| src/utils/helpers.js | 29-31 | validateDays |
| src/utils/helpers.js | 33-36 | isAdmin |
| resources/bot/api.js | 9-16 | ansiRegex, stripAnsi |
| resources/bot/api.js | 18-33 | extractJson |
| resources/bot/api.js | 246-259 | checkPassword |
| resources/bot/api.js | 261-615 | create handlers vmess/vless/trojan/shadowsocks/ssh |
| resources/bot/api.js | 617-843 | check handlers |
| resources/bot/api.js | 845-1366 | delete dan renew handlers |
| resources/bot/api.js | 1368-1691 | trial handlers |
| resources/bot/api.js | 1693-1696 | port 5888 |
| resources/bot/app.js | 28-41 | bot, ADMIN, sqlite3, database |
| resources/bot/app.js | 44-54 | tabel Server |
| resources/bot/app.js | 60-80 | command menu/start/admin |
| resources/bot/app.js | 82-186 | sendMainMenu, handleServiceAction |
| resources/bot/app.js | 188-215 | sendAdminMenu |
| resources/bot/app.js | 321-357 | startSelectServer |
| resources/bot/app.js | 358-514 | action dan text input |
| resources/bot/app.js | 628-633 | bot.launch |
| deploy.sh | 20-24 | root check |
| deploy.sh | 26-52 | OS detect |
| deploy.sh | 115-122 | Node.js 20 |
| deploy.sh | 124-130 | PM2 |
| deploy.sh | 169-175 | PM2 start, save, startup |
| deploy.sh | 197-321 | Nginx + SSL |
| deploy.sh | 323-329 | crontab renewal |