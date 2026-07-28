-- =====================================================================
-- HRIS — hris-be-auth — Database Schema
-- Mengacu ke: GENERAL_PRD.md v1.2 (Section 5), PRD_AUTH.md v1.1
-- Target: PostgreSQL 14+
-- =====================================================================
-- Catatan desain:
-- 1. PK numerik (BIGINT) sequential, dimulai dari 1.000.000, via
--    GENERATED ALWAYS AS IDENTITY (START WITH 1000000).
-- 2. Database ini TERPISAH dari database hris-be-core (service
--    isolation, Section 3 General PRD). Kolom emp_id di tabel users
--    adalah REFERENSI LOGIS ke employees.emp_id di database core —
--    BUKAN foreign key fisik (tidak bisa dibuat FK lintas database
--    di PostgreSQL), validasinya dilakukan via service call
--    auth -> core saat create user (Section 4.3 PRD_AUTH).
-- 3. refresh_tokens SENGAJA TIDAK dibuat sebagai tabel aktif, sesuai
--    keputusan final 9.2 PRD_AUTH (access token short-lived saja,
--    tanpa refresh token untuk prototype ini). Skema disertakan di
--    bagian bawah sebagai referensi/future improvement, dalam blok
--    terpisah yang tidak dieksekusi otomatis.
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- untuk gen_random_uuid() bila dibutuhkan (mis. reset-password token)

-- ---------------------------------------------------------------------
-- ENUM types
-- ---------------------------------------------------------------------
CREATE TYPE user_role_enum AS ENUM ('superadmin', 'admin', 'employee');

-- ---------------------------------------------------------------------
-- Helper: trigger function untuk auto-update kolom updated_at
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================
-- TABLE: users
-- =====================================================================
CREATE TABLE users (
    user_id         BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1000000 INCREMENT BY 1) PRIMARY KEY,
    email           VARCHAR(255)   NOT NULL,
    password_hash   VARCHAR(255)   NOT NULL,  -- bcrypt (cost >=10) atau argon2id, TIDAK PERNAH plaintext
    role            user_role_enum NOT NULL DEFAULT 'employee',
    emp_id          BIGINT,                   -- referensi LOGIS ke core.employees.emp_id (lihat catatan di atas)
    is_active       BOOLEAN        NOT NULL DEFAULT true,  -- soft-disable akun (offboarding), bukan hapus data
    created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ    NOT NULL DEFAULT now()
);

COMMENT ON TABLE users IS 'Akun login. emp_id adalah referensi logis lintas service ke hris-be-core, tanpa FK fisik.';
COMMENT ON COLUMN users.emp_id IS 'Referensi logis ke employees.emp_id di database hris-be-core. Divalidasi via service call saat create user, bukan DB constraint.';
COMMENT ON COLUMN users.role IS 'Role tunggal per user (Section 5.1 General PRD): superadmin, admin, employee.';

-- Email unik, case-insensitive (best practice: hindari duplikat "A@x.com" vs "a@x.com")
CREATE UNIQUE INDEX ux_users_email_lower ON users (lower(email));

CREATE INDEX ix_users_emp_id    ON users (emp_id);
CREATE INDEX ix_users_role      ON users (role);
CREATE INDEX ix_users_is_active ON users (is_active);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION set_updated_at();

COMMIT;

-- =====================================================================
-- REFERENSI / FUTURE IMPROVEMENT (TIDAK diaktifkan di prototype ini)
-- Sesuai keputusan final 9.2 PRD_AUTH — didokumentasikan saja.
-- Uncomment & jalankan manual bila refresh token rotation dibutuhkan
-- di iterasi berikutnya.
-- =====================================================================
-- CREATE TABLE refresh_tokens (
--     token_id    BIGINT GENERATED ALWAYS AS IDENTITY (START WITH 1000000 INCREMENT BY 1) PRIMARY KEY,
--     user_id     BIGINT NOT NULL REFERENCES users (user_id),
--     token_hash  VARCHAR(255) NOT NULL,   -- disimpan sebagai hash, bukan plaintext
--     expires_at  TIMESTAMPTZ NOT NULL,
--     revoked     BOOLEAN NOT NULL DEFAULT false,
--     created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
-- CREATE INDEX ix_refresh_tokens_user_id ON refresh_tokens (user_id);