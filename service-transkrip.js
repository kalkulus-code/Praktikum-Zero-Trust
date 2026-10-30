const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');

const app = express();
app.use(express.json());

const db = new Database(path.join(__dirname, 'zero_trust.db'));
const GATEWAY_SECRET = 'internal-gateway-secret-key';

// Middleware Verifikasi Request dari Gateway
const verifyGateway = (req, res, next) => {
  const secret = req.headers['x-gateway-secret'];
  if (secret !== GATEWAY_SECRET) {
    return res.status(403).json({ error: 'Akses langsung ditolak! Request harus melalui API Gateway' });
  }
  next();
};

app.use(verifyGateway);

// Endpoint Sinkronisasi Transkrip (Diakses oleh Gateway saat finalisasi)
app.post('/transkrip/sinkron', (req, res) => {
  const { items } = req.body;

  if (!items || !Array.isArray(items)) {
    return res.status(400).json({ error: 'Data items tidak valid' });
  }

  const stmt = db.prepare(`
    INSERT INTO transkrip (nim, kode_kelas, nama_kelas, nilai_angka, nilai_huruf)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((rows) => {
    for (const item of rows) {
      stmt.run(item.nim, item.kode_kelas, item.nama_kelas, item.nilai_angka, item.nilai_huruf);
    }
  });

  insertMany(items);

  res.json({ message: 'Transkrip berhasil disinkronkan' });
});

// Endpoint GET Transkrip Mahasiswa
app.get('/transkrip/:nim', (req, res) => {
  const { nim } = req.params;
  const userRole = req.headers['x-user-role'];
  const userNim = req.headers['x-user-nim'];

  if (userRole === 'mahasiswa' && userNim !== nim) {
    return res.status(403).json({ error: 'Akses ditolak: Anda hanya dapat melihat transkrip milik sendiri' });
  }

  const data = db.prepare('SELECT * FROM transkrip WHERE nim = ?').all(nim);
  res.json({ data });
});

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`📜 Service Transkrip running on port ${PORT}`);
});