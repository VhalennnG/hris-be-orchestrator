# PRD — `hris-be-orchestrator`

**Versi:** 1.0
**Status:** Draft
**Mengacu ke:** GENERAL_PRD.md v1.2 (Section 3, 5.3, 6, 8.1.1, 8.1.4), PRD_AUTH.md v1.1, PRD_CORE.md v1.1

---

## 1. Tujuan Service

`hris-be-orchestrator` adalah **satu-satunya entry point** yang boleh diakses oleh `hris-fe`. Tanggung jawabnya sengaja dibuat tipis (thin gateway), bukan tempat business logic:

1. **Routing** — meneruskan request dari frontend ke `hris-be-auth` atau `hris-be-core` sesuai path.
2. **Autentikasi** — verifikasi signature & expiry JWT secara **lokal** (public key, tanpa network call ke `auth`), sesuai keputusan 8.1.1 General PRD.
3. **Propagasi identitas** — ekstrak `user_id`/`emp_id`/`role` dari JWT claim yang sudah tervalidasi, teruskan ke `core` via trusted header.
4. **Agregasi ringan** (bila diperlukan) — menggabungkan response dari lebih dari satu service dalam satu call, jika suatu endpoint FE butuh data gabungan.

**Yang SENGAJA BUKAN tanggung jawab service ini** (supaya tidak over-engineering & tidak jadi bottleneck):

- **Authorization granular** ("role X boleh aksi Y") — itu tetap domain `core`, sesuai keputusan 8.1.1. Orchestrator tidak menyimpan/mengecek matriks permission Section 5.2.
- **Business logic apapun** (validasi reporting line, cycle detection, dll) — semua tetap di `core`.
- **Call chain sinkron ke `auth` per request** — dilarang eksplisit, karena membuat `auth` jadi single point of failure untuk seluruh traffic sistem.
- **Caching/rate-limiting kompleks, service discovery, circuit breaker** — di luar scope prototype ini. Untuk skala assessment, routing statis (URL service dari environment variable) sudah cukup; pola-pola resiliency tingkat lanjut baru relevan di skala produksi nyata, bukan di prototype ini.

Tech Stack & Environment

| Layer             | Teknologi                       |
| :---------------- | :------------------------------ |
| Framework Backend | Node.js dengan Express[cite: 2] |

AI-Assisted Development Tooling (MCP)

Selama sesi _vibe coding_ (pengembangan, _review_, _debugging_) yang merujuk pada PRD dan skema basis data, disarankan mengaktifkan MCP (Model Context Protocol) berikut:

- **`context7`** — dipakai untuk mengambil dokumentasi terbaru dari library/framework yang dipakai (Express, `http-proxy-middleware`), supaya kode yang dihasilkan AI assistant mengikuti API versi yang aktual.
- **`sequential-thinking`** — dipakai untuk memecah task implementasi yang kompleks menjadi langkah-langkah bertahap sebelum eksekusi, supaya keputusan desain terstruktur dan bisa direview per langkah.

---

## 2. Scope & Batasan

| In Scope                                               | Out of Scope                                                       |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| Reverse proxy/routing ke `auth` dan `core`             | Business logic apapun                                              |
| Validasi JWT lokal (signature + expiry)                | Authorization granular per capability                              |
| Ekstraksi & propagasi identitas via trusted header     | Circuit breaker, service discovery dinamis                         |
| Agregasi response ringan (jika dibutuhkan FE)          | Caching layer, rate limiting kompleks                              |
| Format error konsisten (passthrough dari service asal) | Refresh token logic (tidak ada di sistem ini, sesuai PRD_AUTH 9.2) |

---

## 3. Arsitektur & Alur Request

```
hris-fe
   │  Authorization: Bearer <JWT>
   ▼
hris-be-orchestrator
   │  1. Verify JWT signature (public key, lokal) + expiry
   │  2. Jika invalid → 401 UNAUTHORIZED (early return, tidak diteruskan)
   │  3. Jika valid → extract { user_id, emp_id, role } dari claim
   │  4. Teruskan request ke service tujuan + header:
   │       X-User-Id: <user_id>
   │       X-User-Role: <role>
   │       X-Emp-Id: <emp_id>
   ▼
hris-be-core  atau  hris-be-auth
   │  Core: enforce authorization granular (Section 5.2 General PRD)
   │  berdasarkan X-User-Role
   ▼
Response diteruskan balik ke FE apa adanya (passthrough),
kecuali endpoint yang memang butuh agregasi (lihat Section 5).
```

**Prinsip kunci:** orchestrator **tidak membuka kembali koneksi ke `auth`** untuk memverifikasi ulang token per request (no chained validation). Ini murni local crypto check, bukan I/O — sehingga tidak menambah latency berarti dan tidak menciptakan dependency baru di hot path.

---

## 4. Routing Table

| Path dari FE                                     | Diteruskan ke  | Catatan                                                                                   |
| ------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/login`                        | `hris-be-auth` | Endpoint publik, tidak butuh token (login)                                                |
| `POST /api/v1/auth/users`                        | `hris-be-auth` | Butuh token valid + role `superadmin` (dicek di `auth`, karena ini domain manajemen user) |
| `PATCH /api/v1/auth/users/{id}/role`             | `hris-be-auth` | idem                                                                                      |
| `POST /api/v1/auth/users/{id}/reset-password`    | `hris-be-auth` | idem                                                                                      |
| `GET /api/v1/employees/{emp_id}`                 | `hris-be-core` | Butuh token valid                                                                         |
| `POST/PUT/DELETE /api/v1/employees`              | `hris-be-core` | Butuh token valid; authorization granular dicek di `core`                                 |
| `PUT /api/v1/employees/{emp_id}/reporting-lines` | `hris-be-core` | idem                                                                                      |
| `GET /api/v1/org-chart`                          | `hris-be-core` | Butuh token valid                                                                         |

> Catatan penting terkait **Section 4.3 PRD_AUTH** (create user butuh `emp_id` valid di `core`): karena orchestrator tidak boleh mengandung business logic, validasi "apakah `emp_id` ini benar-benar ada di core" **tetap dilakukan oleh `auth` sendiri lewat call langsung `auth → core`** (bukan lewat orchestrator memfasilitasi dua panggilan terpisah dari FE). Ini didetailkan di Section 6.1 di bawah.

---

## 5. Autentikasi: Detail Implementasi

### 5.1 Middleware JWT Verification

- Setiap request masuk (kecuali `POST /auth/login`) wajib membawa header `Authorization: Bearer <token>`.
- Orchestrator memverifikasi signature menggunakan **public key** milik `hris-be-auth` (RS256), disuplai lewat environment variable (`AUTH_PUBLIC_KEY`) — tanpa network call.
- Cek `exp` claim. Jika expired atau signature invalid → `401 UNAUTHORIZED`, request **tidak diteruskan** ke service manapun.

### 5.2 Propagasi Identitas (Trusted Header)

Setelah token valid, orchestrator inject header berikut sebelum meneruskan ke `core`/`auth`:

```
X-User-Id: USR001
X-User-Role: admin
X-Emp-Id: EMP002
```

Header ini **hanya bisa datang dari orchestrator** — `core` dan `auth` tidak boleh diekspos ke jaringan publik/frontend (sesuai Section 3 General PRD), sehingga header ini bisa dipercaya di dalam batas jaringan internal (trust boundary = network isolation, bukan re-verifikasi tambahan yang justru berulang).

---

## 6. Agregasi Response (Kapan Dibutuhkan)

Prinsip: **hindari agregasi kecuali benar-benar dibutuhkan FE dalam satu tampilan**, supaya orchestrator tetap thin.

### 6.1 Contoh kasus yang butuh koordinasi lintas service: Create User (dari `auth`)

Saat superadmin membuat akun login baru (`POST /api/v1/auth/users`) dengan `emp_id` tertentu, `emp_id` tersebut harus valid di `core`. Karena orchestrator dilarang mengandung business logic, ada dua opsi:

**Opsi A (direkomendasikan):** `hris-be-auth` sendiri yang melakukan validasi ke `hris-be-core` (service-to-service call langsung `auth → core`, di luar orchestrator), karena ini adalah bagian dari alur bisnis "create user" yang dimiliki `auth`, bukan concern orchestrator.

**Opsi B (tidak direkomendasikan):** Orchestrator memanggil `core` dulu untuk validasi, baru memanggil `auth` — ditolak, karena ini membuat orchestrator mulai mengandung urutan/keputusan bisnis (bukan sekadar routing), yang melanggar prinsip "orchestrator tetap thin".

**Keputusan:** pakai **Opsi A**. Orchestrator tetap hanya routing satu path (`FE → orchestrator → auth`), dan `auth` yang menangani koordinasi ke `core` di baliknya jika diperlukan.

### 6.2 Kasus lain (org chart, employee list, dsb)

Berdasarkan brief assessment ini, tidak ada endpoint FE yang secara eksplisit butuh gabungan data dari **lebih dari satu service** dalam satu tampilan (org chart & employee profile semuanya berasal dari `core` saja). Sehingga **untuk versi prototype ini, orchestrator tidak memerlukan logic agregasi** — cukup pure reverse proxy + JWT verification + header injection. Ini keputusan yang disengaja untuk menghindari over-engineering: tidak membangun kemampuan agregasi yang belum ada kebutuhannya.

---

## 7. Error Handling

Orchestrator **meneruskan (passthrough)** error envelope dari service asal apa adanya (format sudah konsisten sesuai Section 6 General PRD), kecuali untuk error yang memang terjadi di layer orchestrator sendiri:

| Code                  | HTTP Status | Kapan Dipakai (khusus terjadi di orchestrator)                                         |
| --------------------- | ----------- | -------------------------------------------------------------------------------------- |
| `UNAUTHORIZED`        | 401         | Token tidak ada, invalid signature, atau expired                                       |
| `SERVICE_UNAVAILABLE` | 503         | Service tujuan (`auth`/`core`) tidak bisa dihubungi (misal timeout/connection refused) |
| `BAD_GATEWAY`         | 502         | Response dari service tujuan tidak valid/tidak sesuai format                           |

---

## 8. Non-Functional Requirements

- **Tidak ada validasi berantai ke `auth` per request** (no network call untuk verifikasi token) — murni local crypto check, sesuai 8.1.1.
- **Stateless** — orchestrator tidak menyimpan session/state apapun, murni pass-through per request.
- **Timeout wajar** ke service downstream (misal 5 detik) dengan error `SERVICE_UNAVAILABLE` jika terlampaui, supaya kegagalan satu service tidak membuat orchestrator hang tanpa batas.
- **Tidak menyimpan logic bisnis apapun** — perubahan business rule (misal matriks permission baru) tidak boleh butuh perubahan kode di orchestrator.

---

## 9. Tech Stack Spesifik

| Komponen             | Rekomendasi                                                                                |
| -------------------- | ------------------------------------------------------------------------------------------ |
| Framework            | Node.js (Express/Fastify — pilih yang ringan, cocok untuk reverse proxy)                   |
| Reverse proxy helper | `http-proxy-middleware` (Express) atau native `fetch`/`axios` untuk forward request manual |
| JWT verification     | `jsonwebtoken` (verify only, public key — sama library dengan `core`)                      |

> Catatan: tidak direkomendasikan pakai API Gateway managed service (misal Kong, AWS API Gateway) untuk prototype ini — itu justru over-engineering relatif terhadap scope assessment. Reverse proxy custom ringan sudah cukup dan lebih mudah dinilai reviewer dari sisi kode.

---

## 10. Struktur Folder Repo (Working Layout)

```
hris-be-orchestrator/
├── src/
│   ├── routes/          (proxy definitions per path)
│   ├── middlewares/      (jwt-verify, header-injector, error-handler)
│   ├── services/         (proxy-forwarder ke auth & core)
│   └── config/           (public key loading, service URLs dari env)
├── .env.example           (AUTH_SERVICE_URL, CORE_SERVICE_URL, AUTH_PUBLIC_KEY)
└── package.json
```
