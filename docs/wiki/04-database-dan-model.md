# 04. Database dan Model

Database adalah SQLite single-file di data/zidstore.db, diakses lewat better-sqlite3. Seluruh definisi skema dan model berada di src/database/init.js.

## Konfigurasi Koneksi

- DB_PATH diambil dari environment dengan fallback ./data/zidstore.db (5-5).
- Direktori data dibuat otomatis dengan fs.mkdirSync recursive bila belum ada (7-11).
- Koneksi dibuat sekali pada modul load: `new Database(DB_PATH)` (13-13).
- WAL mode aktif agar reader tidak terblokir writer (16-16).
- foreign_keys ON, wajib untuk menjaga integritas vpn_accounts terhadap api_keys (17-17).

## Skema Tabel

### api_keys (21-31)

| Kolom | Tipe | Constraint | Fungsi |
|-------|------|------------|--------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Kunci surrogate |
| key | TEXT | UNIQUE NOT NULL | Nilai kunci lisensi |
| ip_address | TEXT | NOT NULL | IP yang di-bind |
| days_valid | INTEGER | NOT NULL | Durasi hari saat pembuatan |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Waktu pembuatan |
| expires_at | DATETIME | NOT NULL | Batas masa aktif |
| is_active | INTEGER | DEFAULT 1 | Flag aktif, dipakai untuk penonaktifan |
| last_used | DATETIME | Nullable | Waktu akses terakhir |
| usage_count | INTEGER | DEFAULT 0 | Penghitung pemakaian skrip |

### vpn_accounts (33-43)

| Kolom | Tipe | Constraint | Fungsi |
|-------|------|------------|--------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Kunci surrogate |
| username | TEXT | UNIQUE NOT NULL | Nama akun per protokol |
| key_id | INTEGER | NOT NULL, FK ke api_keys(id) | Relasi ke lisensi |
| protocol | TEXT | NOT NULL, CHECK IN ('vmess','vless','trojan','shadowsocks','openvpn') | Jenis protokol |
| port | INTEGER | NOT NULL | Port layanan |
| is_active | INTEGER | DEFAULT 1 | Flag aktif |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Waktu pembuatan |
| expires_at | DATETIME | NOT NULL | Batas masa aktif akun |

### audit_log (45-51)

| Kolom | Tipe | Constraint | Fungsi |
|-------|------|------------|--------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Kunci surrogate |
| action | TEXT | NOT NULL | Nama aksi, misal SCRIPT_DOWNLOAD |
| details | TEXT | Nullable | Detail bebas dalam bentuk string |
| ip_address | TEXT | Nullable | IP pelaku atau sumber |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Waktu kejadian |

Catatan: task menyebut tabel `audit_logs`, namun skema yang benar-benar dieksekusi adalah `audit_log` (tunggal), sumber/query di 45-51 dan 244-249. Nama objek AuditLog pada kode tetap mengikuti konvensi camel case.

### Index (53-57)

- idx_api_keys_key pada api_keys(key).
- idx_api_keys_ip pada api_keys(ip_address).
- idx_api_keys_active pada api_keys(is_active, expires_at).
- idx_vpn_accounts_key pada vpn_accounts(key_id).
- idx_vpn_accounts_username pada vpn_accounts(username).

Index gabungan is_active dan expires_at kompensasi query deaktivasi massaal sekaligus query key aktif.

## Model ApiKey (96-210)

Semua query memakai prepared statement dengan parameter binding, sehingga tidak ada interpolasi string ke SQL.

| Method | Baris | Perilaku |
|--------|-------|----------|
| create(key, ip, days) | 97-101 | Hitung expires_at dari Date.now() plus hari, insert 4 kolom |
| findByKey(key) | 103-106 | SELECT * WHERE key = ? AND is_active = 1, ambil satu baris |
| findByIp(ip) | 108-111 | SELECT * WHERE ip_address = ? AND is_active = 1 ORDER BY created_at DESC, ambil semua |
| findLatestByIp(ip) | 113-116 | Ambil satu key terbaru untuk IP, tanpa filter is_active |
| findAll() | 118-121 | Semua key ORDER BY created_at DESC |
| deactivate(key) | 123-126 | UPDATE is_active = 0 WHERE key = ? |
| deactivateByIp(ip) | 128-131 | UPDATE is_active = 0 WHERE ip_address = ? |
| deleteByIp(ip) | 133-144 | Hapus vpn_accounts terkait dulu, baru hapus api_keys |
| changeIp(oldIp, newIp) | 146-159 | UPDATE ip_address WHERE ip_address = oldIp |
| changeKey(ip, newKey) | 161-181 | Cari key terbaru via findLatestByIp, tolak NOT_FOUND/DUPLICATE_KEY, UPDATE key, kembalikan oldKey/newKey/data |
| renewByIp(ip, days) | 183-199 | Perpanjang dari max(Date.now(), expires_at), set is_active = 1 |
| deactivateExpired() | 201-204 | UPDATE is_active = 0 WHERE expires_at < datetime('now') |
| incrementUsage(key) | 206-209 | usage_count + 1 dan last_used = CURRENT_TIMESTAMP |

Catatan penting: findByKey hanya mengembalikan key dengan is_active = 1. Semua handler yang memeriksa key expired tetap bekerja karena key expired sudah dinonaktifkan oleh deactivateExpired pada startup atau oleh request sebelumnya.

## Model VpnAccount (212-242)

| Method | Baris | Perilaku |
|--------|-------|----------|
| create(username, keyId, protocol, port, expiresAt) | 178-181 | Insert akun baru terikat key_id |
| findByUsername(username) | 183-186 | Cari akun per username |
| findByKeyId(keyId) | 188-191 | Semua akun untuk satu lisensi, ORDER BY created_at DESC |
| deactivate(username) | 193-196 | UPDATE is_active = 0 |
| deactivateExpired() | 198-201 | Nonaktifkan akun yang lewat masa aktif |
| findAll() | 203-206 | JOIN vpn_accounts dengan api_keys untuk mengambil ip_address |

## Model AuditLog (244-249)

`log(action, details, ip = null)` melakukan INSERT ke audit_log. Dipakai di banyak tempat:

- src/routes/api.js:157 INVALID_KEY
- src/routes/api.js:164 EXPIRED_KEY
- src/routes/api.js:172 SCRIPT_DOWNLOAD
- src/routes/api.js:228 IP_MISMATCH
- src/routes/api.js:291 KEY_REGISTER
- src/routes/api.js:326 KEY_CHANGED
- src/bot/telegram.js:341 dan 704 IP_CHANGED
- 425-425 dan 784 IP_DELETED
- src/bot/telegram.js:390 dan 758 KEY_EDITED
- src/bot/telegram.js:490 KEY_REVOKED
- src/bot/telegram.js:647 KEY_RENEWED
- src/bot/telegram.js:814 BOT_REGISTER
- 79 SERVER_ERROR
- 123 SERVER_START
- 129 dan 123 SERVER_STOP

## Model SlowdnsDomain (282-297)

Model pencatatan kepemilikan subdomain SlowDNS (tabel `slowdns_domains`, 80-92): `findBySub` mencari pemilik sub pada satu zona, `create` mencatat klaim baru, `updateOwnerInfo` memperbarui IP/domain install dan `updated_at`. Dipakai endpoint POST /api/slowdns/register untuk kebijakan tabrakan subdomain.

## Integritas Relasional dan Cascade Delete

Schema declaring foreign key (key_id) REFERENCES api_keys(id) pada 42-42, dengan pragma foreign_keys = ON pada 17-17. Artinya penghapusan parent api_keys akan ditolak selama masih ada vpn_accounts yang merujuk.

Karena itu deleteByIp (133-144) tidak bisa langsung menghapus api_keys. Implementasinya dua tahap:

1. SELECT id FROM api_keys WHERE ip_address = ? (135-135).
2. DELETE FROM vpn_accounts WHERE key_id = ? untuk setiap id (137-140).
3. DELETE FROM api_keys WHERE ip_address = ? (142-143).

Tidak ada ON DELETE CASCADE di skema. Urutan penghapusan manual di deleteByIp adalah satu-satunya penjaga integritas. Jika urutan dibalik, statement DELETE api_keys akan gagal dengan FOREIGN KEY constraint failed karena foreign_keys aktif.

Catatan lain: changeIp (146-159) mengubah ip_address pada seluruh baris yang cocok dengan oldIp, tanpa menyentuh vpn_accounts. Relasi akun tetap utuh karena key_id tidak berubah.

## Mode WAL

WAL (Write-Ahead Logging) diaktifkan pada 16-16. Konsekuensinya:

- Pembacaan tidak terblokir oleh penulisan.
- File database terdiri dari data/zidstore.db, -wal, dan -shm.
- Backup perlu mencerminkan ketiga file atau memakai API backup SQLite.

## Rujukan Berkas:baris

| Berkas | Baris | Rujukan |
|--------|-------|---------|
| src/database/init.js | 5 | DB_PATH |
| src/database/init.js | 7-11 | mkdir data directory |
| src/database/init.js | 13 | new Database |
| src/database/init.js | 15-17 | pragma WAL, foreign_keys |
| src/database/init.js | 20-93 | CREATE TABLE, CREATE INDEX |
| src/database/init.js | 21-31 | tabel api_keys |
| src/database/init.js | 33-43 | tabel vpn_accounts |
| src/database/init.js | 45-51 | tabel audit_log |
| src/database/init.js | 53-57 | index |
| src/database/init.js | 80-92 | tabel slowdns_domains |
| src/database/init.js | 96-210 | ApiKey |
| src/database/init.js | 133-144 | deleteByIp dua tahap |
| src/database/init.js | 146-159 | changeIp |
| src/database/init.js | 161-181 | changeKey |
| src/database/init.js | 183-199 | renewByIp |
| src/database/init.js | 201-204 | deactivateExpired |
| src/database/init.js | 206-209 | incrementUsage |
| src/database/init.js | 212-242 | VpnAccount |
| src/database/init.js | 244-249 | AuditLog |
| src/database/init.js | 282-297 | SlowdnsDomain |
| src/index.js | 95-97 | startup cleanup expired |