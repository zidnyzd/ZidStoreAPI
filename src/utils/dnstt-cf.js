'use strict';

const DEFAULT_ZONE = 'zdnstt.web.id';
const API_BASE = 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 15000;

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
    DEFAULT_ZONE
};