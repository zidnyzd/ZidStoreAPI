'use strict';

const crypto = require('crypto');
const DEFAULT_ZONE = 'zdnstt.web.id';
const API_BASE = 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 15000;

const LABEL_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

let cachedZoneId = null;

function loadEnv() {
    const token = process.env.CF_DNSTT_TOKEN;
    const accountId = process.env.CF_ACCOUNT_ID;
    const missing = [];
    if (!token || String(token).trim() === '') missing.push('CF_DNSTT_TOKEN');
    if (!accountId || String(accountId).trim() === '') missing.push('CF_ACCOUNT_ID');
    if (missing.length > 0) {
        const err = new Error('Konfigurasi Cloudflare belum lengkap: ' + missing.join(', '));
        err.code = 'env_missing';
        throw err;
    }
    return { token, accountId };
}

function fetchWithTimeout(fetchImpl, url, opts) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    return fetchImpl(url, Object.assign({}, opts, { signal: controller.signal }))
        .then(res => {
            clearTimeout(timer);
            return res;
        })
        .catch(err => {
            clearTimeout(timer);
            if (err && err.name === 'AbortError') {
                const e = new Error('Waktu habis saat menghubungi Cloudflare');
                e.code = 'cf_timeout';
                throw e;
            }
            const e = new Error('Gagal terhubung ke Cloudflare');
            e.code = 'cf_network';
            e.details = err && err.message ? err.message : String(err);
            throw e;
        });
}

async function cfJson(fetchImpl, method, urlPath, body, token) {
    const url = API_BASE + urlPath;
    const headers = {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
    };
    const opts = { method, headers };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetchWithTimeout(fetchImpl, url, opts);
    let data = {};
    try {
        data = await res.json();
    } catch (e) {
        data = {};
    }
    if (!res.ok || !data || !data.success) {
        const msg = (data && data.errors && data.errors[0] && data.errors[0].message)
            ? data.errors[0].message
            : (res.statusText || 'Cloudflare error');
        const err = new Error('Cloudflare gagal: ' + msg);
        err.code = 'cf_error';
        err.httpStatus = res.status;
        err.details = (data && data.errors) ? data.errors : String(res.status);
        throw err;
    }
    return data;
}

async function resolveZoneId(fetchImpl, token, zone) {
    if (process.env.CF_ZONE_ID && String(process.env.CF_ZONE_ID).trim() !== '') {
        cachedZoneId = String(process.env.CF_ZONE_ID).trim();
        return cachedZoneId;
    }
    if (cachedZoneId) return cachedZoneId;
    const data = await cfJson(fetchImpl, 'GET', '/zones?name=' + encodeURIComponent(zone), undefined, token);
    const zones = (data && data.result) ? data.result : [];
    if (zones.length === 0) {
        const err = new Error('Zona Cloudflare tidak ditemukan: ' + zone);
        err.code = 'zone_not_found';
        throw err;
    }
    cachedZoneId = zones[0].id;
    return cachedZoneId;
}

async function listRecords(fetchImpl, token, zoneId, name, type) {
    const path = '/zones/' + zoneId + '/dns_records?name=' + encodeURIComponent(name) + '&type=' + type + '&per_page=100';
    const data = await cfJson(fetchImpl, 'GET', path, undefined, token);
    return (data && data.result) ? data.result : [];
}

async function createRecord(fetchImpl, token, zoneId, record) {
    const path = '/zones/' + zoneId + '/dns_records';
    await cfJson(fetchImpl, 'POST', path, record, token);
}

async function updateRecord(fetchImpl, token, zoneId, recordId, record) {
    const path = '/zones/' + zoneId + '/dns_records/' + recordId;
    await cfJson(fetchImpl, 'PATCH', path, record, token);
}

// Baca daftar record Cloudflare untuk satu nama + tipe (A/NS).
// Dipakai route untuk memeriksa keberadaan record tanpa menduplikasi logika CF.
async function listDnsRecords({ name, type, zone, fetchImpl }) {
    const fn = fetchImpl || (typeof globalThis.fetch !== 'undefined' ? globalThis.fetch : null);
    if (!fn) {
        const err = new Error('fetchImpl tidak tersedia');
        err.code = 'no_fetch';
        throw err;
    }
    const { token } = loadEnv();
    const targetZone = zone || process.env.CF_DNSTT_ZONE || DEFAULT_ZONE;
    const zoneId = await resolveZoneId(fn, token, targetZone);
    return listRecords(fn, token, zoneId, name, type);
}

// Sufiks acak untuk fallback tabrakan: huruf kecil + angka, panjang default 4.
function randomSubSuffix(length = 4) {
    const out = [];
    for (let i = 0; i < length; i++) {
        out.push(LABEL_ALPHABET[crypto.randomInt(0, LABEL_ALPHABET.length)]);
    }
    return out.join('');
}

// Gabung base + sufiks fallback tanpa melanggar batas label DNS (63 karakter).
function buildFallbackSub(base, suffix, maxLength = 63) {
    const tail = '-' + suffix;
    const room = maxLength - tail.length;
    if (room < 1) return null;
    const head = base.slice(0, room).replace(/-+$/, '');
    if (!head) return null;
    return head + tail;
}

// Periksa kepemilikan satu sub pada satu zona.
// state: 'new' (belum ada), 'own' (pemilik sama), 'claim' (warisan CF dengan IP pemanggil), 'conflict' (milik orang lain).
async function inspectSlowdnsOwnership({ sub, zone, ip, keyId, fetchImpl, model, listRecordsFn }) {
    const list = listRecordsFn || ((opts) => listDnsRecords(opts));
    const row = model.findBySub(sub, zone);
    if (row) {
        if (Number(row.key_id) === Number(keyId)) {
            return { state: 'own', record: row };
        }
        return { state: 'conflict', reason: 'db_owner' };
    }

    const nsHost = 'ns-' + sub + '.' + zone;
    const tunnel = sub + '.' + zone;

    const aRecords = await list({ name: nsHost, type: 'A', zone, fetchImpl });
    if (aRecords && aRecords.length > 0) {
        if (aRecords[0].content === ip) {
            return { state: 'claim', record: null };
        }
        return { state: 'conflict', reason: 'cf_a_other_ip' };
    }

    const nsRecords = await list({ name: tunnel, type: 'NS', zone, fetchImpl });
    if (nsRecords && nsRecords.length > 0 && nsRecords[0].content !== nsHost) {
        return { state: 'conflict', reason: 'cf_ns_mismatch' };
    }

    return { state: 'new', record: null };
}

// Keputusan alur register SlowDNS.
// Jalur manual (explicit) menolak tabrakan, jalur otomatis memakai suffix acak pendek.
async function resolveSlowdnsSub({
    sub,
    zone,
    ip,
    keyId,
    explicit,
    fetchImpl,
    model,
    listRecordsFn,
    maxAttempts = 5,
    suffixLength = 4,
    randomSuffixFn
}) {
    const requestedSub = sub;
    const ownership = await inspectSlowdnsOwnership({ sub, zone, ip, keyId, fetchImpl, model, listRecordsFn });

    if (ownership.state !== 'conflict') {
        return {
            status: 'ok',
            sub,
            requestedSub,
            fallback: false,
            state: ownership.state,
            record: ownership.record
        };
    }

    if (explicit) {
        return { status: 'conflict', sub, requestedSub, fallback: false, reason: ownership.reason };
    }

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const suffix = randomSuffixFn ? randomSuffixFn(suffixLength) : randomSubSuffix(suffixLength);
        const candidate = buildFallbackSub(sub, suffix);
        if (!candidate) continue;

        const candidateOwnership = await inspectSlowdnsOwnership({
            sub: candidate, zone, ip, keyId, fetchImpl, model, listRecordsFn
        });
        if (candidateOwnership.state === 'conflict') continue;

        return {
            status: 'ok',
            sub: candidate,
            requestedSub,
            fallback: true,
            state: candidateOwnership.state,
            record: candidateOwnership.record
        };
    }

    return { status: 'conflict', sub, requestedSub, fallback: false, reason: 'fallback_exhausted' };
}

async function ensureSlowdnsRecords({ sub, ip, fetchImpl }) {
    const fn = fetchImpl || (typeof globalThis.fetch !== 'undefined' ? globalThis.fetch : null);
    if (!fn) {
        const err = new Error('fetchImpl tidak tersedia');
        err.code = 'no_fetch';
        throw err;
    }
    const { token } = loadEnv();
    const zone = process.env.CF_DNSTT_ZONE || DEFAULT_ZONE;
    const zoneId = await resolveZoneId(fn, token, zone);

    const nsHost = 'ns-' + sub + '.' + zone;
    const tunnel = sub + '.' + zone;

    const result = {
        created: { a: false, ns: false },
        updated: { a: false, ns: false },
        multi: []
    };

    const aRecords = await listRecords(fn, token, zoneId, nsHost, 'A');
    if (aRecords.length === 0) {
        await createRecord(fn, token, zoneId, {
            type: 'A',
            name: nsHost,
            content: ip,
            proxied: false,
            ttl: 1
        });
        result.created.a = true;
    } else if (aRecords.length === 1) {
        if (aRecords[0].content !== ip) {
            await updateRecord(fn, token, zoneId, aRecords[0].id, {
                type: 'A',
                name: nsHost,
                content: ip,
                proxied: false,
                ttl: 1
            });
            result.updated.a = true;
        }
    } else {
        result.multi.push({ type: 'A', name: nsHost, count: aRecords.length });
    }

    const nsRecords = await listRecords(fn, token, zoneId, tunnel, 'NS');
    if (nsRecords.length === 0) {
        await createRecord(fn, token, zoneId, {
            type: 'NS',
            name: tunnel,
            content: nsHost,
            ttl: 1
        });
        result.created.ns = true;
    } else if (nsRecords.length === 1) {
        if (nsRecords[0].content !== nsHost) {
            await updateRecord(fn, token, zoneId, nsRecords[0].id, {
                type: 'NS',
                name: tunnel,
                content: nsHost,
                ttl: 1
            });
            result.updated.ns = true;
        }
    } else {
        result.multi.push({ type: 'NS', name: tunnel, count: nsRecords.length });
    }

    return result;
}

module.exports = {
    ensureSlowdnsRecords,
    DEFAULT_ZONE,
    listDnsRecords,
    randomSubSuffix,
    buildFallbackSub,
    inspectSlowdnsOwnership,
    resolveSlowdnsSub
};