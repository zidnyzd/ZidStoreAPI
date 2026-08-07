const os = require('os');
const { exec, execSync, spawn } = require('child_process');
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();

const ansiRegex = /\x1B\[[0-9;?]*[ -\/]*[@-~]/g;

function stripAnsi(str = '') {
  return str.replace(ansiRegex, '')
            .replace(/\x1B\][^\u0007]*\u0007/g, '') // OSC sequences
            .replace(/\x1B[PX^_].*?\x1B\\/g, '') // DCS, SOS, PM, APC sequences
            .replace(/\r/g, '');
}

function extractJson(output) {
  if (!output) {
    throw new Error('Output kosong');
  }

  const cleaned = stripAnsi(output).trim();
  const startIndex = cleaned.indexOf('{');
  const endIndex = cleaned.lastIndexOf('}');

  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    throw new Error(`JSON tidak ditemukan pada output: ${cleaned}`);
  }

  const jsonString = cleaned.slice(startIndex, endIndex + 1);
  return JSON.parse(jsonString);
}

function formatDateTime(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function parseKeyValuePairs(text) {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.replace(/[\u2500-\u257F]/g, '').trim())
    .filter(line => line.length > 0 && !/^Preparing/i.test(line))
    .reduce((acc, line) => {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key && value) {
          acc[key] = value;
        }
      }
      return acc;
    }, {});
}

function buildTrialResponse(type, pairs, defaults = {}) {
  const ensure = (keys, fallback = '') => {
    for (const key of keys) {
      const value = pairs[key];
      if (value && String(value).trim().length > 0) {
        return String(value).trim();
      }
    }
    return fallback;
  };

  if (type === 'vmess') {
    const username = ensure(['Username', 'Description'], defaults.username || '');
    if (!username) {
      throw new Error('Tidak menemukan Username pada output trial VMess');
    }
    const uuid = ensure(['User ID', 'UUID'], '');
    if (!uuid) {
      throw new Error('Tidak menemukan UUID pada output trial VMess');
    }
    return {
      username,
      expired: ensure(['Expires On', 'Expired', 'Expiry'], defaults.expired || ''),
      uuid,
      quota: ensure(['Quota'], 'Unlimited'),
      ip_limit: ensure(['IP Limit'], '1'),
      domain: ensure(['Host Server', 'Host', 'Domain'], ''),
      ns_domain: ensure(['Host XrayDNS', 'NS Domain', 'Slowdns Host'], ''),
      city: ensure(['Location', 'CITY'], ''),
      pubkey: ensure(['Public Key', 'PublicKey'], ''),
      vmess_tls_link: ensure(['TLS Link'], ''),
      vmess_nontls_link: ensure(['NTLS Link', 'Non-TLS Link'], ''),
      vmess_grpc_link: ensure(['GRPC Link'], ''),
    };
  }

  if (type === 'vless') {
    const username = ensure(['Username', 'Description'], defaults.username || '');
    if (!username) {
      throw new Error('Tidak menemukan Username pada output trial VLESS');
    }
    const uuid = ensure(['User ID', 'UUID'], '');
    if (!uuid) {
      throw new Error('Tidak menemukan UUID pada output trial VLESS');
    }
    return {
      username,
      expired: ensure(['Expires On', 'Expired', 'Expiry'], defaults.expired || ''),
      uuid,
      quota: ensure(['Quota'], 'Unlimited'),
      ip_limit: ensure(['IP Limit'], '1'),
      domain: ensure(['Host Server', 'Host', 'Domain'], ''),
      ns_domain: ensure(['Host XrayDNS', 'NS Domain', 'Slowdns Host'], ''),
      city: ensure(['Location', 'CITY'], ''),
      pubkey: ensure(['Public Key', 'PublicKey'], ''),
      vless_tls_link: ensure(['TLS Link'], ''),
      vless_nontls_link: ensure(['NTLS Link', 'Non-TLS Link'], ''),
      vless_grpc_link: ensure(['GRPC Link'], ''),
    };
  }

  if (type === 'trojan') {
    const username = ensure(['Username', 'Description'], defaults.username || '');
    if (!username) {
      throw new Error('Tidak menemukan Username pada output trial Trojan');
    }
    const uuid = ensure(['Password', 'UUID', 'User ID'], '');
    if (!uuid) {
      throw new Error('Tidak menemukan Password pada output trial Trojan');
    }
    return {
      username,
      expired: ensure(['Expires On', 'Expired', 'Expiry'], defaults.expired || ''),
      uuid,
      quota: ensure(['Quota'], 'Unlimited'),
      ip_limit: ensure(['IP Limit'], '1'),
      domain: ensure(['Host Server', 'Host', 'Domain'], ''),
      ns_domain: ensure(['Host XrayDNS', 'NS Domain', 'Slowdns Host'], ''),
      city: ensure(['Location', 'CITY'], ''),
      pubkey: ensure(['Public Key', 'PublicKey'], ''),
      trojan_tls_link: ensure(['TLS Link', 'TROJAN TLS'], ''),
      trojan_grpc_link: ensure(['GRPC Link', 'TROJAN GRPC'], ''),
    };
  }

  if (type === 'ssh') {
    const username = ensure(['Username', 'User', 'Login'], defaults.username || '');
    if (!username) {
      throw new Error('Tidak menemukan Username pada output trial SSH');
    }
    const password = ensure(['Password', 'Pass'], '');
    if (!password) {
      throw new Error('Tidak menemukan Password pada output trial SSH');
    }
    return {
      username,
      password,
      expired: ensure(['Expires On', 'Expired', 'Expiry'], defaults.expired || ''),
      ip_limit: ensure(['IP Limit'], '1'),
      domain: ensure(['Domain', 'Host Server', 'Host'], ''),
      ns_domain: ensure(['NS Domain', 'Host XrayDNS', 'Slowdns Host'], ''),
      city: ensure(['Location', 'CITY'], ''),
      pubkey: ensure(['Public Key', 'PublicKey'], ''),
    };
  }

  throw new Error(`Parser trial untuk tipe ${type} belum diimplementasikan`);
}

function postProcessTrialData(type, data, pairs = {}, options = {}) {
  const { defaultDomain = '', minutes = null } = options;

  const get = (keys) => {
    for (const key of keys) {
      const value = pairs[key];
      if (value && String(value).trim().length > 0) {
        return String(value).trim();
      }
    }
    return '';
  };

  if (!data.domain) {
    data.domain = get(['Host Server', 'Domain']) || defaultDomain;
  }

  if (!data.expired) {
    data.expired = get(['Expires On', 'Expired', 'Expiry']);
    if (!data.expired && minutes !== null) {
      data.expired = formatDateTime(new Date(Date.now() + minutes * 60 * 1000));
    }
  }

  if (type === 'ssh') {
    if (!data.domain) {
      const linkUdp = get(['Link UDP']);
      const match = linkUdp.match(/i\.([^:@\s]+)[:@]/i);
      if (match) {
        data.domain = match[1];
      }
    }
    if (!data.domain && defaultDomain) {
      data.domain = defaultDomain;
    }
  }

  if (type === 'trojan') {
    if (!data.uuid) {
      const tlsLink = data.trojan_tls_link || get(['TLS Link', 'TROJAN TLS']);
      const grpcLink = data.trojan_grpc_link || get(['GRPC Link', 'TROJAN GRPC']);
      const link = tlsLink || grpcLink;
      if (link) {
        const match = link.match(/trojan:\/\/([^@]+)@/i);
        if (match) {
          data.uuid = match[1];
        }
      }
    }
  }

  if ((type === 'vmess' || type === 'vless') && !data.uuid) {
    const tlsLink = data.vmess_tls_link || data.vless_tls_link || get(['TLS Link']);
    if (tlsLink && tlsLink.startsWith('vmess://')) {
      try {
        const decoded = Buffer.from(tlsLink.replace(/^vmess:\/\//, ''), 'base64').toString('utf8');
        const parsed = JSON.parse(decoded);
        if (parsed.id) {
          data.uuid = parsed.id;
        }
      } catch (_) {}
    }
  }

  // Validasi field kritis — kalau kosong, anggap gagal
  if (type === 'ssh' && !data.password) {
    throw new Error('SSH password tidak ditemukan pada output script');
  }
  if ((type === 'vmess' || type === 'vless') && !data.uuid) {
    throw new Error('UUID tidak ditemukan pada output script');
  }
  if (type === 'trojan' && !data.uuid) {
    throw new Error('Password tidak ditemukan pada output script Trojan');
  }

  return data;
}

// Middleware untuk memeriksa kata sandi
const checkPassword = (req, res, next) => {
  const { auth } = req.query;
  const correctPassword = fs.readFileSync('/root/.key', 'utf8').trim(); // Membaca kata sandi dari /root/.key
  
  if (auth !== correctPassword) {
    return res.status(401).send('<html><body><h1 style="text-align: center;">Akses Ditolak</h1><p style="text-align: center;">Anda tidak memiliki izin untuk mengakses halaman ini.</p></body></html>');
  }
  
  next();
};

// Terapkan middleware checkPassword ke semua rute
app.use(checkPassword);

// Create ssh user
app.get("/createssh", (req, res) => {
  const { user, password, exp, iplimit } = req.query;
  if (!user || !password || !exp || !iplimit) {
    return res.status(400).json({ error: 'Username, expiry, iplimit, dan password diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk membuat akun SSH dengan user: ${user}, exp: ${exp}, iplimit: ${iplimit}, password: ${password}`);
  
  const child = spawn("/bin/bash", ["-c", `apicreate ssh ${user} ${password} ${exp} ${iplimit}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pembuatan akun SSH gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat membuat akun', detail: output });
    }
    console.log(`Akun SSH berhasil dibuat untuk user: ${user}`);
    
    const cleanedOutput = stripAnsi(output);
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        res.json({
          status: "success",
          message: "SSH account successfully created",
          data: {
            username: jsonResponse.data.username,
            password: jsonResponse.data.password,
            expired: jsonResponse.data.expired,            
            ip_limit: jsonResponse.data.ip_limit,
            domain: jsonResponse.data.domain,
            ns_domain: jsonResponse.data.ns_domain,
            city: jsonResponse.data.city,
            pubkey: jsonResponse.data.pubkey
          }
        });
      } else {
        res.status(500).json({ error: "Gagal membuat akun SSH", detail: jsonResponse.message });
      }
    } catch (err) {
      console.error(`Kesalahan parsing JSON: ${err}`);
      console.error('Output asli:', cleanedOutput);
      try {
        const fallbackData = buildTrialResponse('ssh', parseKeyValuePairs(cleanedOutput), { username: sanitizedUser });
        res.json({
          status: 'success',
          message: 'Trial SSH account successfully created',
          data: fallbackData
        });
      } catch (fallbackError) {
        console.error('Fallback parse error:', fallbackError);
        res.status(500).json({ error: 'Terjadi kesalahan saat memproses hasil', detail: fallbackError.message, rawOutput: cleanedOutput });
      }
    }
  });
});

// Create vmess user
app.get("/createvmess", (req, res) => {
  const { user, exp, quota, iplimit } = req.query;
  if (!user || !exp || !quota || !iplimit) {
    return res.status(400).json({ error: 'Username, expiry, quota, dan iplimit diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk membuat akun VMess dengan user: ${user}, exp: ${exp}, quota: ${quota}, iplimit: ${iplimit}`);
  
  const child = spawn("/bin/bash", ["-c", `apicreate vmess ${user} ${exp} ${quota} ${iplimit}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pembuatan akun VMess gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat membuat akun', detail: output });
    }
    console.log(`Akun VMess berhasil dibuat untuk user: ${user}`);
    
    const cleanedOutput = stripAnsi(output);
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        res.json({
          status: "success",
          message: "Vmess account successfully created",
          data: {
            username: jsonResponse.data.username,
            expired: jsonResponse.data.expired,
            uuid: jsonResponse.data.uuid,
            quota: jsonResponse.data.quota,
            ip_limit: jsonResponse.data.ip_limit,
            domain: jsonResponse.data.domain,
            ns_domain: jsonResponse.data.ns_domain,
            city: jsonResponse.data.city,
            pubkey: jsonResponse.data.pubkey,
            vmess_tls_link: jsonResponse.data.vmess_tls_link,
            vmess_nontls_link: jsonResponse.data.vmess_nontls_link,
            vmess_grpc_link: jsonResponse.data.vmess_grpc_link
          }
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat membuat akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      console.error('Output asli:', cleanedOutput);
      try {
        const fallbackData = buildTrialResponse('vmess', parseKeyValuePairs(cleanedOutput), { username: sanitizedUser });
        res.json({
          status: 'success',
          message: 'Trial VMess account successfully created',
          data: fallbackData
        });
      } catch (fallbackError) {
        console.error('Fallback parse error:', fallbackError);
        res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON', detail: fallbackError.message, rawOutput: cleanedOutput });
      }
    }
  });
});


// Create vless user
app.get("/createvless", (req, res) => {
  const { user, exp, quota, iplimit } = req.query;
  if (!user || !exp || !quota || !iplimit) {
    return res.status(400).json({ error: 'Username, expiry, quota, dan iplimit diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk membuat akun VLESS dengan user: ${user}, exp: ${exp}, quota: ${quota}, iplimit: ${iplimit}`);
  
  const child = spawn("/bin/bash", ["-c", `apicreate vless ${user} ${exp} ${quota} ${iplimit}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pembuatan akun VLESS gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat membuat akun', detail: output });
    }
    console.log(`Akun VLESS berhasil dibuat untuk user: ${user}`);
    
    const cleanedOutput = stripAnsi(output);
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        res.json({
          status: "success",
          message: "VLESS account successfully created",
          data: {
            username: jsonResponse.data.username,
            expired: jsonResponse.data.expired,
            uuid: jsonResponse.data.uuid,
            quota: jsonResponse.data.quota,
            ip_limit: jsonResponse.data.ip_limit,
            domain: jsonResponse.data.domain,
            ns_domain: jsonResponse.data.ns_domain,
            city: jsonResponse.data.city,
            pubkey: jsonResponse.data.pubkey,
            vless_tls_link: jsonResponse.data.vless_tls_link,
            vless_nontls_link: jsonResponse.data.vless_nontls_link,
            vless_grpc_link: jsonResponse.data.vless_grpc_link
          }
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat membuat akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      console.error('Output asli:', cleanedOutput);
      try {
        const fallbackData = buildTrialResponse('vless', parseKeyValuePairs(cleanedOutput), { username: sanitizedUser });
        res.json({
          status: 'success',
          message: 'Trial VLESS account successfully created',
          data: fallbackData
        });
      } catch (fallbackError) {
        console.error('Fallback parse error:', fallbackError);
        res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON', detail: fallbackError.message, rawOutput: cleanedOutput });
      }
    }
  });
});

// Create trojan user
app.get("/createtrojan", (req, res) => {
  const { user, exp, quota, iplimit } = req.query;
  if (!user || !exp || !quota || !iplimit) {
    return res.status(400).json({ error: 'Username, expiry, quota, dan iplimit diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk membuat akun Trojan dengan user: ${user}, exp: ${exp}, quota: ${quota}, iplimit: ${iplimit}`);
  
  const child = spawn("/bin/bash", ["-c", `apicreate trojan ${user} ${exp} ${quota} ${iplimit}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pembuatan akun Trojan gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat membuat akun', detail: output });
    }
    console.log(`Akun Trojan berhasil dibuat untuk user: ${user}`);
    
    const cleanedOutput = stripAnsi(output);
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        res.json({
          status: "success",
          message: "Trojan account successfully created",
          data: {
            username: jsonResponse.data.username,
            expired: jsonResponse.data.expired,
            uuid: jsonResponse.data.uuid,
            quota: jsonResponse.data.quota,
            ip_limit: jsonResponse.data.ip_limit,
            domain: jsonResponse.data.domain,
            ns_domain: jsonResponse.data.ns_domain,
            city: jsonResponse.data.city,
            pubkey: jsonResponse.data.pubkey,
            trojan_tls_link: jsonResponse.data.trojan_tls_link,
            trojan_grpc_link: jsonResponse.data.trojan_grpc_link
          }
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat membuat akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      console.error('Output asli:', cleanedOutput);
      try {
        const fallbackData = buildTrialResponse('trojan', parseKeyValuePairs(cleanedOutput), { username: sanitizedUser });
        res.json({
          status: 'success',
          message: 'Trial Trojan account successfully created',
          data: fallbackData
        });
      } catch (fallbackError) {
        console.error('Fallback parse error:', fallbackError);
        res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON', detail: fallbackError.message, rawOutput: cleanedOutput });
      }
    }
  });
});


// Create shadowsocks user
app.get("/createshadowsocks", (req, res) => {
  const { user, exp, quota, iplimit } = req.query;
  if (!user || !exp || !quota || !iplimit) {
    return res.status(400).json({ error: 'Username, expiry, quota, dan iplimit diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk membuat akun Shadowsocks dengan user: ${user}, exp: ${exp}, quota: ${quota}, iplimit: ${iplimit}`);
  
  const child = spawn("/bin/bash", ["-c", `apicreate shadowsocks ${user} ${exp} ${quota} ${iplimit}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pembuatan akun Shadowsocks gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat membuat akun', detail: output });
    }
    console.log(`Akun Shadowsocks berhasil dibuat untuk user: ${user}`);
    
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        res.json({
          status: "success",
          message: "Shadowsocks account successfully created",
          data: {
            username: jsonResponse.data.username,
            expired: jsonResponse.data.expired,
            password: jsonResponse.data.password,
            method: jsonResponse.data.method,
            quota: jsonResponse.data.quota,
            ip_limit: jsonResponse.data.ip_limit,
            domain: jsonResponse.data.domain,
            ns_domain: jsonResponse.data.ns_domain,
            city: jsonResponse.data.city,
            pubkey: jsonResponse.data.pubkey,
            ss_link_ws: jsonResponse.data.ss_link_ws,
            ss_link_grpc: jsonResponse.data.ss_link_grpc
          }
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat membuat akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      console.error('Output asli:', stripAnsi(output));
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON', detail: error.message });
    }
  });
});

// Check SSH user
app.get("/checkssh", (req, res) => { 
  
  const child = spawn("/bin/bash", ["-c", `apicheck ssh`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pemeriksaan akun SSH gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memeriksa akun', detail: output });
    }
    console.log(`Akun SSH berhasil diperiksa`);
    try {
      // Menghapus koma ekstra sebelum mem-parsing JSON
      const cleanedOutput = output.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      const jsonResponse = JSON.parse(cleanedOutput);
      if (jsonResponse.status === "success" && jsonResponse.data) {
        res.json({
          status: "success",
          message: jsonResponse.data.message,
          data: jsonResponse.data
        });
      } else {
        res.status(404).json({ error: 'Akun SSH tidak ditemukan' });
      }
    } catch (error) {
      console.error(`Error parsing JSON: ${error}`);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

app.get("/checkvmess", (req, res) => { 

  console.log(`Menerima permintaan untuk memeriksa akun VMess dengan user: `);
  
  const child = spawn("/bin/bash", ["-c", `apicheck vmess`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pemeriksaan akun VMess gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memeriksa akun', detail: output });
    }
    console.log(`Akun VMess berhasil diperiksa`);
    
    try {
      // Menghapus koma ekstra sebelum mem-parsing JSON
      const cleanedOutput = output.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      const jsonResponse = JSON.parse(cleanedOutput);
      if (jsonResponse.status === "success" && jsonResponse.data) {
        res.json({
          status: "success",
          message: jsonResponse.data.message,
          data: jsonResponse.data
        });
      } else {
        res.status(404).json({ error: 'Akun VMess tidak ditemukan' });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

app.get("/checkvless", (req, res) => { 

  console.log(`Menerima permintaan untuk memeriksa akun VLESS dengan user: `);
  
  const child = spawn("/bin/bash", ["-c", `apicheck vless`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pemeriksaan akun VLESS gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memeriksa akun', detail: output });
    }
    console.log(`Akun VLESS berhasil diperiksa`);
    
    try {
      // Menghapus koma ekstra sebelum mem-parsing JSON
      const cleanedOutput = output.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      const jsonResponse = JSON.parse(cleanedOutput);
      if (jsonResponse.status === "success" && jsonResponse.data) {
        res.json({
          status: "success",
          message: jsonResponse.data.message,
          data: jsonResponse.data
        });
      } else {
        res.status(404).json({ error: 'Akun VLESS tidak ditemukan' });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

app.get("/checktrojan", (req, res) => { 

  console.log(`Menerima permintaan untuk memeriksa akun Trojan dengan user: `);
  
  const child = spawn("/bin/bash", ["-c", `apicheck trojan`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pemeriksaan akun Trojan gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memeriksa akun', detail: output });
    }
    console.log(`Akun Trojan berhasil diperiksa`);
    
    try {
      // Menghapus koma ekstra sebelum mem-parsing JSON
      const cleanedOutput = output.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      const jsonResponse = JSON.parse(cleanedOutput);
      if (jsonResponse.status === "success" && jsonResponse.data) {
        res.json({
          status: "success",
          message: jsonResponse.data.message,
          data: jsonResponse.data
        });
      } else {
        res.status(404).json({ error: 'Akun Trojan tidak ditemukan' });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

app.get("/checkshadowsocks", (req, res) => { 

  console.log(`Menerima permintaan untuk memeriksa akun Shadowsocks dengan user: `);
  
  const child = spawn("/bin/bash", ["-c", `apicheck shadowsocks`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pemeriksaan akun Shadowsocks gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memeriksa akun', detail: output });
    }
    console.log(`Akun Shadowsocks berhasil diperiksa`);
    
    try {
      // Menghapus koma ekstra sebelum mem-parsing JSON
      const cleanedOutput = output.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      const jsonResponse = JSON.parse(cleanedOutput);
      if (jsonResponse.status === "success" && jsonResponse.data) {
        res.json({
          status: "success",
          message: jsonResponse.data.message,
          data: jsonResponse.data
        });
      } else {
        res.status(404).json({ error: 'Akun Shadowsocks tidak ditemukan' });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

// delete user ssh
app.get("/deletessh", (req, res) => {
  const { user } = req.query;
  if (!user) {
    return res.status(400).json({ error: 'Username diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk menghapus akun SSH dengan user: ${user}`);
  
  const child = spawn("/bin/bash", ["-c", `apidelete ssh ${user}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses penghapusan akun SSH gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat menghapus akun', detail: output });
    }
    console.log(`Akun SSH berhasil dihapus untuk user: ${user}`);
    
    try {
      // Menghapus koma ekstra sebelum mem-parsing JSON
      const cleanedOutput = output.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      const jsonResponse = JSON.parse(cleanedOutput);
      if (jsonResponse.status === "success" && jsonResponse.data) {
        res.json({
          status: "success",
          message: jsonResponse.data.message,
          data: jsonResponse.data
        });
      } else {
        res.status(404).json({ error: 'Akun SSH tidak ditemukan' });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

// delete user vmess
app.get("/deletevmess", (req, res) => {
  const { user } = req.query;
  if (!user) {
    return res.status(400).json({ error: 'Username diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk menghapus akun VMess dengan user: ${user}`);
  
  const child = spawn("/bin/bash", ["-c", `apidelete vmess ${user}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses penghapusan akun VMess gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat menghapus akun', detail: output });
    }
    console.log(`Akun VMess berhasil dihapus untuk user: ${user}`);
    
      // Menghapus koma ekstra sebelum mem-parsing JSON
      try {
        const cleanedOutput = output.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
        const jsonResponse = JSON.parse(cleanedOutput);
        if (jsonResponse.status === "success" && jsonResponse.data) {
          res.json({
            status: "success",
            message: jsonResponse.data.message,
            data: jsonResponse.data
          });
        } else {
          res.status(404).json({ error: 'Akun VMess tidak ditemukan' });
        }
      } catch (error) {
        console.error('Error parsing JSON:', error);
        res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
      }
    });
});

// delete user vless
app.get("/deletevless", (req, res) => {
  const { user } = req.query;
  if (!user) {
    return res.status(400).json({ error: 'Username diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk menghapus akun VLess dengan user: ${user}`);
  
  const child = spawn("/bin/bash", ["-c", `apidelete vless ${user}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses penghapusan akun VLess gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat menghapus akun', detail: output });
    }
    console.log(`Akun VLess berhasil dihapus untuk user: ${user}`);
    
    
    try {
      const cleanedOutput = output.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      const jsonResponse = JSON.parse(cleanedOutput);
      if (jsonResponse.status === "success" && jsonResponse.data) {
        res.json({
          status: "success",
          message: jsonResponse.data.message,
          data: jsonResponse.data
        });
      } else {
        res.status(404).json({ error: 'Akun VLess tidak ditemukan' });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

// delete user trojan
app.get("/deletetrojan", (req, res) => {
  const { user } = req.query;
  if (!user) {
    return res.status(400).json({ error: 'Username diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk menghapus akun Trojan dengan user: ${user}`);
  
  const child = spawn("/bin/bash", ["-c", `apidelete trojan ${user}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses penghapusan akun Trojan gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat menghapus akun', detail: output });
    }
    console.log(`Akun Trojan berhasil dihapus untuk user: ${user}`);
    
    
    try {
      const cleanedOutput = output.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      const jsonResponse = JSON.parse(cleanedOutput);
      if (jsonResponse.status === "success" && jsonResponse.data) {
        res.json({
          status: "success",
          message: jsonResponse.data.message,
          data: jsonResponse.data
        });
      } else {
        res.status(404).json({ error: 'Akun Trojan tidak ditemukan' });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

// delete user shadowsocks
app.get("/deleteshadowsocks", (req, res) => {
  const { user } = req.query;
  if (!user) {
    return res.status(400).json({ error: 'Username diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk menghapus akun Shadowsocks dengan user: ${user}`);
  
  const child = spawn("/bin/bash", ["-c", `apidelete shadowsocks ${user}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses penghapusan akun Shadowsocks gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat menghapus akun', detail: output });
    }
    console.log(`Akun Shadowsocks berhasil dihapus untuk user: ${user}`);
    
    try {
      const cleanedOutput = output.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
      const jsonResponse = JSON.parse(cleanedOutput);
      if (jsonResponse.status === "success" && jsonResponse.data) {
        res.json({
          status: "success",
          message: jsonResponse.data.message,
          data: jsonResponse.data
        });
      } else {
        res.status(404).json({ error: 'Akun Shadowsocks tidak ditemukan' });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

// Renew ssh user
app.get("/renewssh", (req, res) => {
  const { user, exp, iplimit } = req.query;
  if (!user || !exp || !iplimit) {
    return res.status(400).json({ error: 'Username, expiry, dan iplimit diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk memperbarui akun SSH dengan user: ${user}, exp: ${exp}, iplimit: ${iplimit}`);
  
  const child = spawn("/bin/bash", ["-c", `apirenew ssh ${user} ${exp} ${iplimit}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pembaruan akun SSH gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui akun', detail: output });
    }
    console.log(`Akun SSH berhasil diperbarui untuk user: ${user}`);
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        res.json({
          status: "success",
          message: "Akun Vmess test berhasil diperbarui",
          data: {
            username: jsonResponse.data.username,
            exp: jsonResponse.data.exp,
            limitip: jsonResponse.data.limitip
          }
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

// Renew vmess user
app.get("/renewvmess", (req, res) => {
  const { user, exp, quota, iplimit } = req.query;
  if (!user || !exp || !quota || !iplimit) {
    return res.status(400).json({ error: 'Username, expiry, quota, dan iplimit diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk memperbarui akun VMess dengan user: ${user}, exp: ${exp}, quota: ${quota}, iplimit: ${iplimit}`);
  
  const child = spawn("/bin/bash", ["-c", `apirenew vmess ${user} ${exp} ${quota} ${iplimit}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pembaruan akun VMess gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui akun', detail: output });
    }
    console.log(`Akun VMess berhasil diperbarui untuk user: ${user}`);
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        res.json({
          status: "success",
          message: "Akun Vmess test berhasil diperbarui",
          data: {
            username: jsonResponse.data.username,
            exp: jsonResponse.data.exp,
            quota: jsonResponse.data.quota,
            limitip: jsonResponse.data.limitip
          }
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

// Renew vless user
app.get("/renewvless", (req, res) => {
  const { user, exp, quota, iplimit } = req.query;
  if (!user || !exp || !quota || !iplimit) {
    return res.status(400).json({ error: 'Username, expiry, quota, dan iplimit diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk memperbarui akun VLess dengan user: ${user}, exp: ${exp}, quota: ${quota}, iplimit: ${iplimit}`);
  
  const child = spawn("/bin/bash", ["-c", `apirenew vless ${user} ${exp} ${quota} ${iplimit}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pembaruan akun VLess gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui akun', detail: output });
    }
    console.log(`Akun VLess berhasil diperbarui untuk user: ${user}`);
    
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        res.json({
          status: "success",
          message: "Akun Vmess test berhasil diperbarui",
          data: {
            username: jsonResponse.data.username,
            exp: jsonResponse.data.exp,
            quota: jsonResponse.data.quota,
            limitip: jsonResponse.data.limitip
          }
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      console.error('Output asli:', stripAnsi(output));
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON', detail: error.message });
    }
  });
});

// Renew trojan user
app.get("/renewtrojan", (req, res) => {
  const { user, exp, quota, iplimit } = req.query;
  if (!user || !exp || !quota || !iplimit) {
    return res.status(400).json({ error: 'Username, expiry, quota, dan iplimit diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk memperbarui akun Trojan dengan user: ${user}, exp: ${exp}, quota: ${quota}, iplimit: ${iplimit}`);
  
  const child = spawn("/bin/bash", ["-c", `apirenew trojan ${user} ${exp} ${quota} ${iplimit}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pembaruan akun Trojan gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui akun', detail: output });
    }
    console.log(`Akun Trojan berhasil diperbarui untuk user: ${user}`);
    
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        res.json({
          status: "success",
          message: "Akun Vmess test berhasil diperbarui",
          data: {
            username: jsonResponse.data.username,
            exp: jsonResponse.data.exp,
            quota: jsonResponse.data.quota,
            limitip: jsonResponse.data.limitip
          }
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      console.error('Output asli:', stripAnsi(output));
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON', detail: error.message });
    }
  });
});

// Renew shadowsocks user
app.get("/renewshadowsocks", (req, res) => {
  const { user, exp, quota, iplimit } = req.query;
  if (!user || !exp || !quota || !iplimit) {
    return res.status(400).json({ error: 'Username, expiry, quota, dan iplimit diperlukan' });
  }
  
  console.log(`Menerima permintaan untuk memperbarui akun Shadowsocks dengan user: ${user}, exp: ${exp}, quota: ${quota}, iplimit: ${iplimit}`);
  
  const child = spawn("/bin/bash", ["-c", `apirenew shadowsocks ${user} ${exp} ${quota} ${iplimit}`], {
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses pembaruan akun Shadowsocks gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui akun', detail: output });
    }
    console.log(`Akun Shadowsocks berhasil diperbarui untuk user: ${user}`);
    
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        res.json({
          status: "success",
          message: "Akun Vmess test berhasil diperbarui",
          data: {
            username: jsonResponse.data.username,
            exp: jsonResponse.data.exp,
            quota: jsonResponse.data.quota,
            limitip: jsonResponse.data.limitip
          }
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat memperbarui akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON' });
    }
  });
});

// Trial SSH user
app.get("/trialssh", (req, res) => {
  const { user, minutes, auth } = req.query;
  if (!minutes) {
    return res.status(400).json({ error: 'Minutes diperlukan' });
  }

  const minutesNum = parseInt(minutes, 10);
  if (isNaN(minutesNum) || minutesNum <= 0 || minutesNum > 1440) {
    return res.status(400).json({ error: 'Minutes harus berupa angka antara 1 - 1440' });
  }

  const sanitizedUser = (user || '').trim();
  if (sanitizedUser && /[^a-zA-Z0-9]/.test(sanitizedUser)) {
    return res.status(400).json({ error: 'Username hanya boleh berisi huruf dan angka tanpa spasi' });
  }

  const hostHeader = req.headers['host'] || '';
  const requestDomain = hostHeader.split(':')[0] || req.hostname || '';
  
  console.log(`Menerima permintaan untuk trial akun SSH dengan user: ${sanitizedUser || '(auto)'}, minutes: ${minutesNum}`);
  
  const child = spawn("/bin/bash", ["-c", "trialssh"], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TERM: 'xterm' }
  });

  if (sanitizedUser) {
    child.stdin.write(`${sanitizedUser}\n`);
  }
  child.stdin.write(`${minutesNum}\n`);
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses trial akun SSH gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat membuat trial akun', detail: output });
    }
    console.log(`Trial akun SSH berhasil dibuat untuk user: ${sanitizedUser || '(auto)'}`);
    
    const cleanedOutput = stripAnsi(output);
    const pairs = parseKeyValuePairs(cleanedOutput);
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        const processed = postProcessTrialData('ssh', jsonResponse.data, pairs, { defaultDomain: requestDomain, minutes: minutesNum });
        res.json({
          status: "success",
          message: "Trial SSH account successfully created",
          data: processed
        });
      } else {
        res.status(500).json({ error: "Gagal membuat trial akun SSH", detail: jsonResponse.message });
      }
    } catch (err) {
      console.error(`Kesalahan parsing JSON: ${err}`);
      console.error('Output asli:', cleanedOutput);
      try {
        const fallbackData = buildTrialResponse('ssh', pairs, { username: sanitizedUser });
        const processed = postProcessTrialData('ssh', fallbackData, pairs, { defaultDomain: requestDomain, minutes: minutesNum });
        return res.json({
          status: 'success',
          message: 'Trial SSH account successfully created',
          data: processed
        });
      } catch (fallbackError) {
        console.error('Fallback parse error:', fallbackError);
        return res.status(500).json({ error: "Terjadi kesalahan saat memproses hasil", detail: fallbackError.message, rawOutput: cleanedOutput });
      }
    }
  });
});

// Trial VMess user
app.get("/trialvmess", (req, res) => {
  const { user, minutes, auth } = req.query;
  if (!minutes) {
    return res.status(400).json({ error: 'Minutes diperlukan' });
  }

  const minutesNum = parseInt(minutes, 10);
  if (isNaN(minutesNum) || minutesNum <= 0 || minutesNum > 1440) {
    return res.status(400).json({ error: 'Minutes harus berupa angka antara 1 - 1440' });
  }

  const sanitizedUser = (user || '').trim();
  if (sanitizedUser && /[^a-zA-Z0-9]/.test(sanitizedUser)) {
    return res.status(400).json({ error: 'Username hanya boleh berisi huruf dan angka tanpa spasi' });
  }
  const hostHeader = req.headers['host'] || '';
  const requestDomain = hostHeader.split(':')[0] || req.hostname || '';
  
  console.log(`Menerima permintaan untuk trial akun VMess dengan user: ${sanitizedUser || '(auto)'}, minutes: ${minutesNum}`);
  
  const child = spawn("/bin/bash", ["-c", "trialvmess"], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TERM: 'xterm' }
  });

  if (sanitizedUser) {
    child.stdin.write(`${sanitizedUser}\n`);
  }
  child.stdin.write(`${minutesNum}\n`);
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses trial akun VMess gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat membuat trial akun', detail: output });
    }
    console.log(`Trial akun VMess berhasil dibuat untuk user: ${sanitizedUser || '(auto)'}`);
    
    const cleanedOutput = stripAnsi(output);
    const pairs = parseKeyValuePairs(cleanedOutput);
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        const processed = postProcessTrialData('vmess', jsonResponse.data, pairs, { defaultDomain: requestDomain, minutes: minutesNum });
        res.json({
          status: "success",
          message: "Trial VMess account successfully created",
          data: processed
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat membuat trial akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      console.error('Output asli:', cleanedOutput);
      try {
        const fallbackData = buildTrialResponse('vmess', pairs, { username: sanitizedUser });
        const processed = postProcessTrialData('vmess', fallbackData, pairs, { defaultDomain: requestDomain, minutes: minutesNum });
        return res.json({
          status: 'success',
          message: 'Trial VMess account successfully created',
          data: processed
        });
      } catch (fallbackError) {
        console.error('Fallback parse error:', fallbackError);
        return res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON', detail: fallbackError.message, rawOutput: cleanedOutput });
      }
    }
  });
});

// Trial VLess user
app.get("/trialvless", (req, res) => {
  const { user, minutes, auth } = req.query;
  if (!minutes) {
    return res.status(400).json({ error: 'Minutes diperlukan' });
  }

  const minutesNum = parseInt(minutes, 10);
  if (isNaN(minutesNum) || minutesNum <= 0 || minutesNum > 1440) {
    return res.status(400).json({ error: 'Minutes harus berupa angka antara 1 - 1440' });
  }

  const sanitizedUser = (user || '').trim();
  if (sanitizedUser && /[^a-zA-Z0-9]/.test(sanitizedUser)) {
    return res.status(400).json({ error: 'Username hanya boleh berisi huruf dan angka tanpa spasi' });
  }
  const hostHeader = req.headers['host'] || '';
  const requestDomain = hostHeader.split(':')[0] || req.hostname || '';
  
  console.log(`Menerima permintaan untuk trial akun VLESS dengan user: ${sanitizedUser || '(auto)'}, minutes: ${minutesNum}`);
  
  const child = spawn("/bin/bash", ["-c", "trialvless"], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TERM: 'xterm' }
  });

  if (sanitizedUser) {
    child.stdin.write(`${sanitizedUser}\n`);
  }
  child.stdin.write(`${minutesNum}\n`);
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses trial akun VLESS gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat membuat trial akun', detail: output });
    }
    console.log(`Trial akun VLESS berhasil dibuat untuk user: ${sanitizedUser || '(auto)'}`);
    
    const cleanedOutput = stripAnsi(output);
    const pairs = parseKeyValuePairs(cleanedOutput);
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        const processed = postProcessTrialData('vless', jsonResponse.data, pairs, { defaultDomain: requestDomain, minutes: minutesNum });
        res.json({
          status: "success",
          message: "Trial VLESS account successfully created",
          data: processed
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat membuat trial akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      console.error('Output asli:', cleanedOutput);
      try {
        const fallbackData = buildTrialResponse('vless', pairs, { username: sanitizedUser });
        const processed = postProcessTrialData('vless', fallbackData, pairs, { defaultDomain: requestDomain, minutes: minutesNum });
        return res.json({
          status: 'success',
          message: 'Trial VLESS account successfully created',
          data: processed
        });
      } catch (fallbackError) {
        console.error('Fallback parse error:', fallbackError);
        return res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON', detail: fallbackError.message, rawOutput: cleanedOutput });
      }
    }
  });
});

// Trial Trojan user
app.get("/trialtrojan", (req, res) => {
  const { user, minutes, auth } = req.query;
  if (!minutes) {
    return res.status(400).json({ error: 'Minutes diperlukan' });
  }

  const minutesNum = parseInt(minutes, 10);
  if (isNaN(minutesNum) || minutesNum <= 0 || minutesNum > 1440) {
    return res.status(400).json({ error: 'Minutes harus berupa angka antara 1 - 1440' });
  }

  const sanitizedUser = (user || '').trim();
  if (sanitizedUser && /[^a-zA-Z0-9]/.test(sanitizedUser)) {
    return res.status(400).json({ error: 'Username hanya boleh berisi huruf dan angka tanpa spasi' });
  }
  const hostHeader = req.headers['host'] || '';
  const requestDomain = hostHeader.split(':')[0] || req.hostname || '';
  
  console.log(`Menerima permintaan untuk trial akun Trojan dengan user: ${sanitizedUser || '(auto)'}, minutes: ${minutesNum}`);
  
  const child = spawn("/bin/bash", ["-c", "trialtrojan"], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, TERM: 'xterm' }
  });

  if (sanitizedUser) {
    child.stdin.write(`${sanitizedUser}\n`);
  }
  child.stdin.write(`${minutesNum}\n`);
  child.stdin.end();
  let output = '';
  child.stdout.on('data', (data) => {
    output += data.toString();
  });
  
  child.stderr.on('data', (data) => {
    console.error(`Kesalahan: ${data}`);
    output += data.toString();
  });
  
  child.on('close', (code) => {
    if (code !== 0) {
      console.log(`Proses trial akun Trojan gagal dengan kode: ${code}`);
      return res.status(500).json({ error: 'Terjadi kesalahan saat membuat trial akun', detail: output });
    }
    console.log(`Trial akun Trojan berhasil dibuat untuk user: ${sanitizedUser || '(auto)'}`);
    
    const cleanedOutput = stripAnsi(output);
    const pairs = parseKeyValuePairs(cleanedOutput);
    try {
      const jsonResponse = extractJson(output);
      if (jsonResponse.status === "success") {
        const processed = postProcessTrialData('trojan', jsonResponse.data, pairs, { defaultDomain: requestDomain, minutes: minutesNum });
        res.json({
          status: "success",
          message: "Trial Trojan account successfully created",
          data: processed
        });
      } else {
        res.status(500).json({ error: 'Terjadi kesalahan saat membuat trial akun', detail: jsonResponse.message });
      }
    } catch (error) {
      console.error('Error parsing JSON:', error);
      console.error('Output asli:', cleanedOutput);
      try {
        const fallbackData = buildTrialResponse('trojan', pairs, { username: sanitizedUser });
        const processed = postProcessTrialData('trojan', fallbackData, pairs, { defaultDomain: requestDomain, minutes: minutesNum });
        return res.json({
          status: 'success',
          message: 'Trial Trojan account successfully created',
          data: processed
        });
      } catch (fallbackError) {
        console.error('Fallback parse error:', fallbackError);
        return res.status(500).json({ error: 'Terjadi kesalahan saat memproses output JSON', detail: fallbackError.message, rawOutput: cleanedOutput });
      }
    }
  });
});

const PORT = process.env.PORT || 5888;
app.listen(PORT, () => {
  console.log(`Server berjalan di port ${PORT}`);
});