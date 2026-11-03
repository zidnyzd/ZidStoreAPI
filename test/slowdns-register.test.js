'use strict';

const assert = require('node:assert');
const test = require('node:test');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEST_DB = path.join(os.tmpdir(), 'zidstore-slowdns-test.db');
process.env.DB_PATH = TEST_DB;
process.env.CF_DNSTT_TOKEN = 'test-token-12345';
process.env.CF_ACCOUNT_ID = 'test-account-12345';
process.env.CF_DNSTT_ZONE = 'zdnstt.web.id';
process.env.CF_ZONE_ID = 'z-env';

if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB);

const { db, ApiKey } = require('../src/database/init');
const dnsCf = require('../src/utils/dnstt-cf');
const realEnsureSlowdnsRecords = dnsCf.ensureSlowdnsRecords;
const apiRouter = require('../src/routes/api');
const express = require('express');
const bodyParser = require('body-parser');

const CLIENT_IP = '127.0.0.1';
const ZONE = 'zdnstt.web.id';

function insertKey(key, ip, expiresAt) {
    db.prepare('DELETE FROM api_keys WHERE key = ?').run(key);
    db.prepare('INSERT INTO api_keys (key, ip_address, days_valid, expires_at, is_active) VALUES (?, ?, ?, ?, 1)')
        .run(key, ip, 1, expiresAt || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString());
}

function defaultResponse() {
    return { ok: true, status: 200, json: async () => ({ success: true, result: [] }) };
}

function makeFetchStub(queue) {
    const calls = [];
    async function fetchImpl(url, opts = {}) {
        calls.push({ url, opts });
        const item = queue.shift() || defaultResponse();
        return item;
    }
    fetchImpl.calls = calls;
    return fetchImpl;
}

function makeApp(stub) {
    const app = express();
    app.use(bodyParser.json());
    dnsCf.ensureSlowdnsRecords = stub !== undefined ? stub : defaultStub;
    app.use('/', apiRouter);
    return app;
}

async function defaultStub() {
    return { created: { a: true, ns: true }, updated: { a: false, ns: false }, multi: [] };
}

function req(app, method, url, body) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', err => {
            if (err) return reject(err);
            const port = server.address().port;
            const xhr = http.request({
                host: '127.0.0.1',
                port,
                method,
                path: url,
                headers: body ? { 'Content-Type': 'application/json' } : {}
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
            if (body) xhr.write(JSON.stringify(body));
            xhr.end();
        });
    });
}

function jsonBody(res) {
    return JSON.parse(res.body);
}

// ---- Unit test: modul dnstt-cf (fetchImpl di-stub, tanpa jaringan) ----

test('dnstt-cf: resolve zone id via GET /zones saat CF_ZONE_ID tidak diatur', async () => {
    delete process.env.CF_ZONE_ID;
    const fetchImpl = makeFetchStub([
        { ok: true, status: 200, json: async () => ({ success: true, result: [{ id: 'z-api' }] }) }, // GET /zones?name=zdnstt.web.id
        defaultResponse(), // GET dns_records A (kosong)
        defaultResponse(), // GET dns_records NS (kosong)
        defaultResponse(), // POST A
        defaultResponse()  // POST NS
    ]);
    const res = await dnsCf.ensureSlowdnsRecords({ sub: 'contoh', ip: '1.2.3.4', fetchImpl });
    assert.strictEqual(res.created.a, true);
    assert.strictEqual(res.created.ns, true);
    assert.strictEqual(res.updated.a, false);
    assert.strictEqual(res.updated.ns, false);
    assert.ok(fetchImpl.calls[0].url.endsWith('/client/v4/zones?name=zdnstt.web.id'));
    assert.strictEqual(fetchImpl.calls[0].url.endsWith('/client/v4/zones?name=zdnstt.web.id'), true);
    assert.strictEqual(fetchImpl.calls[1].url, 'https://api.cloudflare.com/client/v4/zones/z-api/dns_records?name=ns-contoh.zdnstt.web.id&type=A&per_page=100');
    assert.strictEqual(fetchImpl.calls[1].opts.headers.Authorization, 'Bearer test-token-12345');
    assert.ok(fetchImpl.calls[1].opts.signal, 'AbortController signal harus disertakan');
    assert.strictEqual(fetchImpl.calls[2].opts.method, 'POST');
    assert.deepStrictEqual(JSON.parse(fetchImpl.calls[2].opts.body), {
        type: 'A', name: 'ns-contoh.zdnstt.web.id', content: '1.2.3.4', proxied: false, ttl: 1
    });
    assert.strictEqual(fetchImpl.calls[3].opts.method, 'GET');
    assert.strictEqual(fetchImpl.calls[4].opts.method, 'POST');
    assert.deepStrictEqual(JSON.parse(fetchImpl.calls[4].opts.body), {
        type: 'NS', name: 'contoh.zdnstt.web.id', content: 'ns-contoh.zdnstt.web.id', ttl: 1
    });
    process.env.CF_ZONE_ID = 'z-env';
});

test('dnstt-cf: create baru saat record belum ada (created.a dan created.ns true)', async () => {
    process.env.CF_ZONE_ID = 'z-env';
    const fetchImpl = makeFetchStub([
        defaultResponse(), // GET dns_records A (kosong)
        defaultResponse(), // GET dns_records NS (kosong)
        defaultResponse(), // POST A
        defaultResponse()  // POST NS
    ]);
    const res = await dnsCf.ensureSlowdnsRecords({ sub: 'contoh', ip: '1.2.3.4', fetchImpl });
    assert.strictEqual(res.created.a, true);
    assert.strictEqual(res.created.ns, true);
    assert.strictEqual(res.updated.a, false);
    assert.strictEqual(res.updated.ns, false);
    assert.strictEqual(fetchImpl.calls.length, 4);
    for (const c of fetchImpl.calls) {
        assert.strictEqual(c.opts.headers.Authorization, 'Bearer test-token-12345');
        assert.ok(c.opts.signal);
    }
    assert.deepStrictEqual(JSON.parse(fetchImpl.calls[1].opts.body), {
        type: 'A', name: 'ns-contoh.zdnstt.web.id', content: '1.2.3.4', proxied: false, ttl: 1
    });
    assert.deepStrictEqual(JSON.parse(fetchImpl.calls[3].opts.body), {
        type: 'NS', name: 'contoh.zdnstt.web.id', content: 'ns-contoh.zdnstt.web.id', ttl: 1
    });
});

test('dnstt-cf: idempoten, record sudah ada dan sama (semua false)', async () => {
    process.env.CF_ZONE_ID = 'z-env';
    const fetchImpl = makeFetchStub([
        { ok: true, status: 200, json: async () => ({ success: true, result: [{ id: 'r-a', content: '1.2.3.4', name: 'ns-contoh.zdnstt.web.id', type: 'A', ttl: 1, proxied: false }] }) },
        { ok: true, status: 200, json: async () => ({ success: true, result: [{ id: 'r-ns', content: 'ns-contoh.zdnstt.web.id', name: 'contoh.zdnstt.web.id', type: 'NS', ttl: 1, proxied: false }] }) }
    ]);
    const res = await dnsCf.ensureSlowdnsRecords({ sub: 'contoh', ip: '1.2.3.4', fetchImpl });
    assert.strictEqual(res.created.a, false);
    assert.strictEqual(res.created.ns, false);
    assert.strictEqual(res.updated.a, false);
    assert.strictEqual(res.updated.ns, false);
    assert.strictEqual(fetchImpl.calls.length, 2);
});

test('dnstt-cf: IP beda pada record A => PATCH, updated.a true', async () => {
    process.env.CF_ZONE_ID = 'z-env';
    const fetchImpl = makeFetchStub([
        { ok: true, status: 200, json: async () => ({ success: true, result: [{ id: 'r-a', content: '9.9.9.9', name: 'ns-contoh.zdnstt.web.id', type: 'A', ttl: 1, proxied: false }] }) },
        defaultResponse(), // PATCH A
        { ok: true, status: 200, json: async () => ({ success: true, result: [{ id: 'r-ns', content: 'ns-contoh.zdnstt.web.id', name: 'contoh.zdnstt.web.id', type: 'NS', ttl: 1, proxied: false }] }) }
    ]);
    const res = await dnsCf.ensureSlowdnsRecords({ sub: 'contoh', ip: '1.2.3.4', fetchImpl });
    assert.strictEqual(res.created.a, false);
    assert.strictEqual(res.updated.a, true);
    assert.strictEqual(res.updated.ns, false);
    assert.strictEqual(fetchImpl.calls[1].opts.method, 'PATCH');
    assert.ok(fetchImpl.calls[1].url.includes('/dns_records/r-a'));
    assert.strictEqual(JSON.parse(fetchImpl.calls[1].opts.body).content, '1.2.3.4');
});

test('dnstt-cf: lebih dari 1 record A ditandai di hasil, tidak ditimpa', async () => {
    process.env.CF_ZONE_ID = 'z-env';
    const fetchImpl = makeFetchStub([
        { ok: true, status: 200, json: async () => ({ success: true, result: [{ id: 'a1' }, { id: 'a2' }] }) },
        defaultResponse(), // GET dns_records NS (kosong)
        defaultResponse()  // POST NS
    ]);
    const res = await dnsCf.ensureSlowdnsRecords({ sub: 'contoh', ip: '1.2.3.4', fetchImpl });
    assert.strictEqual(res.created.a, false);
    assert.strictEqual(res.updated.a, false);
    assert.ok(Array.isArray(res.multi) && res.multi.some(m => m.type === 'A' && m.count === 2));
    assert.strictEqual(res.created.ns, true);
    assert.strictEqual(fetchImpl.calls.length, 3);
});

test('dnstt-cf: env wajib hilang => error env_missing tanpa rahasia di pesan', async () => {
    const savedToken = process.env.CF_DNSTT_TOKEN;
    delete process.env.CF_DNSTT_TOKEN;
    await assert.rejects(
        dnsCf.ensureSlowdnsRecords({ sub: 'x', ip: '1.2.3.4', fetchImpl: makeFetchStub([]) }),
        err => {
            assert.strictEqual(err.code, 'env_missing');
            assert.ok(!err.message.includes(savedToken));
            assert.ok(!err.message.includes('test-token-12345'));
            return true;
        }
    );
    process.env.CF_DNSTT_TOKEN = savedToken;
});

test('dnstt-cf: fetchImpl tidak tersedia => error no_fetch', async () => {
    const savedFetch = globalThis.fetch;
    globalThis.fetch = undefined;
    try {
        await assert.rejects(
            dnsCf.ensureSlowdnsRecords({ sub: 'x', ip: '1.2.3.4' }),
            err => {
                assert.strictEqual(err.code, 'no_fetch');
                return true;
            }
        );
    } finally {
        if (savedFetch !== undefined) globalThis.fetch = savedFetch;
    }
});

// ---- Route test: POST /api/slowdns/register (server in-proses, fetchImpl di-override) ----

test('route: key tidak ada => 400 missing_key', async () => {
    insertKey('key-ok', CLIENT_IP);
    const app = makeApp(defaultStub);
    const res = await req(app, 'POST', '/api/slowdns/register', { domain: 'contoh.zds.web.id' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(jsonBody(res).error, 'missing_key');
});

test('route: key salah => 403 invalid_key', async () => {
    insertKey('key-ok', CLIENT_IP);
    const app = makeApp(defaultStub);
    const res = await req(app, 'POST', '/api/slowdns/register?key=salah', { domain: 'contoh.zds.web.id' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(jsonBody(res).error, 'invalid_key');
});

test('route: key expired => 403 key_expired', async () => {
    insertKey('key-exp', CLIENT_IP, new Date(Date.now() - 10000).toISOString());
    const app = makeApp(defaultStub);
    const res = await req(app, 'POST', '/api/slowdns/register?key=key-exp', { domain: 'contoh.zds.web.id' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(jsonBody(res).error, 'key_expired');
});

test('route: IP tidak cocok => 403 ip_mismatch', async () => {
    insertKey('key-mm', '10.0.0.5');
    const app = makeApp(defaultStub);
    const res = await req(app, 'POST', '/api/slowdns/register?key=key-mm', { domain: 'contoh.zds.web.id' });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(jsonBody(res).error, 'ip_mismatch');
});

test('route: domain kosong => 400 invalid_domain', async () => {
    insertKey('key-ok', CLIENT_IP);
    const app = makeApp(defaultStub);
    const res = await req(app, 'POST', '/api/slowdns/register?key=key-ok', {});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(jsonBody(res).error, 'invalid_domain');
});

test('route: sub invalid => 400 invalid_sub', async () => {
    insertKey('key-ok', CLIENT_IP);
    const app = makeApp(defaultStub);
    const res = await req(app, 'POST', '/api/slowdns/register?key=key-ok', { domain: 'contoh.zds.web.id', sub: 'ab!!cd' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(jsonBody(res).error, 'invalid_sub');
});

test('route: sub diawali ns- => 400 sub_reserved', async () => {
    insertKey('key-ok', CLIENT_IP);
    const app = makeApp(defaultStub);
    const res = await req(app, 'POST', '/api/slowdns/register?key=key-ok', { domain: 'contoh.zds.web.id', sub: 'ns-override' });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(jsonBody(res).error, 'sub_reserved');
});

test('route: rate limit per key => 429 rate_limit', async () => {
    insertKey('key-rl', CLIENT_IP);
    const app = makeApp(defaultStub);
    for (let i = 0; i < 6; i++) {
        const res = await req(app, 'POST', '/api/slowdns/register?key=key-rl', { domain: 'contoh.zds.web.id' });
        if (i < 5) assert.strictEqual(res.status, 200);
        else assert.strictEqual(res.status, 429);
    }
    assert.strictEqual(jsonBody(await req(app, 'POST', '/api/slowdns/register?key=key-rl', { domain: 'contoh.zds.web.id' })).error, 'rate_limit');
});

test('route: env Cloudflare tidak lengkap => 500 internal_error (tanpa jaringan)', async () => {
    const savedToken = process.env.CF_DNSTT_TOKEN;
    delete process.env.CF_DNSTT_TOKEN;
    try {
        insertKey('key-ok', CLIENT_IP);
        const app = makeApp(realEnsureSlowdnsRecords);
        const res = await req(app, 'POST', '/api/slowdns/register?key=key-ok', { domain: 'contoh.zds.web.id' });
        assert.strictEqual(res.status, 500);
        assert.strictEqual(jsonBody(res).error, 'internal_error');
    } finally {
        process.env.CF_DNSTT_TOKEN = savedToken;
    }
});

test('route: sukses create baru => 200 dan created true', async () => {
    insertKey('key-ok', CLIENT_IP);
    const calls = [];
    const stub = async () => {
        calls.push({ sub: undefined, ip: undefined });
        return { created: { a: true, ns: true }, updated: { a: false, ns: false } };
    };
    const app = makeApp(stub);
    const res = await req(app, 'POST', '/api/slowdns/register?key=key-ok', { domain: 'contoh.zds.web.id' });
    assert.strictEqual(res.status, 200);
    const body = jsonBody(res);
    assert.strictEqual(body.ok, true);
    assert.strictEqual(body.zone, ZONE);
    assert.strictEqual(body.sub, 'contoh');
    assert.strictEqual(body.tunnel_domain, 'contoh.' + ZONE);
    assert.strictEqual(body.ns_host, 'ns-contoh.' + ZONE);
    assert.deepStrictEqual(body.created, { a: true, ns: true });
    assert.deepStrictEqual(body.updated, { a: false, ns: false });
});

test('route: derive sub "asd.zds.web.id" -> "asd"', async () => {
    insertKey('key-ok', CLIENT_IP);
    let captured = null;
    const app = makeApp(async ({ sub, ip }) => {
        captured = { sub, ip };
        return { created: { a: true, ns: true }, updated: { a: false, ns: false } };
    });
    const res = await req(app, 'POST', '/api/slowdns/register?key=key-ok', { domain: 'asd.zds.web.id' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(captured.sub, 'asd');
    assert.strictEqual(captured.ip, CLIENT_IP);
    const body = jsonBody(res);
    assert.strictEqual(body.sub, 'asd');
    assert.strictEqual(body.tunnel_domain, 'asd.zdnstt.web.id');
    assert.strictEqual(body.ns_host, 'ns-asd.zdnstt.web.id');
});

test('route: idempoten via route => created/updated semua false', async () => {
    insertKey('key-ok', CLIENT_IP);
    const app = makeApp(async () => ({ created: { a: false, ns: false }, updated: { a: false, ns: false } }));
    const res = await req(app, 'POST', '/api/slowdns/register?key=key-ok', { domain: 'contoh.zds.web.id' });
    assert.strictEqual(res.status, 200);
    const body = jsonBody(res);
    assert.deepStrictEqual(body.created, { a: false, ns: false });
    assert.deepStrictEqual(body.updated, { a: false, ns: false });
});

test('route: IP beda via route => updated.a true', async () => {
    insertKey('key-ok', CLIENT_IP);
    const app = makeApp(async () => ({ created: { a: false, ns: false }, updated: { a: true, ns: false } }));
    const res = await req(app, 'POST', '/api/slowdns/register?key=key-ok', { domain: 'contoh.zds.web.id' });
    assert.strictEqual(res.status, 200);
    const body = jsonBody(res);
    assert.deepStrictEqual(body.updated, { a: true, ns: false });
});

test('route: audit log tertulis ke database', async () => {
    insertKey('key-audit', CLIENT_IP);
    const app = makeApp(defaultStub);
    await req(app, 'POST', '/api/slowdns/register?key=key-audit', { domain: 'contoh.zds.web.id' });
    const rows = db.prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id DESC LIMIT 1').all('SLOWDNS_REGISTER');
    assert.strictEqual(rows.length, 1);
    assert.ok(rows[0].details.includes('zone=' + ZONE));
    assert.ok(rows[0].details.includes('sub=contoh'));
    assert.ok(rows[0].details.includes('key=key-****'));
    assert.strictEqual(rows[0].ip_address, CLIENT_IP);
});

// restore real implementation for hygiene
dnsCf.ensureSlowdnsRecords = require('../src/utils/dnstt-cf').ensureSlowdnsRecords;

if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB);