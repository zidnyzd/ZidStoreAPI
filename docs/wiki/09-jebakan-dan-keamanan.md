# 09. Jebakan dan Keamanan

Dokumen ini mencatat jebakan nyata yang pernah terjadi atau berpotensi terjadi di ZidStoreAPI, beserta penyebab teknis dan cara mitigasi.

## Jebakan 1: IP Mismatch pada GET /api/key

**Gejala**

Operator atau klien menerima 403 "Error: IP not authorized for this key" meskipun IP yang mengakses memang terdaftar.

**Penyebab Teknis**

- Nginx reverse proxy tidak meneruskan header X-Real-IP atau X-Forwarded-For, sehingga req.ip di Express terisi 127.0.0.1.
- app.set('trust proxy', 1) tidak aktif atau berada setelah middleware yang membaca req.ip.
- Klien mengakses via HTTP langsung ke port 3000 (bukan HTTPS), sehingga Express tidak melihat header trust proxy yang valid.

Solusi yang diimplementasikan:

- app.set('trust proxy', 1) di 21.
- deploy.sh menambahkan proxy_set_header X-Real-IP \$remote_addr dan X-Forwarded-For \$proxy_add_x_forwarded_for di deploy.sh:208-209 dan deploy.sh:299-300.
- request logging mencatat req.ip ke console (51).

**Cara Menghindari / Mengatasi**

- Pastikan deploy.sh atau konfigurasi Nginx Anda memasang header X-Real-IP.
- Verifikasi req.ip dari edge VPS bukan 127.0.0.1 dengan meninjau console log di 51.
- Jika menggunakan load balancer tambahan, naikkan angka trust proxy sesuai hop.

## Jebakan 2: Parsing Output CLI Menghasilkan Error JSON

**Gejala**

Edge API mengembalikan 500 "Terjadi kesalahan saat memproses output JSON" meskipun skrip CLI sukses membuat akun.

**Penyebab Teknis**

- Skrip CLI mencetak warna atau format terminal lain ke stdout/stderr, mencampur karakter ANSI escape sequence.
- Prompt interaktif atau banner berbaris mencemari stdout, sehingga extractJson tidak menemukan pasangan { } yang valid.
- File config diubah oleh user lain atau ulang generate stats Xray menimbulkan output tak terduga.

Solusi di kode:

- stripAnsi menghapus \x1B[...m, OSC, DCS/SOS/PM/APC sequences (resources/bot/api.js:9-16).
- extractJson mencari indeks { pertama dan } terakhir lalu JSON.parse (resources/bot/api.js:18-33).
- Fallback parse key-value untuk trial vmess/vless/trojan/ssh (resources/bot/api.js:40-166).

**Cara Menghindari / Mengatasi**

- Pastikan script CLI berjalan dengan env TERM=xterm jika perlu, seperti pada handler trial (resources/bot/api.js:1392-1393, 1471-1474, 1552-1555, 1633-1636).
- Bersihkan config.json dari baris banner atau prompt sebelum parse.
- Periksa log stderr di console.log untuk eksperimen reproduksi.

## Jebakan 3: Penghapusan IP Gagal atau Orphan Records

**Gejala**

- Operator menghapus IP, tetapi akun VPN terkait masih ada di tabel vpn_accounts.
- Error "FOREIGN KEY constraint failed" muncul saat menghapus api_keys.

**Penyebab Teknis**

- foreign_keys ON membuat sqlite menolak DELETE pada parent jika masih ada child vpn_accounts (17-17).
- Tidak ada ON DELETE CASCADE di skema (42-42).
- deleteByIp sudah berjalan dua tahap: hapus vpn_accounts per key_id, lalu hapus api_keys (133-144).

Solusi yang sudah ada di kode:

- deleteByIp mengambil id dari api_keys berdasarkan ip_address, kemudian hapus vpn_accounts yang refer ke id tersebut sebelum menghapus baris api_keys (133-144).

**Cara Menghindari / Mengatasi**

- Jangan menjalankan DELETE api_keys secara manual tanpa menghapus vpn_accounts terlebih dahulu.
- Jika muncul orphan record di database.sqlite3 legacy, hapus melalui ApiKey.deleteByIp agar aturan diterapkan.
- Jika skrip penghapusan butuh lebih cepat, gunakan VACUUM setelah menghapus massal.

## Jebakan 4: Hak Akses File Terlalu Buka

**Gejala**

- /root/.key, /root/.vars, database.db, atau config Xray dapat dibaca oleh user non-root.
- Penyusup dapat mengambil kata sandi bridge atau token bot.

**Penyebab Teknis**

- Script instalasi atau operator lupa atur chmod setelah copy berkas.
- Proses node berjalan di bawah user root, sehingga file yang dibuat oleh proses tersebut memiliki mode yang terlalu permisif.
- Node default membuat .db dengan mode 0664 atau 0666 jika umask tidak diubah.

**Cara Menghindari / Mengatasi**

- Atur umask sebelum membuat berkas sensitif.
- Gunakan chmod 600 untuk /root/.key dan /root/.vars.
- Hindari mengeksekusi skrip CLI sebagai root jika memungkinkan. Jika menggunakan Docker, batasi user non-root.
- Audit berkas sensitif secara periodik.

## Jebakan 5: Domain Lisensi Bisa Dibaik di VPS Pelanggan

**Gejala**

Skrip menu atau ft tidak mendeteksi expired meskipun domain lisensi sudah expired, karena VPS pelanggan me-reverse domain ke IP lain atau host lokal.

**Penyebab Teknis**

- resources/src-bin/menu dan ft membaca kunci dari /root/.key dan memanggil https://zds.web.id/api/exp?key= secara langsung (4-5).
- /etc/hosts di VPS pelanggan bisa mengarahkan zds.web.id ke 127.0.0.1 atau IP lain yang menyediakan halaman palsu yang selalu mengembalikan tanggal yang tidak valid.
- Jika bypass berhasil, skrip menganggap lisensi aktif selamanya.

**Cara Menghindari / Mengatasi**

- Jangan mempercayai client-side saja. Tambahkan validasi sisi server untuk expiry yang ketat.
- Tambahkan pemeriksaan integritas domain atau fingerprint server (misalnya signed response atau hardcode signature).
- Pastikan zds.web.id menggunakan DNSSEC dan resolusi DNS tepercaya di VPS pelanggan.
- Monitoring: catat IP akses edge API, dan tambahkan log jika expired key tetap bisa mengunduh skrip.

## Jebakan 6: Register SlowDNS 502 cf_error / 500 internal_error

**Gejala**

Panggilan POST /api/slowdns/register (menu Change SlowDNS domain atau fallback domain installer) gagal dengan 502 `cf_error` atau 500 `internal_error`.

**Penyebab Teknis**

- Env Cloudflare tidak lengkap (`CF_DNSTT_TOKEN` atau `CF_ACCOUNT_ID` kosong) -> 500 `internal_error`.
- Token Cloudflare salah / tidak punya izin zona -> 502 `cf_error`.
- Gangguan Cloudflare atau timeout pemanggilan API -> 502 `cf_error`.

**Penanganan**

- Periksa env `CF_DNSTT_TOKEN`, `CF_ACCOUNT_ID` (dan `CF_DNSTT_ZONE` / `CF_ZONE_ID` bila dipakai).
- Pastikan token memiliki izin menulis DNS zona tujuan.
- Bila 502 bersifat sementara, ulangi panggilan setelah jeda; mode fallback domain tetap fail-open, instalasi tidak terhenti.
- Bila balasan 409 `sub_taken`: subdomain sudah dipakai pemilik lain; pada jalur manual pilih subdomain lain, pada jalur otomatis installer memakai fallback `<sub>-xxxx` (acak).

## Rujukan Berkas:baris

| Berkas | Baris | Rujukan |
|--------|-------|---------|
| src/index.js | 20-21 | trust proxy |
| src/index.js | 48-53 | logging req.ip |
| src/index.js | 77-81 | audit SERVER_ERROR |
| src/routes/api.js | 208-234 | GET /api/key validasi IP |
| src/routes/api.js | 237-257 | GET /api/exp |
| src/database/init.js | 17 | pragma foreign_keys |
| src/database/init.js | 42 | FOREIGN KEY tanpa ON DELETE CASCADE |
| src/database/init.js | 133-144 | deleteByIp dua tahap |
| resources/bot/api.js | 9-16 | stripAnsi |
| resources/bot/api.js | 18-33 | extractJson |
| resources/bot/api.js | 40-166 | buildTrialResponse fallback |
| resources/bot/api.js | 246-253 | checkPassword |
| resources/src-bin/menu | 4-5 | validasi lisensi via /api/exp |
| resources/src-bin/ft | 4-5 | validasi lisensi via /api/exp |
| deploy.sh | 208-209 | Nginx X-Real-IP, X-Forwarded-For |
| deploy.sh | 299-300 | Nginx HTTPS headers |
| deploy.sh | 307-312 | Block sensitive files |