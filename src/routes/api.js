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
    const { key, ip } = req.query;
    const clientIp = ip || req.ip || req.connection.remoteAddress;

    if (!key) {
        return res.status(400).send('Error: Missing key parameter. Usage: /?key=YOUR_KEY');
    }

    // Validate key
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

    // Check IP match
    if (apiKey.ip_address !== clientIp.replace('::ffff:', '')) {
        AuditLog.log('IP_MISMATCH', `Key: ${key}, Expected: ${apiKey.ip_address}, Got: ${clientIp}`, clientIp);
        return res.status(403).send('Error: IP address does not match registered IP.');
    }

    // Increment usage counter
    ApiKey.incrementUsage(key);

    // Log successful access
    AuditLog.log('SCRIPT_DOWNLOAD', `Key: ${key}, IP: ${apiKey.ip_address}`, clientIp);

    // Serve the script file
    const scriptPath = path.join(__dirname, '../../resources', 'zidstoretunnel');
    
    if (!fs.existsSync(scriptPath)) {
        console.error('Script file not found at:', scriptPath);
        return res.status(500).send('Error: Installation script not found on server.');
    }

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="zidstoretunnel"');
    res.sendFile(scriptPath);
});

// GET /api/validate - Validate key (used by script internally)
router.get('/api/validate', (req, res) => {
    const { key } = req.query;
    const clientIp = req.ip || req.connection.remoteAddress;

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

    if (apiKey.ip_address !== clientIp.replace('::ffff:', '')) {
        return res.json({ 
            valid: false, 
            message: 'IP mismatch',
            expected_ip: apiKey.ip_address,
            actual_ip: clientIp 
        });
    }

    res.json({ 
        valid: true, 
        ip: apiKey.ip_address,
        expires_at: apiKey.expires_at,
        days_left: Math.floor((new Date(apiKey.expires_at) - new Date()) / (1000 * 60 * 60 * 24))
    });
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

module.exports = router;
