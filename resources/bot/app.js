const sqlite3 = require('sqlite3').verbose();
const { Telegraf, Scenes, session } = require('telegraf');
const moment = require('moment');
const { createvmess } = require('./create/createvmess');
const { createvless } = require('./create/createvless');
const { createtrojan } = require('./create/createtrojan');
const { createshadowsocks } = require('./create/createshadowsocks');
// import create modules
const { createssh } = require('./create/createssh');
const { checkvmess } = require('./check/checkvmess');
const { checkvless } = require('./check/checkvless');
const { checktrojan } = require('./check/checktrojan');
const { checkshadowsocks } = require('./check/checkshadowsock');
const { checkssh } = require('./check/checkssh');
// import renew modules
const { renewvmess } = require('./renew/renewvmess');
const { renewvless } = require('./renew/renewvless');
const { renewtrojan } = require('./renew/renewtrojan');
const { renewshadowsocks } = require('./renew/renewshadowsocks');
const { renewssh } = require('./renew/renewssh');
// import delete modules
const { deletevmess } = require('./delete/deletevmess');
const { deletevless } = require('./delete/deletevless');
const { deletetrojan } = require('./delete/deletetrojan');
const { deleteshadowsocks } = require('./delete/deleteshadowsocks');
const { deletessh } = require('./delete/deletessh');

const { BOT_TOKEN, ADMIN } = require('/root/.bot/.vars.json');
const bot = new Telegraf(BOT_TOKEN);
// Daftar ID admin yang diizinkan
const adminIds = ADMIN; // Ganti dengan ID admin yang diizinkan
console.log('Bot initialized');

// Koneksi ke SQLite3
const db = new sqlite3.Database('./database.db', (err) => {
  if (err) {
    console.error('Kesalahan koneksi SQLite3:', err.message);
  } else {
    console.log('Terhubung ke SQLite3');
  }
});

// Buat tabel Server jika belum ada
db.run(`CREATE TABLE IF NOT EXISTS Server (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT,
  auth TEXT
)`, (err) => {
  if (err) {
    console.error('Kesalahan membuat tabel Server:', err.message);
  } else {
    console.log('Server table created or already exists');
  }
});

// Menyimpan state pengguna
const userState = {};
console.log('User state initialized');

// Tambahkan command menu dan start
bot.command('menu', async (ctx) => {
  console.log('Menu command received');
  await sendMainMenu(ctx);
});

bot.command('start', async (ctx) => {
  console.log('Start command received');
  await sendMainMenu(ctx);
});

bot.command('admin', async (ctx) => {
  console.log('Admin menu requested');
  
  if (!adminIds.includes(ctx.from.id)) {
    await ctx.reply('Anda tidak memiliki izin untuk mengakses menu admin.');
    return;
  }

  await sendAdminMenu(ctx);
});

async function sendMainMenu(ctx) {
  const keyboard = [
    [
      { text: '🍏 Service Create', callback_data: 'service_create' },
      { text: '🍎 Service Delete', callback_data: 'service_delete' },
    ],
    [
      { text: '🍊 Service Renew', callback_data: 'service_renew' },
      { text: '🍌 Service Check', callback_data: 'service_check' }
    ],
  ];


  const currentTime = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
  const messageText = `**Selamat datang di FTVPN VPN Bot!** 🚀
Bot VPN otomatis untuk mengelola 
layanan VPN dengan mudah dan cepat.
**Waktu sekarang:** ${currentTime}

Silakan pilih opsi layanan:`;

  try {
    await ctx.editMessageText(messageText, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: keyboard
      }
    });
    console.log('Main menu sent');
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      // Jika pesan tidak dapat diedit, kirim pesan baru
      await ctx.reply(messageText, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      console.log('Main menu sent as new message');
    } else {
      console.error('Error saat mengirim menu utama:', error);
    }
  }
}

/// Fungsi untuk menangani semua jenis layanan
async function handleServiceAction(ctx, action) {
  let keyboard;
  if (action === 'create') {
    keyboard = [
      [{ text: '🍏 Create SSH', callback_data: 'create_ssh' }],      
      [{ text: '🍏 Create Vmess', callback_data: 'create_vmess' }],
      [{ text: '🍏 Create Vless', callback_data: 'create_vless' }],
      [{ text: '🍏 Create Trojan', callback_data: 'create_trojan' }],
      [{ text: '🍏 Create Shadowsocks', callback_data: 'create_shadowsocks' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'delete') {
    keyboard = [
      [{ text: '🍎 Delete SSH', callback_data: 'delete_ssh' }],      
      [{ text: '🍎 Delete Vmess', callback_data: 'delete_vmess' }],
      [{ text: '🍎 Delete Vless', callback_data: 'delete_vless' }],
      [{ text: '🍎 Delete Trojan', callback_data: 'delete_trojan' }],
      [{ text: '🍎 Delete Shadowsocks', callback_data: 'delete_shadowsocks' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'renew') {
    keyboard = [
      [{ text: '🍊 Renew SSH', callback_data: 'renew_ssh' }],      
      [{ text: '🍊 Renew Vmess', callback_data: 'renew_vmess' }],
      [{ text: '🍊 Renew Vless', callback_data: 'renew_vless' }],
      [{ text: '🍊 Renew Trojan', callback_data: 'renew_trojan' }],
      [{ text: '🍊 Renew Shadowsocks', callback_data: 'renew_shadowsocks' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  } else if (action === 'check') {
    keyboard = [
      [{ text: '🍌 Check SSH', callback_data: 'check_ssh' }],      
      [{ text: '🍌 Check Vmess', callback_data: 'check_vmess' }],
      [{ text: '🍌 Check Vless', callback_data: 'check_vless' }],
      [{ text: '🍌 Check Trojan', callback_data: 'check_trojan' }],
      [{ text: '🍌 Check Shadowsocks', callback_data: 'check_shadowsocks' }],
      [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
    ];
  }

  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: keyboard
    });
    console.log(`${action} service menu sent`);
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      // Jika pesan tidak dapat diedit, kirim pesan baru
      await ctx.reply(`Pilih jenis layanan yang ingin Anda ${action}:`, {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
      console.log(`${action} service menu sent as new message`);
    } else {
      console.error(`Error saat mengirim menu ${action}:`, error);
    }
  }
}

async function sendAdminMenu(ctx) {
  const adminKeyboard = [
    [{ text: '➕ Tambah Server', callback_data: 'addserver' }],
    [{ text: '❌ Hapus Server', callback_data: 'deleteserver' }],   
    [{ text: '📜 List Server', callback_data: 'listserver' }],     
    [{ text: '🗑️ Reset Server', callback_data: 'resetdb' }],
    [{ text: '🔙 Kembali', callback_data: 'send_main_menu' }]
  ];

  try {
    await ctx.editMessageReplyMarkup({
      inline_keyboard: adminKeyboard
    });
    console.log('Admin menu sent');
  } catch (error) {
    if (error.response && error.response.error_code === 400) {
      // Jika pesan tidak dapat diedit, kirim pesan baru
      await ctx.reply('Menu Admin:', {
        reply_markup: {
          inline_keyboard: adminKeyboard
        }
      });
      console.log('Admin menu sent as new message');
    } else {
      console.error('Error saat mengirim menu admin:', error);
    }
  }
}
// Action handlers untuk semua jenis layanan
bot.action('service_create', async (ctx) => {
  await handleServiceAction(ctx, 'create');
});

bot.action('service_delete', async (ctx) => {
  await handleServiceAction(ctx, 'delete');
});

bot.action('service_renew', async (ctx) => {
  await handleServiceAction(ctx, 'renew');
});

bot.action('service_check', async (ctx) => {
  await handleServiceAction(ctx, 'check');
});

// Action handler untuk kembali ke menu utama
bot.action('send_main_menu', async (ctx) => {
  await sendMainMenu(ctx);
});

// Action handlers for creating accounts
bot.action('create_vmess', async (ctx) => {
  await startSelectServer(ctx, 'create', 'vmess');
});

bot.action('create_vless', async (ctx) => {
  await startSelectServer(ctx, 'create', 'vless');
});

bot.action('create_trojan', async (ctx) => {
  await startSelectServer(ctx, 'create', 'trojan');
});

bot.action('create_shadowsocks', async (ctx) => {
  await startSelectServer(ctx, 'create', 'shadowsocks');
});

bot.action('create_ssh', async (ctx) => {
  await startSelectServer(ctx, 'create', 'ssh');
});

// Action handlers for deleting accounts
bot.action('delete_vmess', async (ctx) => {
  await startSelectServer(ctx, 'delete', 'vmess');
});

bot.action('delete_vless', async (ctx) => {
  await startSelectServer(ctx, 'delete', 'vless');
});

bot.action('delete_trojan', async (ctx) => {
  await startSelectServer(ctx, 'delete', 'trojan');
});

bot.action('delete_shadowsocks', async (ctx) => {
  await startSelectServer(ctx, 'delete', 'shadowsocks');
});

bot.action('delete_ssh', async (ctx) => {
  await startSelectServer(ctx, 'delete', 'ssh');
});

// Action handlers for renewing accounts
bot.action('renew_vmess', async (ctx) => {
  await startSelectServer(ctx, 'renew', 'vmess');
});

bot.action('renew_vless', async (ctx) => {
  await startSelectServer(ctx, 'renew', 'vless');
});

bot.action('renew_trojan', async (ctx) => {
  await startSelectServer(ctx, 'renew', 'trojan');
});

bot.action('renew_shadowsocks', async (ctx) => {
  await startSelectServer(ctx, 'renew', 'shadowsocks');
});

bot.action('renew_ssh', async (ctx) => {
  await startSelectServer(ctx, 'renew', 'ssh');
});
// Action handlers for checking accounts
bot.action('check_vmess', async (ctx) => {
  await startSelectServer(ctx, 'check', 'vmess');
});

bot.action('check_vless', async (ctx) => {
  await startSelectServer(ctx, 'check', 'vless');
});

bot.action('check_trojan', async (ctx) => {
  await startSelectServer(ctx, 'check', 'trojan');
});

bot.action('check_shadowsocks', async (ctx) => {
  await startSelectServer(ctx, 'check', 'shadowsocks');
});

bot.action('check_ssh', async (ctx) => {
  await startSelectServer(ctx, 'check', 'ssh');
});

// Function to start selecting a server
async function startSelectServer(ctx, action, type) {
  try {
    console.log(`Memulai proses ${action} untuk ${type}`);
    
    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        console.error('Error fetching servers:', err.message);
        return ctx.reply('⚠️ PERHATIAN! Tidak ada server yang tersedia saat ini. Coba lagi nanti!');
      }

      if (servers.length === 0) {
        console.log('Tidak ada server yang tersedia');
        return ctx.reply('⚠️ PERHATIAN! Tidak ada server yang tersedia saat ini. Coba lagi nanti!');
      }

      const keyboard = servers.map(server => {
        return [{ text: server.domain, callback_data: `${action}_username_${type}_${server.id}` }];
      });
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'send_main_menu' }]);

      ctx.answerCbQuery();
      ctx.deleteMessage();
      ctx.reply('Pilih server:', {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });

      // Menyimpan state pengguna
      userState[ctx.chat.id] = { step: `${action}_username_${type}` };
    });
  } catch (error) {
    console.error(`Error saat memulai proses ${action} untuk ${type}:`, error);
    await ctx.reply(`❌ GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.`);
  }
}
// Handle server selection
bot.action(/(create|delete|renew|check)_username_(vmess|vless|trojan|shadowsocks|ssh)_(.+)/, async (ctx) => {
  const action = ctx.match[1];
  const type = ctx.match[2];
  const serverId = ctx.match[3];
  userState[ctx.chat.id] = { step: `username_${action}_${type}`, serverId, type, action };
  if (action === 'check') {
    let msg;
    if (type === 'vmess') {
      msg = await checkvmess(serverId);
    } else if (type === 'vless') {
      msg = await checkvless(serverId);
    } else if (type === 'trojan') {
      msg = await checktrojan(serverId);
    } else if (type === 'shadowsocks') {
      msg = await checkshadowsocks(serverId);
    } else if (type === 'ssh') {
      msg = await checkssh(serverId);
    }
    await ctx.reply(msg, { parse_mode: 'Markdown' });
    delete userState[ctx.chat.id];
  } else {
    await ctx.reply('👤 Masukkan username:');
  }
});

// Handle text input for various steps
bot.on('text', async (ctx) => {
  const state = userState[ctx.chat.id];

  if (!state) return; // Jika tidak ada state, abaikan pesan

  if (state.step.startsWith('username_')) {
    state.username = ctx.message.text;
    const { username, serverId, type, action } = state;
    let msg;
    if (action === 'create') {
      if (type === 'ssh') {
        state.step = `password_${state.action}_${state.type}`;
        await ctx.reply('🔑 Masukkan password:');
      } else {
        state.step = `exp_${state.action}_${state.type}`;
        await ctx.reply('⏳ Masukkan masa aktif (hari):');
      }
    } else if (action === 'renew') {
      state.step = `exp_${state.action}_${state.type}`;
      await ctx.reply('⏳ Masukkan masa aktif (hari):');
    } else if (action === 'delete') {
      if (type === 'vmess') {
        msg = await deletevmess(username, serverId);
      } else if (type === 'vless') {
        msg = await deletevless(username, serverId);
      } else if (type === 'trojan') {
        msg = await deletetrojan(username, serverId);
      } else if (type === 'shadowsocks') {
        msg = await deleteshadowsocks(username, serverId);
      } else if (type === 'ssh') {
        msg = await deletessh(username, serverId);
      }
      await ctx.reply(msg, { parse_mode: 'Markdown' });
      delete userState[ctx.chat.id];
    }
  } else if (state.step.startsWith('password_')) {
    state.password = ctx.message.text;
    state.step = `exp_${state.action}_${state.type}`;
    await ctx.reply('⏳ Masukkan masa aktif (hari):');
  } else if (state.step.startsWith('exp_')) {
    if (!/^\d+$/.test(ctx.message.text)) {
      await ctx.reply('❌ PERHATIAN! Masukkan HANYA ANGKA untuk masa berlaku akun!');
      return;
    }
    state.exp = ctx.message.text;
    if (state.type === 'ssh') {
      state.step = `limitip_${state.action}_${state.type}`;
      await ctx.reply('🔢 Masukkan limit IP:');
    } else {
      state.step = `quota_${state.action}_${state.type}`;
      await ctx.reply('📊 Masukkan quota (GB):');
    }
  } else if (state.step.startsWith('quota_')) {
    if (!/^\d+$/.test(ctx.message.text)) {
      await ctx.reply('❌ PERHATIAN! Masukkan HANYA ANGKA untuk quota!');
      return;
    }
    state.quota = ctx.message.text;
    state.step = `limitip_${state.action}_${state.type}`;
    await ctx.reply('🔢 Masukkan limit IP:');
  } else if (state.step.startsWith('limitip_')) {
    if (!/^\d+$/.test(ctx.message.text)) {
      await ctx.reply('❌ PERHATIAN! Masukkan HANYA ANGKA untuk limit IP!');
      return;
    }
    state.limitip = ctx.message.text;
    const { username, password, exp, quota, limitip, serverId, type, action } = state;
    let msg;
    if (action === 'create') {
      if (type === 'vmess') {
        msg = await createvmess(username, exp, quota, limitip, serverId);
      } else if (type === 'vless') {
        msg = await createvless(username, exp, quota, limitip, serverId);
      } else if (type === 'trojan') {
        msg = await createtrojan(username, exp, quota, limitip, serverId);
      } else if (type === 'shadowsocks') {
        msg = await createshadowsocks(username, exp, quota, limitip, serverId);
      } else if (type === 'ssh') {
        msg = await createssh(username, password, exp, limitip, serverId);
      }
    } else if (action === 'renew') {
      if (type === 'vmess') {
        msg = await renewvmess(username, exp, quota, limitip, serverId);
      } else if (type === 'vless') {
        msg = await renewvless(username, exp, quota, limitip, serverId);
      } else if (type === 'trojan') {
        msg = await renewtrojan(username, exp, quota, limitip, serverId);
      } else if (type === 'shadowsocks') {
        msg = await renewshadowsocks(username, exp, quota, limitip, serverId);
      } else if (type === 'ssh') {
        msg = await renewssh(username, exp, limitip, serverId);
      }
    }
    await ctx.reply(msg, { parse_mode: 'Markdown' });
    delete userState[ctx.chat.id];
  } else if (state.step === 'addserver') {
    const domain = ctx.message.text.trim();
    if (!domain) {
      await ctx.reply('⚠️ Domain tidak boleh kosong. Silakan masukkan domain server yang valid.');
      return;
    }

    state.step = 'addserver_auth';
    state.domain = domain;
    await ctx.reply('🔑 Silakan masukkan auth server:');
  } else if (state.step === 'addserver_auth') {
    const auth = ctx.message.text.trim();
    if (!auth) {
      await ctx.reply('⚠️ Auth tidak boleh kosong. Silakan masukkan auth server yang valid.');
      return;
    }

    const { domain } = state;

    try {
      db.run('INSERT INTO Server (domain, auth) VALUES (?, ?)', [domain, auth], function(err) {
        if (err) {
          console.error('Error saat menambahkan server:', err.message);
          ctx.reply('❌ Terjadi kesalahan saat menambahkan server baru.');
        } else {
          ctx.reply(`✅ Server baru dengan domain ${domain} telah berhasil ditambahkan.`);
        }
      });
    } catch (error) {
      console.error('Error saat menambahkan server:', error);
      await ctx.reply('❌ Terjadi kesalahan saat menambahkan server baru.');
    }
    delete userState[ctx.chat.id];
  }
});
//ADMIN
bot.action('deleteserver', async (ctx) => {
  try {
    console.log('Delete server process started');
    await ctx.answerCbQuery();
    
    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        console.error('Error fetching servers:', err.message);
        return ctx.reply('⚠️ PERHATIAN! Terjadi kesalahan saat mengambil daftar server.');
      }

      if (servers.length === 0) {
        console.log('Tidak ada server yang tersedia');
        return ctx.reply('⚠️ PERHATIAN! Tidak ada server yang tersedia saat ini.');
      }

      const keyboard = servers.map(server => {
        return [{ text: server.domain, callback_data: `confirm_delete_server_${server.id}` }];
      });
      keyboard.push([{ text: '🔙 Kembali ke Menu Utama', callback_data: 'kembali_ke_menu' }]);

      ctx.reply('Pilih server yang ingin dihapus:', {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    });
  } catch (error) {
    console.error('Kesalahan saat memulai proses hapus server:', error);
    await ctx.reply('❌ GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.');
  }
});

bot.action(/confirm_delete_server_(\d+)/, async (ctx) => {
  try {
    db.run('DELETE FROM Server WHERE id = ?', [ctx.match[1]], function(err) {
      if (err) {
        console.error('Error deleting server:', err.message);
        return ctx.reply('⚠️ PERHATIAN! Terjadi kesalahan saat menghapus server.');
      }

      if (this.changes === 0) {
        console.log('Server tidak ditemukan');
        return ctx.reply('⚠️ PERHATIAN! Server tidak ditemukan.');
      }

      console.log(`Server dengan ID ${ctx.match[1]} berhasil dihapus`);
      ctx.reply('✅ Server berhasil dihapus.');
    });
  } catch (error) {
    console.error('Kesalahan saat menghapus server:', error);
    await ctx.reply('❌ GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.');
  }
});

bot.action('addserver', async (ctx) => {
  try {
    console.log('Add server process started');
    await ctx.answerCbQuery();
    await ctx.reply('🌐 Silakan masukkan domain/ip server:');
    userState[ctx.chat.id] = { step: 'addserver' };
  } catch (error) {
    console.error('Kesalahan saat memulai proses tambah server:', error);
    await ctx.reply('❌ GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.');
  }
});

bot.action('listserver', async (ctx) => {
  try {
    console.log('List server process started');
    await ctx.answerCbQuery();
    
    db.all('SELECT * FROM Server', [], (err, servers) => {
      if (err) {
        console.error('Error fetching servers:', err.message);
        return ctx.reply('⚠️ PERHATIAN! Terjadi kesalahan saat mengambil daftar server.');
      }

      if (servers.length === 0) {
        console.log('Tidak ada server yang tersedia');
        return ctx.reply('⚠️ PERHATIAN! Tidak ada server yang tersedia saat ini.');
      }

      let serverList = '📜 *Daftar Server* 📜\n\n';
      servers.forEach((server, index) => {
        serverList += `${index + 1}. ${server.domain}\n`;
      });

      ctx.reply(serverList, { parse_mode: 'Markdown' });
    });
  } catch (error) {
    console.error('Kesalahan saat mengambil daftar server:', error);
    await ctx.reply('❌ GAGAL! Terjadi kesalahan saat memproses permintaan Anda. Silakan coba lagi nanti.');
  }
});

bot.action('resetdb', async (ctx) => {
  try {
    await ctx.answerCbQuery();
    db.run('DELETE FROM Server', (err) => {
      if (err) {
        console.error('Error saat mereset tabel Server:', err.message);
        ctx.reply('❗️ PERHATIAN! Terjadi KESALAHAN SERIUS saat mereset database. Harap segera hubungi administrator!');
      }
    });
    await ctx.reply('🚨 PERHATIAN! Database telah DIRESET SEPENUHNYA. Semua server telah DIHAPUS TOTAL.');
  } catch (error) {
    console.error('Error saat mereset database:', error);
    await ctx.reply('❗️ PERHATIAN! Terjadi KESALAHAN SERIUS saat mereset database. Harap segera hubungi administrator!');
  }
});

// Mulai bot
bot.launch().then(() => {
  console.log('Bot telah dimulai');
}).catch((error) => {
  console.error('Error saat memulai bot:', error);
});