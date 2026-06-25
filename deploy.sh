#!/bin/bash

# ZidStore API - Auto Deployment Script
# Download & run: wget -O deploy.sh https://raw.githubusercontent.com/zidnyzd/ZidStoreAPI/main/deploy.sh && chmod +x deploy.sh && bash deploy.sh

set -e

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║         ZidStore API - Auto Deployment                   ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    echo -e "${RED}This script must be run as root${NC}"
    exit 1
fi

# Detect OS
if [[ -f /etc/os-release ]]; then
    . /etc/os-release
    OS_ID=$ID
    OS_VERSION=$VERSION_ID
    echo -e "${GREEN}Detected OS: $PRETTY_NAME${NC}"
else
    echo -e "${RED}Cannot detect OS${NC}"
    exit 1
fi

# Check Debian version support
if [[ "$OS_ID" == "debian" ]]; then
    if [[ "$OS_VERSION" -lt 11 ]]; then
        echo -e "${RED}Debian 11+ required. Current: $OS_VERSION${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Debian $OS_VERSION supported${NC}"
elif [[ "$OS_ID" == "ubuntu" ]]; then
    if [[ "$OS_VERSION" -lt 20 ]]; then
        echo -e "${RED}Ubuntu 20.04+ required. Current: $OS_VERSION${NC}"
        exit 1
    fi
    echo -e "${GREEN}✓ Ubuntu $OS_VERSION supported${NC}"
else
    echo -e "${YELLOW}Warning: Untested OS. Proceeding anyway...${NC}"
fi

# Configuration
INSTALL_DIR="/www/ZidStoreAPI"
DOMAIN=""
BOT_TOKEN=""
ADMIN_ID=""
PORT=3000
EMAIL=""

echo ""
echo -e "${YELLOW}Please provide the following information:${NC}"
echo ""

# Get domain
read -p "Enter your domain (e.g., zds.web.id): " DOMAIN
if [[ -z "$DOMAIN" ]]; then
    echo -e "${RED}Domain is required${NC}"
    exit 1
fi

# Get email for Let's Encrypt
read -p "Enter email for Let's Encrypt (e.g., admin@$DOMAIN): " EMAIL
if [[ -z "$EMAIL" ]]; then
    echo -e "${YELLOW}Using placeholder email (update later)${NC}"
    EMAIL="admin@$DOMAIN"
fi

# Get Telegram Bot Token
read -p "Enter Telegram Bot Token: " BOT_TOKEN
if [[ -z "$BOT_TOKEN" ]]; then
    echo -e "${RED}Bot token is required${NC}"
    exit 1
fi

# Get Admin ID
read -p "Enter your Telegram User ID (admin): " ADMIN_ID
if [[ -z "$ADMIN_ID" ]]; then
    echo -e "${RED}Admin ID is required${NC}"
    exit 1
fi

# Update system
echo ""
echo -e "${BLUE}[1/8] Updating system...${NC}"
apt-get update -y

# Install essential packages first (for minimal VPS installs)
echo -e "${BLUE}[2/8] Installing essential packages...${NC}"
ESSENTIAL_PKGS="git curl wget screen dnsutils ca-certificates gnupg lsb-release"
MISSING_PKGS=""
for pkg in $ESSENTIAL_PKGS; do
    if ! dpkg -s "$pkg" &>/dev/null; then
        MISSING_PKGS="$MISSING_PKGS $pkg"
    fi
done
if [[ -n "$MISSING_PKGS" ]]; then
    apt-get install -y $MISSING_PKGS
    echo -e "${GREEN}Installed: $MISSING_PKGS${NC}"
else
    echo -e "${GREEN}All essential packages already installed${NC}"
fi

# Install Node.js
echo -e "${BLUE}[3/8] Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo -e "${GREEN}Node.js already installed: $(node -v)${NC}"
fi

# Install PM2
echo -e "${BLUE}[4/8] Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
else
    echo -e "${GREEN}PM2 already installed${NC}"
fi

# Clone repository
echo -e "${BLUE}[5/8] Cloning ZidStoreAPI...${NC}"
if [[ -d "$INSTALL_DIR" ]]; then
    echo -e "${YELLOW}Directory exists, pulling latest...${NC}"
    cd "$INSTALL_DIR"
    git pull
else
    git clone https://github.com/zidnyzd/ZidStoreAPI.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies
echo -e "${BLUE}[6/8] Installing dependencies...${NC}"
cd "$INSTALL_DIR"
npm install --production

# Create .env file
echo -e "${BLUE}[7/8] Configuring environment...${NC}"
mkdir -p "$INSTALL_DIR/data"

cat > "$INSTALL_DIR/.env" <<EOF
PORT=${PORT}
NODE_ENV=production
DOMAIN=${DOMAIN}
TELEGRAM_BOT_TOKEN=${BOT_TOKEN}
TELEGRAM_ADMIN_ID=${ADMIN_ID}
DB_PATH=./data/zidstore.db
KEY_LENGTH=20
KEY_PREFIX=zs
EOF

# Copy installation script from ScriptTunnel repo
echo -e "${BLUE}Downloading installation script...${NC}"
mkdir -p "$INSTALL_DIR/resources"
wget -q -O "$INSTALL_DIR/resources/zidstoretunnel" https://raw.githubusercontent.com/zidnyzd/ScriptTunnel/main/zidstoretunnel
chmod +x "$INSTALL_DIR/resources/zidstoretunnel"

# Start with PM2
echo -e "${BLUE}[8/8] Starting ZidStore API with PM2...${NC}"
pm2 delete zidstore-api 2>/dev/null || true
pm2 start src/index.js --name zidstore-api
pm2 save
pm2 startup

# Setup Nginx + SSL
echo -e "${BLUE}[9/8] Setting up Nginx reverse proxy + SSL...${NC}"

# Install Nginx
if ! command -v nginx &> /dev/null; then
    apt-get install -y nginx
    echo -e "${GREEN}Nginx installed${NC}"
else
    echo -e "${GREEN}Nginx already installed${NC}"
fi

# Install certbot
if ! command -v certbot &> /dev/null; then
    apt-get install -y certbot
    echo -e "${GREEN}Certbot installed${NC}"
else
    echo -e "${GREEN}Certbot already installed${NC}"
fi

# Create Nginx config (HTTP only first, for certbot validation)
echo -e "${BLUE}Creating Nginx configuration...${NC}"
cat > /etc/nginx/sites-available/zidstore-api <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # For Let's Encrypt validation
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }
}
EOF

# Enable site
ln -sf /etc/nginx/sites-available/zidstore-api /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

# Create certbot directory
mkdir -p /var/www/certbot

# Test Nginx config
nginx -t

# Start Nginx
systemctl start nginx
systemctl enable nginx

# Get SSL certificate (skip if already exists)
if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    echo -e "${GREEN}SSL certificate already exists for ${DOMAIN}${NC}"
else
    echo -e "${BLUE}Requesting SSL certificate from Let's Encrypt...${NC}"
    
    # Use standalone mode (stop nginx temporarily)
    systemctl stop nginx 2>/dev/null || true
    certbot certonly --standalone -d ${DOMAIN} --email ${EMAIL} --agree-tos --non-interactive || {
        echo -e "${RED}SSL certificate request failed. Domain may not be pointing to this server.${NC}"
        echo -e "${YELLOW}Please ensure DNS A record for ${DOMAIN} points to this VPS IP${NC}"
        echo -e "${YELLOW}You can try again later with: certbot certonly --standalone -d ${DOMAIN}${NC}"
        echo -e "${YELLOW}Continuing with HTTP-only setup...${NC}"
    }
    systemctl start nginx 2>/dev/null || true
fi

# Update Nginx config with HTTPS if SSL cert exists
if [[ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]]; then
    echo -e "${BLUE}Updating Nginx config with HTTPS...${NC}"
    cat > /etc/nginx/sites-available/zidstore-api <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    # For Let's Encrypt renewal
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Redirect HTTP to HTTPS
    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${DOMAIN};

    # SSL certificates
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    # SSL settings
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256:ECDHE-ECDSA-AES256-GCM-SHA384:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-ECDSA-CHACHA20-POLY1305:ECDHE-RSA-CHACHA20-POLY1305:DHE-RSA-AES128-GCM-SHA256:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;

    # Reverse proxy to Node.js
    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 86400;
        proxy_send_timeout 86400;
    }

    # Block access to sensitive files
    location ~ /\. {
        deny all;
        access_log off;
        log_not_found off;
    }
}
EOF
fi

# Setup auto-renewal (only if not already set)
if ! crontab -l 2>/dev/null | grep -q "certbot renew"; then
    echo -e "${BLUE}Setting up certificate auto-renewal...${NC}"
    (crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet && systemctl reload nginx") | crontab -
else
    echo -e "${GREEN}Auto-renewal already configured${NC}"
fi

# Reload Nginx to apply SSL
nginx -t && systemctl reload nginx

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Installation Complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Domain:    ${YELLOW}https://${DOMAIN}${NC}"
echo -e "  Port:      ${YELLOW}${PORT} (internal)${NC}"
echo -e "  SSL:       ${YELLOW}Active (Let's Encrypt)${NC}"
echo -e "  Bot:       ${YELLOW}Started${NC}"
echo ""
echo -e "  ${BLUE}Test Your Setup:${NC}"
echo -e "    API Health:  ${YELLOW}curl https://${DOMAIN}/health${NC}"
echo -e "    Telegram:    Send /start to your bot${NC}"
echo ""
echo -e "  ${BLUE}Useful Commands:${NC}"
echo -e "    View logs:     ${YELLOW}pm2 logs zidstore-api${NC}"
echo -e "    Restart API:   ${YELLOW}pm2 restart zidstore-api${NC}"
echo -e "    Nginx status:  ${YELLOW}systemctl status nginx${NC}"
echo -e "    Cert status:   ${YELLOW}certbot certificates${NC}"
echo ""
echo -e "  ${BLUE}Auto-Renewal:${NC}"
echo -e "    SSL cert auto-renews daily at 3:00 AM"
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"

