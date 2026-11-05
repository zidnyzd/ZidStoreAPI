require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');
const { ApiKey, AuditLog, InstallLog } = require('./database/init');

// Initialize routes
const apiRoutes = require('./routes/api');

// Initialize Telegram Bot
const TelegramBotHandler = require('./bot/telegram');
let botInstance = null;

// Create Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Trust nginx reverse proxy so req.ip reflects real client IP
app.set('trust proxy', 1);

// Rate limiters
const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
});

const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many API requests, please try again later.' },
});

// Middleware
app.use(cors());
// --- R28 JSON-RESCUE BEGIN ---
app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));
app.use((err, req, res, next) => {
    if (err && err.type === 'entity.parse.failed' && req.rawBody) {
        try {
            const cleaned = req.rawBody.toString('utf8').replace(/[\u0000-\u001F]/g, ' ');
            req.body = JSON.parse(cleaned);
            return next();
        } catch (e) { /* jatuh ke handler error umum */ }
    }
    if (err && err.type === 'entity.parse.failed') {
        AuditLog.log('SERVER_ERROR', 'invalid_json: ' + err.message, req.ip);
        return res.status(400).json({ error: 'invalid_json' });
    }
    return next(err);
});
// --- R28 JSON-RESCUE END ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(generalLimiter);
app.use('/api', apiLimiter);

// Log requests
app.use((req, res, next) => {
    const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
    const ts = now.toISOString().replace('T', ' ').substring(0, 19) + ' WIB';
    console.log(`${ts} ${req.method} ${req.url} - ${req.ip}`);
    next();
});

// Serve script file directly when accessing root with ?key=
app.use('/', apiRoutes);

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        version: '1.0.0'
    });
});

// Serve static files (for web dashboard if needed)
app.use(express.static(path.join(__dirname, '../public')));

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    AuditLog.log('SERVER_ERROR', err.message, req.ip);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔══════════════════════════════════════════════════════════╗
║              ZidStore API Server                         ║
╠══════════════════════════════════════════════════════════╣
║  Domain:   ${process.env.DOMAIN || 'zds.web.id'}${' '.repeat(Math.max(0, 40 - (process.env.DOMAIN || 'zds.web.id').length))}║
║  Port:     ${PORT}${' '.repeat(46 - String(PORT).length)}║
║  Env:      ${process.env.NODE_ENV || 'development'}${' '.repeat(43 - (process.env.NODE_ENV || 'development').length)}║
╚══════════════════════════════════════════════════════════╝
    `);

    // Clean up expired keys on startup
    const { deactivated } = ApiKey.deactivateExpired();
    console.log(`Cleaned up ${deactivated} expired keys`);

    // Prune install logs every 24 hours (default retention 30 days)
    setInterval(() => {
        try {
            const result = InstallLog.prune(30);
            if (result && result.changes > 0) {
                console.log(`Pruned ${result.changes} install log entries older than 30 days`);
            }
        } catch (err) {
            console.error('Install log pruning failed:', err.message);
        }
    }, 24 * 60 * 60 * 1000);

    // Start Telegram Bot
    if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here') {
        try {
            botInstance = new TelegramBotHandler();
            console.log('✅ Telegram Bot started');
        } catch (error) {
            console.error('❌ Failed to start Telegram Bot:', error.message);
        }
    } else {
        console.log('⚠️  Telegram Bot not configured (set TELEGRAM_BOT_TOKEN in .env)');
    }

    AuditLog.log('SERVER_START', `Port: ${PORT}, Domain: ${process.env.DOMAIN || 'zds.web.id'}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    AuditLog.log('SERVER_STOP', 'SIGTERM received');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received. Shutting down gracefully...');
    AuditLog.log('SERVER_STOP', 'SIGINT received');
    process.exit(0);
});

module.exports = app;
