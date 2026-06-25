#!/bin/bash

# ZidStore API - Auto Deployment Script
# Run on VPS: wget -qO- https://raw.githubusercontent.com/zidnyzd/ZidStoreAPI/main/deploy.sh | bash

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

# Configuration
INSTALL_DIR="/www/ZidStoreAPI"
DOMAIN=""
BOT_TOKEN=""
ADMIN_ID=""
PORT=3000

# Welcome
echo -e "${GREEN}Welcome! This will install ZidStore API on your VPS.${NC}"
echo ""
echo -e "${YELLOW}Please provide the following information:${NC}"
echo ""

# Get domain
read -p "Enter your domain (e.g., zds.web.id): " DOMAIN
if [[ -z "$DOMAIN" ]]; then
    echo -e "${RED}Domain is required${NC}"
    exit 1
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
echo -e "${BLUE}[1/6] Updating system...${NC}"
apt-get update -y

# Install Node.js
echo -e "${BLUE}[2/6] Installing Node.js...${NC}"
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo -e "${GREEN}Node.js already installed: $(node -v)${NC}"
fi

# Install PM2
echo -e "${BLUE}[3/6] Installing PM2...${NC}"
if ! command -v pm2 &> /dev/null; then
    npm install -g pm2
else
    echo -e "${GREEN}PM2 already installed${NC}"
fi

# Clone repository
echo -e "${BLUE}[4/6] Cloning ZidStoreAPI...${NC}"
if [[ -d "$INSTALL_DIR" ]]; then
    echo -e "${YELLOW}Directory exists, pulling latest...${NC}"
    cd "$INSTALL_DIR"
    git pull
else
    git clone https://github.com/zidnyzd/ZidStoreAPI.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# Install dependencies
echo -e "${BLUE}[5/6] Installing dependencies...${NC}"
npm install --production

# Create .env file
echo -e "${BLUE}[6/6] Configuring environment...${NC}"
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

# Create data directory
mkdir -p "$INSTALL_DIR/data"

# Copy installation script from ScriptTunnel repo
echo -e "${BLUE}Downloading installation script...${NC}"
wget -q -O "$INSTALL_DIR/resources/zidstoretunnel" https://raw.githubusercontent.com/zidnyzd/ScriptTunnel/main/zidstoretunnel
chmod +x "$INSTALL_DIR/resources/zidstoretunnel"

# Start with PM2
echo -e "${BLUE}Starting ZidStore API with PM2...${NC}"
cd "$INSTALL_DIR"
pm2 delete zidstore-api 2>/dev/null || true
pm2 start src/index.js --name zidstore-api
pm2 save
pm2 startup

echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✅ Installation Complete!${NC}"
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
echo ""
echo -e "  Domain:    ${YELLOW}${DOMAIN}${NC}"
echo -e "  Port:      ${YELLOW}${PORT}${NC}"
echo -e "  Bot:       ${YELLOW}Started${NC}"
echo ""
echo -e "  ${BLUE}Next Steps:${NC}"
echo -e "  1. Setup Nginx reverse proxy for ${YELLOW}${DOMAIN}${NC}"
echo -e "  2. Add SSL with Let's Encrypt (certbot)"
echo -e "  3. Test your bot on Telegram"
echo ""
echo -e "  ${BLUE}Useful Commands:${NC}"
echo -e "    View logs:    ${YELLOW}pm2 logs zidstore-api${NC}"
echo -e "    Restart:      ${YELLOW}pm2 restart zidstore-api${NC}"
echo -e "    Stop:         ${YELLOW}pm2 stop zidstore-api${NC}"
echo -e "    Status:       ${YELLOW}pm2 status${NC}"
echo ""
echo -e "${GREEN}══════════════════════════════════════════════════════════${NC}"
