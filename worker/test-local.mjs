// Local harness for worker/index.js: mocks env (Hyperdrive -> local socket PG,
// ASSETS -> serves ../app/dist from disk) and drives the fetch handler.
// Gate checks + a real API flow through the shared api.js + local dev DB.
import worker from './index.js';
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve('../app/dist');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const CONN = 'postgresql://postgres@/chavruta_dev?host=/tmp/chavruta-pgsock-dev';
const KEY = 'local-test-gate-key-0123456789abcdef';

const env = {
  PREVIEW_GATE_KEY: KEY,
  HYPERDRIVE_APP: { connectionString: CONN },
  HYPERDRIVE_ADMIN: { connectionString: CONN },
  ASSETS: {
    async fetch(request) {
      let p = new URL(request.url).pathname;
      if (p === '/') p = '/index.html';
      const file = path.join(DIST, path.normalize(p).replace(/^([/\\])+/, ''));
      const f = fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, 'index.html');
      return new Response(fs.readFileSync(f), { headers: { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' } });
    },
  },
};

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('ok -', name); } else { fail++; console.log('FAIL -', name, extra); } };

// 1. no key -> gate page (403) for static, JSON 403 for API
let r = await worker.fetch(new Request('https://preview.test/'), env);
ok('G1 static without key gated', r.status === 403 && (await r.text()).includes('מפתח'));
r = await worker.fetch(new Request('https://preview.test/api/health'), env);
ok('G2 api without key 403 json', r.status === 403 && (await r.json()).error === 'preview_gate_required');

// 2. wrong key via form -> 403
let form = new FormData(); form.set('key', 'wrong-key-0000000000000000000000');
r = await worker.fetch(new Request('https://preview.test/__gate', { method: 'POST', body: form }), env);
ok('G3 wrong key rejected', r.status === 403);

// 3. right key via form -> 303 + cookie
form = new FormData(); form.set('key', KEY);
r = await worker.fetch(new Request('https://preview.test/__gate', { method: 'POST', body: form }), env);
const cookie = (r.headers.get('set-cookie') || '').split(';')[0];
ok('G4 right key sets cookie + redirect', r.status === 303 && cookie.startsWith('preview_gate='));
r = await worker.fetch(new Request('https://preview.test/', { headers: { cookie } }), env);
ok('G5 static with key serves index', r.status === 200 && (r.headers.get('content-type') || '').includes('html'));

// 4. unset secret fails closed even with a key presented
const envNoKey = { ...env, PREVIEW_GATE_KEY: '' };
r = await worker.fetch(new Request('https://preview.test/api/health', { headers: { cookie } }), envNoKey);
ok('G6 unset secret fails closed', r.status === 403);

// 5. API through the gate: health + register + candidates (RLS path)
const H = { cookie, 'content-type': 'application/json' };
r = await worker.fetch(new Request('https://preview.test/api/health', { headers: H }), env);
ok('A1 health ok', r.status === 200 && (await r.json()).ok === true);
const un = 'wtest' + Date.now();
r = await worker.fetch(new Request('https://preview.test/api/auth/register', { method: 'POST', headers: H, body: JSON.stringify({ email: un + '@test.dev', password: 'password123', displayName: 'בדיקה', gender: 'man', attestAdult: true }) }), env);
const reg = await r.json();
ok('A2 register 201', r.status === 201 && !!reg.userId, JSON.stringify(reg));
const sess = (r.headers.get('set-cookie') || '').split(';')[0];
r = await worker.fetch(new Request('https://preview.test/api/candidates', { headers: { cookie: cookie + '; ' + sess } }), env);
ok('A3 candidates 200 via RLS', r.status === 200, String(r.status));
r = await worker.fetch(new Request('https://preview.test/api/me', { headers: { cookie: cookie + '; ' + sess } }), env);
const me = await r.json();
ok('A4 /api/me returns profile', r.status === 200 && me.profile?.gender === 'man', JSON.stringify(me).slice(0, 120));

// 5b. session POST with body (regression: lazy body delivery - readBody attaches
// listeners only after async session lookup; early 'end' delivery hung it)
r = await worker.fetch(new Request('https://preview.test/api/me/attest-age', { method: 'POST', headers: { cookie: cookie + '; ' + sess, 'content-type': 'application/json' }, body: JSON.stringify({ attestAdult: true }) }), env);
ok('A3b session POST body delivered', r.status === 200, String(r.status));

// 6. bad session rejected
r = await worker.fetch(new Request('https://preview.test/api/me', { headers: { cookie: cookie + '; dev_session=forged' } }), env);
ok('A5 forged session 401', r.status === 401);

console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
