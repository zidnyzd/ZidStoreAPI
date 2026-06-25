# ZidStore API

VPN Tunnel Server Management API with Telegram Bot Integration

## Features

- 🔑 Generate unique API keys per IP address
- 📱 Telegram Bot for IP registration
- 🛡️ Key validation with IP matching
- 📊 Usage tracking and statistics
- ⏰ Automatic key expiration
- 🔒 Secure script delivery
- 📝 Complete audit logging

## Quick Start

### Option 1: One-Click Deploy (Recommended)
```bash
wget -qO- https://raw.githubusercontent.com/zidnyzd/ZidStoreAPI/main/deploy.sh | bash
```
This will auto-install everything: Node.js, PM2, Nginx, SSL, and configure the bot.

### Option 2: Manual Install
1. **Install dependencies:**
```bash
npm install
```

2. **Configure environment:**
```bash
cp .env.example .env
# Edit .env with your values
```

3. **Initialize database:**
```bash
npm run db:init
```

4. **Start server:**
```bash
# Development
npm run dev

# Production
npm start

# With PM2
npm run pm2:start
```

## Deployment

### Prerequisites
- VPS with Ubuntu 20.04+ or Debian 11+ (including Debian 13)
- Domain pointing to VPS IP (e.g., `zds.web.id`)
- Telegram Bot Token from [@BotFather](https://t.me/BotFather)
- Your Telegram User ID (check via [@userinfobot](https://t.me/userinfobot))

### One-Command Deploy
```bash
wget -qO- https://raw.githubusercontent.com/zidnyzd/ZidStoreAPI/main/deploy.sh | bash
```

The script will ask for:
1. **Domain** - Your server domain (e.g., `zds.web.id`)
2. **Email** - For Let's Encrypt SSL certificate
3. **Telegram Bot Token** - From @BotFather
4. **Telegram Admin ID** - Your user ID for admin access

### What Gets Installed
- ✅ Node.js 20 LTS
- ✅ PM2 (process manager)
- ✅ Nginx (reverse proxy)
- ✅ Let's Encrypt SSL (auto-renew daily)
- ✅ ZidStore API + Telegram Bot
- ✅ Auto-start on boot

### Manual Deploy

1. **Clone & Install:**
```bash
git clone https://github.com/zidnyzd/ZidStoreAPI.git /www/ZidStoreAPI
cd /www/ZidStoreAPI
npm install --production
```

2. **Configure:**
```bash
cp .env.example .env
# Edit .env with your values
```

3. **Download installation script:**
```bash
mkdir -p resources
wget -O resources/zidstoretunnel https://raw.githubusercontent.com/zidnyzd/ScriptTunnel/main/zidstoretunnel
```

4. **Start with PM2:**
```bash
pm2 start src/index.js --name zidstore-api
pm2 save
pm2 startup
```

5. **Setup Nginx (optional):**
```bash
# See deploy.sh for full Nginx + SSL setup
```

### Nginx Config Example
```nginx
server {
    listen 80;
    server_name zds.web.id;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name zds.web.id;

    ssl_certificate /etc/letsencrypt/live/zds.web.id/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/zds.web.id/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## API Endpoints

### Download Script
```
GET /?key=YOUR_API_KEY
```
Returns the installation script if key is valid and IP matches.

### Validate Key
```
GET /api/validate?key=YOUR_API_KEY
```
Returns:
```json
{
  "valid": true,
  "ip": "103.253.244.181",
  "expires_at": "2026-07-05T00:00:00.000Z",
  "days_left": 10
}
```

### Register New IP (used by bot)
```
POST /api/register
Body: { "ip": "103.253.244.181", "days": 30 }
```

### Get Statistics
```
GET /api/stats
```

## Telegram Bot Commands

| Command | Description | Access |
|---------|-------------|--------|
| `/start` | Welcome message | All |
| `/register` | Register new IP | All |
| `/key` | Check key status | All |
| `/help` | Help message | All |
| `/list` | List all IPs | Admin |
| `/revoke <ip>` | Revoke IP key | Admin |
| `/stats` | System statistics | Admin |

## Project Structure

```
ZidStoreAPI/
├── src/
│   ├── index.js          # Main server entry
│   ├── database/
│   │   └── init.js       # Database setup & models
│   ├── routes/
│   │   └── api.js        # API routes
│   ├── bot/
│   │   └── telegram.js   # Telegram bot handler
│   └── utils/
│       └── helpers.js    # Utility functions
├── resources/
│   └── zidstoretunnel    # Installation script
├── data/
│   └── zidstore.db       # SQLite database (auto-created)
├── .env                  # Environment variables
├── .env.example          # Example environment
├── package.json
└── README.md
```

## Deployment

### Using PM2

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
npm run pm2:start

# View logs
npm run pm2:logs

# Restart after update
npm run pm2:restart
```

### Nginx Reverse Proxy

```nginx
server {
    listen 80;
    server_name zds.web.id;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL with Let's Encrypt

```bash
sudo certbot --nginx -d zds.web.id
```

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `NODE_ENV` | Environment (development/production) | No |
| `DOMAIN` | Server domain | Yes |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token | Yes |
| `TELEGRAM_ADMIN_ID` | Admin Telegram user ID(s) | Yes |
| `DB_PATH` | SQLite database path | No |
| `KEY_LENGTH` | API key length (default: 20) | No |
| `KEY_PREFIX` | API key prefix (default: zs) | No |

## License

MIT © ZidStore
