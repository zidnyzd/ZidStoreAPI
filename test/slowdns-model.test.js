'use strict';

const assert = require('node:assert');
const test = require('node:test');
const fs = require('fs');
const path = require('path');

const TEST_DB = '/tmp/slowdns-model-test.db';
process.env.DB_PATH = TEST_DB;
process.env.CF_DNSTT_TOKEN = 'test-token-12345';
process.env.CF_ACCOUNT_ID = 'test-account-12345';
process.env.CF_DNSTT_ZONE = 'zdnstt.web.id';
process.env.CF_ZONE_ID = 'z-env';

if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB);

const { db, SlowdnsDomain } = require('../src/database/init');

test('model smoke: buat-baca-update', () => {
    const res = SlowdnsDomain.create({
        sub: 'tes-model',
        zone: 'zdnstt.web.id',
        key_id: 1,
        install_domain: 'old.zds.web.id',
        ip: '1.1.1.1'
    });
    assert.ok(res);

    const row = SlowdnsDomain.findBySub('tes-model', 'zdnstt.web.id');
    assert.ok(row);
    assert.strictEqual(row.ip, '1.1.1.1');
    assert.strictEqual(row.install_domain, 'old.zds.web.id');

    SlowdnsDomain.updateOwnerInfo(row.id, { ip: '2.2.2.2', install_domain: 'new.zds.web.id' });

    const row2 = SlowdnsDomain.findBySub('tes-model', 'zdnstt.web.id');
    assert.strictEqual(row2.ip, '2.2.2.2');
    assert.strictEqual(row2.install_domain, 'new.zds.web.id');
});

test.after(() => {
    try { db.close(); } catch (e) {}
    if (fs.existsSync(TEST_DB)) fs.rmSync(TEST_DB);
    // hapus sidecar files
    for (const suffix of ['-wal', '-shm', '-journal']) {
        const f = TEST_DB + suffix;
        if (fs.existsSync(f)) fs.rmSync(f);
    }
});
