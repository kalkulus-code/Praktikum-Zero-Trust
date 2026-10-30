const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'zero_trust.db'));

// 1. Matikan foreign key sementara untuk reset database
db.exec('PRAGMA foreign_keys = OFF;');

// 2. Bersihkan tabel lama
db.exec(`
  DROP TABLE IF EXISTS audit_logs;
  DROP TABLE IF EXISTS transkrip;
  DROP TABLE IF EXISTS nilai;
  DROP TABLE IF EXISTS kelas;
  DROP TABLE IF EXISTS users;
`);

// 3. Nyalakan kembali foreign key
db.exec('PRAGMA foreign_keys = ON;');

// 4. Buat Skema Tabel
db.exec(`
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL,
    device_id TEXT NOT NULL,
    nim_or_nip TEXT NOT NULL
  );

  CREATE TABLE kelas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kode_kelas TEXT NOT NULL,
    nama_kelas TEXT NOT NULL,
    dosen_id INTEGER NOT NULL,
    FOREIGN KEY (dosen_id) REFERENCES users(id)
  );

  CREATE TABLE nilai (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kelas_id INTEGER NOT NULL,
    mahasiswa_id INTEGER NOT NULL,
    nilai_angka REAL,
    nilai_huruf TEXT,
    status_final INTEGER DEFAULT 0,
    FOREIGN KEY (kelas_id) REFERENCES kelas(id),
    FOREIGN KEY (mahasiswa_id) REFERENCES users(id)
  );

  CREATE TABLE transkrip (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nim TEXT NOT NULL,
    kode_kelas TEXT NOT NULL,
    nama_kelas TEXT NOT NULL,
    nilai_angka REAL NOT NULL,
    nilai_huruf TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE audit_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    username TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    device_id TEXT NOT NULL,
    decision TEXT NOT NULL,
    reason TEXT NOT NULL
  );
`);

// 5. Isi Seed Data Sesuai Urutan Dependensi
db.exec(`
  INSERT INTO users (id, username, password, role, device_id, nim_or_nip) VALUES
  (1, 'admin', 'admin123', 'admin', 'DEV-ADMIN-01', 'ADM01'),
  (2, 'dosen1', 'dosen123', 'dosen', 'DEV-DOSEN-01', 'DOSEN01'),
  (3, 'mhs1', 'mhs123', 'mahasiswa', 'DEV-MHS-01', 'MHS01'),
  (4, 'mhs2', 'mhs2123', 'mahasiswa', 'DEV-MHS-02', 'MHS02');

  INSERT INTO kelas (id, kode_kelas, nama_kelas, dosen_id) VALUES
  (1, 'IF101', 'Pemrograman Web', 2);

  INSERT INTO nilai (id, kelas_id, mahasiswa_id, nilai_angka, nilai_huruf, status_final) VALUES
  (1, 1, 3, 85, 'A', 0),
  (2, 1, 4, 75, 'B', 0);
`);

console.log('✅ Database berhasil diinisialisasi dan diisi seed data!');
db.close();