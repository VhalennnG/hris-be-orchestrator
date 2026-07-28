# Implementation Plan — `hris-be-orchestrator` Development

Implementasi `hris-be-orchestrator` sebagai entry point/gateway tunggal untuk `hris-fe`. Gateway ini bertindak sebagai reverse proxy tipis (_thin reverse proxy_) yang mengurusi verifikasi token JWT lokal (RS256), menyuntikkan trusted headers (`X-User-Id`, `X-User-Role`, `X-Emp-Id`), dan meneruskan request ke service downstream (`auth` dan `core`).

## User Review Required

> [!IMPORTANT]
> **Port Default & Konfigurasi Lingkungan (.env)**
> Kami mengusulkan port default **`4000`** untuk `hris-be-orchestrator`.
> Gateway akan merutekan request ke URL service internal yang didefinisikan secara statis di `.env` (tanpa dynamic service discovery):
>
> - `AUTH_SERVICE_URL=http://localhost:4002`
> - `CORE_SERVICE_URL=http://localhost:4001`
> - `AUTH_PUBLIC_KEY_PATH=keys/public_key.pem`

> [!WARNING]
> **Public Key Sharing**
> Gateway memerlukan Public Key PEM untuk memverifikasi token secara lokal. Kami akan menyalin file Public Key (`keys/public_key.pem`) dari folder `auth/keys/public_key.pem` ke folder `orchestrator/keys/public_key.pem` agar verifikasi signature RS256 berjalan selaras.

---

## Open Questions

> [!NOTE]
> **1. Library Proxy Helper**
> Kami berencana menggunakan library **`http-proxy-middleware`** yang sangat stabil dan handal untuk menangani reverse proxying di Express. Library ini secara otomatis menangani streaming data request (termasuk JSON payload dan file jika ada) dan mempermudah injeksi header di level gateway. Apakah ada keberatan menggunakan library ini?

---

## Proposed Changes

### Project Foundation & Configuration

#### [NEW] [package.json](file:///Users/vhalen/Code/Playground/hris-project/orchestrator/package.json)

Mendefinisikan package manifest, dependencies (`express`, `http-proxy-middleware`, `jsonwebtoken`, `dotenv`, `cors`), serta script start/dev/test. Menggunakan ES modules (`"type": "module"`).

#### [NEW] [.env.example](file:///Users/vhalen/Code/Playground/hris-project/orchestrator/.env.example)

Template variabel lingkungan untuk port gateway, URL service `auth` dan `core`, serta path Public Key JWT.

#### [NEW] [src/config/keys.js](file:///Users/vhalen/Code/Playground/hris-project/orchestrator/src/config/keys.js)

Helper untuk membaca file Public Key RSA PEM secara aman dari filesystem untuk melakukan verifikasi signature token JWT.

---

### Security & Middlewares

#### [NEW] [src/middlewares/jwt-gateway-verify.js](file:///Users/vhalen/Code/Playground/hris-project/orchestrator/src/middlewares/jwt-gateway-verify.js)

Middleware otentikasi utama pada pintu gerbang.

- Memeriksa ketersediaan header `Authorization: Bearer <token>`.
- Memverifikasi signature (RS256) menggunakan Public Key dan memeriksa waktu kedaluwarsa (`exp`).
- Jika valid, mendekripsi klaim token (`sub`, `role`, `emp_id`) dan menempelkannya ke `req.user` untuk digunakan oleh proxy middleware.
- Jika tidak valid, memotong request dan mengembalikan `401 UNAUTHORIZED` dengan error envelope standard.

#### [NEW] [src/middlewares/error-handler.js](file:///Users/vhalen/Code/Playground/hris-project/orchestrator/src/middlewares/error-handler.js)

Menangani error runtime internal gateway sendiri dan mengembalikan envelope format standar.

---

### Gateway Proxy Services

#### [NEW] [src/services/proxy-service.js](file:///Users/vhalen/Code/Playground/hris-project/orchestrator/src/services/proxy-service.js)

Mendefinisikan dan mengonfigurasi proxy middleware menggunakan `http-proxy-middleware`:

- **`authProxy`**: Meneruskan request ke `AUTH_SERVICE_URL`.
- **`coreProxy`**: Meneruskan request ke `CORE_SERVICE_URL`.
- Menyuntikkan trusted headers (`X-User-Id`, `X-User-Role`, `X-Emp-Id`) pada request yang telah terotentikasi sebelum diforward ke downstream.
- Menangani kegagalan koneksi ke service downstream dengan mengembalikan error `SERVICE_UNAVAILABLE` (503) secara user-friendly.

---

### App Assembly & Entry Point

#### [NEW] [src/app.js](file:///Users/vhalen/Code/Playground/hris-project/orchestrator/src/app.js)

Merakit rute gateway Express:

- `POST /api/v1/auth/login` ditujukan langsung ke `authProxy` (endpoint publik).
- `app.use('/api/v1/auth', jwtGatewayVerify, authProxy)` (endpoint manajemen user dilindungi).
- `app.use('/api/v1/employees', jwtGatewayVerify, coreProxy)` (dilindungi).
- `app.use('/api/v1/org-chart', jwtGatewayVerify, coreProxy)` (dilindungi).

#### [NEW] [src/server.js](file:///Users/vhalen/Code/Playground/hris-project/orchestrator/src/server.js)

Entry point bootstrap server untuk menjalankan listener port Express pada Port `4000`.

---

## Verification Plan

### Automated Tests

Pengujian otomatis menggunakan unit test ringan `node:test` untuk memverifikasi:

1.  **Middleware JWT Verification:** Memastikan token yang valid disetujui, token kedaluwarsa diblokir, dan klaim diekstrak dengan benar.

Command:

```bash
npm run test
```

### Manual Verification

1.  **Downstream Outage Test:**
    - Matikan service `core` dan panggil endpoint `/api/v1/employees/1000002` melalui orchestrator. Verifikasi gateway mengembalikan `SERVICE_UNAVAILABLE` (503).
2.  **End-to-End Routing via Postman:**
    - Mengimpor Postman Collection dari `core` dan `auth` namun mengubah `baseUrl` menjadi `http://localhost:4000/api/v1` (port Orchestrator).
    - Memverifikasi seluruh skenario login, pembuatan karyawan, setup reporting lines, dan RBAC ownership check berjalan sukses melalui gerbang orchestrator.
