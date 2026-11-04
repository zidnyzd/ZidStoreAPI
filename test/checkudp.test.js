'use strict';

const assert = require('node:assert');
const test = require('node:test');
const http = require('http');
const dgram = require('dgram');
const fs = require('fs');
const os = require('os');
const path = require('path');

// DB berkas eksklusif untuk checkudp: runner node menjalankan berkas tes secara
// paralel, jadi path tidak boleh sama dengan tes lain (rmSync dapat saling menghapus).
const TEST_DB = path.join(os.tmpdir(), 'zidstore-checkudp-test.db');
process.env.DB_PATH = TEST_DB;

if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB);

const { db, ApiKey } = require('../src/database/init');
const apiRouter = require('../src/routes/api');
const express = require('express');
const bodyParser = require('body-parser');

const CLIENT_IP = '127.0.0.1';
const TEST_PORT = 34210;

let savedEnv = null;

function setupEnv(overrides = {}) {
    savedEnv = {
        CHECKUDP_PORT_WHITELIST: process.env.CHECKUDP_PORT_WHITELIST,
        CHECKUDP_TIMEOUT_MS: process.env.CHECKUDP_TIMEOUT_MS,
    };
    for (const [k, v] of Object.entries(overrides)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = String(v);
    }
}

function restoreEnv() {
    if (savedEnv === null) return;
    if (savedEnv.CHECKUDP_PORT_WHITELIST === undefined) delete process.env.CHECKUDP_PORT_WHITELIST;
    else process.env.CHECKUDP_PORT_WHITELIST = savedEnv.CHECKUDP_PORT_WHITELIST;
    if (savedEnv.CHECKUDP_TIMEOUT_MS === undefined) delete process.env.CHECKUDP_TIMEOUT_MS;
    else process.env.CHECKUDP_TIMEOUT_MS = savedEnv.CHECKUDP_TIMEOUT_MS;
    savedEnv = null;
}

function insertKey(key, ip, expiresAt) {
    db.prepare('DELETE FROM api_keys WHERE key = ?').run(key);
    db.prepare('INSERT INTO api_keys (key, ip_address, days_valid, expires_at, is_active) VALUES (?, ?, ?, ?, 1)')
        .run(key, ip, 1, expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
}

function clearTables() {
    try { db.prepare('DELETE FROM api_keys').run(); } catch (e) {}
    try { db.prepare('DELETE FROM audit_log').run(); } catch (e) {}
    try { db.prepare('DELETE FROM slowdns_domains').run(); } catch (e) {}
}

function req(app, method, url, body, extraHeaders = {}) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', err => {
            if (err) return reject(err);
            const port = server.address().port;
            const headers = Object.assign({}, body ? { 'Content-Type': 'application/json' } : {}, extraHeaders);
            const xhr = http.request({
                host: '127.0.0.1',
                port,
                method,
                path: url,
                headers
            }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    server.close();
                    resolve({ status: res.statusCode, headers: res.headers, body: data });
                });
            });
            xhr.on('error', err => { server.close(); reject(err); });
            if (body) xhr.write(JSON.stringify(body));
            xhr.end();
        });
    });
}

function jsonBody(res) { return JSON.parse(res.body); }

function startUdpServer(port, replyDifferent) {
    return new Promise((resolve, reject) => {
        const server = dgram.createSocket('udp4');
        server.on('error', reject);
        server.on('message', (msg, rinfo) => {
            const reply = replyDifferent ? Buffer.from('DIFF-' + msg.toString()) : msg;
            server.send(reply, 0, reply.length, rinfo.port, rinfo.address, () => {});
        });
        server.bind(port, '127.0.0.1', () => resolve(server));
    });
}

test.beforeEach(clearTables);
test.afterEach(() => {
    restoreEnv();
});

test('checkudp: key tidak ada => 400 missing_key', async () => {
    setupEnv({ CHECKUDP_PORT_WHITELIST: String(TEST_PORT) });
    const app = express();
    app.use(bodyParser.json());
    app.use('/', apiRouter);
    const res = await req(app, 'POST', '/api/checkudp', { port: TEST_PORT });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(jsonBody(res).error, 'missing_key');
});

test('checkudp: key salah => 403 invalid_key', async () => {
    insertKey('key-ok', CLIENT_IP);
    setupEnv({ CHECKUDP_PORT_WHITELIST: String(TEST_PORT) });
    const app = express();
    app.use(bodyParser.json());
    app.use('/', apiRouter);
    const res = await req(app, 'POST', '/api/checkudp', { port: TEST_PORT }, { 'X-API-Key': 'salah' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(jsonBody(res).error, 'invalid_key');
});

test('checkudp: key expired => 403 key_expired', async () => {
    insertKey('key-exp', CLIENT_IP, new Date(Date.now() - 10000).toISOString());
    setupEnv({ CHECKUDP_PORT_WHITELIST: String(TEST_PORT) });
    const app = express();
    app.use(bodyParser.json());
    app.use('/', apiRouter);
    const res = await req(app, 'POST', '/api/checkudp', { port: TEST_PORT }, { 'X-API-Key': 'key-exp' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(jsonBody(res).error, 'key_expired');
});

test('checkudp: IP tidak cocok => 403 ip_mismatch', async () => {
    insertKey('key-mm', '10.0.0.5');
    setupEnv({ CHECKUDP_PORT_WHITELIST: String(TEST_PORT) });
    const app = express();
    app.use(bodyParser.json());
    app.use('/', apiRouter);
    const res = await req(app, 'POST', '/api/checkudp', { port: TEST_PORT }, { 'X-API-Key': 'key-mm' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(jsonBody(res).error, 'ip_mismatch');
});

test('checkudp: port di luar whitelist default => 400 invalid_port', async () => {
    insertKey('key-ok', CLIENT_IP);
    setupEnv(); // default whitelist = [53]
    const app = express();
    app.use(bodyParser.json());
    app.use('/', apiRouter);
    const res = await req(app, 'POST', '/api/checkudp', { port: TEST_PORT }, { 'X-API-Key': 'key-ok' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(jsonBody(res).error, 'invalid_port');
});

test('checkudp: open=true dan echo=true dengan listener echo', async () => {
    insertKey('key-ok', CLIENT_IP);
    setupEnv({ CHECKUDP_PORT_WHITELIST: String(TEST_PORT) });
    const udpServer = await startUdpServer(TEST_PORT, false);
    const app = express();
    app.use(bodyParser.json());
    app.use('/', apiRouter);
    try {
        const res = await req(app, 'POST', '/api/checkudp', { port: TEST_PORT }, { 'X-API-Key': 'key-ok' });
        assert.strictEqual(res.status, 200, res.body);
        const body = jsonBody(res);
        assert.strictEqual(body.ok, true);
        assert.strictEqual(body.open, true);
        assert.strictEqual(body.echo, true);
        assert.strictEqual(body.target, CLIENT_IP);
        assert.strictEqual(body.port, TEST_PORT);
        assert.ok(Number.isInteger(body.rtt_ms) && body.rtt_ms >= 0, 'rtt_ms harus integer non-negatif: ' + body.rtt_ms);
    } finally {
        udpServer.close();
    }
});

test('checkudp: open=false tanpa listener (timeout)', async () => {
    insertKey('key-ok', CLIENT_IP);
    setupEnv({ CHECKUDP_PORT_WHITELIST: String(TEST_PORT), CHECKUDP_TIMEOUT_MS: 400 });
    const app = express();
    app.use(bodyParser.json());
    app.use('/', apiRouter);
    const res = await req(app, 'POST', '/api/checkudp', { port: TEST_PORT }, { 'X-API-Key': 'key-ok' });
    assert.strictEqual(res.status, 200, res.body);
    const body = jsonBody(res);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.open, false);
    assert.strictEqual(body.echo, null);
    assert.strictEqual(body.rtt_ms, null);
    assert.strictEqual(body.target, CLIENT_IP);
    assert.strictEqual(body.port, TEST_PORT);
});

test('checkudp: echo=false saat balasan payload berbeda', async () => {
    insertKey('key-ok', CLIENT_IP);
    setupEnv({ CHECKUDP_PORT_WHITELIST: String(TEST_PORT) });
    const udpServer = await startUdpServer(TEST_PORT, true);
    const app = express();
    app.use(bodyParser.json());
    app.use('/', apiRouter);
    try {
        const res = await req(app, 'POST', '/api/checkudp', { port: TEST_PORT }, { 'X-API-Key': 'key-ok' });
        assert.strictEqual(res.status, 200, res.body);
        const body = jsonBody(res);
        assert.strictEqual(body.ok, true);
        assert.strictEqual(body.open, true);
        assert.strictEqual(body.echo, false);
        assert.ok(Number.isInteger(body.rtt_ms) && body.rtt_ms >= 0);
    } finally {
        udpServer.close();
    }
});

test('checkudp: audit log tertulis tanpa nilai key mentah', async () => {
    insertKey('key-audit', CLIENT_IP);
    setupEnv({ CHECKUDP_PORT_WHITELIST: String(TEST_PORT), CHECKUDP_TIMEOUT_MS: 400 });
    const app = express();
    app.use(bodyParser.json());
    app.use('/', apiRouter);
    await req(app, 'POST', '/api/checkudp', { port: TEST_PORT }, { 'X-API-Key': 'key-audit' });
    const rows = db.prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT 1').all('CHECKUDP');
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].details.includes('ip=' + CLIENT_IP));
    assert.ok(rows[0].details.includes('port=' + TEST_PORT));
    assert.ok(rows[0].details.includes('open=false'));
    assert.ok(!rows[0].details.includes('key-audit'), 'nilai key mentah tidak boleh ada di audit log');
    assert.strictEqual(rows[0].ip_address, CLIENT_IP);
});

if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB);
