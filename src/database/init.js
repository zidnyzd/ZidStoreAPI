const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/zidstore.db';

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode and foreign keys
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
    CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT UNIQUE NOT NULL,
        ip_address TEXT NOT NULL,
        days_valid INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        is_active INTEGER DEFAULT 1,
        last_used DATETIME,
        usage_count INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS vpn_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        key_id INTEGER NOT NULL,
        protocol TEXT NOT NULL CHECK(protocol IN ('vmess', 'vless', 'trojan', 'shadowsocks', 'openvpn')),
        port INTEGER NOT NULL,
        is_active INTEGER DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (key_id) REFERENCES api_keys(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action TEXT NOT NULL,
        details TEXT,
        ip_address TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
    CREATE INDEX IF NOT EXISTS idx_api_keys_ip ON api_keys(ip_address);
    CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active, expires_at);
    CREATE INDEX IF NOT EXISTS idx_vpn_accounts_key ON vpn_accounts(key_id);
    CREATE INDEX IF NOT EXISTS idx_vpn_accounts_username ON vpn_accounts(username);
`);

// Helper functions
const ApiKey = {
    create(key, ip, days) {
        const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
        const stmt = db.prepare('INSERT INTO api_keys (key, ip_address, days_valid, expires_at) VALUES (?, ?, ?, ?)');
        return stmt.run(key, ip, days, expiresAt);
    },

    findByKey(key) {
        const stmt = db.prepare('SELECT * FROM api_keys WHERE key = ? AND is_active = 1');
        return stmt.get(key);
    },

    findByIp(ip) {
        const stmt = db.prepare('SELECT * FROM api_keys WHERE ip_address = ? AND is_active = 1 ORDER BY created_at DESC');
        return stmt.all(ip);
    },

    findAll() {
        const stmt = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC');
        return stmt.all();
    },

    deactivate(key) {
        const stmt = db.prepare('UPDATE api_keys SET is_active = 0 WHERE key = ?');
        return stmt.run(key);
    },

    deactivateByIp(ip) {
        const stmt = db.prepare('UPDATE api_keys SET is_active = 0 WHERE ip_address = ?');
        return stmt.run(ip);
    },

    deactivateExpired() {
        const stmt = db.prepare("UPDATE api_keys SET is_active = 0 WHERE expires_at < datetime('now')");
        return stmt.run();
    },

    incrementUsage(key) {
        const stmt = db.prepare('UPDATE api_keys SET usage_count = usage_count + 1, last_used = CURRENT_TIMESTAMP WHERE key = ?');
        return stmt.run(key);
    }
};

const VpnAccount = {
    create(username, keyId, protocol, port, expiresAt) {
        const stmt = db.prepare('INSERT INTO vpn_accounts (username, key_id, protocol, port, expires_at) VALUES (?, ?, ?, ?, ?)');
        return stmt.run(username, keyId, protocol, port, expiresAt);
    },

    findByUsername(username) {
        const stmt = db.prepare('SELECT * FROM vpn_accounts WHERE username = ?');
        return stmt.get(username);
    },

    findByKeyId(keyId) {
        const stmt = db.prepare('SELECT * FROM vpn_accounts WHERE key_id = ? ORDER BY created_at DESC');
        return stmt.all(keyId);
    },

    deactivate(username) {
        const stmt = db.prepare('UPDATE vpn_accounts SET is_active = 0 WHERE username = ?');
        return stmt.run(username);
    },

    deactivateExpired() {
        const stmt = db.prepare("UPDATE vpn_accounts SET is_active = 0 WHERE expires_at < datetime('now')");
        return stmt.run();
    },

    findAll() {
        const stmt = db.prepare('SELECT v.*, a.ip_address FROM vpn_accounts v JOIN api_keys a ON v.key_id = a.id ORDER BY v.created_at DESC');
        return stmt.all();
    }
};

const AuditLog = {
    log(action, details, ip = null) {
        const stmt = db.prepare('INSERT INTO audit_log (action, details, ip_address) VALUES (?, ?, ?)');
        return stmt.run(action, details, ip);
    }
};

module.exports = { db, ApiKey, VpnAccount, AuditLog };
