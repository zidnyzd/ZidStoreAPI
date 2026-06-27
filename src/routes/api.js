const express = require('express');
const fs = require('fs');
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database', 'init');
const { ApiKey, AuditLog } = require(dbPath);
const helperPath = path.join(__dirname, '..', 'utils', 'helpers');
const { generateInstallCommand } = require(helperPath);

const router = express.Router();

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
        AuditLog.log('INVALID_KEY', `Key: ${key}, IP: ${clientIp}`, clientIp);
        return res.status(403).send('Error: Invalid or expired key. Please contact administrator.');
    }

    // Check expiration
    if (new Date(apiKey.expires_at) < new Date()) {
        ApiKey.deactivate(key);
        AuditLog.log('EXPIRED_KEY', `Key: ${key}, IP: ${apiKey.ip_address}`, clientIp);
        return res.status(403).send('Error: Key has expired. Please register a new key.');
    }

    // Increment usage counter
    ApiKey.incrementUsage(key);

    // Log successful access
    AuditLog.log('SCRIPT_DOWNLOAD', `Key: ${key}, Registered IP: ${apiKey.ip_address}`, clientIp);

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
    const { key } = req.query;
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
        AuditLog.log('IP_MISMATCH', `Key: ${key}, Expected: ${apiKey.ip_address}, Got: ${clientIp}`, clientIp);
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

    AuditLog.log('KEY_REGISTER', `IP: ${ip}, Days: ${days}, Key: ${newKey}`);

    res.json({
        success: true,
        key: newKey,
        ip: ip,
        days: days,
        expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        install_url: `https://${process.env.DOMAIN || 'zds.web.id'}/?key=${newKey}`
    });
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
