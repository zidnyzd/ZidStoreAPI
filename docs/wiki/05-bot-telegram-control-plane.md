# 05. Bot Telegram Control Plane

Bot Telegram operator di src/bot/telegram.js berfungsi sebagai panel administrasi lisensi dan IP. Pengguna yang tidak terdaftar ditolak secara keseluruhan. Semua aksi dicatat ke audit_log.

## Arsitektur

Bot dipasang di 112-121, hanya saat TELEGRAM_BOT_TOKEN tersedia dan bukan placeholder. Instance `TelegramBotHandler` menggunakan node-telegram-bot-api dengan polling mode (17-17).

## Otorisasi RBAC

`ALLOWED_USER_ID` didefinisikan sebagai 6200639382 pada 9-9. Fungsi `isAuthorized(telegramId)` mengizinkan pemanggilan jika `isAdmin(telegramId)` true atau `telegramId` sama dengan ALLOWED_USER_ID (11-13).

`isAdmin(telegramId)` memeriksa TELEGRAM_ADMIN_ID dari environment, dipisahkan koma (src/utils/helpers.js:41-44).

Otorisasi diterapkan di setiap handler:

- callback_query gateway di 142-146.
- /start di 211-215.
- /help di 218-220.
- /register di 263-266.
- /renew di 275-277.
- /change di 300-302.
- /editkey di 348-395.
- /delete di 398-400.
- /key di 433-435.
- /list di 454-457.
- /revoke di 475-477.
- /stats di 498-501.
- message handler gateway di 583-586.

Admin (`isUserAdmin`) dapat menggunakan tombol List IPs dan Statistics di 41-46.

## State Machine

`this.userStates = {}` melacak percakapan multi-step per chatId (18-18). Setiap state adalah objek:

- step: langkah saat ini, misal waiting_ip, waiting_days, waiting_renew_ip, waiting_renew_days, waiting_change_old_ip, waiting_change_new_ip, waiting_editkey_ip, waiting_editkey_new_key, waiting_delete_ip.
- ip / oldIp / newIp: data sementara per langkah.

Handler message memproses state secara berurutan di 588-854:

- waiting_ip: validasi IP, pindah ke waiting_days (593-607).
- waiting_renew_ip: validasi IP, cari key terbaru, pindah ke waiting_renew_days (609-627).
- waiting_renew_days: validasi 1-365, panggil ApiKey.renewByIp, hapus state (629-651).
- waiting_change_old_ip: validasi, cari key terbaru, pindah ke waiting_change_new_ip (653-675).
- waiting_change_new_ip: validasi, cek duplikasi, panggil ApiKey.changeIp, hapus state (677-708).
- waiting_editkey_ip: validasi IP, cari key terbaru, pindah ke waiting_editkey_new_key (711-733).
- waiting_editkey_new_key: validasi custom key via validateCustomKey, panggil ApiKey.changeKey, audit log KEY_EDITED, hapus state (735-763).
- waiting_delete_ip: validasi, cari data, panggil ApiKey.deleteByIp, hapus state (765-788).
- waiting_days: validasi, cek duplikasi, generateApiKey, ApiKey.create, audit log, kirim install command (791-854).

## Paginasi daftar Key dan IP

`sendPaginated(chatId, title, items, page = 0, isUserAdmin = false, prefix = 'page', messageId = null)` di 66-102.

Perilaku:

- perPage = 10 (67-67).
- totalPages = Math.ceil(items.length / perPage) (68-68).
- Jika ada messageId, edit pesan yang ada dengan editMessageText (93-96).
- Jika edit gagal, kirim pesan baru (97-99).
- Tombol nav Prev / Next dan Home (77-85).

Digunakan oleh:

- sendKeyStatus untuk daftar kunci (104-115).
- sendAdminList untuk admin daftar IP (117-125).
- callback_query pagination keys_<page> dan adminlist_<page> (196-205).
- /key command (432-451).
- /list command (453-472).

## Alur Fitur

### Register IP

Operator menekan Register IP atau /register. Bot meminta IP, lalu hari. Validasi duplikasi aktif sebelum generateApiKey dan ApiKey.create. Audit log BOT_REGISTER. Install command dari generateInstallCommand di 817-817.

### Renew IP

/renew IP atau tombol Renew IP. Bot mencari key terbaru untuk IP via ApiKey.findLatestByIp (286-286). Meminta hari tambahan, lalu panggil ApiKey.renewByIp (638-638). Audit log KEY_RENEWED.

### Change IP

/change atau tombol Change IP. Bot meminta IP lama dan baru, validasi masing-masing, cek duplikasi IP baru, panggil ApiKey.changeIp. Audit log IP_CHANGED (src/bot/telegram.js:341 dan 704).

### Edit Key (Kustom Key)

/editkey atau tombol Edit Key. Dua bentuk: interaktif (/editkey) meminta IP lalu custom key baru, atau langsung /editkey <IP> <KEY_BARU>. Validasi IP dengan validateIp dan key dengan validateCustomKey (4-32 karakter alfanumerik, strip, underscore). Panggil ApiKey.changeKey. Audit log KEY_EDITED (src/bot/telegram.js:390 dan 758).

### Delete IP

/delete IP atau tombol Delete IP. Bot meminta IP, cek data via ApiKey.findByIp, panggil ApiKey.deleteByIp yang juga menghapus vpn_accounts terikat. Audit log IP_DELETED (425-425 dan 613).

### My Keys

/key atau tombol My Keys. Menampilkan semua key via ApiKey.findAll dan sendPaginated (436-451).

### Statistics

/stats atau tombol Statistics. Admin hanya. Query COUNT(*) dan SUM(usage_count) langsung ke db (506-508).

## Rujukan Berkas:baris

| Berkas | Baris | Rujukan |
|--------|-------|---------|
| src/index.js | 13 | require TelegramBotHandler |
| src/index.js | 100-109 | start bot jika token tersedia |
| src/bot/telegram.js | 9 | ALLOWED_USER_ID = 6200639382 |
| src/bot/telegram.js | 11-13 | isAuthorized |
| src/bot/telegram.js | 15-20 | constructor, userStates |
| src/bot/telegram.js | 22-46 | mainMenu, admin rows |
| src/bot/telegram.js | 51-56 | sendMainMenu |
| src/bot/telegram.js | 58-63 | sendHelp |
| src/bot/telegram.js | 66-102 | sendPaginated 10 item/halaman |
| src/bot/telegram.js | 104-115 | sendKeyStatus |
| src/bot/telegram.js | 117-125 | sendAdminList |
| src/bot/telegram.js | 127-134 | sendAdminStats |
| src/bot/telegram.js | 138-208 | setupHandlers callback_query |
| src/bot/telegram.js | 211-261 | /start, /help |
| src/bot/telegram.js | 264-272 | /register |
| src/bot/telegram.js | 275-297 | /renew |
| src/bot/telegram.js | 300-346 | /change |
| src/bot/telegram.js | 348-395 | /editkey |
| src/bot/telegram.js | 398-430 | /delete |
| src/bot/telegram.js | 433-451 | /key |
| src/bot/telegram.js | 454-472 | /list |
| src/bot/telegram.js | 475-495 | /revoke |
| src/bot/telegram.js | 498-519 | /stats |
| src/bot/telegram.js | 522-801 | message handler state machine |
| src/utils/helpers.js | 2-10 | generateApiKey |
| src/utils/helpers.js | 24-31 | validateIp, validateDays |
| src/utils/helpers.js | 33-39 | validateCustomKey |
| src/utils/helpers.js | 41-44 | isAdmin |
| src/database/init.js | 96-210 | ApiKey |