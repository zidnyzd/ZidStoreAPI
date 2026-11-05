'use strict';

const assert = require('node:assert');
const test = require('node:test');
const { beforeEach } = require('node:test');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB = path.join(os.tmpdir(), 'zidstore-install-logs-test.db');
process.env.DB_PATH = TEST_DB;

if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB);

const { db, ApiKey, AuditLog } = require('../src/database/init');
const apiRouter = require('../src/routes/api');
const express = require('express');
const bodyParser = require('body-parser');

const CLIENT_IP = '127.0.0.1';

function insertKey(key, ip, expiresAt) {
    db.prepare('DELETE FROM api_keys WHERE key = ?').run(key);
    db.prepare('INSERT INTO api_keys (key, ip_address, days_valid, expires_at, is_active) VALUES (?, ?, ?, ?, 1)')
        .run(key, ip, 1, expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
}

beforeEach(async () => {
    try { db.prepare('DELETE FROM install_logs').run(); } catch (e) {}
});

function makeApp() {
    const app = express();
    // Mirror of src/index.js R28 JSON-RESCUE: tangkap body JSON yang berisi
    // karakter kontrol mentah (bodyParser normally gagal 500).
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
    app.use('/', apiRouter);
    return app;
}

function req(app, method, url, body, extraHeaders) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', err => {
            if (err) return reject(err);
            const port = server.address().port;
            const headers = Object.assign({ 'Content-Type': 'application/json' }, extraHeaders || {});
            const xhr = http.request({
                host: '127.0.0.1',
                port,
                method,
                path: url,
                headers: body !== undefined ? headers : {}
            }, res => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    server.close();
                    resolve({ status: res.statusCode, headers: res.headers, body: data });
                });
            });
            xhr.on('error', err => {
                server.close();
                reject(err);
            });
            if (body !== undefined) xhr.write(typeof body === 'string' ? body : JSON.stringify(body));
            xhr.end();
        });
    });
}

function jsonBody(res) {
    return JSON.parse(res.body);
}

function latestRow() {
    return db.prepare('SELECT * FROM install_logs ORDER BY id DESC LIMIT 1').get();
}

const VALID_BODY = {
    install_id: 'abcd1234efgh',
    event: 'slowdns_skipped',
    status: 'success',
    step: 'slowdns',
    script_version: '1.0.4',
    domain: 'example.com',
    ip: '1.2.3.4',
    os: '',
    os_version: '',
    arch: '',
    timestamp: '2026-01-01T00:00:00.000Z'
};

test('install-logs (a): extras level atas tersimpan ke payload', async () => {
    insertKey('key-a', CLIENT_IP);
    const app = makeApp();
    const body = Object.assign({}, VALID_BODY, { note: 'disabled_by_admin', open: 'true' });
    const res = await req(app, 'POST', '/api/install-logs?key=key-a', body);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(jsonBody(res).ok, true);
    const row = latestRow();
    const payload = JSON.parse(row.payload);
    assert.strictEqual(payload.note, 'disabled_by_admin');
    assert.strictEqual(payload.open, 'true');
});

test('install-logs (b): nested payload menang atas extras', async () => {
    insertKey('key-b', CLIENT_IP);
    const app = makeApp();
    const body = Object.assign({}, VALID_BODY, { payload: { nested: 1 }, note: 'x' });
    const res = await req(app, 'POST', '/api/install-logs?key=key-b', body);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(jsonBody(res).ok, true);
    const row = latestRow();
    const payload = JSON.parse(row.payload);
    assert.deepStrictEqual(payload, { nested: 1 });
});

test('install-logs (c): __proto__ tidak masuk payload dan tidak polusi prototype', async () => {
    insertKey('key-c', CLIENT_IP);
    const app = makeApp();
    // Kirim sebagai string mentah agar __proto__ menjadi key JSON (bukan set prototype).
    const raw = JSON.stringify(VALID_BODY).replace(/}$/, ',"__proto__":{"evil":true}}');
    const res = await req(app, 'POST', '/api/install-logs?key=key-c', raw);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(jsonBody(res).ok, true);
    const row = latestRow();
    const payload = JSON.parse(row.payload);
    assert.strictEqual(payload.evil, undefined);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(payload, '__proto__'), false);
    assert.strictEqual(({}).evil, undefined);
});

test('install-logs (d): tanpa extras dan tanpa nested -> payload {}', async () => {
    insertKey('key-d', CLIENT_IP);
    const app = makeApp();
    const res = await req(app, 'POST', '/api/install-logs?key=key-d', VALID_BODY);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(jsonBody(res).ok, true);
    const row = latestRow();
    assert.deepStrictEqual(JSON.parse(row.payload), {});
});

test('install-logs (e): status invalid -> 400', async () => {
    insertKey('key-e', CLIENT_IP);
    const app = makeApp();
    const body = Object.assign({}, VALID_BODY, { status: 'weird' });
    const res = await req(app, 'POST', '/api/install-logs?key=key-e', body);
    assert.strictEqual(res.status, 400);
});

test('install-logs (f): timestamp valid string tidak masuk extras', async () => {
    insertKey('key-f', CLIENT_IP);
    const app = makeApp();
    const body = Object.assign({}, VALID_BODY, { extra_field: 'should_be_captured' });
    const res = await req(app, 'POST', '/api/install-logs?key=key-f', body);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(jsonBody(res).ok, true);
    const row = latestRow();
    const payload = JSON.parse(row.payload);
    assert.strictEqual(payload.extra_field, 'should_be_captured');
    assert.strictEqual(payload.timestamp, undefined);
});

test('install-logs (g): body JSON valid tapi berisi kontrol mentah di payload -> 200, tersimpan', async () => {
    insertKey('key-g', CLIENT_IP);
    const app = makeApp();
    const cntrl = String.fromCharCode(1);
    const raw = JSON.stringify(VALID_BODY).replace(/}$/, ',"payload":{"error_snippet":"abc' + cntrl + 'def","note":"ok"}}');
    const res = await req(app, 'POST', '/api/install-logs?key=key-g', raw);
    assert.strictEqual(res.status, 200);
    assert.strictEqual(jsonBody(res).ok, true);
    const row = latestRow();
    const payload = JSON.parse(row.payload);
    assert.strictEqual(payload.error_snippet, 'abc def');
    assert.strictEqual(payload.note, 'ok');
});

test('install-logs (h): JSON benar-benar rusak -> 400 invalid_json, tidak ada 500', async () => {
    insertKey('key-h', CLIENT_IP);
    const app = makeApp();
    const res = await req(app, 'POST', '/api/install-logs?key=key-h', '{"event":');
    assert.strictEqual(res.status, 400);
    assert.strictEqual(jsonBody(res).error, 'invalid_json');
});

test.after(() => {
    try { db.close(); } catch (e) {}
    if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB);
    for (const suffix of ['-wal', '-shm', '-journal']) {
        const f = TEST_DB + suffix;
        if (fs.existsSync(f)) fs.rmSync(f);
    }
});