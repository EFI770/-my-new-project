// DEVELOPMENT-ONLY local emulator for the future Supabase backend.
// Serves the built frontend and a JSON API whose every data access executes
// under the real RLS policies + RPCs from supabase/migrations (role
// `authenticated`, app.sub per request). This file routes and validates input
// shape only; it contains no authorization decisions of its own.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDb, mapPgError } from './db.js';
import { hashPassword, verifyPassword, newSessionToken, sessionExpiry } from './devAuth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, '..', 'app', 'dist');
const SOCKET_DIR = process.env.PGSOCKET || '/tmp/chavruta-pgsock-dev';
const DATABASE = process.env.PGDATABASE || 'chavruta_dev';
const PORT = Number(process.env.PORT || 4173);

const db = createDb({ socketDir: SOCKET_DIR, database: DATABASE });

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
function route(method, pattern, handler) {
  const keys = [];
  const rx = new RegExp('^' + pattern.replace(/:([^/]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, rx, keys, handler });
}

// ---------- auth (dev-only) ----------
route('POST', '/api/auth/register', async (req, res) => {
  if (rateLimited(`reg:${req.socket.remoteAddress}`, 10, 3600_000)) return send(res, 429, { error: 'rate_limited' });
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
    'insert into public.profiles (id, display_name, gender) values ($1, $2, $3)', [created, displayName, gender]));

  const token = newSessionToken();
  await db.asService((c) => c.query(
    'insert into dev_auth.sessions (token, user_id, expires_at) values ($1, $2, $3)',
    [token, created, sessionExpiry()]));
  send(res, 201, { userId: created }, {
    'set-cookie': `dev_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${14 * 24 * 3600}`,
  });
});

route('POST', '/api/auth/login', async (req, res) => {
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
  const token = cookies(req).dev_session;
  if (token) await db.asService((c) => c.query('delete from dev_auth.sessions where token = $1', [token]));
  send(res, 200, { ok: true }, { 'set-cookie': 'dev_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
});

// ---------- me / profile / contact methods ----------
route('GET', '/api/me', async (req, res, user) => {
  const data = await db.withRls(user.id, async (c) => {
    const p = await c.query(
      `select display_name, gender, bio, learning_topics, learning_level, preferred_modes, available_days, availability_notes
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
  await db.withRls(user.id, async (c) => {
    await c.query(
      `update public.profiles set display_name=$2, bio=$3, learning_topics=$4, learning_level=$5,
         preferred_modes=$6, available_days=$7, availability_notes=$8, updated_at=now() where id=$1`,
      [user.id, displayName, bio, topics, level, modes, days, notes]);
    // A gender change severs all existing connections and interest selections
    // (AFTER UPDATE trigger in migration 0004) so no cross-gender tie survives.
    if (body.gender !== undefined) {
      await c.query('update public.profiles set gender=$2, updated_at=now() where id=$1', [user.id, body.gender]);
    }
  });
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
  // Dev-scope account deletion. FK cascades (on delete cascade) remove profile,
  // contact methods, interest selections and connection requests; reports filed
  // BY the user are removed, reports ABOUT the user keep null user reference.
  await db.asService(async (c) => {
    await c.query('delete from auth.users where id = $1', [user.id]);
    await c.query('delete from dev_auth.users where id = $1', [user.id]);
  });
  send(res, 200, { ok: true }, { 'set-cookie': 'dev_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' });
});

// ---------- candidates & private interest ----------
route('GET', '/api/candidates', async (req, res, user) => {
  const data = await db.withRls(user.id, async (c) => {
    // RLS excludes profiles blocked in either direction.
    const profiles = await c.query(
      `select id, display_name, bio, learning_topics, learning_level, preferred_modes, available_days
         from public.profiles where id <> $1`, [user.id]);
    const mine = await c.query(
      'select candidate_id, interested from public.interest_selections where viewer_id = $1', [user.id]);
    const myMap = new Map(mine.rows.map((r) => [r.candidate_id, r.interested]));
    return profiles.rows.map((p) => ({
      id: p.id,
      displayName: p.display_name,
      bio: p.bio,
      learningTopics: p.learning_topics,
      learningLevel: p.learning_level,
      preferredModes: p.preferred_modes,
      availableDays: p.available_days,
      myInterest: myMap.has(p.id) ? myMap.get(p.id) : null,
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
    const matches = await c.query('select candidate_id, matched_at from public.list_my_matches()');
    if (!matches.rows.length) return [];
    const ids = matches.rows.map((r) => r.candidate_id);
    const profiles = await c.query(
      `select id, display_name, bio, learning_topics, learning_level, preferred_modes, available_days
         from public.profiles where id = any($1)`, [ids]);
    const byId = new Map(profiles.rows.map((p) => [p.id, p]));
    return matches.rows.map((m) => {
      const p = byId.get(m.candidate_id);
      return {
        candidateId: m.candidate_id,
        matchedAt: m.matched_at,
        card: p ? {
          displayName: p.display_name, bio: p.bio, learningTopics: p.learning_topics,
          learningLevel: p.learning_level, preferredModes: p.preferred_modes, availableDays: p.available_days,
        } : null,
      };
    });
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

route('GET', '/api/health', async (req, res) => send(res, 200, { ok: true, mode: 'dev-emulator' }));

// ---------- static ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
function serveStatic(req, res) {
  let p = decodeURIComponent((req.url || '/').split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(DIST, path.normalize(p).replace(/^([/\\])+/, ''));
  if (!file.startsWith(DIST) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    const index = path.join(DIST, 'index.html');
    if (fs.existsSync(index)) { res.writeHead(200, { 'content-type': MIME['.html'] }); return res.end(fs.readFileSync(index)); }
    res.writeHead(404); return res.end('frontend not built');
  }
  res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
  res.end(fs.readFileSync(file));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = (req.url || '').split('?')[0];
    if (!url.startsWith('/api/')) return serveStatic(req, res);
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = url.match(r.rx);
      if (!m) continue;
      const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
      const isAuthRoute = url.startsWith('/api/auth/') || url === '/api/health';
      const user = isAuthRoute ? null : await sessionUser(req);
      if (!isAuthRoute && !user) return send(res, 401, { error: 'authentication_required' });
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
});

server.listen(PORT, () => console.log(`dev emulator on :${PORT} (db: ${DATABASE} via ${SOCKET_DIR})`));
