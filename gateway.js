const express = require('express');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.json());

const db = new Database(path.join(__dirname, 'zero_trust.db'));
const JWT_SECRET = 'super-secret-jwt-key';
const GATEWAY_SECRET = 'internal-gateway-secret-key';

// Helper Logging Audit Trail
function logAudit(username, endpoint, deviceId, decision, reason) {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (username, endpoint, device_id, decision, reason)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(username || 'anonymous', endpoint, deviceId || 'UNKNOWN', decision, reason);
  } catch (err) {
    console.error('Gagal mencatat audit log:', err.message);
  }
}

// ==================== AUTHENTICATION ENDPOINTS ====================

// Login User (Dosen / Mahasiswa)
app.post('/auth/login', (req, res) => {
  const { username, password, device_id } = req.body;

  if (!username || !password || !device_id) {
    return res.status(400).json({ error: 'Username, password, dan device_id wajib diisi' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);

  if (!user) {
    logAudit(username, '/auth/login', device_id, 'deny', 'Kredensial tidak valid');
    return res.status(401).json({ error: 'Username atau password salah' });
  }

  if (user.device_id !== device_id) {
    logAudit(username, '/auth/login', device_id, 'deny', 'Device ID tidak cocok');
    return res.status(403).json({ error: 'Device ID tidak terdaftar untuk akun ini' });
  }

  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    nim_or_nip: user.nim_or_nip
  };

  const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '10m' });
  const refreshToken = jwt.sign({ sub: user.id }, JWT_SECRET, { expiresIn: '1d' });

  logAudit(user.username, '/auth/login', device_id, 'allow', 'Login berhasil');

  res.json({
    access_token: accessToken,
    refresh_token: refreshToken
  });
});

// Issuance Service Token (Antar-Microservice)
app.post('/auth/service-token', (req, res) => {
  const gatewaySecret = req.headers['x-gateway-secret'];

  if (gatewaySecret !== GATEWAY_SECRET) {
    return res.status(403).json({ error: 'Gateway secret tidak valid' });
  }

  const { service_name } = req.body;
  const payload = {
    sub: service_name,
    role: 'service'
  };

  const serviceToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '5m' });
  res.json({ service_token: serviceToken });
});

// ==================== POLICY ENGINE MIDDLEWARE ====================

function policyEngine(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    logAudit('anonymous', req.originalUrl, req.headers['x-device-id'], 'deny', 'Header Authorization missing/invalid');
    return res.status(401).json({ error: 'Access token diperlukan' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;

    const requestPath = req.originalUrl.split('?')[0];
    const method = req.method;
    const deviceId = req.headers['x-device-id'];
    const subject = decoded.username || decoded.sub;

    // 1. Panggilan Antar-Service (role: service)
    if (decoded.role === 'service') {
      if (requestPath === '/transkrip/sinkron' && method === 'POST') {
        logAudit(subject, req.originalUrl, 'INTERNAL', 'allow', 'Akses sinkronisasi transkrip diizinkan untuk service');
        return next();
      }
      logAudit(subject, req.originalUrl, 'INTERNAL', 'deny', 'Service token tidak memiliki akses ke endpoint ini');
      return res.status(403).json({ error: 'Akses ditolak untuk token service' });
    }

    // 2. Verifikasi Device ID (Aplikasi Mahasiswa / Dosen)
    const user = db.prepare('SELECT device_id FROM users WHERE id = ?').get(decoded.sub);
    if (!user || user.device_id !== deviceId) {
      logAudit(subject, req.originalUrl, requestPath, 'deny', 'Device ID tidak cocok atau tidak terdaftar');
      return res.status(403).json({ error: 'Akses ditolak: Perangkat tidak dikenali' });
    }

    // 3. Verifikasi Aturan Waktu (07:00 - 21:00)
    const currentHour = new Date().getHours();
    if (currentHour < 7 || currentHour >= 21) {
      logAudit(subject, req.originalUrl, requestPath, 'deny', 'Akses di luar jam operasional (07:00 - 21:00)');
      return res.status(403).json({ error: 'Akses ditolak: Di luar jam operasional' });
    }

    // 4. Verifikasi RBAC (Role-Based Access Control)
    let allowed = false;
    if (decoded.role === 'dosen') {
      if (requestPath.startsWith('/nilai') || requestPath.startsWith('/kelas')) {
        allowed = true;
      }
    } else if (decoded.role === 'mahasiswa') {
      if (requestPath.startsWith('/transkrip')) {
        allowed = true;
      }
    }

    if (!allowed) {
      logAudit(subject, req.originalUrl, requestPath, 'deny', `Role ${decoded.role} tidak memiliki izin ke ${requestPath}`);
      return res.status(403).json({ error: 'Akses ditolak oleh Policy Engine' });
    }

    logAudit(subject, req.originalUrl, requestPath, 'allow', 'Akses diberikan oleh Policy Engine');
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token tidak valid atau telah kadaluwarsa' });
  }
}

// ==================== REVERSE PROXY ROUTING ====================

// Proxy ke Service Nilai (Port 3001)
app.use(['/nilai', '/kelas'], policyEngine, async (req, res) => {
  try {
    const targetUrl = `http://localhost:3001${req.originalUrl}`;
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Secret': GATEWAY_SECRET,
        'X-User-Role': req.user.role,
        'X-User-NIP': req.user.nim_or_nip || ''
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghubungkan ke Service Nilai', details: err.message });
  }
});

// Proxy ke Service Transkrip (Port 3002)
app.use('/transkrip', policyEngine, async (req, res) => {
  try {
    const targetUrl = `http://localhost:3002${req.originalUrl}`;
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Secret': GATEWAY_SECRET,
        'X-User-Role': req.user.role,
        'X-User-NIM': req.user.nim_or_nip || ''
      },
      body: ['POST', 'PUT', 'PATCH'].includes(req.method) ? JSON.stringify(req.body) : undefined
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghubungkan ke Service Transkrip', details: err.message });
  }
});

// Server Listening
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🛡️ API Gateway (PEP) & Policy Engine running on port ${PORT}`);
});