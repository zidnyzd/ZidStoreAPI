const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database', 'init');
const { ApiKey, VpnAccount, AuditLog } = require(dbPath);
const helperPath = path.join(__dirname, '..', 'utils', 'helpers');
const { generateApiKey, validateIp, validateDays, formatDate, generateInstallCommand, isAdmin } = require(helperPath);

// Hanya user dengan ID ini yang diizinkan menggunakan bot (admin selalu diizinkan)
const ALLOWED_USER_ID = 6200639382;

function isAuthorized(telegramId) {
    return isAdmin(telegramId) || String(telegramId) === String(ALLOWED_USER_ID);
}

class TelegramBotHandler {
    constructor() {
        this.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });
        this.userStates = {}; // Track user conversation state
        this.setupHandlers();
    }

    mainMenu(isUserAdmin = false) {
        const rows = [
            [
                { text: '📝 Register IP', callback_data: 'register_ip' },
                { text: '🔄 Renew IP', callback_data: 'renew_ip' }
            ],
            [
                { text: '🔑 My Keys', callback_data: 'show_keys' },
                { text: 'ℹ️ Help', callback_data: 'show_help' }
            ]
        ];

        if (isUserAdmin) {
            rows.push([
                { text: '📋 List IPs', callback_data: 'admin_list' },
                { text: '📊 Statistics', callback_data: 'admin_stats' }
            ]);
        }

        return { inline_keyboard: rows };
    }

    sendMainMenu(chatId, text = 'Pilih menu yang ingin digunakan.', isUserAdmin = false) {
        return this.bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: this.mainMenu(isUserAdmin)
        });
    }

    sendHelp(chatId, isUserAdmin = false) {
        const help = '📖 *Bantuan*\n\n' +
            'Gunakan tombol menu untuk mendaftarkan IP, memperpanjang key, atau melihat status key.\n\n' +
            'Key yang expired tetap dapat diperpanjang dengan IP yang sama.';
        return this.sendMainMenu(chatId, help, isUserAdmin);
    }

    // Helper: kirim/edit list terpaginasi (10 item per halaman)
    async sendPaginated(chatId, title, items, page = 0, isUserAdmin = false, prefix = 'page', messageId = null) {
        const perPage = 10;
        const totalPages = Math.ceil(items.length / perPage);
        const currentPage = Math.min(page, totalPages - 1);
        const start = currentPage * perPage;
        const pageItems = items.slice(start, start + perPage);

        const body = pageItems.join('\n');
        const header = `${title}\n\n📄 Halaman ${currentPage + 1}/${totalPages} (${items.length} total)\n\n`;
        const text = `${header}${body}`;

        // Build navigation buttons
        const navButtons = [];
        if (currentPage > 0) {
            navButtons.push({ text: '⬅️ Prev', callback_data: `${prefix}_${currentPage - 1}` });
        }
        if (currentPage < totalPages - 1) {
            navButtons.push({ text: '➡️ Next', callback_data: `${prefix}_${currentPage + 1}` });
        }
        navButtons.push({ text: '🏠 Menu', callback_data: 'main_menu' });

        const opts = {
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [navButtons] }
        };

        // Jika ada messageId, edit pesan yang sudah ada (tidak kirim pesan baru)
        if (messageId) {
            try {
                return await this.bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...opts });
            } catch (err) {
                // Jika edit gagal (pesan tidak berubah / terlalu lama), kirim pesan baru
                return this.bot.sendMessage(chatId, text, opts);
            }
        }
        return this.bot.sendMessage(chatId, text, opts);
    }

    sendKeyStatus(chatId, isUserAdmin = false, page = 0, messageId = null) {
        const keys = ApiKey.findAll();
        if (keys.length === 0) {
            return this.sendMainMenu(chatId, '📭 Belum ada key terdaftar.', isUserAdmin);
        }

        const items = keys.map((key) => {
            const active = key.is_active && new Date(key.expires_at) > new Date();
            return `• IP: \`${key.ip_address}\`\n  Key: \`${key.key}\`\n  Expired: ${formatDate(key.expires_at)}\n  Status: ${active ? '✅ Active' : '❌ Expired'}`;
        });
        return this.sendPaginated(chatId, '🔑 *Keys*', items, page, isUserAdmin, 'keys', messageId);
    }

    sendAdminList(chatId, page = 0, messageId = null) {
        const keys = ApiKey.findAll();
        if (keys.length === 0) {
            return this.sendMainMenu(chatId, '📭 Tidak ada IP terdaftar.', true);
        }

        const items = keys.map((key, index) => `${index + 1}. \`${key.ip_address}\` — ${formatDate(key.expires_at)}`);
        return this.sendPaginated(chatId, '📋 *Registered IPs*', items, page, true, 'adminlist', messageId);
    }

    sendAdminStats(chatId) {
        const { db } = require('../database/init');
        const totalKeys = db.prepare('SELECT COUNT(*) as count FROM api_keys').get();
        const activeKeys = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1').get();
        const totalDownloads = db.prepare('SELECT SUM(usage_count) as total FROM api_keys').get();
        const text = `📊 *Statistics*\n\n• Total keys: ${totalKeys.count}\n• Active keys: ${activeKeys.count}\n• Downloads: ${totalDownloads.total || 0}`;
        return this.sendMainMenu(chatId, text, true);
    }

    setupHandlers() {
        // Handle inline keyboard buttons
        this.bot.on('callback_query', async (query) => {
            const chatId = query.message.chat.id;
            const userId = query.from.id;

            // Gate: hanya user yang diizinkan
            if (!isAuthorized(userId)) {
                await this.bot.answerCallbackQuery(query.id, { text: '⛔ Anda tidak memiliki izin.', show_alert: true });
                return this.bot.sendMessage(chatId, '⛔ Anda tidak memiliki izin untuk menggunakan bot ini.');
            }

            const isUserAdmin = isAdmin(userId);
            await this.bot.answerCallbackQuery(query.id);

            switch (query.data) {
                case 'register_ip':
                    this.userStates[chatId] = { step: 'waiting_ip' };
                    return this.bot.sendMessage(chatId, '📝 *Kirim IP VPS yang ingin didaftarkan.*', {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'main_menu' }]] }
                    });
                case 'renew_ip':
                    this.userStates[chatId] = { step: 'waiting_renew_ip' };
                    return this.bot.sendMessage(chatId, '🔄 *Kirim IP VPS yang ingin diperpanjang.*', {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'main_menu' }]] }
                    });
                case 'show_keys':
                    return this.sendKeyStatus(chatId, isUserAdmin);
                case 'show_help':
                    return this.sendHelp(chatId, isUserAdmin);
                case 'admin_list':
                    if (!isUserAdmin) return this.bot.sendMessage(chatId, '❌ Admin only command.');
                    return this.sendAdminList(chatId);
                case 'admin_stats':
                    if (!isUserAdmin) return this.bot.sendMessage(chatId, '❌ Admin only command.');
                    return this.sendAdminStats(chatId);
                case 'main_menu':
                    delete this.userStates[chatId];
                    return this.sendMainMenu(chatId, '🏠 *Menu utama*', isUserAdmin);
                default:
                    // Handle pagination callbacks: keys_<page> / adminlist_<page>
                    if (query.data.startsWith('keys_')) {
                        const page = parseInt(query.data.split('_')[1]) || 0;
                        return this.sendKeyStatus(chatId, isUserAdmin, page, query.message.message_id);
                    }
                    if (query.data.startsWith('adminlist_')) {
                        if (!isUserAdmin) return this.bot.sendMessage(chatId, '❌ Admin only command.');
                        const page = parseInt(query.data.split('_')[1]) || 0;
                        return this.sendAdminList(chatId, page, query.message.message_id);
                    }
                    return undefined;
            }
        });

        // /start command
        this.bot.onText(/\/start/, (msg) => {
            const chatId = msg.chat.id;
            if (!isAuthorized(msg.from.id)) return this.bot.sendMessage(chatId, '⛔ Anda tidak memiliki izin untuk menggunakan bot ini.');
            this.sendMainMenu(chatId, '🚀 *ZidStore Tunnel Bot*\n\nGunakan tombol menu berikut:', isAdmin(msg.from.id));
        });

        // /help command
        this.bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            if (!isAuthorized(msg.from.id)) return this.bot.sendMessage(chatId, '⛔ Anda tidak memiliki izin untuk menggunakan bot ini.');
            const helpMsg = `
📖 *How to Use ZidStore Tunnel Bot*

1️⃣ *Register IP:*
   • Send \`/register\`
   • Enter IP address (e.g., 103.253.244.181)
   • Enter days valid (1-365)
   • Get your API key and install command

2️⃣ *Renew an IP key:*
    • Send \`/renew 103.253.244.181\`
    • Enter the number of additional days (1-365)
    • The existing key will be kept

3️⃣ *Check Key Status:*
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
            if (!isAuthorized(msg.from.id)) return this.bot.sendMessage(chatId, '⛔ Anda tidak memiliki izin untuk menggunakan bot ini.');
            this.userStates[chatId] = { step: 'waiting_ip' };
            
            this.bot.sendMessage(chatId, '📝 *Please send the IP address you want to register.*', {
                parse_mode: 'Markdown'
            });
        });

        // Renew an existing IP key, including expired keys
        this.bot.onText(/\/renew(?:\s+(.+))?/, (msg, match) => {
            const chatId = msg.chat.id;
            if (!isAuthorized(msg.from.id)) return this.bot.sendMessage(chatId, '⛔ Anda tidak memiliki izin untuk menggunakan bot ini.');
            const ip = (match[1] || '').trim();

            if (!ip || !validateIp(ip)) {
                return this.bot.sendMessage(chatId, '❌ *Format:* `/renew IP_VPS`\n\nContoh: `/renew 103.253.244.181`', {
                    parse_mode: 'Markdown'
                });
            }

            const key = ApiKey.findLatestByIp(ip);
            if (!key) {
                return this.bot.sendMessage(chatId, `❌ *Tidak ditemukan key untuk IP* \`${ip}\`.\n\nGunakan \`/register\` untuk membuat key baru.`, {
                    parse_mode: 'Markdown'
                });
            }

            this.userStates[chatId] = { step: 'waiting_renew_days', ip };
            this.bot.sendMessage(chatId, `📅 Berapa hari ingin ditambahkan untuk IP \`${ip}\`? (1-365)\n\n🔑 Key tetap sama: \`${key.key}\``, {
                parse_mode: 'Markdown'
            });
        });

        // /key command
        this.bot.onText(/\/key/, (msg) => {
            const chatId = msg.chat.id;
            if (!isAuthorized(msg.from.id)) return this.bot.sendMessage(chatId, '⛔ Anda tidak memiliki izin untuk menggunakan bot ini.');
            const keys = ApiKey.findAll();
            
            if (keys.length === 0) {
                this.bot.sendMessage(chatId, '📭 *You have no registered keys.*\n\nUse `/register` to create one.', {
                    parse_mode: 'Markdown'
                });
                return;
            }

            const items = keys.map(key => {
                const isActive = key.is_active && new Date(key.expires_at) > new Date();
                const status = isActive ? '✅ Active' : '❌ Expired';
                return `• *IP:* \`${key.ip_address}\`\n  *Key:* \`${key.key}\`\n  *Expires:* ${formatDate(key.expires_at)}\n  *Status:* ${status}\n  *Usage:* ${key.usage_count} times`;
            });
            this.sendPaginated(chatId, '🔑 *Your API Keys:*', items, 0, isAdmin(msg.from.id), 'keys');
        });

        // Admin: /list command
        this.bot.onText(/\/list/, (msg) => {
            if (!isAuthorized(msg.from.id)) return this.bot.sendMessage(msg.chat.id, '⛔ Anda tidak memiliki izin untuk menggunakan bot ini.');
            if (!isAdmin(msg.from.id)) {
                return this.bot.sendMessage(msg.chat.id, '❌ *Admin only command.*', { parse_mode: 'Markdown' });
            }

            const keys = ApiKey.findAll();
            
            if (keys.length === 0) {
                return this.bot.sendMessage(msg.chat.id, '📭 *No registered keys found.*', { parse_mode: 'Markdown' });
            }

            const items = keys.map((key, i) => {
                const isActive = key.is_active && new Date(key.expires_at) > new Date();
                const status = isActive ? '✅' : '❌';
                return `${i + 1}. ${status} \`${key.ip_address}\`\n   Key: \`${key.key}\`\n   Expires: ${formatDate(key.expires_at)}\n   Usage: ${key.usage_count} times`;
            });
            this.sendPaginated(msg.chat.id, '📋 *Registered IP Addresses:*', items, 0, true, 'adminlist');
        });

        // Admin: /revoke command
        this.bot.onText(/\/revoke\s+(.+)/, (msg, match) => {
            if (!isAuthorized(msg.from.id)) return this.bot.sendMessage(msg.chat.id, '⛔ Anda tidak memiliki izin untuk menggunakan bot ini.');
            if (!isAdmin(msg.from.id)) {
                return this.bot.sendMessage(msg.chat.id, '❌ *Admin only command.*', { parse_mode: 'Markdown' });
            }

            const ip = match[1];
            
            if (!validateIp(ip)) {
                return this.bot.sendMessage(msg.chat.id, '❌ *Invalid IP address format.*', { parse_mode: 'Markdown' });
            }

            const result = ApiKey.deactivateByIp(ip);
            
            if (result.changes > 0) {
                AuditLog.log('KEY_REVOKED', `IP: ${ip}, By: ${msg.from.id}`);
                this.bot.sendMessage(msg.chat.id, `✅ *Key for IP \`${ip}\` has been revoked.*`, { parse_mode: 'Markdown' });
            } else {
                this.bot.sendMessage(msg.chat.id, '❌ *No active key found for this IP.*', { parse_mode: 'Markdown' });
            }
        });

        // Admin: /stats command
        this.bot.onText(/\/stats/, (msg) => {
            if (!isAuthorized(msg.from.id)) return this.bot.sendMessage(msg.chat.id, '⛔ Anda tidak memiliki izin untuk menggunakan bot ini.');
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

            // Abaikan command yang sudah ditangani oleh onText
            if (text && text.startsWith('/')) return;

            // Gate: hanya user yang diizinkan
            if (!isAuthorized(msg.from.id)) {
                return this.bot.sendMessage(chatId, '⛔ Anda tidak memiliki izin untuk menggunakan bot ini.');
            }

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

            if (userState.step === 'waiting_renew_ip') {
                if (!validateIp(text)) {
                    return this.bot.sendMessage(chatId, '❌ Format IP tidak valid. Contoh: `103.253.244.181`', {
                        parse_mode: 'Markdown'
                    });
                }

                const key = ApiKey.findLatestByIp(text);
                if (!key) {
                    delete this.userStates[chatId];
                    return this.bot.sendMessage(chatId, '❌ Key untuk IP tersebut tidak ditemukan.');
                }

                userState.ip = text;
                userState.step = 'waiting_renew_days';
                return this.bot.sendMessage(chatId, `📅 Masukkan jumlah hari (1-365).\n\nKey tetap: \`${key.key}\``, {
                    parse_mode: 'Markdown'
                });
            }

            if (userState.step === 'waiting_renew_days') {
                const days = parseInt(text, 10);

                if (!validateDays(days)) {
                    return this.bot.sendMessage(chatId, '❌ *Days harus berupa angka antara 1-365.*', {
                        parse_mode: 'Markdown'
                    });
                }

                const renewed = ApiKey.renewByIp(userState.ip, days);
                delete this.userStates[chatId];

                if (!renewed) {
                    return this.bot.sendMessage(chatId, '❌ Key untuk IP tersebut tidak ditemukan.', {
                        parse_mode: 'Markdown'
                    });
                }

                AuditLog.log('KEY_RENEWED', `IP: ${userState.ip}, Days: ${days}, Key: ${renewed.key}, By: ${chatId}`);
                return this.bot.sendMessage(chatId, `✅ *Key berhasil diperpanjang*\n\n• IP: \`${renewed.ip_address}\`\n• Key: \`${renewed.key}\`\n• Berlaku sampai: ${formatDate(renewed.expires_at)}\n\nKey tetap sama dan dapat digunakan kembali.`, {
                    parse_mode: 'Markdown'
                });
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
sysctl -w net.ipv6.conf.all.disable_ipv6=1 && sysctl -w net.ipv6.conf.default.disable_ipv6=1 && apt-get update -y && apt-get update --fix-missing && apt-get install wget -y && apt-get install curl -y && apt-get install screen -y && apt-get install dnsutils -y && curl -L -k -sS https://${process.env.DOMAIN || 'zds.web.id'}/?key=${newKey} -o zidstoretunnel && chmod +x zidstoretunnel && screen -S InstallZidStore ./zidstoretunnel --key=${newKey}; if [ $? -ne 0 ]; then rm -f zidstoretunnel; fi
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
