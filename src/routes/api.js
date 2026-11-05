const express = require('express');
const fs = require('fs');
const path = require('path');
const dgram = require('dgram');
const crypto = require('crypto');
const TelegramBot = require('node-telegram-bot-api');
const dbPath = path.join(__dirname, '..', 'database', 'init');
const { ApiKey, AuditLog, InstallLog, SlowdnsDomain } = require(dbPath);
const helperPath = path.join(__dirname, '..', 'utils', 'helpers');
const { generateInstallCommand, maskKey } = require(helperPath);
const { validateCustomKey, validateIp } = require('../utils/helpers');
const dnsCfPath = path.join(__dirname, '..', 'utils', 'dnstt-cf');
const dnsCf = require(dnsCfPath);

const failNotify = {};

const router = express.Router();

const installLogLimiter = new Map();

function rateLimitInstallLog(keyId) {
    const now = Date.now();
    const windowMs = 2000;
    const maxRequests = 5;

    const entry = installLogLimiter.get(keyId) || { tokens: maxRequests, lastRefill: now };
    const elapsed = now - entry.lastRefill;
    if (elapsed > 0) {
        const refill = (elapsed / 1000) * 0.5;
        entry.tokens = Math.min(maxRequests, entry.tokens + refill);
        entry.lastRefill = now;
    }

    if (entry.tokens >= 1) {
        entry.tokens -= 1;
        installLogLimiter.set(keyId, entry);
        return { allowed: true };
    }

    installLogLimiter.set(keyId, entry);
    return { allowed: false, retryAfter: 2 };
}

// POST /api/install-logs - Receive installer telemetry events
router.post('/api/install-logs', (req, res) => {
    const key = req.query.key || req.get('X-API-Key');
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!key) {
        return res.status(400).json({ error: 'missing_key' });
    }

    const apiKey = ApiKey.findByKey(key);
    if (!apiKey) {
        return res.status(403).json({ error: 'invalid_key' });
    }

    if (new Date(apiKey.expires_at) < new Date()) {
        return res.status(403).json({ error: 'key_expired' });
    }

    if (apiKey.ip_address && apiKey.ip_address !== clientIp) {
        return res.status(403).json({ error: 'ip_mismatch' });
    }

    const body = req.body || {};

    if (typeof body.install_id !== 'string' || !/^[A-Za-z0-9_-]{8,64}$/.test(body.install_id)) {
        return res.status(400).json({ error: 'invalid_install_id' });
    }
    if (typeof body.event !== 'string' || body.event.length < 3 || body.event.length > 50) {
        return res.status(400).json({ error: 'invalid_event' });
    }
    if (!['success', 'failed', 'running'].includes(body.status)) {
        return res.status(400).json({ error: 'invalid_status' });
    }
    if (body.timestamp && typeof body.timestamp !== 'string') {
        return res.status(400).json({ error: 'invalid_timestamp' });
    }
    if (body.timestamp && typeof body.timestamp === 'string') {
        const ts = Date.parse(body.timestamp);
        if (isNaN(ts)) {
            return res.status(400).json({ error: 'invalid_timestamp' });
        }
    }

    const limitResult = rateLimitInstallLog(apiKey.id);
    if (!limitResult.allowed) {
        return res.status(429).json({ error: 'rate_limit', retry_after: limitResult.retryAfter });
    }

    const KNOWN_FIELDS = ['install_id','event','status','step','script_version','domain','ip','os','os_version','arch','timestamp','payload'];
    const extra = {};
    for (const k of Object.keys(body)) {
        if (KNOWN_FIELDS.includes(k)) continue;
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
        extra[k] = body[k];
    }

    const payloadSource = (typeof body.payload === 'object' && body.payload !== null)
        ? body.payload
        : (Object.keys(extra).length > 0 ? extra : null);

    let payloadData = payloadSource;
    // capture installer extras (top-level fields) into payload
    if (payloadData) {
        const payloadJson = JSON.stringify(payloadData);
        if (payloadJson.length > 4096) {
            payloadData = { truncated: payloadJson.slice(0, 4000) };
        }
    }

    const payload = {
        install_id: body.install_id,
        event: body.event.slice(0, 50),
        status: body.status,
        step: typeof body.step === 'string' ? body.step.slice(0, 64) : null,
        script_version: typeof body.script_version === 'string' ? body.script_version.slice(0, 32) : null,
        domain: typeof body.domain === 'string' ? body.domain.slice(0, 128) : null,
        ip: typeof body.ip === 'string' ? body.ip.slice(0, 64) : null,
        os: typeof body.os === 'string' ? body.os.slice(0, 64) : null,
        os_version: typeof body.os_version === 'string' ? body.os_version.slice(0, 64) : null,
        arch: typeof body.arch === 'string' ? body.arch.slice(0, 64) : null,
        payload: payloadData
    };

    try {
        InstallLog.log(payload);
    } catch (err) {
        console.error('Failed to write install log', err);
        return res.status(500).json({ error: 'internal_error' });
    }

    if (body.status === 'failed' && process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_BOT_TOKEN !== 'your_telegram_bot_token_here') {
        try {
            const { TELEGRAM_ADMIN_ID } = process.env;
            const adminIds = TELEGRAM_ADMIN_ID ? TELEGRAM_ADMIN_ID.split(',').map(id => id.trim()) : [];
            if (adminIds.length > 0) {
                if (!failNotify.bot) {
                    failNotify.bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });
                }
                const failedMsg = [
                    `\u26a0\ufe0f *Installation Failed*`,
                    ``,
                    `IP: \`${payload.ip || '-'}\``,
                    `Domain: \`${payload.domain || '-'}\``,
                    `Event: \`${payload.event}\``,
                    `Step: \`${payload.step || '-'}\``,
                    `Time: \`${body.timestamp || new Date().toISOString()}\``
                ].join('\n');
                adminIds.forEach(chatId => {
                    failNotify.bot.sendMessage(chatId, failedMsg, { parse_mode: 'Markdown' }).catch(() => {});
                });
            }
        } catch (err) {
            // fire-and-forget: never break the telemetry response
        }
    }

    return res.json({ ok: true });
});

// GET /?key=XXXXX - Download script with key validation
router.get('/', (req, res) => {
    const { key } = req.query;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!key) {
        return res.status(400).send('Error: Missing key parameter. Usage: /?key=YOUR_KEY');
    }

    // Validate key exists and is active
    const apiKey = ApiKey.findByKey(key);
    
    if (!apiKey) {
        AuditLog.log('INVALID_KEY', `Key: ${maskKey(key)}, IP: ${clientIp}`, clientIp);
        return res.status(403).send('Error: Invalid or expired key. Please contact administrator.');
    }

    // Check expiration
    if (new Date(apiKey.expires_at) < new Date()) {
        ApiKey.deactivate(key);
        AuditLog.log('EXPIRED_KEY', `Key: ${maskKey(key)}, IP: ${apiKey.ip_address}`, clientIp);
        return res.status(403).send('Error: Key has expired. Please register a new key.');
    }

    // Increment usage counter
    ApiKey.incrementUsage(key);

    // Log successful access
    AuditLog.log('SCRIPT_DOWNLOAD', `Key: ${maskKey(key)}, Registered IP: ${apiKey.ip_address}`, clientIp);

    // Redirect to GitHub raw URL for always-latest script
    const githubUrl = 'https://raw.githubusercontent.com/zidnyzd/ScriptTunnel/main/zidstoretunnel';
    res.redirect(302, githubUrl);
});

// GET /api/validate - Validate key (returns JSON, used by dashboard/admin)
router.get('/api/validate', (req, res) => {
    const { key } = req.query;

    if (!key) {
        return res.json({ valid: false, message: 'Missing key parameter' });
    }

    const apiKey = ApiKey.findByKey(key);
    
    if (!apiKey) {
        return res.json({ valid: false, message: 'Invalid key' });
    }

    if (new Date(apiKey.expires_at) < new Date()) {
        ApiKey.deactivate(key);
        return res.json({ valid: false, message: 'Key expired', expired_at: apiKey.expires_at });
    }

    res.json({ 
        valid: true, 
        key: apiKey.key,
        ip: apiKey.ip_address,
        expires_at: apiKey.expires_at,
        days_left: Math.floor((new Date(apiKey.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
    });
});

// GET /api/key - Return plain key string (for script validation)
router.get('/api/key', (req, res) => {
    const key = req.query.key || req.get('X-API-Key');
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!key) {
        return res.status(400).send('Error: Missing key parameter');
    }

    const apiKey = ApiKey.findByKey(key);

    if (!apiKey) {
        return res.status(403).send('Error: Invalid key');
    }

    if (new Date(apiKey.expires_at) < new Date()) {
        ApiKey.deactivate(key);
        return res.status(403).send('Error: Key expired');
    }

    if (apiKey.ip_address && apiKey.ip_address !== clientIp) {
        AuditLog.log('IP_MISMATCH', `Key: ${maskKey(key)}, Expected: ${apiKey.ip_address}, Got: ${clientIp}`, clientIp);
        return res.status(403).send('Error: IP not authorized for this key');
    }

    ApiKey.incrementUsage(key);
    res.type('text/plain').send(apiKey.key);
});

// GET /api/exp - Return expiration date for key validation (used by decoded scripts)
router.get('/api/exp', (req, res) => {
    const { key } = req.query;

    if (!key) {
        return res.status(400).send('Missing key');
    }

    const apiKey = ApiKey.findByKey(key);
    
    if (!apiKey) {
        return res.status(403).send('Invalid key');
    }

    if (new Date(apiKey.expires_at) < new Date()) {
        ApiKey.deactivate(key);
        return res.status(403).send('Key expired');
    }

    // Return expiration date in format expected by scripts
    res.type('text/plain').send(apiKey.expires_at);
});

// POST /api/register - Register new IP (used by bot or admin panel)
router.post('/api/register', (req, res) => {
    const { ip, days } = req.body;
    const { generateApiKey, validateIp, validateDays } = require('../utils/helpers');

    if (!ip || !days) {
        return res.status(400).json({ error: 'IP and days are required' });
    }

    if (!validateIp(ip)) {
        return res.status(400).json({ error: 'Invalid IP address format' });
    }

    if (!validateDays(days)) {
        return res.status(400).json({ error: 'Days must be between 1 and 365' });
    }

    // Check if IP already has active key
    const existing = ApiKey.findByIp(ip).find(k => k.is_active && new Date(k.expires_at) > new Date());
    
    if (existing) {
        return res.status(409).json({ 
            error: 'IP already has an active key',
            key: existing.key,
            expires_at: existing.expires_at
        });
    }

    // Generate new key
    const newKey = generateApiKey(parseInt(process.env.KEY_LENGTH) || 20);
    const result = ApiKey.create(newKey, ip, parseInt(days));

    AuditLog.log('KEY_REGISTER', `IP: ${ip}, Days: ${days}, Key: ${maskKey(newKey)}`);

    res.json({
        success: true,
        key: newKey,
        ip: ip,
        days: days,
        expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        install_url: `https://${process.env.DOMAIN || 'zds.web.id'}/?key=${newKey}`
    });
});

// POST /api/change-key - Change API key for an IP
router.post('/api/change-key', (req, res) => {
    const { ip, new_key } = req.body;
    const newKey = new_key;

    if (!validateIp(ip)) {
        return res.status(400).json({ error: 'Invalid IP address format' });
    }

    if (!validateCustomKey(new_key)) {
        return res.status(400).json({ error: 'Invalid key format. Allowed: 4-32 alphanumeric characters, dash, or underscore' });
    }

    const result = ApiKey.changeKey(ip, new_key);

    if (result.reason === 'NOT_FOUND') {
        return res.status(404).json({ error: 'No key found for this IP' });
    }

    if (result.reason === 'DUPLICATE_KEY') {
        return res.status(409).json({ error: 'Key already in use by another IP' });
    }

    AuditLog.log('KEY_CHANGED', `IP: ${ip}, Old Key: ${maskKey(result.oldKey)}, New Key: ${maskKey(newKey)}`, req.ip || req.connection.remoteAddress);

    return res.status(200).json({
        success: true,
        ip,
        old_key: result.oldKey,
        new_key: newKey
    });
});

// POST /api/slowdns/register - Register SlowDNS subdomain with collision policy
async function slowdnsRegister(req, res) {
    const key = req.get('X-API-Key') || req.query.key;
    const clientIp = req.ip || req.connection.remoteAddress;

    if (!key) {
        return res.status(400).json({ error: 'missing_key' });
    }

    const apiKey = ApiKey.findByKey(key);
    if (!apiKey) {
        return res.status(403).json({ error: 'invalid_key' });
    }

    if (new Date(apiKey.expires_at) < new Date()) {
        return res.status(403).json({ error: 'key_expired' });
    }

    if (apiKey.ip_address && apiKey.ip_address !== clientIp) {
        return res.status(403).json({ error: 'ip_mismatch' });
    }

    const body = req.body || {};
    const domain = typeof body.domain === 'string' ? body.domain.trim() : '';
    if (!domain) {
        return res.status(400).json({ error: 'invalid_domain' });
    }

    const explicit = typeof body.sub === 'string' && body.sub.trim() !== '';
    let sub = explicit ? body.sub.trim() : domain.split('.')[0];
    sub = String(sub).toLowerCase();

    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(sub)) {
        return res.status(400).json({ error: 'invalid_sub' });
    }

    if (sub.startsWith('ns-')) {
        return res.status(400).json({ error: 'sub_reserved' });
    }

    const limitResult = rateLimitInstallLog(apiKey.id);
    if (!limitResult.allowed) {
        return res.status(429).json({ error: 'rate_limit', retry_after: limitResult.retryAfter });
    }

    const zone = process.env.CF_DNSTT_ZONE || 'zdnstt.web.id';
    const requestedSub = sub;

    let ip = apiKey.ip_address || clientIp;
    if (typeof ip === 'string' && ip.startsWith('::ffff:')) {
        ip = ip.substring(7);
    }

    const installDomain = typeof body.install_domain === 'string' && body.install_domain.trim() !== ''
        ? body.install_domain.trim().slice(0, 128)
        : null;

    const fetchImpl = (typeof fetch !== 'undefined' ? fetch : undefined);
    const listRecordsFn = (opts) => dnsCf.listDnsRecords(opts);

    let decision;
    try {
        decision = await dnsCf.resolveSlowdnsSub({
            sub,
            zone,
            ip,
            keyId: apiKey.id,
            explicit,
            fetchImpl,
            model: SlowdnsDomain,
            listRecordsFn
        });
    } catch (err) {
        if (err && err.code === 'env_missing') {
            console.error('SlowDNS register: konfigurasi env tidak lengkap', err.message);
            return res.status(500).json({ error: 'internal_error' });
        }
        console.error('SlowDNS register: error Cloudflare', err && err.code, err && err.httpStatus, err && err.details);
        return res.status(502).json({ error: 'cf_error' });
    }

    if (decision.status === 'conflict') {
        AuditLog.log('SLOWDNS_REGISTER', 'zone=' + zone + ' sub=' + requestedSub + ' ip=' + ip + ' key=' + maskKey(key) + ' conflict=' + (decision.reason || 'sub_taken'), clientIp);
        return res.status(409).json({ error: 'sub_taken' });
    }

    const finalSub = decision.sub;
    const tunnel = finalSub + '.' + zone;
    const nsHost = 'ns-' + finalSub + '.' + zone;

    let result;
    try {
        result = await dnsCf.ensureSlowdnsRecords({ sub: finalSub, ip, fetchImpl });
    } catch (err) {
        if (err && err.code === 'env_missing') {
            console.error('SlowDNS register: konfigurasi env tidak lengkap', err.message);
            return res.status(500).json({ error: 'internal_error' });
        }
        console.error('SlowDNS register: error Cloudflare', err && err.code, err && err.httpStatus, err && err.details);
        return res.status(502).json({ error: 'cf_error' });
    }

    try {
        if (decision.state === 'own') {
            SlowdnsDomain.updateOwnerInfo(decision.record.id, { ip, install_domain: installDomain });
        } else {
            SlowdnsDomain.create({
                sub: finalSub,
                zone,
                key_id: apiKey.id,
                install_domain: installDomain,
                ip
            });
        }
    } catch (err) {
        console.error('SlowDNS register: kegagalan mencatat kepemilikan', err && err.message);
        return res.status(500).json({ error: 'internal_error' });
    }

    AuditLog.log('SLOWDNS_REGISTER', 'zone=' + zone + ' sub=' + finalSub + ' ip=' + ip + ' key=' + maskKey(key) + ' fallback=' + decision.fallback, clientIp);

    return res.json({
        ok: true,
        zone: zone,
        sub: finalSub,
        requested_sub: requestedSub,
        fallback: decision.fallback,
        tunnel_domain: tunnel,
        ns_host: nsHost,
        created: { a: !!result.created.a, ns: !!result.created.ns },
        updated: { a: !!result.updated.a, ns: !!result.updated.ns }
    });
}

router.post('/api/slowdns/register', slowdnsRegister);

function normalizeIp(ip) {
    if (typeof ip !== 'string') return ip;
    if (ip.startsWith('::ffff:')) {
        return ip.substring(7);
    }
    return ip;
}

function getAllowedCheckudpPorts() {
    // Override via env CHECKUDP_PORT_WHITELIST (koma) HANYA UNTUK KEPERLUAN TES
    if (process.env.CHECKUDP_PORT_WHITELIST) {
        const ports = String(process.env.CHECKUDP_PORT_WHITELIST)
            .split(',')
            .map(p => p.trim())
            .filter(p => p !== '')
            .map(p => parseInt(p))
            .filter(p => !isNaN(p));
        if (ports.length > 0) return ports;
    }
    return [53];
}

function checkUdpOnce(targetIp, port, payload, timeoutMs) {
    return new Promise((resolve) => {
        const socket = dgram.createSocket('udp4');
        let done = false;
        const start = Date.now();
        const timer = setTimeout(() => {
            if (done) return;
            done = true;
            try { socket.close(); } catch (e) {}
            resolve({ received: false, rtt_ms: null });
        }, timeoutMs);

        socket.on('message', (msg, rinfo) => {
            if (done) return;
            if (rinfo.address !== targetIp) return;
            if (rinfo.port !== port) return;
            done = true;
            const rtt = Date.now() - start;
            clearTimeout(timer);
            try { socket.close(); } catch (e) {}
            resolve({ received: true, data: msg, rtt_ms: rtt });
        });

        socket.on('error', () => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { socket.close(); } catch (e) {}
            resolve({ received: false, rtt_ms: null });
        });

        try {
            socket.send(payload, 0, payload.length, port, targetIp, (err) => {
                if (err && !done) {
                    done = true;
                    clearTimeout(timer);
                    try { socket.close(); } catch (e) {}
                    resolve({ received: false, rtt_ms: null });
                }
            });
        } catch (e) {
            if (done) return;
            done = true;
            clearTimeout(timer);
            try { socket.close(); } catch (e) {}
            resolve({ received: false, rtt_ms: null });
        }
    });
}

async function checkUdpProbe(targetIp, port) {
    const timeoutMs = parseInt(process.env.CHECKUDP_TIMEOUT_MS) || 3000;
    const payload = Buffer.from('ZIDPROBE-' + crypto.randomBytes(4).toString('hex'));
    let result = await checkUdpOnce(targetIp, port, payload, timeoutMs);
    if (!result.received) {
        result = await checkUdpOnce(targetIp, port, payload, timeoutMs);
    }
    if (!result.received) {
        return { open: false, echo: null, rtt_ms: null };
    }
    const echo = result.data && result.data.length === payload.length && result.data.equals(payload);
    return { open: true, echo: !!echo, rtt_ms: result.rtt_ms };
}

// POST /api/checkudp
router.post('/api/checkudp', async (req, res) => {
    const key = req.get('X-API-Key') || req.query.key;
    const clientIpRaw = req.ip || req.connection.remoteAddress;
    const clientIp = normalizeIp(clientIpRaw);

    if (!key) {
        return res.status(400).json({ error: 'missing_key' });
    }

    const apiKey = ApiKey.findByKey(key);
    if (!apiKey) {
        return res.status(403).json({ error: 'invalid_key' });
    }

    if (new Date(apiKey.expires_at) < new Date()) {
        return res.status(403).json({ error: 'key_expired' });
    }

    const apiKeyIp = normalizeIp(apiKey.ip_address);
    if (apiKey.ip_address && apiKeyIp !== clientIp) {
        return res.status(403).json({ error: 'ip_mismatch' });
    }

    const body = req.body || {};
    const port = body.port;

    const allowedPorts = getAllowedCheckudpPorts();
    if (typeof port !== 'number' || isNaN(port) || !allowedPorts.includes(port)) {
        return res.status(400).json({ error: 'invalid_port' });
    }

    let targetIp = normalizeIp(apiKey.ip_address) || clientIp;
    if (!targetIp) {
        return res.status(400).json({ error: 'invalid_target' });
    }

    const limitResult = rateLimitInstallLog(apiKey.id);
    if (!limitResult.allowed) {
        return res.status(429).json({ error: 'rate_limit', retry_after: limitResult.retryAfter });
    }

    try {
        const probeResult = await checkUdpProbe(targetIp, port);
        try {
            AuditLog.log('CHECKUDP', 'ip=' + targetIp + ' port=' + port + ' open=' + probeResult.open + ' echo=' + probeResult.echo, clientIp);
        } catch (e) {
            // ignore audit errors
        }
        return res.status(200).json({
            ok: true,
            open: probeResult.open,
            echo: probeResult.echo,
            rtt_ms: probeResult.rtt_ms,
            target: targetIp,
            port: port
        });
    } catch (e) {
        return res.status(500).json({ error: 'internal_error' });
    }
});

// GET /api/stats - Get statistics (admin only)
router.get('/api/stats', (req, res) => {
    const { db } = require('../database/init');
    
    const totalKeys = db.prepare('SELECT COUNT(*) as count FROM api_keys').get();
    const activeKeys = db.prepare('SELECT COUNT(*) as count FROM api_keys WHERE is_active = 1').get();
    const totalAccounts = db.prepare('SELECT COUNT(*) as count FROM vpn_accounts').get();
    const activeAccounts = db.prepare('SELECT COUNT(*) as count FROM vpn_accounts WHERE is_active = 1').get();
    const totalDownloads = db.prepare('SELECT SUM(usage_count) as total FROM api_keys').get();

    res.json({
        total_keys: totalKeys.count,
        active_keys: activeKeys.count,
        total_accounts: totalAccounts.count,
        active_accounts: activeAccounts.count,
        total_downloads: totalDownloads.total || 0
    });
});

// GET /resources/* - Serve any resource file (fallback for GitHub)
router.get('/resources/*', (req, res) => {
    const filePath = req.params[0];
    const fullPath = path.join(__dirname, '../../resources', filePath);
    
    // Security: prevent path traversal
    if (!fullPath.startsWith(path.join(__dirname, '../../resources'))) {
        return res.status(403).send('Error: Access denied');
    }
    
    if (!fs.existsSync(fullPath)) {
        return res.status(404).send(`Error: /resources/${filePath} not found`);
    }
    
    // Set content type based on extension
    const ext = path.extname(fullPath).toLowerCase();
    const contentTypes = {
        '.zip': 'application/zip',
        '.json': 'application/json',
        '.sh': 'text/x-sh',
        '.py': 'text/x-python',
        '.cfg': 'text/plain',
        '.conf': 'text/plain',
        '.js': 'text/javascript',
        '.log': 'text/plain',
    };
    
    res.setHeader('Content-Type', contentTypes[ext] || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(fullPath)}"`);
    res.sendFile(fullPath);
});

module.exports = router;
