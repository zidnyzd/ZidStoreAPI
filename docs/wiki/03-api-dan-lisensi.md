# 03. API dan Lisensi

Halaman ini mendokumentasikan endpoint API, rate limiting, dan trust proxy. Semua rute didefinisikan di src/routes/api.js dan dipasang di src/index.js.

## Middleware Express: Trust Proxy dan Rate Limiting

- `app.set('trust proxy', 1)` di 21 agar req.ip mencerminkan X-Forwarded-For dari Nginx.
- `generalLimiter`: 60 request per menit per IP, diterapkan global di 44.
- `apiLimiter`: 30 request per menit per IP, diterapkan pada path /api di 45.
- CORS dan body parser dipasang di 41-43.
- Logging request dengan timestamp WIB di 48-53.

## Endpoint GET /?key= (Download Script)

Rute di 145-177.

Alur:

1. Ambil key dari query string (146-146).
2. Client IP dari req.ip (147-147).
3. Jika key kosong, kembalikan 400 dengan pesan kesalahan (149-151).
4. Cari key aktif lewat ApiKey.findByKey (154-154).
5. Jika tidak ada, audit log INVALID_KEY dan kembalikan 403 (156-159).
6. Jika expired, nonaktifkan key, audit log EXPIRED_KEY, kembalikan 403 (162-166).
7. Increment usage_count lewat ApiKey.incrementUsage (169-169).
8. Audit log SCRIPT_DOWNLOAD (src/routes/api.js:172).
9. Redirect 302 ke https://raw.githubusercontent.com/zidnyzd/ScriptTunnel/main/zidstoretunnel (175-176).

## Endpoint GET /api/validate (Dashboard)

Rute di 180-205.

Response JSON:

- valid: false, message: "Missing key parameter" jika key kosong.
- valid: false, message: "Invalid key" jika tidak ditemukan.
- valid: false, message: "Key expired", expired_at jika expired.
- valid: true, key, ip, expires_at, days_left jika aktif.

days_left dihitung dengan `(new Date(apiKey.expires_at) - new Date()) / (1000 * 60 * 60 * 24)` (203-203).

## Endpoint GET /api/key (Plain Key String)

Rute di 208-234.

Alur:

1. Ambil key dari query string (src/routes/api.js:209).
2. Client IP dari req.ip (210-210).
3. Jika key kosong, kembalikan 400 (212-214).
4. Cari key aktif (216-216).
5. Jika tidak ada, kembalikan 403 (218-220).
6. Jika expired, nonaktifkan dan kembalikan 403 (222-225).
7. Jika apiKey.ip_address ada dan tidak sama dengan clientIp, audit log IP_MISMATCH dan kembalikan 403 (227-230).
8. Increment usage (232-232).
9. Kembalikan apiKey.key sebagai teks plain (233-233).

## Endpoint GET /api/exp (Masa Aktif)

Rute di 237-257.

Endpoint yang dipakai oleh skrip menu di VPS pelanggan untuk memvalidasi lisensi. Alur:

1. Ambil key dari query string (238-238).
2. Jika kosong, kembalikan 400 dengan "Missing key" (240-242).
3. Cari key aktif (244-244).
4. Jika tidak ada, kembalikan 403 dengan "Invalid key" (246-248).
5. Jika expired, nonaktifkan dan kembalikan 403 dengan "Key expired" (250-253).
6. Kembalikan apiKey.expires_at sebagai teks plain (256-256).

## Endpoint POST /api/register (Registrasi IP)

Rute di 260-301.

Body JSON: `{ ip, days }`.

Alur:

1. Ambil ip dan days dari req.body (261-261).
2. Validasi ip dengan validateIp (268-270).
3. Validasi days dengan validateDays (272-274).
4. Cek apakah IP sudah memiliki key aktif (277-285). Jika ada, kembalikan 409 dengan key dan expires_at.
5. Generate key lewat generateApiKey(parseInt(KEY_LENGTH) || 20) (288-288).
6. Buat key lewat ApiKey.create (289-289).
7. Audit log KEY_REGISTER (src/routes/api.js:291).
8. Response JSON: success, key, ip, days, expires_at, install_url (293-300).

## Endpoint POST /api/change-key (Ubah Kustom Key)

Rute di src/routes/api.js:304-335.

Body JSON: `{ ip, new_key }`.

Alur:

1. Ambil ip dan new_key dari req.body (304-305).
2. Validasi ip dengan validateIp (308). Gagal -> 400 dengan pesan "Invalid IP address format".
3. Validasi new_key dengan validateCustomKey (33-39): 4-32 karakter dari himpunan alfanumerik, strip (-), atau underscore (_), regex `/^[a-zA-Z0-9_-]{4,32}$/`. Gagal -> 400 dengan pesan "Invalid key format. Allowed: 4-32 alphanumeric characters, dash, or underscore".
4. Panggil ApiKey.changeKey(ip, new_key) (161-181).
5. Jika result.reason === 'NOT_FOUND' (tidak ada key untuk IP) -> 404 dengan pesan "No key found for this IP".
6. Jika result.reason === 'DUPLICATE_KEY' (key sudah dipakai IP lain) -> 409 dengan pesan "Key already in use by another IP".
7. Audit log KEY_CHANGED dengan IP, oldKey, newKey, dan client IP (src/routes/api.js:326).
8. Response 200: { success: true, ip, old_key, new_key } (328-333).

Contoh respons sukses (200):

```json
{
  "success": true,
  "ip": "103.253.244.181",
  "old_key": "zsabc123456789012345678901234567",
  "new_key": "custom-key-123"
}
```

Contoh respons error:

- 400: `{ "error": "Invalid IP address format" }`
- 400: `{ "error": "Invalid key format. Allowed: 4-32 alphanumeric characters, dash, or underscore" }`
- 404: `{ "error": "No key found for this IP" }`
- 409: `{ "error": "Key already in use by another IP" }`

## Endpoint GET /api/stats (Statistik)

Rute di 473-489.

Prepared statement langsung ke db:

- total_keys: COUNT(*) dari api_keys.
- active_keys: COUNT(*) dari api_keys WHERE is_active = 1.
- total_accounts: COUNT(*) dari vpn_accounts.
- active_accounts: COUNT(*) dari vpn_accounts WHERE is_active = 1.
- total_downloads: SUM(usage_count) dari api_keys, default 0 jika null.

## Endpoint GET /resources/* (Penyajian File Statis)

Rute di 492-521.

Alur:

1. Ambil filePath dari req.params[0] (493-493).
2. Gabungkan ke fullPath = path.join(__dirname, '../../resources', filePath) (494-494).
3. Proteksi path traversal: jika !fullPath.startsWith(path.join(__dirname, '../../resources')) kembalikan 403 (496-499).
4. Jika file tidak ada, kembalikan 404 (501-503).
5. Tentukan Content-Type berdasarkan ekstensi (506-516).
6. Set Content-Disposition attachment (519-519).
7. sendFile (520-520).

## Health Check dan Static Files

- GET /health di 59-66 mengembalikan status, uptime, timestamp, version.
- express.static(path.join(__dirname, '../public')) di 69.
- 404 handler di 72-74.
- Error handler di 77-81 audit log SERVER_ERROR.

## Endpoint POST /api/slowdns/register (Otomasi Subdomain SlowDNS)

Rute di `src/routes/api.js:337-470`; modul Cloudflare di `src/utils/dnstt-cf.js:1-308`.

Digunakan installer sebagai fallback domain (prioritas ke-4, dipanggil bila unit existing, `/etc/slowdns/domain`, dan env `DNSTT_DOMAIN` semuanya kosong) serta oleh menu VPS untuk mengubah domain SlowDNS (menu System Settings item "9. Change SlowDNS domain").

Auth: header `X-API-Key` (pola sama seperti install-logs: key + expiry + IP match).

Body JSON: `{"domain": "...", "sub": "..."}` (`sub` opsional).

Derivasi `sub`: bila kosong, diambil label pertama domain, diformat lowercase, divalidasi regex aman `/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/`, dan prefix `ns-` ditolak.

Kepemilikan sub dicatat di tabel `slowdns_domains` (model `SlowdnsDomain` di database API). Tabrakan sub: bila sub sudah dimiliki key lain, jalur eksplisit (field `sub` diisi) dibalas 409; jalur otomatis (tanpa field `sub`, dipakai installer) memakai fallback `<sub>-<4 karakter acak>` (huruf kecil + angka, crypto) agar instalasi tetap berhasil. Record warisan yang belum tercatat (ada di Cloudflare tanpa baris DB) diklaim hanya bila record A cocok dengan IP pemanggil; beda IP dianggap milik pihak lain.

Efek idempoten: membuat `A` record `ns-<sub>` (proxied=false, ttl 1) dan `NS` record `<sub>` -> `ns-<sub>` (ttl 1). Record sudah ada dengan IP sama = tidak diubah; IP beda = PATCH.

Respons sukses: `{ ok, zone, sub, requested_sub, fallback, tunnel_domain, ns_host, created, updated }` (`requested_sub` = sub sebelum fallback; `fallback` = true bila sub dialihkan).

Error:
- 400 `invalid_domain` / `invalid_sub` / `sub_reserved`
- 403 auth (`invalid_key`, `key_expired`, `ip_mismatch`)
- 409 `sub_taken` (sub sudah dipakai pemilik lain pada jalur eksplisit)
- 429 `rate_limit`
- 500 `internal_error` (env CF tidak lengkap)
- 502 `cf_error`

Env yang dipakai: `CF_DNSTT_TOKEN`, `CF_ACCOUNT_ID`, `CF_DNSTT_ZONE`, `CF_ZONE_ID` (opsional).

## Rujukan Berkas:baris

| Berkas | Baris | Rujukan |
|--------|-------|---------|
| src/index.js | 20-21 | trust proxy |
| src/index.js | 23-38 | generalLimiter, apiLimiter |
| src/index.js | 40-46 | middleware CORS, body parser, rate limiter |
| src/index.js | 47-53 | request logging WIB |
| src/index.js | 55-57 | apiRoutes mount |
| src/index.js | 59-66 | /health |
| src/index.js | 68-69 | express.static public |
| src/index.js | 71-74 | 404 handler |
| src/index.js | 76-81 | error handler |
| src/routes/api.js | 145-177 | GET /?key= |
| src/routes/api.js | 180-205 | GET /api/validate |
| src/routes/api.js | 208-234 | GET /api/key |
| src/routes/api.js | 237-257 | GET /api/exp |
| src/routes/api.js | 260-301 | POST /api/register |
| src/routes/api.js | 304-335 | POST /api/change-key |
| src/routes/api.js | 337-470 | POST /api/slowdns/register (handler slowdnsRegister + attach) |
| src/routes/api.js | 473-489 | GET /api/stats |
| src/routes/api.js | 492-521 | GET /resources/* |
| src/utils/dnstt-cf.js | 1-308 | Modul Cloudflare SlowDNS |
| src/utils/dnstt-cf.js | 111-142 | listDnsRecords + suffix fallback |
| src/utils/dnstt-cf.js | 145-228 | inspectSlowdnsOwnership + resolveSlowdnsSub (kebijakan tabrakan) |
| src/database/init.js | 80-92 | tabel slowdns_domains (kepemilikan subdomain) |
| src/database/init.js | 282-297 | model SlowdnsDomain |
| src/utils/helpers.js | 2-10 | generateApiKey |
| src/utils/helpers.js | 24-31 | validateIp, validateDays |
| src/utils/helpers.js | 33-39 | validateCustomKey |