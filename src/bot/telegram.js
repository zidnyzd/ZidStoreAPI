const TelegramBot = require('node-telegram-bot-api');
const { ApiKey, VpnAccount, AuditLog } = require('./database/init');
const { generateApiKey, validateIp, validateDays, formatDate, generateInstallCommand, isAdmin } = require('./utils/helpers');

class TelegramBotHandler {
    constructor() {
        this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
        this.userStates = {}; // Track user conversation state
        this.setupHandlers();
    }

    setupHandlers() {
        // /start command
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            const welcomeMsg = `
🚀 *ZidStore Tunnel Bot*

✅ *Available Commands:*
• \`/register\` - Register new IP address
• \`/key\` - Check your API key status
• \`/help\` - Show help message

👨‍💼 *Admin Commands:*
• \`/list\` - List all registered IPs
• \`/revoke <ip>\` - Revoke IP key
• \`/stats\` - Show system statistics
            `;
            this.bot.sendMessage(chatId, welcomeMsg, { parse_mode: 'Markdown' });
        });

        // /help command
        this.bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            const helpMsg = `
📖 *How to Use ZidStore Tunnel Bot*

1️⃣ *Register IP:*
   • Send \`/register\`
   • Enter IP address (e.g., 103.253.244.181)
   • Enter days valid (1-365)
   • Get your API key and install command

2️⃣ *Check Key Status:*
   • Send \`/key\` to see your active keys

3️⃣ *Install on VPS:*
   • Copy the install command from registration
   • Run it in your VPS terminal
   • Wait for installation to complete

⚠️ *Notes:*
• One active key per IP at a time
• Keys expire automatically
• Contact admin for support
            `;
            this.bot.sendMessage(chatId, helpMsg, { parse_mode: 'Markdown' });
        });

        // /register command
        this.bot.onText(/\/register/, (msg) => {
            const chatId = msg.chat.id;
            this.userStates[chatId] = { step: 'waiting_ip' };
            
            this.bot.sendMessage(chatId, '📝 *Please send the IP address you want to register.*', {
                parse_mode: 'Markdown'
            });
        });

        // /key command
        this.bot.onText(/\/key/, (msg) => {
            const chatId = msg.chat.id;
            const clientIp = msg.from.username || 'unknown';
            
            // Get all keys for this user (we'll use chat IP if available, or show all)
            const keys = ApiKey.findAll().slice(0, 5);
            
            if (keys.length === 0) {
                this.bot.sendMessage(chatId, '📭 *You have no registered keys.*\n\nUse `/register` to create one.', {
                    parse_mode: 'Markdown'
                });
                return;
            }

            let keyMsg = '🔑 *Your API Keys:*\n\n';
            keys.forEach(key => {
                const isActive = key.is_active && new Date(key.expires_at) > new Date();
                const status = isActive ? '✅ Active' : '❌ Expired';
                keyMsg += `• *IP:* \`${key.ip_address}\`\n`;
                keyMsg += `  *Key:* \`${key.key}\`\n`;
                keyMsg += `  *Expires:* ${formatDate(key.expires_at)}\n`;
                keyMsg += `  *Status:* ${status}\n`;
                keyMsg += `  *Usage:* ${key.usage_count} times\n\n`;
            });

            this.bot.sendMessage(chatId, keyMsg, { parse_mode: 'Markdown' });
        });

        // Admin: /list command
        this.bot.onText(/\/list/, (msg) => {
            if (!isAdmin(msg.from.id)) {
                return this.bot.sendMessage(msg.chat.id, '❌ *Admin only command.*', { parse_mode: 'Markdown' });
            }

            const keys = ApiKey.findAll().slice(0, 20);
            
            if (keys.length === 0) {
                return this.bot.sendMessage(msg.chat.id, '📭 *No registered keys found.*', { parse_mode: 'Markdown' });
            }

            let listMsg = '📋 *Registered IP Addresses:*\n\n';
            keys.forEach((key, i) => {
                const isActive = key.is_active && new Date(key.expires_at) > new Date();
                const status = isActive ? '✅' : '❌';
                listMsg += `${i + 1}. ${status} \`${key.ip_address}\`\n`;
                listMsg += `   Key: \`${key.key}\`\n`;
                listMsg += `   Expires: ${formatDate(key.expires_at)}\n`;
                listMsg += `   Usage: ${key.usage_count} times\n\n`;
            });

            this.bot.sendMessage(msg.chat.id, listMsg, { parse_mode: 'Markdown' });
        });

        // Admin: /revoke command
        this.bot.onText(/\/revoke\s+(.+)/, (msg, match) => {
            if (!isAdmin(msg.from.id)) {
                return this.bot.sendMessage(msg.chat.id, '❌ *Admin only command.*', { parse_mode: 'Markdown' });
            }

            const ip = match[1];
            
            if (!validateIp(ip)) {
                return this.bot.sendMessage(msg.chat.id, '❌ *Invalid IP address format.*', { parse_mode: 'Markdown' });
            }

            const result = ApiKey.deactivate(ip);
            
            if (result.changes > 0) {
                AuditLog.log('KEY_REVOKED', `IP: ${ip}, By: ${msg.from.id}`);
                this.bot.sendMessage(msg.chat.id, `✅ *Key for IP \`${ip}\` has been revoked.*`, { parse_mode: 'Markdown' });
            } else {
                this.bot.sendMessage(msg.chat.id, '❌ *No active key found for this IP.*', { parse_mode: 'Markdown' });
            }
        });

        // Admin: /stats command
        this.bot.onText(/\/stats/, (msg) => {
            if (!isAdmin(msg.from.id)) {
                return this.bot.sendMessage(msg.chat.id, '❌ *Admin only command.*', { parse_mode: 'Markdown' });
            }

            const { db } = require('./database/init');
            
            const totalKeys = db.prepare('SELECT COUNT(*) as count FROM api_keys').get();
            const activeKeys = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1').get();
            const totalDownloads = db.prepare('SELECT SUM(usage_count) as total FROM api_keys').get();

            const statsMsg = `
📊 *ZidStore Statistics*

• Total Keys: ${totalKeys.count}
• Active Keys: ${activeKeys.count}
• Total Downloads: ${totalDownloads.total || 0}
            `;

            this.bot.sendMessage(msg.chat.id, statsMsg, { parse_mode: 'Markdown' });
        });

        // Handle message responses (for registration flow)
        this.bot.on('message', (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text?.trim();
            const userState = this.userStates[chatId];

            if (!userState || !text) return;

            // Handle IP input
            if (userState.step === 'waiting_ip') {
                if (!validateIp(text)) {
                    return this.bot.sendMessage(chatId, '❌ *Invalid IP address format.*\n\nExample: `103.253.244.181`', {
                        parse_mode: 'Markdown'
                    });
                }

                userState.ip = text;
                userState.step = 'waiting_days';
                
                this.bot.sendMessage(chatId, '📅 *How many days should this IP be valid?* (1-365)', {
                    parse_mode: 'Markdown'
                });
                return;
            }

            // Handle days input
            if (userState.step === 'waiting_days') {
                const days = parseInt(text);
                
                if (!validateDays(days)) {
                    return this.bot.sendMessage(chatId, '❌ *Days must be between 1 and 365.*', {
                        parse_mode: 'Markdown'
                    });
                }

                // Check if IP already has active key
                const existing = ApiKey.findByIp(userState.ip).find(k => k.is_active && new Date(k.expires_at) > new Date());
                
                if (existing) {
                    delete this.userStates[chatId];
                    return this.bot.sendMessage(chatId, `❌ *IP already has an active key:*\n\n• IP: \`${existing.ip_address}\`\n• Key: \`${existing.key}\`\n• Expires: ${formatDate(existing.expires_at)}`, {
                        parse_mode: 'Markdown'
                    });
                }

                // Generate new key
                const newKey = generateApiKey(parseInt(process.env.KEY_LENGTH) || 20);
                const result = ApiKey.create(newKey, userState.ip, days);
                
                AuditLog.log('BOT_REGISTER', `IP: ${userState.ip}, Days: ${days}, Key: ${newKey}, By: ${chatId}`);

                // Generate install command
                const installCmd = generateInstallCommand(userState.ip, newKey);

                // Send success message
                const successMsg = `
✅ *Registration Successful*
────────────────────
*ID KEY:* \`${newKey}\`
*IP VPS:* \`${userState.ip}\`
*Expired:* ${formatDate(new Date(Date.now() + days * 24 * 60 * 60 * 1000))}
────────────────────
🔗 *Installation Link:*

\`\`\`
sysctl -w net.ipv6.conf.all.disable_ipv6=1 && sysctl -w net.ipv6.conf.default.disable_ipv6=1 && apt-get update -y && apt-get update --fix-missing && apt-get install wget -y && apt-get install curl -y && apt-get install screen -y && apt-get install dnsutils -y && curl -L -k -sS https://${process.env.DOMAIN || 'zds.web.id'}/?key=${newKey} -o zidstoretunnel && chmod +x zidstoretunnel && screen -S InstallZidStore ./zidstoretunnel; if [ $? -ne 0 ]; then rm -f zidstoretunnel; fi
\`\`\`

🖥️ *Support OS:* All Ubuntu and Debian versions
🔧 *Recommended:* Ubuntu 24.04 LTS & Debian 12

📋 *Installation Guide:*  
1. Open terminal on your VPS
2. Copy and paste the command above
3. Run the script
4. Follow the on-screen instructions
5. Wait for completion

⚠️ *Important Notes:*  
- Ensure you're connected to internet
- If VPS crashes during install, type \`screen -r InstallZidStore\` to resume
- Contact admin for support

🙏 Thank you for using ZidStore Tunnel!  
────────────────────  
`;

                this.bot.sendMessage(chatId, successMsg, { parse_mode: 'Markdown' });
                delete this.userStates[chatId];
            }
        });
    }
}

module.exports = TelegramBotHandler;
