# 05. Bot Telegram Control Plane

Bot Telegram operator di src/bot/telegram.js berfungsi sebagai panel administrasi lisensi dan IP. Pengguna yang tidak terdaftar ditolak secara keseluruhan. Semua aksi dicatat ke audit_log.

## Arsitektur

Bot dipasang di src/index.js:100-109, hanya saat TELEGRAM_BOT_TOKEN tersedia dan bukan placeholder. Instance `TelegramBotHandler` menggunakan node-telegram-bot-api dengan polling mode (src/bot/telegram.js:17).

## Otorisasi RBAC

`ALLOWED_USER_ID` didefinisikan sebagai 6200639382 pada src/bot/telegram.js:9. Fungsi `isAuthorized(telegramId)` mengizinkan pemanggilan jika `isAdmin(telegramId)` true atau `telegramId` sama dengan ALLOWED_USER_ID (src/bot/telegram.js:11-13).

`isAdmin(telegramId)` memeriksa TELEGRAM_ADMIN_ID dari environment, dipisahkan koma (src/utils/helpers.js:33-36).

Otorisasi diterapkan di setiap handler:

- callback_query gateway di src/bot/telegram.js:139-143.
- /start di src/bot/telegram.js:202-206.
- /help di src/bot/telegram.js:209-211.
- /register di src/bot/telegram.js:250-253.
- /renew di src/bot/telegram.js:262-264.
- /change di src/bot/telegram.js:287-289.
- /delete di src/bot/telegram.js:336-338.
- /key di src/bot/telegram.js:371-373.
- /list di src/bot/telegram.js:392-395.
- /revoke di src/bot/telegram.js:413-415.
- /stats di src/bot/telegram.js:436-439.
- message handler gateway di src/bot/telegram.js:467-470.

Admin (`isUserAdmin`) dapat menggunakan tombol List IPs dan Statistics di src/bot/telegram.js:38-43.

## State Machine

`this.userStates = {}` melacak percakapan multi-step per chatId (src/bot/telegram.js:18). Setiap state adalah objek:

- step: langkah saat ini, misal waiting_ip, waiting_days, waiting_renew_ip, waiting_renew_days, waiting_change_old_ip, waiting_change_new_ip, waiting_delete_ip.
- ip / oldIp / newIp: data sementara per langkah.

Handler message memproses state secara berurutan di src/bot/telegram.js:472-683:

- waiting_ip: validasi IP, pindah ke waiting_days (src/bot/telegram.js:477-491).
- waiting_renew_ip: validasi IP, cari key terbaru, pindah ke waiting_renew_days (src/bot/telegram.js:493-511).
- waiting_renew_days: validasi 1-365, panggil ApiKey.renewByIp, hapus state (src/bot/telegram.js:513-535).
- waiting_change_old_ip: validasi, cari key terbaru, pindah ke waiting_change_new_ip (src/bot/telegram.js:537-559).
- waiting_change_new_ip: validasi, cek duplikasi, panggil ApiKey.changeIp, hapus state (src/bot/telegram.js:561-592).
- waiting_delete_ip: validasi, cari data, panggil ApiKey.deleteByIp, hapus state (src/bot/telegram.js:594-617).
- waiting_days: validasi, cek duplikasi, generateApiKey, ApiKey.create, audit log, kirim install command (src/bot/telegram.js:620-683).

## Paginasi daftar Key dan IP

`sendPaginated(chatId, title, items, page = 0, isUserAdmin = false, prefix = 'page', messageId = null)` di src/bot/telegram.js:63-99.

Perilaku:

- perPage = 10 (src/bot/telegram.js:64).
- totalPages = Math.ceil(items.length / perPage) (src/bot/telegram.js:65).
- Jika ada messageId, edit pesan yang ada dengan editMessageText (src/bot/telegram.js:90-93).
- Jika edit gagal, kirim pesan baru (src/bot/telegram.js:94-96).
- Tombol nav Prev / Next dan Home (src/bot/telegram.js:74-82).

Digunakan oleh:

- sendKeyStatus untuk daftar kunci (src/bot/telegram.js:101-112).
- sendAdminList untuk admin daftar IP (src/bot/telegram.js:114-122).
- callback_query pagination keys_<page> dan adminlist_<page> (src/bot/telegram.js:187-196).
- /key command (src/bot/telegram.js:370-389).
- /list command (src/bot/telegram.js:391-410).

## Alur Fitur

### Register IP

Operator menekan Register IP atau /register. Bot meminta IP, lalu hari. Validasi duplikasi aktif sebelum generateApiKey dan ApiKey.create. Audit log BOT_REGISTER. Install command dari generateInstallCommand di src/bot/telegram.js:646.

### Renew IP

/renew IP atau tombol Renew IP. Bot mencari key terbaru untuk IP via ApiKey.findLatestByIp (src/bot/telegram.js:273). Meminta hari tambahan, lalu panggil ApiKey.renewByIp (src/bot/telegram.js:522). Audit log KEY_RENEWED.

### Change IP

/change atau tombol Change IP. Bot meminta IP lama dan baru, validasi masing-masing, cek duplikasi IP baru, panggil ApiKey.changeIp. Audit log IP_CHANGED (src/bot/telegram.js:328 dan 588).

### Delete IP

/delete IP atau tombol Delete IP. Bot meminta IP, cek data via ApiKey.findByIp, panggil ApiKey.deleteByIp yang juga menghapus vpn_accounts terikat. Audit log IP_DELETED (src/bot/telegram.js:363 dan 613).

### My Keys

/key atau tombol My Keys. Menampilkan semua key via ApiKey.findAll dan sendPaginated (src/bot/telegram.js:374-389).

### Statistics

/stats atau tombol Statistics. Admin hanya. Query COUNT(*) dan SUM(usage_count) langsung ke db (src/bot/telegram.js:444-446).

## Rujukan Berkas:baris

| Berkas | Baris | Rujukan |
|--------|-------|---------|
| src/index.js | 13 | require TelegramBotHandler |
| src/index.js | 100-109 | start bot jika token tersedia |
| src/bot/telegram.js | 9 | ALLOWED_USER_ID = 6200639382 |
| src/bot/telegram.js | 11-13 | isAuthorized |
| src/bot/telegram.js | 15-20 | constructor, userStates |
| src/bot/telegram.js | 22-46 | mainMenu, admin rows |
| src/bot/telegram.js | 48-53 | sendMainMenu |
| src/bot/telegram.js | 55-60 | sendHelp |
| src/bot/telegram.js | 63-99 | sendPaginated 10 item/halaman |
| src/bot/telegram.js | 101-112 | sendKeyStatus |
| src/bot/telegram.js | 114-122 | sendAdminList |
| src/bot/telegram.js | 124-131 | sendAdminStats |
| src/bot/telegram.js | 133-199 | setupHandlers callback_query |
| src/bot/telegram.js | 201-248 | /start, /help |
| src/bot/telegram.js | 250-259 | /register |
| src/bot/telegram.js | 261-284 | /renew |
| src/bot/telegram.js | 286-333 | /change |
| src/bot/telegram.js | 335-368 | /delete |
| src/bot/telegram.js | 370-389 | /key |
| src/bot/telegram.js | 391-410 | /list |
| src/bot/telegram.js | 412-433 | /revoke |
| src/bot/telegram.js | 435-457 | /stats |
| src/bot/telegram.js | 459-684 | message handler state machine |
| src/utils/helpers.js | 2-10 | generateApiKey |
| src/utils/helpers.js | 24-31 | validateIp, validateDays |
| src/utils/helpers.js | 33-36 | isAdmin |
| src/database/init.js | 61-153 | ApiKey |