// DEVELOPMENT-ONLY email/password auth. Exists because the auth vendor
// (Supabase Auth or other) is not yet chosen. Passwords are scrypt-hashed;
// sessions are random tokens stored server-side. When the vendor is decided
// this module is deleted and the frontend switches to the vendor client.
import crypto from 'node:crypto';

const SCRYPT_N = 16384, SCRYPT_R = 8, SCRYPT_P = 1, KEYLEN = 64;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, KEYLEN, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt:${SCRYPT_N}:${salt.toString('hex')}:${key.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  try {
    const [scheme, n, saltHex, keyHex] = stored.split(':');
    if (scheme !== 'scrypt') return false;
    const key = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), KEYLEN, { N: Number(n), r: SCRYPT_R, p: SCRYPT_P });
    return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
  } catch { return false; }
}

export function newSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function sessionExpiry() {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export const DEV_AUTH_DDL = `
create schema if not exists dev_auth;
create table if not exists dev_auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null,
  created_at timestamptz not null default now()
);
create table if not exists dev_auth.sessions (
  token text primary key,
  user_id uuid not null references dev_auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists dev_auth_sessions_user_idx on dev_auth.sessions(user_id);
`;
