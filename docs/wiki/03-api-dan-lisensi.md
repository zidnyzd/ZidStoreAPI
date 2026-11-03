# 03. API dan Lisensi

Halaman ini mendokumentasikan endpoint API, rate limiting, dan trust proxy. Semua rute didefinisikan di src/routes/api.js dan dipasang di src/index.js.

## Middleware Express: Trust Proxy dan Rate Limiting

- `app.set('trust proxy', 1)` di src/index.js:21 agar req.ip mencerminkan X-Forwarded-For dari Nginx.
- `generalLimiter`: 60 request per menit per IP, diterapkan global di src/index.js:44.
- `apiLimiter`: 30 request per menit per IP, diterapkan pada path /api di src/index.js:45.
- CORS dan body parser dipasang di src/index.js:41-43.
- Logging request dengan timestamp WIB di src/index.js:48-53.

## Endpoint GET /?key= (Download Script)

Rute di src/routes/api.js:13-45.

Alur:

1. Ambil key dari query string (src/routes/api.js:14-14).
2. Client IP dari req.ip (src/routes/api.js:15-15).
3. Jika key kosong, kembalikan 400 dengan pesan kesalahan (src/routes/api.js:17-19).
4. Cari key aktif lewat ApiKey.findByKey (src/routes/api.js:22-22).
5. Jika tidak ada, audit log INVALID_KEY dan kembalikan 403 (src/routes/api.js:24-27).
6. Jika expired, nonaktifkan key, audit log EXPIRED_KEY, kembalikan 403 (src/routes/api.js:30-34).
7. Increment usage_count lewat ApiKey.incrementUsage (src/routes/api.js:37-37).
8. Audit log SCRIPT_DOWNLOAD (src/routes/api.js:40-40).
9. Redirect 302 ke https://raw.githubusercontent.com/zidnyzd/ScriptTunnel/main/zidstoretunnel (src/routes/api.js:43-44).

## Endpoint GET /api/validate (Dashboard)

Rute di src/routes/api.js:48-73.

Response JSON:

- valid: false, message: "Missing key parameter" jika key kosong.
- valid: false, message: "Invalid key" jika tidak ditemukan.
- valid: false, message: "Key expired", expired_at jika expired.
- valid: true, key, ip, expires_at, days_left jika aktif.

days_left dihitung dengan `(new Date(apiKey.expires_at) - new Date()) / (1000 * 60 * 60 * 24)` (src/routes/api.js:71-71).

## Endpoint GET /api/key (Plain Key String)

Rute di src/routes/api.js:76-102.

Alur:

1. Ambil key dari query string (src/routes/api.js:77-77).
2. Client IP dari req.ip (src/routes/api.js:78-78).
3. Jika key kosong, kembalikan 400 (src/routes/api.js:80-82).
4. Cari key aktif (src/routes/api.js:84-84).
5. Jika tidak ada, kembalikan 403 (src/routes/api.js:86-88).
6. Jika expired, nonaktifkan dan kembalikan 403 (src/routes/api.js:90-93).
7. Jika apiKey.ip_address ada dan tidak sama dengan clientIp, audit log IP_MISMATCH dan kembalikan 403 (src/routes/api.js:95-98).
8. Increment usage (src/routes/api.js:100-100).
9. Kembalikan apiKey.key sebagai teks plain (src/routes/api.js:101-101).

## Endpoint GET /api/exp (Masa Aktif)

Rute di src/routes/api.js:105-125.

Endpoint yang dipakai oleh skrip menu di VPS pelanggan untuk memvalidasi lisensi. Alur:

1. Ambil key dari query string (src/routes/api.js:106-106).
2. Jika kosong, kembalikan 400 dengan "Missing key" (src/routes/api.js:108-110).
3. Cari key aktif (src/routes/api.js:112-112).
4. Jika tidak ada, kembalikan 403 dengan "Invalid key" (src/routes/api.js:114-116).
5. Jika expired, nonaktifkan dan kembalikan 403 dengan "Key expired" (src/routes/api.js:118-121).
6. Kembalikan apiKey.expires_at sebagai teks plain (src/routes/api.js:124-124).

## Endpoint POST /api/register (Registrasi IP)

Rute di src/routes/api.js:128-169.

Body JSON: `{ ip, days }`.

Alur:

1. Ambil ip dan days dari req.body (src/routes/api.js:129-129).
2. Validasi ip dengan validateIp (src/routes/api.js:136-138).
3. Validasi days dengan validateDays (src/routes/api.js:140-142).
4. Cek apakah IP sudah memiliki key aktif (src/routes/api.js:145-153). Jika ada, kembalikan 409 dengan key dan expires_at.
5. Generate key lewat generateApiKey(parseInt(KEY_LENGTH) || 20) (src/routes/api.js:156-156).
6. Buat key lewat ApiKey.create (src/routes/api.js:157-157).
7. Audit log KEY_REGISTER (src/routes/api.js:159-159).
8. Response JSON: success, key, ip, days, expires_at, install_url (src/routes/api.js:161-168).

## Endpoint POST /api/change-key (Ubah Kustom Key)

Rute di src/routes/api.js:171-202.

Body JSON: `{ ip, new_key }`.

Alur:

1. Ambil ip dan new_key dari req.body (src/routes/api.js:172-173).
2. Validasi ip dengan validateIp (src/routes/api.js:176). Gagal -> 400 dengan pesan "Invalid IP address format".
3. Validasi new_key dengan validateCustomKey (src/utils/helpers.js:33-39): 4-32 karakter dari himpunan alfanumerik, strip (-), atau underscore (_), regex `/^[a-zA-Z0-9_-]{4,32}$/`. Gagal -> 400 dengan pesan "Invalid key format. Allowed: 4-32 alphanumeric characters, dash, or underscore".
4. Panggil ApiKey.changeKey(ip, new_key) (src/database/init.js:126-146).
5. Jika result.reason === 'NOT_FOUND' (tidak ada key untuk IP) -> 404 dengan pesan "No key found for this IP".
6. Jika result.reason === 'DUPLICATE_KEY' (key sudah dipakai IP lain) -> 409 dengan pesan "Key already in use by another IP".
7. Audit log KEY_CHANGED dengan IP, oldKey, newKey, dan client IP (src/routes/api.js:194).
8. Response 200: { success: true, ip, old_key, new_key } (src/routes/api.js:196-201).

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

Rute di src/routes/api.js:205-221.

Prepared statement langsung ke db:

- total_keys: COUNT(*) dari api_keys.
- active_keys: COUNT(*) dari api_keys WHERE is_active = 1.
- total_accounts: COUNT(*) dari vpn_accounts.
- active_accounts: COUNT(*) dari vpn_accounts WHERE is_active = 1.
- total_downloads: SUM(usage_count) dari api_keys, default 0 jika null.

## Endpoint GET /resources/* (Penyajian File Statis)

Rute di src/routes/api.js:223-253.

Alur:

1. Ambil filePath dari req.params[0] (src/routes/api.js:225-225).
2. Gabungkan ke fullPath = path.join(__dirname, '../../resources', filePath) (src/routes/api.js:226-226).
3. Proteksi path traversal: jika !fullPath.startsWith(path.join(__dirname, '../../resources')) kembalikan 403 (src/routes/api.js:228-231).
4. Jika file tidak ada, kembalikan 404 (src/routes/api.js:233-235).
5. Tentukan Content-Type berdasarkan ekstensi (src/routes/api.js:238-248).
6. Set Content-Disposition attachment (src/routes/api.js:251-251).
7. sendFile (src/routes/api.js:252-252).

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
| src/routes/api.js | 12-45 | GET /?key= |
| src/routes/api.js | 47-73 | GET /api/validate |
| src/routes/api.js | 75-102 | GET /api/key |
| src/routes/api.js | 104-125 | GET /api/exp |
| src/routes/api.js | 128-169 | POST /api/register |
| src/routes/api.js | 171-202 | POST /api/change-key |
| src/routes/api.js | 205-221 | GET /api/stats |
| src/routes/api.js | 223-253 | GET /resources/* |
| src/utils/helpers.js | 2-10 | generateApiKey |
| src/utils/helpers.js | 24-31 | validateIp, validateDays |
| src/utils/helpers.js | 33-39 | validateCustomKey |