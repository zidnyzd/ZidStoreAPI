# 03. API dan Lisensi

Halaman ini mendokumentasikan endpoint API, rate limiting, dan trust proxy. Semua rute didefinisikan di src/routes/api.js dan dipasang di src/index.js.

## Middleware Express: Trust Proxy dan Rate Limiting

- `app.set('trust proxy', 1)` di src/index.js:21 agar req.ip mencerminkan X-Forwarded-For dari Nginx.
- `generalLimiter`: 60 request per menit per IP, diterapkan global di src/index.js:44.
- `apiLimiter`: 30 request per menit per IP, diterapkan pada path /api di src/index.js:45.
- CORS dan body parser dipasang di src/index.js:41-43.
- Logging request dengan timestamp WIB di src/index.js:48-53.

## Endpoint GET /?key= (Download Script)

Rute di src/routes/api.js:12-44.

Alur:

1. Ambil key dari query string (src/routes/api.js:13).
2. Client IP dari req.ip (src/routes/api.js:14).
3. Jika key kosong, kembalikan 400 dengan pesan kesalahan (src/routes/api.js:16-18).
4. Cari key aktif lewat ApiKey.findByKey (src/routes/api.js:21).
5. Jika tidak ada, audit log INVALID_KEY dan kembalikan 403 (src/routes/api.js:23-26).
6. Jika expired, nonaktifkan key, audit log EXPIRED_KEY, kembalikan 403 (src/routes/api.js:29-33).
7. Increment usage_count lewat ApiKey.incrementUsage (src/routes/api.js:36).
8. Audit log SCRIPT_DOWNLOAD (src/routes/api.js:39).
9. Redirect 302 ke https://raw.githubusercontent.com/zidnyzd/ScriptTunnel/main/zidstoretunnel (src/routes/api.js:42-43).

## Endpoint GET /api/validate (Dashboard)

Rute di src/routes/api.js:47-72.

Response JSON:

- valid: false, message: "Missing key parameter" jika key kosong.
- valid: false, message: "Invalid key" jika tidak ditemukan.
- valid: false, message: "Key expired", expired_at jika expired.
- valid: true, key, ip, expires_at, days_left jika aktif.

days_left dihitung dengan `(new Date(apiKey.expires_at) - new Date()) / (1000 * 60 * 60 * 24)` (src/routes/api.js:70).

## Endpoint GET /api/key (Plain Key String)

Rute di src/routes/api.js:75-101.

Alur:

1. Ambil key dari query string (src/routes/api.js:76).
2. Client IP dari req.ip (src/routes/api.js:77).
3. Jika key kosong, kembalikan 400 (src/routes/api.js:79-81).
4. Cari key aktif (src/routes/api.js:83).
5. Jika tidak ada, kembalikan 403 (src/routes/api.js:85-87).
6. Jika expired, nonaktifkan dan kembalikan 403 (src/routes/api.js:89-92).
7. Jika apiKey.ip_address ada dan tidak sama dengan clientIp, audit log IP_MISMATCH dan kembalikan 403 (src/routes/api.js:94-97).
8. Increment usage (src/routes/api.js:99).
9. Kembalikan apiKey.key sebagai teks plain (src/routes/api.js:100).

## Endpoint GET /api/exp (Masa Aktif)

Rute di src/routes/api.js:104-124.

Endpoint yang dipakai oleh skrip menu di VPS pelanggan untuk memvalidasi lisensi. Alur:

1. Ambil key dari query string (src/routes/api.js:105).
2. Jika kosong, kembalikan 400 dengan "Missing key" (src/routes/api.js:107-109).
3. Cari key aktif (src/routes/api.js:111).
4. Jika tidak ada, kembalikan 403 dengan "Invalid key" (src/routes/api.js:113-115).
5. Jika expired, nonaktifkan dan kembalikan 403 dengan "Key expired" (src/routes/api.js:117-120).
6. Kembalikan apiKey.expires_at sebagai teks plain (src/routes/api.js:123).

## Endpoint POST /api/register (Registrasi IP)

Rute di src/routes/api.js:127-168.

Body JSON: `{ ip, days }`.

Alur:

1. Ambil ip dan days dari req.body (src/routes/api.js:128).
2. Validasi ip dengan validateIp (src/routes/api.js:135-137).
3. Validasi days dengan validateDays (src/routes/api.js:139-141).
4. Cek apakah IP sudah memiliki key aktif (src/routes/api.js:144-152). Jika ada, kembalikan 409 dengan key dan expires_at.
5. Generate key lewat generateApiKey(parseInt(KEY_LENGTH) || 20) (src/routes/api.js:155).
6. Buat key lewat ApiKey.create (src/routes/api.js:156).
7. Audit log KEY_REGISTER (src/routes/api.js:158).
8. Response JSON: success, key, ip, days, expires_at, install_url (src/routes/api.js:160-167).

## Endpoint GET /api/stats (Statistik)

Rute di src/routes/api.js:171-187.

Prepared statement langsung ke db:

- total_keys: COUNT(*) dari api_keys.
- active_keys: COUNT(*) dari api_keys WHERE is_active = 1.
- total_accounts: COUNT(*) dari vpn_accounts.
- active_accounts: COUNT(*) dari vpn_accounts WHERE is_active = 1.
- total_downloads: SUM(usage_count) dari api_keys, default 0 jika null.

## Endpoint GET /resources/* (Penyajian File Statis)

Rute di src/routes/api.js:189-219.

Alur:

1. Ambil filePath dari req.params[0] (src/routes/api.js:191).
2. Gabungkan ke fullPath = path.join(__dirname, '../../resources', filePath) (src/routes/api.js:192).
3. Proteksi path traversal: jika !fullPath.startsWith(path.join(__dirname, '../../resources')) kembalikan 403 (src/routes/api.js:194-197).
4. Jika file tidak ada, kembalikan 404 (src/routes/api.js:199-201).
5. Tentukan Content-Type berdasarkan ekstensi (src/routes/api.js:204-214).
6. Set Content-Disposition attachment (src/routes/api.js:217).
7. sendFile (src/routes/api.js:218).

## Health Check dan Static Files

- GET /health di src/index.js:59-66 mengembalikan status, uptime, timestamp, version.
- express.static(path.join(__dirname, '../public')) di src/index.js:69.
- 404 handler di src/index.js:72-74.
- Error handler di src/index.js:77-81 audit log SERVER_ERROR.

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
| src/routes/api.js | 11-44 | GET /?key= |
| src/routes/api.js | 46-72 | GET /api/validate |
| src/routes/api.js | 74-101 | GET /api/key |
| src/routes/api.js | 103-124 | GET /api/exp |
| src/routes/api.js | 126-168 | POST /api/register |
| src/routes/api.js | 170-187 | GET /api/stats |
| src/routes/api.js | 189-219 | GET /resources/* |
| src/utils/helpers.js | 2-10 | generateApiKey |
| src/utils/helpers.js | 24-31 | validateIp, validateDays |