# 04. Database dan Model

Database adalah SQLite single-file di data/zidstore.db, diakses lewat better-sqlite3. Seluruh definisi skema dan model berada di src/database/init.js.

## Konfigurasi Koneksi

- DB_PATH diambil dari environment dengan fallback ./data/zidstore.db (src/database/init.js:5-5).
- Direktori data dibuat otomatis dengan fs.mkdirSync recursive bila belum ada (src/database/init.js:7-11).
- Koneksi dibuat sekali pada modul load: `new Database(DB_PATH)` (src/database/init.js:13-13).
- WAL mode aktif agar reader tidak terblokir writer (src/database/init.js:16-16).
- foreign_keys ON, wajib untuk menjaga integritas vpn_accounts terhadap api_keys (src/database/init.js:17-17).

## Skema Tabel

### api_keys (src/database/init.js:21-31)

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

### vpn_accounts (src/database/init.js:33-43)

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

### audit_log (src/database/init.js:45-51)

| Kolom | Tipe | Constraint | Fungsi |
|-------|------|------------|--------|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Kunci surrogate |
| action | TEXT | NOT NULL | Nama aksi, misal SCRIPT_DOWNLOAD |
| details | TEXT | Nullable | Detail bebas dalam bentuk string |
| ip_address | TEXT | Nullable | IP pelaku atau sumber |
| created_at | DATETIME | DEFAULT CURRENT_TIMESTAMP | Waktu kejadian |

Catatan: task menyebut tabel `audit_logs`, namun skema yang benar-benar dieksekusi adalah `audit_log` (tunggal), sumber/query di src/database/init.js:45-45 dan src/database/init.js:211-211. Nama objek AuditLog pada kode tetap mengikuti konvensi camel case.

### Index (src/database/init.js:53-57)

- idx_api_keys_key pada api_keys(key).
- idx_api_keys_ip pada api_keys(ip_address).
- idx_api_keys_active pada api_keys(is_active, expires_at).
- idx_vpn_accounts_key pada vpn_accounts(key_id).
- idx_vpn_accounts_username pada vpn_accounts(username).

Index gabungan is_active dan expires_at kompensasi query deaktivasi massaal sekaligus query key aktif.

## Model ApiKey (src/database/init.js:61-175)

Semua query memakai prepared statement dengan parameter binding, sehingga tidak ada interpolasi string ke SQL.

| Method | Baris | Perilaku |
|--------|-------|----------|
| create(key, ip, days) | 62-66 | Hitung expires_at dari Date.now() plus hari, insert 4 kolom |
| findByKey(key) | 68-71 | SELECT * WHERE key = ? AND is_active = 1, ambil satu baris |
| findByIp(ip) | 73-76 | SELECT * WHERE ip_address = ? AND is_active = 1 ORDER BY created_at DESC, ambil semua |
| findLatestByIp(ip) | 78-81 | Ambil satu key terbaru untuk IP, tanpa filter is_active |
| findAll() | 83-86 | Semua key ORDER BY created_at DESC |
| deactivate(key) | 88-91 | UPDATE is_active = 0 WHERE key = ? |
| deactivateByIp(ip) | 93-96 | UPDATE is_active = 0 WHERE ip_address = ? |
| deleteByIp(ip) | 98-109 | Hapus vpn_accounts terkait dulu, baru hapus api_keys |
| changeIp(oldIp, newIp) | 111-124 | UPDATE ip_address WHERE ip_address = oldIp |
| changeKey(ip, newKey) | 126-146 | Cari key terbaru via findLatestByIp, tolak NOT_FOUND/DUPLICATE_KEY, UPDATE key, kembalikan oldKey/newKey/data |
| renewByIp(ip, days) | 148-164 | Perpanjang dari max(Date.now(), expires_at), set is_active = 1 |
| deactivateExpired() | 166-169 | UPDATE is_active = 0 WHERE expires_at < datetime('now') |
| incrementUsage(key) | 171-174 | usage_count + 1 dan last_used = CURRENT_TIMESTAMP |

Catatan penting: findByKey hanya mengembalikan key dengan is_active = 1. Semua handler yang memeriksa key expired tetap bekerja karena key expired sudah dinonaktifkan oleh deactivateExpired pada startup atau oleh request sebelumnya.

## Model VpnAccount (src/database/init.js:177-207)

| Method | Baris | Perilaku |
|--------|-------|----------|
| create(username, keyId, protocol, port, expiresAt) | 178-181 | Insert akun baru terikat key_id |
| findByUsername(username) | 183-186 | Cari akun per username |
| findByKeyId(keyId) | 188-191 | Semua akun untuk satu lisensi, ORDER BY created_at DESC |
| deactivate(username) | 193-196 | UPDATE is_active = 0 |
| deactivateExpired() | 198-201 | Nonaktifkan akun yang lewat masa aktif |
| findAll() | 203-206 | JOIN vpn_accounts dengan api_keys untuk mengambil ip_address |

## Model AuditLog (src/database/init.js:209-214)

`log(action, details, ip = null)` melakukan INSERT ke audit_log. Dipakai di banyak tempat:

- src/routes/api.js:25-25 INVALID_KEY
- src/routes/api.js:32-32 EXPIRED_KEY
- src/routes/api.js:40-40 SCRIPT_DOWNLOAD
- src/routes/api.js:96-96 IP_MISMATCH
- src/routes/api.js:159-159 KEY_REGISTER
- src/routes/api.js:194-194 KEY_CHANGED
- src/bot/telegram.js:341-341 dan 650 IP_CHANGED
- src/bot/telegram.js:425-425 dan 613 IP_DELETED
- src/bot/telegram.js:390-390 dan 704-704 KEY_EDITED
- src/bot/telegram.js:490-490 KEY_REVOKED
- src/bot/telegram.js:593-593 KEY_RENEWED
- src/bot/telegram.js:760-760 BOT_REGISTER
- src/index.js:79 SERVER_ERROR
- src/index.js:111 SERVER_START
- src/index.js:117 dan 123 SERVER_STOP

## Integritas Relasional dan Cascade Delete

Schema declaring foreign key (key_id) REFERENCES api_keys(id) pada src/database/init.js:42-42, dengan pragma foreign_keys = ON pada src/database/init.js:17-17. Artinya penghapusan parent api_keys akan ditolak selama masih ada vpn_accounts yang merujuk.

Karena itu deleteByIp (src/database/init.js:98-109) tidak bisa langsung menghapus api_keys. Implementasinya dua tahap:

1. SELECT id FROM api_keys WHERE ip_address = ? (src/database/init.js:100-100).
2. DELETE FROM vpn_accounts WHERE key_id = ? untuk setiap id (src/database/init.js:102-105).
3. DELETE FROM api_keys WHERE ip_address = ? (src/database/init.js:107-108).

Tidak ada ON DELETE CASCADE di skema. Urutan penghapusan manual di deleteByIp adalah satu-satunya penjaga integritas. Jika urutan dibalik, statement DELETE api_keys akan gagal dengan FOREIGN KEY constraint failed karena foreign_keys aktif.

Catatan lain: changeIp (src/database/init.js:111-124) mengubah ip_address pada seluruh baris yang cocok dengan oldIp, tanpa menyentuh vpn_accounts. Relasi akun tetap utuh karena key_id tidak berubah.

## Mode WAL

WAL (Write-Ahead Logging) diaktifkan pada src/database/init.js:16-16. Konsekuensinya:

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
| src/database/init.js | 20-58 | CREATE TABLE, CREATE INDEX |
| src/database/init.js | 21-31 | tabel api_keys |
| src/database/init.js | 33-43 | tabel vpn_accounts |
| src/database/init.js | 45-51 | tabel audit_log |
| src/database/init.js | 53-57 | index |
| src/database/init.js | 61-175 | ApiKey |
| src/database/init.js | 98-109 | deleteByIp dua tahap |
| src/database/init.js | 111-124 | changeIp |
| src/database/init.js | 126-146 | changeKey |
| src/database/init.js | 148-164 | renewByIp |
| src/database/init.js | 166-169 | deactivateExpired |
| src/database/init.js | 171-174 | incrementUsage |
| src/database/init.js | 177-207 | VpnAccount |
| src/database/init.js | 209-214 | AuditLog |
| src/index.js | 95-97 | startup cleanup expired |