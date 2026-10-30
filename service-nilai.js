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

// 1. GET /nilai
app.get('/nilai', (req, res) => {
  const userRole = req.headers['x-user-role'];
  const userNip = req.headers['x-user-nip'];

  if (userRole !== 'dosen') {
    return res.status(403).json({ error: 'Hanya dosen yang dapat melihat nilai' });
  }

  const data = db.prepare(`
    SELECT n.id, k.kode_kelas, k.nama_kelas, u.username as nama_mahasiswa, u.nim_or_nip as nim, n.nilai_angka, n.nilai_huruf, n.status_final
    FROM nilai n
    JOIN kelas k ON n.kelas_id = k.id
    JOIN users u ON n.mahasiswa_id = u.id
    JOIN users d ON k.dosen_id = d.id
    WHERE d.nim_or_nip = ?
  `).all(userNip);

  res.json({ data });
});

// 2. PUT /nilai/:id
app.put('/nilai/:id', (req, res) => {
  const { id } = req.params;
  const { nilai_angka, nilai_huruf } = req.body;

  const stmt = db.prepare('UPDATE nilai SET nilai_angka = ?, nilai_huruf = ? WHERE id = ?');
  const result = stmt.run(nilai_angka, nilai_huruf, id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Data nilai tidak ditemukan' });
  }

  res.json({ message: 'Nilai berhasil diperbarui' });
});

// 3. POST /kelas/:id/finalisasi
app.post('/kelas/:id/finalisasi', async (req, res) => {
  const { id } = req.params;

  // Update status final
  db.prepare('UPDATE nilai SET status_final = 1 WHERE kelas_id = ?').run(id);

  // Ambil data nilai kelas yang difinalisasi
  const items = db.prepare(`
    SELECT u.nim_or_nip as nim, k.kode_kelas, k.nama_kelas, n.nilai_angka, n.nilai_huruf
    FROM nilai n
    JOIN kelas k ON n.kelas_id = k.id
    JOIN users u ON n.mahasiswa_id = u.id
    WHERE n.kelas_id = ?
  `).all(id);

  try {
    // Minta Service Token ke Gateway
    const tokenRes = await fetch('http://localhost:3000/auth/service-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Secret': GATEWAY_SECRET
      },
      body: JSON.stringify({ service_name: 'service-nilai' })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      return res.status(500).json({ error: 'Gagal mengambil service token', details: tokenData.error });
    }

    // Kirim data ke Service Transkrip lewat API Gateway (PORT 3000)
    const syncRes = await fetch('http://localhost:3000/transkrip/sinkron', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenData.service_token}`
      },
      body: JSON.stringify({ items })
    });

    const syncData = await syncRes.json();
    if (!syncRes.ok) {
      return res.status(syncRes.status).json({ error: 'Gagal melakukan sinkronisasi transkrip', details: syncData.error });
    }

    res.json({ message: 'Kelas berhasil difinalisasi dan transkrip disinkronkan' });
  } catch (err) {
    res.status(500).json({ error: 'Terjadi kesalahan sistem', details: err.message });
  }
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`📊 Service Nilai running on port ${PORT}`);
});