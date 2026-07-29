# hris-be-orchestrator (API Gateway / BFF Service)

`hris-be-orchestrator` bertindak sebagai penengah (*API Gateway*) tipis dan satu-satunya gerbang masuk (*entry point*) bagi Frontend untuk berinteraksi dengan Auth dan Core Service.

---

## Posisi di Arsitektur

```
┌────────────────┐
│    hris-fe     │
└────────────────┘
        │
        ▼
┌────────────────────────┐ ◀── kamu di sini
│  hris-be-orchestrator  │
│   (API Gateway/BFF)    │
└────────────────────────┘
   │                  │
   ▼                  ▼
┌──────────────┐   ┌──────────────┐
│ hris-be-core │   │ hris-be-auth │
└──────────────┘   └──────────────┘
```

---

## Tanggung Jawab (Scope)

| In Scope | Out of Scope |
| :--- | :--- |
| Reverse proxy & routing request ke `auth` dan `core` service. | Implementasi logika bisnis (business logic) apa pun. |
| Validasi otentikasi JWT secara lokal (signature & expiry check). | Otorisasi granular per kapabilitas detail (RBAC detail). |
| Ekstraksi klaim JWT & propagasi identitas via trusted headers. | Pola ketahanan kompleks (circuit breaker, service discovery). |
| Penyelarasan format error downstream jika terjadi gangguan. | Caching layer database, rate limiting kompleks. |

---

## Poin Arsitektur Paling Penting
*   **Pemisahan Otentikasi vs Otorisasi:** Gateway ini hanya memverifikasi **otentikasi** (apakah token itu valid, ditandatangani dengan benar oleh Auth Service, dan belum kedaluwarsa). Gateway tidak mengetahui secara granular apa saja kapabilitas dari suatu role. Otorisasi granular ("apakah role X boleh mengedit atasan") sepenuhnya didelegasikan kepada `hris-be-core`. Hal ini mencegah penumpukan aturan bisnis di gateway dan memastikan perbaikan aturan akses hanya diubah di Core Service.
*   **Keamanan Verifikasi Lokal (Stateless):** Gateway memverifikasi tanda tangan JWT menggunakan **asymmetric cryptography (RS256)** dengan berkas `public key` dari Auth Service. Gateway **tidak melakukan panggilan jaringan sinkron ke Auth Service** per request. Hal ini meminimalkan latensi dan mencegah Auth Service menjadi *single point of failure* (bila Auth Service mati, seluruh aktivitas baca/tulis di sistem tidak akan ikut lumpuh seketika).

---

## Cara Kerja
1.  **Menerima Request:** Request datang dari Frontend membawa header `Authorization: Bearer <token>`.
2.  **Verifikasi Token (Lokal):** Middleware JWT memvalidasi signature token menggunakan `AUTH_PUBLIC_KEY` dan memeriksa klaim waktu `exp` (expiry). Jika gagal, mengembalikan status `401 UNAUTHORIZED`.
3.  **Ekstraksi Klaim:** Jika lolos, identitas pengguna (`userId`, `role`, dan `empId`) diekstrak dari klaim JWT.
4.  **Injeksi Trusted Headers:** Gateway menginjeksikan header tepercaya:
    *   `X-User-Id`
    *   `X-User-Role`
    *   `X-Emp-Id`
    *   Gateway secara ketat akan menghapus (strip) header-header tersebut yang coba dikirim oleh client dari luar untuk mencegah pemalsuan identitas (*spoofing protection*).
5.  **Proxying:** Request diteruskan ke tujuan downstream (`hris-be-core` atau `hris-be-auth`) menggunakan aturan `pathRewrite` terintegrasi.

---

## Pemetaan API Routing & Permission

| Method | Path Eksternal (FE) | Target Downstream | Proteksi / Role | Deskripsi |
| :--- | :--- | :--- | :--- | :--- |
| **POST** | `/api/v1/auth/login` | `auth` | Publik (No Token) | Login pengguna dan perolehan JWT. |
| **POST** | `/api/v1/auth/users` | `auth` | Superadmin | Registrasi akun login baru. |
| **PATCH** | `/api/v1/auth/users/:id/role` | `auth` | Superadmin | Mengubah peranan user. |
| **POST** | `/api/v1/auth/users/:id/reset-password` | `auth` | Superadmin | Reset kata sandi user. |
| **GET** | `/api/v1/auth/users` | `auth` | Superadmin | Mengambil daftar seluruh user. |
| **GET** | `/api/v1/employees` | `core` | Admin, Superadmin | Mengambil daftar seluruh karyawan. |
| **GET** | `/api/v1/employees/:emp_id` | `core` | Semua Role | Detail profil karyawan & manager. |
| **POST** | `/api/v1/employees` | `core` | Admin, Superadmin | Membuat data karyawan baru. |
| **PUT** | `/api/v1/employees/:emp_id` | `core` | Admin, Superadmin | Memperbarui biodata karyawan. |
| **DELETE**| `/api/v1/employees/:emp_id` | `core` | Admin, Superadmin | Nonaktifkan karyawan (soft delete). |
| **PUT** | `/api/v1/employees/:emp_id/reporting-lines` | `core` | Admin, Superadmin | Mengatur hubungan manager. |
| **GET** | `/api/v1/org-chart` | `core` | Semua Role | Struktur pohon organisasi. |

> 💡 **Dokumentasi Interaktif (Swagger UI):** Jalankan server gateway lalu buka [http://localhost:4000/docs](http://localhost:4000/docs) atau [http://localhost:4000/api-docs](http://localhost:4000/api-docs) pada browser untuk melihat dokumentasi API interaktif.

---

## Error Codes (Layer Gateway)

| Code | HTTP Status | Kapan Dipakai |
| :--- | :---: | :--- |
| **`UNAUTHORIZED`** | 401 | Token JWT tidak terlampir, memiliki tanda tangan (*signature*) tidak sah, atau telah kedaluwarsa. |
| **`SERVICE_UNAVAILABLE`** | 503 | Service tujuan (`core` atau `auth`) tidak merespon / tidak aktif (*connection refused*). |
| **`BAD_GATEWAY`** | 502 | Downstream memberikan format respon yang rusak/tidak sesuai envelope standar. |

---

## Database
Service ini bertindak sebagai **Stateless Gateway** dan tidak memiliki database sendiri.

---

## Diagram

Diagram pendukung gateway berikut dapat ditemukan di folder [docs/diagrams](docs/diagrams):

| Nama Diagram | Deskripsi Diagram | Link Relatif |
| :--- | :--- | :--- |
| **Activity Middleware JWT** | Diagram alur verifikasi tanda tangan dan masa kedaluwarsa token JWT secara lokal. | [03_activity_middleware_jwt.mermaid](docs/diagrams/03_activity_middleware_jwt.mermaid) |
| **DFD Header Injection** | Diagram aliran data dari ekstraksi klaim JWT hingga injeksi trusted header. | [04_dfd_payload_header_injection.mermaid](docs/diagrams/04_dfd_payload_header_injection.mermaid) |

---

## Environment Variables

Buat berkas `.env` pada folder root orchestrator dengan konfigurasi berikut:

```env
PORT=4000

# URL Downstream Services
AUTH_SERVICE_URL=http://localhost:4002
CORE_SERVICE_URL=http://localhost:4001

# Public Key untuk verifikasi signature JWT (Asymmetric RS256)
AUTH_PUBLIC_KEY="<YOUR_AUTH_PUBLIC_KEY_PEM_STRING>"
```

---

## Tech Stack
*   **Runtime:** Node.js
*   **Framework:** Express.js (dengan `nodemon` untuk hot-reload development)
*   **Library Utama:** `http-proxy-middleware` (Proxy Engine), `jsonwebtoken` (JWT parser)

---

## Dokumen Terkait
*   **Spesifikasi Detail PRD Orchestrator:** [docs/prd.md](docs/prd.md)
*   **Spesifikasi Induk Proyek:** Dokumen global `prd/GENERAL_PRD.md` (di luar repositori service ini)
