# 🛡️ Zero Trust Security Architecture System (NIST SP 800-207)

Sistem backend berbasis **Zero Trust Architecture (ZTA)** sesuai standar **NIST SP 800-207** yang dibangun menggunakan **Node.js**, **Express.js**, dan **SQLite**. Proyek ini mendemonstrasikan implementasi keamanan modern dengan prinsip dasar *"Never Trust, Always Verify"*, *Least Privilege*, *Micro-segmentation (Assume Breach)*, serta pencatatan audit log terpusat.

---

## 📐 Arsitektur Sistem & Pemetaan NIST SP 800-207

Sistem memisahkan komponen keamanan menjadi **API Gateway** yang mengontrol seluruh *traffic*, dan **Microservices** yang terisolasi di dalam *Implicit Trust Zone*.

```text
                    ┌─────────────────────────────────────────────────────────┐
                    │                   CLIENT / USER                         │
                    └────────────────────────────┬────────────────────────────┘
                                                 │ (HTTPS / HTTP Request)
                                                 ▼
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                   API GATEWAY (Port 3000)                                 │
│  ┌──────────────────────────┐    ┌──────────────────────────────────┐   ┌──────────────┐  │
│  │ Policy Enforcement Point │ ── │      Policy Decision Point       │ ─ │ Policy Admin │  │
│  │          (PEP)           │    │    (PEP Engine / Context Check)  │   │  (PA / Auth) │  │
│  └──────────────────────────┘    └──────────────────────────────────┘   └──────────────┘  │
└────────────────────────────────────────────┬──────────────────────────────────────────────┘
                                             │ (X-Gateway-Secret Header)
                     ┌───────────────────────┴───────────────────────┐
                     ▼                                               ▼
   ┌───────────────────────────────────┐           ┌───────────────────────────────────┐
   │    Service Nilai (Port 3001)      │ ────────> │   Service Transkrip (Port 3002)   │
   │      (Implicit Trust Zone)        │           │      (Implicit Trust Zone)        │
   └───────────────────────────────────┘           └───────────────────────────────────┘
                     │                                               │
                     └───────────────────────┬───────────────────────┘
                                             ▼
                          ┌──────────────────────────────────────┐
                          │   Database SQLite (zero_trust.db)    │
                          │   (Policy Information Point / PIP)   │
                          └──────────────────────────────────────┘

Komponen NIST SP 800-207File / ModulDeskripsi & Tanggung JawabPolicy Enforcement Point (PEP)gateway.js (Port 3000)Pintu gerbang utama (Reverse Proxy) yang menyaring dan meneruskan semua request ke microservices.Policy Decision Point (PDP)Middleware policyEngine()Mengevaluasi keputusan Allow/Deny secara real-time berdasarkan JWT, Device ID, Jam Operasional, dan RBAC.Policy Information Point (PIP)zero_trust.dbDatabase SQLite yang menyimpan data pengguna, hak akses, kelas, transkrip, dan audit_logs.Policy Administrator (PA)/auth/login & /auth/service-tokenMenerbitkan token JWT untuk pengguna (10 menit) dan Service Token antar-microservice (5 menit).Implicit Trust Zonenilai.js (3001) & transkrip.js (3002)Service internal terisolasi yang wajib memverifikasi header X-Gateway-Secret.
🔒 Fitur & Kontrol Keamanan Utama
-Otentikasi & Konteks Berkelanjutan (Continuous Verification):Menerapkan JWT Token untuk otentikasi identitas.Pengecekan Device ID (X-Device-ID) yang wajib cocok dengan data terdaftar di database.Pembatasan Jam Operasional System (Hanya diizinkan pukul 07:00 - 21:00).
-Hak Akses Terbatas (Role-Based Access Control & Least Privilege):Dosen: Hanya dapat mengelola dan memfinalisasi nilai pada kelas yang diampu.Mahasiswa: Hanya dapat melihat data transkrip milik sendiri (userNim === nim), akses ke transkrip mahasiswa lain otomatis ditolak.
-Mikrosegmentasi & Assume Breach:Service Nilai (3001) dan Transkrip (3002) menolak seluruh akses langsung (Direct Access) yang tidak melalui API Gateway melalui pengecekan X-Gateway-Secret.-Autentikasi Antar-Service (Service-to-Service Auth):Proses finalisasi nilai memicu Service Nilai untuk meminta Service Token berdurasi pendek (5 menit) ke Gateway sebelum menyinkronkan data ke Service Transkrip.
-Audit Trail Terpusat (Centralized Audit Logging):Seluruh keputusan allow dan deny beserta alasan penolakannya dicatat secara real-time ke tabel audit_logs.
📊 Data Awal & Kredensial Pengujian (Seed Data)
UsernamePasswordRoleNIM / NIPDevice ID TerdaftarDeskripsi Hak Aksesadminadmin123adminADM01DEV-ADMIN-01Administrator Sistemdosen1dosen123dosenDOSEN01DEV-DOSEN-01Dosen Pengampu Kelas IF101mhs1mhs123mahasiswaMHS01DEV-MHS-01Mahasiswa 1 (Pemilik NIM MHS01)mhs2mhs2123mahasiswaMHS02DEV-MHS-02Mahasiswa 2 (Pemilik NIM MHS02)
📁 Struktur Direktori ProyekPlaintextzero-trust-system/
├── db.js                # Script inisialisasi & seed data SQLite
├── gateway.js           # API Gateway (PEP, PDP, PA, Audit Logging) - Port 3000
├── nilai.js             # Service Nilai (Implicit Trust Zone) - Port 3001
├── transkrip.js         # Service Transkrip (Implicit Trust Zone) - Port 3002
├── package.json         # Dependensi & script eksekusi
├── zero_trust.db        # File Database SQLite (dihasilkan setelah init-db)
└── README.md            # Dokumentasi proyek
🚀 Panduan Memulai (Installation & Setup)
1. Prasyarat SystemNode.js (v18.0.0 atau yang lebih baru)npm (v9.0.0 atau yang lebih baru)PowerShell / Terminal Console
2. Instalasi DependensiBuka terminal dan jalankan perintah berikut untuk menginstal paket yang dibutuhkan (express, better-sqlite3, jsonwebtoken):Bashnpm install
3. Inisialisasi DatabaseJalankan perintah ini untuk me-reset dan mengisi ulang data awal (seed data) ke dalam database SQLite:Bashnpm run init-db
Output yang diharapkan: ✅ Database berhasil diinisialisasi dan diisi seed data!
🏃 Cara Menjalankan SistemSistem memerlukan 4 Terminal Terpisah untuk dijalankan secara bersamaan:Terminal 1 — Service Nilai (Port 3001):Bashnpm run start-nilai
Terminal 2 — Service Transkrip (Port 3002):Bashnpm run start-transkrip
Terminal 3 — API Gateway (Port 3000):Bashnpm run start-gateway
Terminal 4 — Terminal Eksekusi & Pengujian (PowerShell):
Gunakan terminal ini untuk mengeksekusi perintah pengujian menggunakan PowerShell.
🧪 Skrip Pengujian Skenario Keamanan (PowerShell)
Jalankan perintah-perintah berikut di Terminal 4:
1. Uji Otentikasi Dosen & Finalisasi Nilai (Service-to-Service Sync)Melakukan login sebagai Dosen 1, mengambil token JWT, dan memfinalisasi nilai kelas.PowerShell$login = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method POST -ContentType "application/json" -Body '{"username": "dosen1", "password": "dosen123", "device_id": "DEV-DOSEN-01"}'; $token =$login.access_token

Invoke-RestMethod -Uri "http://localhost:3000/kelas/1/finalisasi" -Method POST -Headers @{ "Authorization" = "Bearer $token"; "X-Device-ID" = "DEV-DOSEN-01" }
Hasil: {"message": "Kelas berhasil difinalisasi dan transkrip disinkronkan"}

2. Uji Isolasi Data Mahasiswa & RBAC (Least Privilege)Memastikan mahasiswa hanya bisa mengakses transkrip miliknya sendiri dan ditolak saat mencoba mengintip data milik orang lain.PowerShell# A. Login Mahasiswa 1 (mhs1)
$loginMhs = Invoke-RestMethod -Uri "http://localhost:3000/auth/login" -Method POST -ContentType "application/json" -Body '{"username": "mhs1", "password": "mhs123", "device_id": "DEV-MHS-01"}'; $tokenMhs =$loginMhs.access_token

# B. Akses Transkrip Sendiri (MHS01) -> DITERIMA
Invoke-RestMethod -Uri "http://localhost:3000/transkrip/MHS01" -Method GET -Headers @{ "Authorization" = "Bearer $tokenMhs"; "X-Device-ID" = "DEV-MHS-01" }

# C. Akses Transkrip Mahasiswa Lain (MHS02) -> DITOLAK
Invoke-RestMethod -Uri "http://localhost:3000/transkrip/MHS02" -Method GET -Headers @{ "Authorization" = "Bearer $tokenMhs"; "X-Device-ID" = "DEV-MHS-01" }
Hasil C: {"error": "Akses ditolak: Anda hanya dapat melihat transkrip milik sendiri"}

3. Uji Proteksi Akses Langsung (Assume Breach)Mencoba menembak langsung Service Nilai di port 3001 tanpa melewati API Gateway.PowerShellInvoke-RestMethod -Uri "http://localhost:3001/nilai" -Method GET -Headers @{ "Authorization" = "Bearer $token" }
Hasil: {"error": "Akses langsung ditolak! Request harus melalui API Gateway"}

4. Pemeriksaan Log Audit Terpusat (audit_logs)Melihat rekaman histori seluruh keputusan keamanan (allow/deny) yang disimpan di database SQLite:PowerShellnode -e "const DB = require('better-sqlite3'); const db = new DB('zero_trust.db'); console.table(db.prepare('SELECT id, timestamp, username, endpoint, decision, reason FROM audit_logs ORDER BY id DESC LIMIT 10').all());"

🛠️ Ringkasan API EndpointsServiceMethodEndpointAccess LevelDeskripsiGatewayPOST/auth/loginPublicAuthenticasi user & penerbitan token JWT.GatewayPOST/auth/service-tokenInternalPenerbitan token khusus komunikasi inter-service.GatewayGET/nilaiDosenMengambil daftar nilai mahasiswa.GatewayPOST/kelas/:id/finalisasiDosenMemfinalisasi nilai & sinkronisasi otomatis ke transkrip.GatewayGET/transkrip/:nimMahasiswa / DosenMengambil transkrip nilai mahasiswa berdasarkan NIM.GatewayPOST/transkrip/sinkronInternal ServiceEndpoint internal sinkronisasi nilai ke transkrip.