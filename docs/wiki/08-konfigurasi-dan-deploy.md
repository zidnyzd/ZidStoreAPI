# 08. Konfigurasi dan Deploy

Bagian ini membahas variabel lingkungan dan alur deployment otomatis.

## Variabel Lingkungan

Template .env.example berada di root (baris 1-23).

| Variabel | Default | Wajib | Fungsi |
|----------|---------|-------|--------|
| PORT | 3000 | Tidak | Port Express |
| NODE_ENV | production | Tidak | Mode runtime |
| DOMAIN | zds.web.id | Ya | Domain HTTPS untuk endpoint |
| TELEGRAM_BOT_TOKEN | your_telegram_bot_token_here | Ya | Token bot operator |
| TELEGRAM_ADMIN_ID | your_telegram_user_id_here | Ya | ID admin Telegram, koma jika banyak |
| DB_PATH | ./data/zidstore.db | Tidak | Path SQLite |
| KEY_LENGTH | 20 | Tidak | Panjang karakter kunci |
| KEY_PREFIX | zs | Tidak | Prefiks kunci |
| SCRIPT_PATH | ./resources/zidstoretunnel | Tidak | Path skrip instalasi |
| SCRIPT_BRANCH | main | Tidak | Branch GitHub |
| SCRIPT_REPO | zidnyzd/ScriptTunnel | Tidak | Repositori skrip |

Ekstensi domain tidak diperbolehkan selain zidstore.net untuk domain resmi (pastikan .env menggunakan domain yang sesuai).

## File .env Riil

deploy.sh membuat .env di install directory dengan ini (deploy.sh:152-161):

```
PORT=3000
NODE_ENV=production
DOMAIN=<domain>
TELEGRAM_BOT_TOKEN=<token>
TELEGRAM_ADMIN_ID=<admin>
DB_PATH=./data/zidstore.db
KEY_LENGTH=20
KEY_PREFIX=zs
```

Nilai tersebut mengganti .env.example. Pastikan .env riil tidak di-commit ke repositori.

## Alur deploy.sh Satu Perintah

Skrip bash di root (deploy.sh). Eksekusi: `bash deploy.sh` setelah wget.

### 1. Prasyarat

- Hanya root (deploy.sh:21-24).
- OS Debian 11+ atau Ubuntu 20.04+ (deploy.sh:26-52).
- Input domain, email, bot token, admin ID (deploy.sh:66-92).

### 2. Update dan Paket Instalasi

- apt-get update (deploy.sh:97).
- Install git curl wget screen dnsutils ca-certificates gnupg lsb-release (deploy.sh:99-113).

### 3. Node.js 20

- curl -fsSL https://deb.nodesource.com/setup_20.x | bash - (deploy.sh:118).
- apt-get install -y nodejs (deploy.sh:119).
- Muat Node.js versi exsisting (deploy.sh:121).

### 4. PM2

- npm install -g pm2 (deploy.sh:127). Install hanya jika pm2 belum ada.

### 5. Clone Repositori

- Install directory /www/ZidStoreAPI (deploy.sh:55, 134-141).
- Jika sudah ada, git pull. Jika belum, git clone https://github.com/zidnyzd/ZidStoreAPI.git /www/ZidStoreAPI.

### 6. npm install --production

- Deploy di mode production (deploy.sh:146).

### 7. Konfigurasi Environment

- mkdir -p $INSTALL_DIR/data (deploy.sh:150).
- Tulis .env dengan heredoc (deploy.sh:152-161).

### 8. PM2 Start

- pm2 delete zidstore-api (deploy.sh:165).
- pm2 start src/index.js --name zidstore-api (deploy.sh:166).
- pm2 save (deploy.sh:167).
- pm2 startup (deploy.sh:168).

### 9. Nginx dan SSL

- Install nginx jika belum ada (deploy.sh:174-179).
- Install certbot jika belum ada (deploy.sh:181-187).
- Buat konfigurasi /etc/nginx/sites-available/zidstore-api (deploy.sh:189-216).
- Link situs ke sites-enabled (deploy.sh:218-220).
- mkdir /var/www/certbot (deploy.sh:222-223).
- nginx -t (deploy.sh:226).
- systemctl start nginx, enable (deploy.sh:228-230).
- Jika HTTPS belum ada, request certificate via certbot certonly --standalone (deploy.sh:232-248).
- Update konfigurasi HTTPS otomatis: HTTP redirect, server 443 ssl http2, SSL cert, security headers (deploy.sh:251-315).
- Block access to sensitive files (deploy.sh:307-312).

### 10. Auto-Renewal

- Pastikan crontab berisi certbot renew (deploy.sh:317-323).
- Schedule: 0 3 * * * certbot renew --quiet && systemctl reload nginx (deploy.sh:320).

### 11. Verifikasi

- pm2 logs zidstore-api (deploy.sh:343).
- pm2 restart zidstore-api (deploy.sh:350).
- systemctl status nginx (deploy.sh:351).
- certbot certificates (deploy.sh:352).

## Manajemen Lifecycle Proses via PM2

Penggunaan yang direkomendasikan dari deploy.sh:

- pm2 start src/index.js --name zidstore-api (deploy.sh:166).
- pm2 save (deploy.sh:167).
- pm2 startup (deploy.sh:168).
- pm2 delete zidstore-api (deploy.sh:165).
- pm2 logs zidstore-api (deploy.sh:343).
- pm2 restart zidstore-api (deploy.sh:350).

PM2 menjalankan src/index.js sebagai daemon. Karena index.js memanggil process.on SIGTERM dan SIGINT untuk audit log dan exit, PM2 dapat melakukan graceful shutdown (126-137).

## Rujukan Berkas:baris

| Berkas | Baris | Rujukan |
|--------|-------|---------|
| .env.example | 1-23 | Variabel lingkungan |
| deploy.sh | 21-24 | Root check |
| deploy.sh | 26-52 | Deteksi OS |
| deploy.sh | 55 | INSTALL_DIR |
| deploy.sh | 66-92 | Input user |
| deploy.sh | 97 | apt-get update |
| deploy.sh | 101 | Essential packages |
| deploy.sh | 118-119 | NodeSource 20 |
| deploy.sh | 127 | PM2 global |
| deploy.sh | 134-141 | Clone repository |
| deploy.sh | 146 | npm install production |
| deploy.sh | 150 | mkdir data |
| deploy.sh | 152-161 | .env heredoc |
| deploy.sh | 95-96 | Cek paket yang hilang |
| deploy.sh | 165-168 | PM2 delete, start, save, startup |
| deploy.sh | 174-179 | Nginx |
| deploy.sh | 181-187 | Certbot |
| deploy.sh | 189-216 | Nginx HTTP config |
| deploy.sh | 218-220 | Enable site |
| deploy.sh | 222-223 | Certbot directory |
| deploy.sh | 226 | nginx -t |
| deploy.sh | 228-230 | Start nginx |
| deploy.sh | 232-248 | Let's Encrypt standalone |
| deploy.sh | 251-315 | Nginx HTTPS config |
| deploy.sh | 307-312 | Block sensitive files |
| deploy.sh | 317-323 | Crontab renewal |
| deploy.sh | 328-352 | Ringkasan akhir |
| src/index.js | 126-137 | Graceful shutdown |
| src/routes/api.js | 492-521 | Resources static |
