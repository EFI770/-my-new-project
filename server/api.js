// DEVELOPMENT-ONLY local emulator for the future Supabase backend.
// Serves the built frontend and a JSON API whose every data access executes
// under the real RLS policies + RPCs from supabase/migrations (role
// `authenticated`, app.sub per request). This file routes and validates input
// shape only; it contains no authorization decisions of its own.
import { mapPgError } from './db.js';
import { hashPassword, verifyPassword, newSessionToken, sessionExpiry } from './devAuth.js';
import { createNeonAuth } from './neonAuth.js';
import { createFirebaseAuth } from './firebaseAuth.js';

// Runtime-agnostic API core: same code runs as a local listener (server.js)
// and inside a hosted fetch runtime (../worker/index.js). All configuration
// arrives through createApiHandler(config); nothing reads process.env here,
// so a hosted runtime can inject its own env/binding values.
export function createApiHandler(config) {
const AUTH_MODE = config.authMode || 'dev';
const neonAuth = AUTH_MODE === 'neon' ? createNeonAuth({
  jwksUrl: config.neonJwksUrl,
  issuer: config.neonIssuer,
  audience: config.neonAudience,
}) : null;
// Firebase Authentication community mode: same vendor-JWT shape as Neon mode
// (Bearer ID token -> verified sub -> auth.users.auth_sub), different issuer.
const firebaseAuth = AUTH_MODE === 'firebase' ? createFirebaseAuth({
  projectId: config.firebaseProjectId,
  jwksUrl: config.firebaseJwksUrl,
}) : null;
// Vendor JWT mode (Neon Auth or Firebase): stateless Bearer-token sessions,
// register binds the verified sub. Everything vendor-generic keys off this.
const vendorAuth = neonAuth || firebaseAuth;

const db = config.db;

// Same-origin proxy to the Neon Auth vendor (Neon mode only). The vendor
// session cookie stays first-party. The REAL incoming Origin is forwarded
// unchanged; the app origin must be allowlisted under the vendor's trusted
// domains (management API config step). Never substitute the vendor's own
// origin here - that would defeat the vendor's origin/CSRF check instead of
// satisfying it (explicitly rejected in review of d888d43).
async function proxyVendorAuth(req, res, url) {
  const base = (ENV.NEON_AUTH_URL || '').replace(/\/+$/, '');
  if (!base) return send(res, 503, { error: 'vendor_auth_not_configured' });
  // base is a fixed config value and only a PATH is appended, so the target
  // authority can never escape the vendor origin.
  const target = base + url.replace(/^\/vendor-auth/, '') + ((req.url || '').includes('?') ? '?' + (req.url || '').split('?')[1] : '');
  // Forward ONLY what the vendor flow needs: content-type, the incoming
  // Cookie (the proxy's whole purpose - /token and /get-session need it),
  // and the real incoming Origin when present.
  const headers = {
    'content-type': req.headers['content-type'] || 'application/json',
    ...(req.headers.cookie ? { cookie: req.headers.cookie } : {}),
    ...(req.headers.origin ? { origin: req.headers.origin } : {}),
  };
  const chunks = [];
  for await (const ch of req) chunks.push(typeof ch === 'string' ? Buffer.from(ch) : ch);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  let upstream;
  try {
    upstream = await fetch(target, { method: req.method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(15000) });
  } catch {
    return send(res, 502, { error: 'vendor_auth_unreachable' });
  }
  // first-party rewrite: strip Domain so the cookie binds to our origin
  const setCookies = (upstream.headers.getSetCookie ? upstream.headers.getSetCookie() : [])
    .map((c) => c.replace(/;\s*Domain=[^;]*/i, ''));
  const outHeaders = {
    'content-type': upstream.headers.get('content-type') || 'application/json',
    ...(upstream.headers.get('location') ? { location: upstream.headers.get('location') } : {}),
    ...(setCookies.length ? { 'set-cookie': setCookies } : {}),
  };
  res.writeHead(upstream.status, outHeaders);
  res.end(Buffer.from(await upstream.arrayBuffer()));
}


const ENV = config.env || {};

// Neon management API wiring (community mode only): used exclusively to erase
// the vendor-side identity record on account deletion, so deletion is complete
// (privacy). Vendor-owned neon_auth.* tables are never touched by SQL; this is
// the management API route verified for fixture cleanup 2026-11-06.
// Absent config = vendor deletion is skipped and the fact is logged/reported.
const NEON_MGMT = config.neonManagement || null;

const JSON_LIMIT = 64 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONTACT_KINDS = new Set(['phone', 'email', 'whatsapp', 'telegram']);
const GENDERS = new Set(['man', 'woman']);
const LEVELS = new Set(['beginner', 'intermediate', 'advanced']);
const MODES = new Set(['in_person', 'phone', 'video']);
const DAYS = new Set(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']);

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > JSON_LIMIT) {
        req.removeAllListeners('data');
        req.removeAllListeners('end');
        req.pause();
        reject(Object.assign(new Error('too_large'), { status: 413 }));
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('bad_json'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function send(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...headers });
  res.end(body);
}

function cookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

async function sessionUser(req) {
  if (vendorAuth) {
    const token = (req.headers.authorization || '').replace(/^Bearer /i, '') || null;
    if (!token) return null;
    let payload;
    try { payload = await vendorAuth.verify(token); } catch { return null; }
    // Bind the verified vendor subject to the one app user it owns.
    const row = await db.asService(async (c) => {
      const { rows } = await c.query('select id from auth.users where auth_sub = $1', [payload.sub]);
      return rows[0] || null;
    });
    if (!row) return null;
    return { id: row.id, email: typeof payload.email === 'string' ? payload.email : null, sub: payload.sub };
  }
  const token = cookies(req).dev_session
    || (req.headers.authorization || '').replace(/^Bearer /i, '') || null;
  if (!token) return null;
  return db.asService(async (c) => {
    const { rows } = await c.query(
      `select u.id, u.email from dev_auth.sessions s
         join dev_auth.users u on u.id = s.user_id
        where s.token = $1 and s.expires_at > now()`, [token]);
    return rows[0] || null;
  });
}

function cleanStr(v, max) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length === 0 || t.length > max ? null : t;
}
function cleanArray(v, allowed, maxLen = 20) {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > maxLen) return null;
  for (const item of v) if (typeof item !== 'string' || (allowed && !allowed.has(item))) return null;
  return v;
}

// Dev-scope rate limiting (in-memory). Production limits belong to the vendor/edge
// layer; these exist so abuse behavior is testable in development.
const buckets = new Map();
function rateLimited(key, limit, windowMs) {
  const now = Date.now();
  const b = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  b.push(now);
  buckets.set(key, b);
  return b.length > limit;
}

const routes = [];
const AGE_GATE_OPEN = new Set(['GET /api/me', 'POST /api/me/attest-age', 'DELETE /api/me']);
function route(method, pattern, handler) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, rx, keys, handler });
}

// ---------- auth (dev-only) ----------
route('POST', '/api/auth/register', async (req, res) => {
  if (rateLimited(`reg:${req.socket.remoteAddress}`, 10, 3600_000)) return send(res, 429, { error: 'rate_limited' });
  // Gated synthetic preview: password auth is BLOCKED AT THE API here (not
  // merely CPU-infeasible): scrypt exceeds the Workers Free 10ms CPU limit,
  // so on this runtime register/login are disabled by construction.
  if (DEMO_ENABLED) return send(res, 403, { error: 'demo_preview_only' });
  if (vendorAuth) {
    // Vendor mode: the user already signed in with the auth vendor (Neon Auth
    // or Firebase) and presents its JWT/ID token. We bind the verified `sub`
    // to a new app user + profile. No password ever touches this server.
    const token = (req.headers.authorization || '').replace(/^Bearer /i, '') || null;
    if (!token) return send(res, 401, { error: 'authentication_required' });
    let payload;
    try { payload = await vendorAuth.verify(token); } catch { return send(res, 401, { error: 'authentication_required' }); }
    const body = await readBody(req);
    const displayName = cleanStr(body.displayName, 80);
    const gender = GENDERS.has(body.gender) ? body.gender : null;
    if (!displayName) return send(res, 400, { error: 'invalid_display_name' });
    if (!gender) return send(res, 400, { error: 'invalid_gender' });
    // Adults-only pilot: explicit 18+ self-attestation is mandatory. Stored as
    // a timestamp only - no date of birth or ID is collected.
    if (body.attestAdult !== true) return send(res, 400, { error: 'age_attestation_required' });
    const created = await db.asService(async (c) => {
      const existing = await c.query('select id from auth.users where auth_sub = $1', [payload.sub]);
      if (existing.rows.length) return null;
      const { rows } = await c.query(
        'insert into auth.users (id, auth_sub) values (gen_random_uuid(), $1) returning id', [payload.sub]);
      return rows[0].id;
    });
    if (!created) return send(res, 409, { error: 'already_registered' });
    await db.withRls(created, (c) => c.query(
      'insert into public.profiles (id, display_name, gender, age_attested_at) values ($1, $2, $3, now())', [created, displayName, gender]));
    return send(res, 201, { userId: created });
  }
  const body = await readBody(req);
  const email = cleanStr(body.email, 254)?.toLowerCase();
  const password = typeof body.password === 'string' ? body.password : null;
  const displayName = cleanStr(body.displayName, 80);
  const gender = GENDERS.has(body.gender) ? body.gender : null;
  if (!email || !EMAIL_RE.test(email)) return send(res, 400, { error: 'invalid_email' });
  if (!password || password.length < 8 || password.length > 200) return send(res, 400, { error: 'password_too_short' });
  if (!displayName) return send(res, 400, { error: 'invalid_display_name' });
  // Gender is mandatory at signup: learning is same-gender only, and the
  // database fails closed when gender is missing.
  if (!gender) return send(res, 400, { error: 'invalid_gender' });
  // Adults-only pilot: explicit 18+ self-attestation is mandatory (timestamp
  // only; no DOB/ID collected).
  if (body.attestAdult !== true) return send(res, 400, { error: 'age_attestation_required' });

  const created = await db.asService(async (c) => {
    const existing = await c.query('select 1 from dev_auth.users where email = $1', [email]);
    if (existing.rows.length) return null;
    const { rows } = await c.query(
      'insert into dev_auth.users (email, password_hash) values ($1, $2) returning id',
      [email, hashPassword(password)]);
    const userId = rows[0].id;
    await c.query('insert into auth.users (id) values ($1) on conflict do nothing', [userId]);
    return userId;
  });
  if (!created) return send(res, 409, { error: 'email_taken' });

  await db.withRls(created, (c) => c.query(
    'insert into public.profiles (id, display_name, gender, age_attested_at) values ($1, $2, $3, now())', [created, displayName, gender]));

  const token = newSessionToken();
  await db.asService((c) => c.query(
    'insert into dev_auth.sessions (token, user_id, expires_at) values ($1, $2, $3)',
    [token, created, sessionExpiry()]));
  send(res, 201, { userId: created }, {
    'set-cookie': `dev_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${14 * 24 * 3600}`,
  });
});

route('POST', '/api/auth/login', async (req, res) => {
  if (vendorAuth) return send(res, 400, { error: 'use_vendor_auth' });
  if (DEMO_ENABLED) return send(res, 403, { error: 'demo_preview_only' });
  if (rateLimited(`login:${req.socket.remoteAddress}`, 20, 600_000)) return send(res, 429, { error: 'rate_limited' });
  const body = await readBody(req);
  const email = cleanStr(body.email, 254)?.toLowerCase();
  const password = typeof body.password === 'string' ? body.password : '';
  if (!email || !password) return send(res, 400, { error: 'invalid_input' });
  const user = await db.asService(async (c) => {
    const { rows } = await c.query('select id, password_hash from dev_auth.users where email = $1', [email]);
    return rows[0] || null;
  });
  if (!user || !verifyPassword(password, user.password_hash)) {
    return send(res, 401, { error: 'invalid_credentials' });
  }
  const token = newSessionToken();
  await db.asService((c) => c.query(
    'insert into dev_auth.sessions (token, user_id, expires_at) values ($1, $2, $3)',
    [token, user.id, sessionExpiry()]));
  send(res, 200, { userId: user.id }, {
    'set-cookie': `dev_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${14 * 24 * 3600}`,
  });
});

route('POST', '/api/auth/logout', async (req, res) => {
  if (vendorAuth) return send(res, 200, { ok: true });
  const token = cookies(req).dev_session;
  if (token) await db.asService((c) => c.query('delete from dev_auth.sessions where token = $1', [token]));
  send(res, 200, { ok: true }, { 'set-cookie': 'dev_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
});

// ---------- synthetic preview demo entry (GATED PREVIEW ONLY) ----------
// Enabled ONLY when ENV.PREVIEW_DEMO_MODE === 'true' AND authMode is not 'neon'
// - so it can never exist in production vendor mode, and is off by default
// everywhere. Exists because scrypt password hashing (~32ms CPU, measured on
// local workerd 2026-11-06) exceeds the Workers Free 10ms CPU limit, so real
// register/login cannot run on the free hosted runtime. Issues sessions for
// TWO FIXED seeded synthetic identities only - no arbitrary userId, no
// password (password login stays impossible for these rows), no real user
// data. NEVER enable outside a gated synthetic preview.
const DEMO_ENABLED = ENV.PREVIEW_DEMO_MODE === 'true' && !vendorAuth;
const DEMO_IDENTITIES = {
  // Two same-gender pairs so the match/request/consent/contact flow is
  // exercisable end-to-end between login identities (matching is same-gender
  // by design, so one man + one woman can never match each other).
  man: { email: 'demo.man@preview.synthetic', displayName: 'אברהם (דמו)', gender: 'man' },
  man2: { email: 'demo.man2@preview.synthetic', displayName: 'יעקב (דמו)', gender: 'man' },
  woman: { email: 'demo.woman@preview.synthetic', displayName: 'שרה (דמו)', gender: 'woman' },
  woman2: { email: 'demo.woman2@preview.synthetic', displayName: 'רבקה (דמו)', gender: 'woman' },
};
if (DEMO_ENABLED) {
  route('POST', '/api/auth/demo-login', async (req, res) => {
    if (rateLimited(`demo:${req.socket.remoteAddress}`, 30, 600_000)) return send(res, 429, { error: 'rate_limited' });
    const body = await readBody(req);
    const spec = DEMO_IDENTITIES[body.identity];
    if (!spec) return send(res, 400, { error: 'invalid_input' });
    const userId = await db.asService(async (c) => {
      const { rows } = await c.query('select id from dev_auth.users where email = $1', [spec.email]);
      if (rows.length) return rows[0].id;
      const ins = await c.query(
        'insert into dev_auth.users (email, password_hash) values ($1, $2) returning id',
        [spec.email, 'demo-password-login-impossible']);
      const id = ins.rows[0].id;
      await c.query('insert into auth.users (id) values ($1) on conflict do nothing', [id]);
      return id;
    });
    await db.withRls(userId, (c) => c.query(
      `insert into public.profiles (id, display_name, gender, age_attested_at)
         values ($1, $2, $3, now()) on conflict (id) do nothing`,
      [userId, spec.displayName, spec.gender]));
    const token = newSessionToken();
    await db.asService((c) => c.query(
      'insert into dev_auth.sessions (token, user_id, expires_at) values ($1, $2, $3)',
      [token, userId, sessionExpiry()]));
    send(res, 200, { userId, demo: true }, {
      'set-cookie': `dev_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${14 * 24 * 3600}`,
    });
  });
}

// ---------- OAuth provider discovery (code prep; vendor config pending) ----------
// Google sign-in for APP END-USERS (user decision 2026-11-06 11:59, wamid
// HBgMOTcyNTI3NzA3NDQxFQIAEhgUM0FEQjAyM0NFQTk1...E2RjZENTkwMjhBRTk4MTUwMjgA).
// Neon Auth (managed Better Auth) owns the actual OAuth dance; the console-side
// provider setup is blocked on console.neon.com access, so this ships disabled
// by default: the client only renders a Google button when enabled AND an auth
// base URL is configured. No tokens or secrets here - the base URL is public.
route('GET', '/api/auth/providers', async (req, res) => {
  send(res, 200, {
    // Community mode defaults to Google-only registration (owner's expressed
    // preference 2026-11-06 11:59 IST); EMAIL_AUTH_ENABLED=true opts back in.
    // Dev emulator keeps email/password for local testing.
    email: { enabled: !DEMO_ENABLED && (AUTH_MODE !== 'neon' || ENV.EMAIL_AUTH_ENABLED === 'true') },
    demo: { enabled: DEMO_ENABLED },
    firebase: {
      // Google sign-in via Firebase Authentication (owner decision 2026-11-07,
      // replaces the Neon-Auth Google plan). The web config values are public
      // by design (Google docs: Firebase API keys identify the project, they
      // are not access-control secrets) and ship to every visitor regardless;
      // they are served from env here, never committed to the repo.
      enabled: ENV.FIREBASE_SIGNIN_ENABLED === 'true' && !!config.firebaseClient,
      config: ENV.FIREBASE_SIGNIN_ENABLED === 'true' ? (config.firebaseClient || null) : null,
    },
    google: {
      enabled: ENV.GOOGLE_SIGNIN_ENABLED === 'true' && !!ENV.NEON_AUTH_URL,
      // Neon mode: same-origin proxy path so the vendor session cookie is
      // first-party (third-party cookies break the OAuth callback leg on
      // hosted origins). The vendor URL itself is never exposed to clients.
      authUrl: ENV.GOOGLE_SIGNIN_ENABLED === 'true' && !!ENV.NEON_AUTH_URL
        ? (AUTH_MODE === 'neon' ? '/vendor-auth' : ENV.NEON_AUTH_URL)
        : null,
    },
  });
});

// ---------- age attestation ----------
route('POST', '/api/me/attest-age', async (req, res, user) => {
  const body = await readBody(req);
  if (body.attestAdult !== true) return send(res, 400, { error: 'age_attestation_required' });
  await db.withRls(user.id, (c) => c.query(
    'update public.profiles set age_attested_at = now(), updated_at = now() where id = $1 and age_attested_at is null', [user.id]));
  send(res, 200, { ok: true });
});

// ---------- me / profile / contact methods ----------
route('GET', '/api/me', async (req, res, user) => {
  const data = await db.withRls(user.id, async (c) => {
    const p = await c.query(
      `select display_name, gender, bio, learning_topics, learning_level, preferred_modes, available_days, availability_notes, age_attested_at
         from public.profiles where id = $1`, [user.id]);
    const m = await c.query(
      'select id, kind, value, is_primary from public.contact_methods where user_id = $1 order by is_primary desc, created_at',
      [user.id]);
    return { profile: p.rows[0] || null, contactMethods: m.rows };
  });
  send(res, 200, { userId: user.id, email: user.email, ...data });
});

route('PUT', '/api/me/profile', async (req, res, user) => {
  const body = await readBody(req);
  const displayName = cleanStr(body.displayName, 80);
  const bio = typeof body.bio === 'string' && body.bio.length <= 1000 ? body.bio : null;
  const topics = cleanArray(body.learningTopics, null, 12);
  const level = body.learningLevel == null || body.learningLevel === '' ? null : (LEVELS.has(body.learningLevel) ? body.learningLevel : undefined);
  const modes = cleanArray(body.preferredModes, MODES);
  const days = cleanArray(body.availableDays, DAYS);
  const notes = typeof body.availabilityNotes === 'string' && body.availabilityNotes.length <= 500 ? body.availabilityNotes : null;
  if (!displayName || bio === null || topics === null || level === undefined || modes === null || days === null || notes === null) {
    return send(res, 400, { error: 'invalid_input' });
  }
  if (body.gender !== undefined && !GENDERS.has(body.gender)) {
    return send(res, 400, { error: 'invalid_gender' });
  }
  const outcome = await db.withRls(user.id, async (c) => {
    if (body.gender !== undefined) {
      const cur = await c.query('select gender from public.profiles where id = $1', [user.id]);
      // Gender is immutable once set (provisional policy, migration 0004):
      // only a first-time set (NULL -> value) may pass; the DB trigger
      // rejects any other change on every path.
      if (cur.rows[0]?.gender && cur.rows[0].gender !== body.gender) return 'gender_immutable';
    }
    await c.query(
      `update public.profiles set display_name=$2, bio=$3, learning_topics=$4, learning_level=$5,
         preferred_modes=$6, available_days=$7, availability_notes=$8, updated_at=now() where id=$1`,
      [user.id, displayName, bio, topics, level, modes, days, notes]);
    if (body.gender !== undefined) {
      await c.query('update public.profiles set gender=$2, updated_at=now() where id=$1 and gender is null', [user.id, body.gender]);
    }
    return 'ok';
  });
  if (outcome === 'gender_immutable') return send(res, 400, { error: 'gender_immutable' });
  send(res, 200, { ok: true });
});

route('PUT', '/api/me/contact-methods', async (req, res, user) => {
  const body = await readBody(req);
  if (!Array.isArray(body.methods) || body.methods.length > 5) return send(res, 400, { error: 'invalid_input' });
  for (const m of body.methods) {
    if (!m || !CONTACT_KINDS.has(m.kind) || !cleanStr(m.value, 200)) return send(res, 400, { error: 'invalid_input' });
  }
  await db.withRls(user.id, async (c) => {
    await c.query('delete from public.contact_methods where user_id = $1', [user.id]);
    for (const m of body.methods) {
      await c.query('insert into public.contact_methods (user_id, kind, value, is_primary) values ($1, $2, $3, $4)',
        [user.id, m.kind, m.value.trim(), m.isPrimary === true]);
    }
  });
  send(res, 200, { ok: true });
});

route('DELETE', '/api/me', async (req, res, user) => {
  // FK cascades (on delete cascade) remove profile, contact methods, interest
  // selections and connection requests; reports filed BY the user are removed,
  // reports ABOUT the user keep null user reference.
  let authSub = null;
  await db.asService(async (c) => {
    if (vendorAuth) {
      // auth_sub exists only where the vendor binding migration (0005) ran.
      const { rows } = await c.query('select auth_sub from auth.users where id = $1', [user.id]);
      authSub = rows[0] && rows[0].auth_sub || null;
    }
    await c.query('delete from auth.users where id = $1', [user.id]);
    if (!vendorAuth) await c.query('delete from dev_auth.users where id = $1', [user.id]);
  });
  // Neon mode: erase the vendor identity record too (management API only), so
  // account deletion is complete. Local data is already gone either way; a
  // vendor failure is logged and reported, never hidden. 404 counts as deleted
  // (record already absent).
  let vendorDeleted = null;
  if (AUTH_MODE === 'neon' && authSub) {
    if (NEON_MGMT && NEON_MGMT.apiKey && NEON_MGMT.projectId && NEON_MGMT.branchId) {
      try {
        const base = (NEON_MGMT.baseUrl || 'https://console.neon.tech/api/v2').replace(/\/$/, '');
        const r = await fetch(`${base}/projects/${NEON_MGMT.projectId}/branches/${NEON_MGMT.branchId}/auth/users/${encodeURIComponent(authSub)}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${NEON_MGMT.apiKey}` },
        });
        vendorDeleted = r.status === 204 || r.status === 404;
        if (!vendorDeleted) console.error(`[api] neon vendor user delete failed: HTTP ${r.status}`);
      } catch (e) {
        vendorDeleted = false;
        console.error('[api] neon vendor user delete failed:', (e && e.message) || e);
      }
    } else {
      console.error('[api] neon vendor user delete skipped: neonManagement not configured');
    }
  }
  send(res, 200, { ok: true, ...(vendorDeleted === null ? {} : { vendorDeleted }) }, { 'set-cookie': 'dev_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
});

// ---------- candidates & private interest ----------
route('GET', '/api/candidates', async (req, res, user) => {
  const data = await db.withRls(user.id, async (c) => {
    // RLS excludes profiles blocked in either direction. Single round trip:
    // the viewer's interest is joined in instead of a second query (Workers
    // CPU budget - every round trip through the pool costs).
    const profiles = await c.query(
      `select p.id, p.display_name, p.bio, p.learning_topics, p.learning_level, p.preferred_modes, p.available_days,
              s.interested as my_interest
         from public.profiles p
         left join public.interest_selections s
           on s.viewer_id = $1 and s.candidate_id = p.id
        where p.id <> $1`, [user.id]);
    return profiles.rows.map((p) => ({
      id: p.id,
      displayName: p.display_name,
      bio: p.bio,
      learningTopics: p.learning_topics,
      learningLevel: p.learning_level,
      preferredModes: p.preferred_modes,
      availableDays: p.available_days,
      myInterest: p.my_interest ?? null,
    }));
  });
  send(res, 200, { candidates: data });
});

route('POST', '/api/interests', async (req, res, user) => {
  const body = await readBody(req);
  if (typeof body.candidateId !== 'string' || typeof body.interested !== 'boolean') {
    return send(res, 400, { error: 'invalid_input' });
  }
  await db.withRls(user.id, (c) => c.query(
    `insert into public.interest_selections (viewer_id, candidate_id, interested) values ($1, $2, $3)
       on conflict (viewer_id, candidate_id) do update set interested = $3, updated_at = now()`,
    [user.id, body.candidateId, body.interested]));
  send(res, 200, { ok: true });
});

route('GET', '/api/matches', async (req, res, user) => {
  const data = await db.withRls(user.id, async (c) => {
    // Single round trip: join profiles inside the same query (RLS applies to
    // both the function's filters and the profiles read).
    const matches = await c.query(
      `select m.candidate_id, m.matched_at,
              p.display_name, p.bio, p.learning_topics, p.learning_level, p.preferred_modes, p.available_days
         from public.list_my_matches() m
         left join public.profiles p on p.id = m.candidate_id`);
    return matches.rows.map((m) => ({
      candidateId: m.candidate_id,
      matchedAt: m.matched_at,
      card: m.display_name != null ? {
        displayName: m.display_name, bio: m.bio, learningTopics: m.learning_topics,
        learningLevel: m.learning_level, preferredModes: m.preferred_modes, availableDays: m.available_days,
      } : null,
    }));
  });
  send(res, 200, { matches: data });
});

// ---------- study requests ----------
route('GET', '/api/study-requests', async (req, res, user) => {
  const rows = await db.withRls(user.id, async (c) => {
    const r = await c.query(
      `select sr.id, sr.owner_id, sr.title, sr.description, sr.topic, sr.learning_level,
              sr.preferred_modes, sr.available_days, sr.status, sr.created_at,
              p.display_name as owner_name
         from public.study_requests sr
         left join public.profiles p on p.id = sr.owner_id
        order by sr.created_at desc limit 100`);
    return r.rows;
  });
  send(res, 200, {
    studyRequests: rows.map((r) => ({
      id: r.id, ownerId: r.owner_id, ownerName: r.owner_name, title: r.title,
      description: r.description, topic: r.topic, learningLevel: r.learning_level,
      preferredModes: r.preferred_modes, availableDays: r.available_days,
      status: r.status, createdAt: r.created_at, mine: r.owner_id === user.id,
    })),
  });
});

route('POST', '/api/study-requests', async (req, res, user) => {
  const body = await readBody(req);
  const title = cleanStr(body.title, 120);
  const topic = cleanStr(body.topic, 120);
  const description = typeof body.description === 'string' && body.description.length <= 2000 ? body.description : '';
  const level = body.learningLevel == null || body.learningLevel === '' ? null : (LEVELS.has(body.learningLevel) ? body.learningLevel : undefined);
  const modes = cleanArray(body.preferredModes, MODES);
  const days = cleanArray(body.availableDays, DAYS);
  if (!title || !topic || level === undefined || modes === null || days === null) {
    return send(res, 400, { error: 'invalid_input' });
  }
  const { rows } = await db.withRls(user.id, async (c) => c.query(
    `insert into public.study_requests (owner_id, title, description, topic, learning_level, preferred_modes, available_days)
       values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [user.id, title, description, topic, level, modes, days]));
  send(res, 201, { id: rows[0].id });
});

route('PUT', '/api/study-requests/:id', async (req, res, user, params) => {
  const body = await readBody(req);
  const patch = {};
  if (body.title !== undefined) { const v = cleanStr(body.title, 120); if (!v) return send(res, 400, { error: 'invalid_input' }); patch.title = v; }
  if (body.description !== undefined) { if (typeof body.description !== 'string' || body.description.length > 2000) return send(res, 400, { error: 'invalid_input' }); patch.description = body.description; }
  if (body.topic !== undefined) { const v = cleanStr(body.topic, 120); if (!v) return send(res, 400, { error: 'invalid_input' }); patch.topic = v; }
  if (body.status !== undefined) { if (!['open', 'paused', 'closed'].includes(body.status)) return send(res, 400, { error: 'invalid_input' }); patch.status = body.status; }
  const keys = Object.keys(patch);
  if (!keys.length) return send(res, 400, { error: 'invalid_input' });
  const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
  const result = await db.withRls(user.id, async (c) => c.query(
    `update public.study_requests set ${sets}, updated_at = now() where id = $1`,
    [params.id, ...keys.map((k) => patch[k])]));
  if (!result.rowCount) return send(res, 404, { error: 'not_found' });
  send(res, 200, { ok: true });
});

route('DELETE', '/api/study-requests/:id', async (req, res, user, params) => {
  const result = await db.withRls(user.id, (c) => c.query(
    'delete from public.study_requests where id = $1', [params.id]));
  if (!result.rowCount) return send(res, 404, { error: 'not_found' });
  send(res, 200, { ok: true });
});

// ---------- connections, consent, contact ----------
route('GET', '/api/connections', async (req, res, user) => {
  const data = await db.withRls(user.id, async (c) => {
    const r = await c.query(
      `select id, requester_id, recipient_id, study_request_id, message, status,
              requester_contact_consent, recipient_contact_consent, created_at
         from public.connection_requests order by created_at desc limit 100`);
    const otherIds = [...new Set(r.rows.map((x) => (x.requester_id === user.id ? x.recipient_id : x.requester_id)))];
    let profiles = new Map();
    if (otherIds.length) {
      const p = await c.query('select id, display_name from public.profiles where id = any($1)', [otherIds]);
      profiles = new Map(p.rows.map((x) => [x.id, x.display_name]));
    }
    return r.rows.map((x) => {
      const otherId = x.requester_id === user.id ? x.recipient_id : x.requester_id;
      return {
        id: x.id, direction: x.requester_id === user.id ? 'outgoing' : 'incoming',
        otherId, otherName: profiles.get(otherId) || null,
        studyRequestId: x.study_request_id, message: x.message, status: x.status,
        myConsent: x.requester_id === user.id ? x.requester_contact_consent : x.recipient_contact_consent,
        theirConsent: x.requester_id === user.id ? x.recipient_contact_consent : x.requester_contact_consent,
        createdAt: x.created_at,
      };
    });
  });
  send(res, 200, { connections: data });
});

route('POST', '/api/connections', async (req, res, user) => {
  const body = await readBody(req);
  if (typeof body.recipientId !== 'string') return send(res, 400, { error: 'invalid_input' });
  const message = typeof body.message === 'string' && body.message.length <= 1000 ? body.message : '';
  if (body.message !== undefined && message === '' && body.message !== '') return send(res, 400, { error: 'invalid_input' });
  const studyRequestId = typeof body.studyRequestId === 'string' ? body.studyRequestId : null;
  const { rows } = await db.withRls(user.id, async (c) => c.query(
    `insert into public.connection_requests (requester_id, recipient_id, study_request_id, message)
       values ($1, $2, $3, $4) returning id`,
    [user.id, body.recipientId, studyRequestId, message]));
  send(res, 201, { id: rows[0].id });
});

route('POST', '/api/connections/:id/respond', async (req, res, user, params) => {
  const body = await readBody(req);
  if (!['accepted', 'declined', 'cancelled'].includes(body.decision)) return send(res, 400, { error: 'invalid_input' });
  await db.withRls(user.id, (c) => c.query(
    'select public.respond_to_connection_request($1, $2)', [params.id, body.decision]));
  send(res, 200, { ok: true });
});

route('POST', '/api/connections/:id/consent', async (req, res, user, params) => {
  const body = await readBody(req);
  if (typeof body.consent !== 'boolean') return send(res, 400, { error: 'invalid_input' });
  await db.withRls(user.id, (c) => c.query(
    'select public.consent_to_contact($1, $2)', [params.id, body.consent]));
  send(res, 200, { ok: true });
});

route('GET', '/api/connections/:id/contact', async (req, res, user, params) => {
  const { rows } = await db.withRls(user.id, (c) => c.query(
    'select kind, value, is_primary from public.get_connection_contact($1)', [params.id]));
  send(res, 200, { contactMethods: rows });
});

// ---------- blocks & reports ----------
route('GET', '/api/blocks', async (req, res, user) => {
  const rows = await db.withRls(user.id, async (c) => c.query(
    'select blocked_id, created_at from public.user_blocks order by created_at desc'));
  send(res, 200, { blocks: rows.rows.map((r) => ({ blockedId: r.blocked_id, createdAt: r.created_at })) });
});

route('POST', '/api/blocks', async (req, res, user) => {
  const body = await readBody(req);
  if (typeof body.blockedId !== 'string' || body.blockedId === user.id) return send(res, 400, { error: 'invalid_input' });
  await db.withRls(user.id, (c) => c.query(
    'insert into public.user_blocks (blocker_id, blocked_id) values ($1, $2) on conflict do nothing',
    [user.id, body.blockedId]));
  send(res, 201, { ok: true });
});

route('DELETE', '/api/blocks/:id', async (req, res, user, params) => {
  await db.withRls(user.id, (c) => c.query(
    'delete from public.user_blocks where blocker_id = $1 and blocked_id = $2', [user.id, params.id]));
  send(res, 200, { ok: true });
});

route('POST', '/api/reports', async (req, res, user) => {
  const body = await readBody(req);
  const reason = cleanStr(body.reason, 100);
  const details = typeof body.details === 'string' && body.details.length <= 3000 ? body.details : '';
  if (!reason || reason.length < 3) return send(res, 400, { error: 'invalid_input' });
  await db.withRls(user.id, (c) => c.query(
    `insert into public.user_reports (reporter_id, reported_user_id, study_request_id, reason, details)
       values ($1, $2, $3, $4, $5)`,
    [user.id, typeof body.reportedUserId === 'string' ? body.reportedUserId : null,
     typeof body.studyRequestId === 'string' ? body.studyRequestId : null, reason, details]));
  send(res, 201, { ok: true });
});

route('GET', '/api/health', async (req, res) => send(res, 200, { ok: true, mode: AUTH_MODE === 'neon' ? 'neon-vendor' : AUTH_MODE === 'firebase' ? 'firebase-vendor' : 'dev-emulator' }));

// Request handler is exported so the same code can run as a long-lived
// local listener (dev) or be invoked per-request by a serverless runtime
// (hosted preview). Local behavior is unchanged.
const handler = async (req, res) => {
  try {
    const url = (req.url || '').split('?')[0];
    if (AUTH_MODE === 'neon' && url.startsWith('/vendor-auth/')) return proxyVendorAuth(req, res, url);
    if (!url.startsWith('/api/')) return send(res, 404, { error: 'not_found' });
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.match(r.rx);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const isAuthRoute = url.startsWith('/api/auth/') || url === '/api/health';
      const user = isAuthRoute ? null : await sessionUser(req);
      if (!isAuthRoute && !user) return send(res, 401, { error: 'authentication_required' });
      // Adults-only gate (fail closed): a profile without an 18+ attestation
      // can read/delete itself and can attest - nothing else. This also covers
      // future OAuth-provisioned identities that never passed /api/auth/register.
      if (!isAuthRoute && !AGE_GATE_OPEN.has(`${r.method} ${url}`)) {
        const att = await db.asService((c) => c.query(
          'select age_attested_at from public.profiles where id = $1', [user.id]));
        if (!att.rows[0] || !att.rows[0].age_attested_at) {
          return send(res, 403, { error: 'age_attestation_required' });
        }
      }
      return await r.handler(req, res, user, params);
    }
    send(res, 404, { error: 'not_found' });
  } catch (err) {
    if (err?.status) return send(res, err.status, { error: err.message });
    const mapped = mapPgError(err);
    if (mapped) return send(res, mapped.status, { error: mapped.error });
    console.error(err);
    send(res, 500, { error: 'internal_error' });
  }
};

return handler;
}
