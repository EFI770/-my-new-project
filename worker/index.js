// Chavruta private preview Worker.
// Serves the built frontend (static assets) and the SAME api.js the local
// dev listener runs, behind a fail-closed preview gate. Synthetic data only;
// no real-user OAuth until the vendor auth origin story is resolved (proxy
// stays disabled here: AUTH_MODE is 'dev', so /vendor-auth is never routed).
import { createApiHandler } from '../server/api.js';
import { createDb } from '../server/db.js';

// ---------- preview gate (fail closed) ----------
// Every route - API and static - requires the gate key. The key arrives as
// the preview_gate cookie (set by submitting the gate form) or as an
// X-Preview-Gate header for API clients. Missing/empty/mismatched => 403.
// Constant-time comparison; no part of the key is ever reflected back.
async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return new Uint8Array(buf);
}
async function gateOk(request, env) {
  const expected = (env.PREVIEW_GATE_KEY || '').trim();
  if (expected.length < 16) return false; // fail closed on unset/short secret
  const cookie = request.headers.get('cookie') || '';
  const m = cookie.match(/(?:^|;\s*)preview_gate=([^;]*)/);
  const presented = m ? decodeURIComponent(m[1]) : (request.headers.get('x-preview-gate') || '');
  if (!presented) return false;
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  if (a.length !== b.length) return false;
  // Constant-time compare (manual: subtle.timingSafeEqual is not portable).
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const GATE_PAGE = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>תצוגה מקדימה פרטית</title>
<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f5f1e8}
form{background:#fff;padding:2rem;border-radius:12px;box-shadow:0 2px 12px #0002;display:grid;gap:.8rem;min-width:280px}
input{padding:.6rem;font-size:1rem;border:1px solid #ccc;border-radius:8px}
button{padding:.7rem;font-size:1rem;border:0;border-radius:8px;background:#5b3a8c;color:#fff;cursor:pointer}
p{margin:0;color:#444}</style></head><body>
<form method="post" action="/__gate">
<p>תצוגה מקדימה פרטית. נא להזין את מפתח הגישה שקיבלת.</p>
<input type="password" name="key" autocomplete="off" required aria-label="מפתח גישה">
<button type="submit">כניסה</button></form></body></html>`;

function gatePage(status = 200) {
  return new Response(GATE_PAGE, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

// ---------- node-style req/res shims for the shared API core ----------
// api.js speaks the subset of node's req/res contract it actually uses:
// req.method/url/headers/socket.remoteAddress + body events/async iterator;
// res.writeHead/end. The shims map Fetch API Request/Response onto that.
function shimReq(request, bodyText) {
  const headers = {};
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  const listeners = {};
  let delivered = false;
  const deliver = () => {
    if (delivered) return;
    delivered = true;
    queueMicrotask(() => {
      if (bodyText) for (const fn of listeners.data || []) fn(new TextEncoder().encode(bodyText));
      for (const fn of listeners.end || []) fn();
    });
  };
  const req = {
    method: request.method,
    url: new URL(request.url).pathname + new URL(request.url).search,
    headers,
    socket: { remoteAddress: request.headers.get('cf-connecting-ip') || 'worker' },
    // Body events are delivered lazily: the handler may await session/DB work
    // before it ever registers body listeners, so delivering at shim creation
    // would fire 'end' into the void and hang readBody. Delivery is armed when
    // the 'end' listener attaches (readBody registers 'data' before 'end').
    on(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); if (ev === 'end') deliver(); },
    removeAllListeners(ev) { delete listeners[ev]; },
    pause() {},
    async *[Symbol.asyncIterator]() { if (bodyText) yield new TextEncoder().encode(bodyText); },
  };
  return req;
}

function shimRes() {
  let status = 200; let headers = {}; let body = '';
  const res = {
    writeHead(s, h = {}) { status = s; headers = { ...headers, ...h }; },
    end(b) { body = b == null ? '' : (typeof b === 'string' ? b : new TextDecoder().decode(b)); },
  };
  const toResponse = () => new Response(body, { status, headers });
  return { res, toResponse };
}

function authModeIsNeon(env) {
  return env.AUTH_MODE === 'neon';
}

// ---------- API handler: one per isolate, configured from env ----------
let apiHandler = null;
function getApi(env) {
  if (!apiHandler) {
    // Auth mode is env-switched: 'dev' = synthetic preview accounts (current
    // gated preview), 'neon' = vendor Google sign-in (community build). The
    // preview deployment ships with AUTH_MODE unset/'dev'; the community
    // deploy sets AUTH_MODE=neon plus the Neon Auth values.
    const authMode = env.AUTH_MODE === 'firebase' ? 'firebase' : env.AUTH_MODE === 'neon' ? 'neon' : 'dev';
    apiHandler = createApiHandler({
      authMode,
      firebaseProjectId: env.FIREBASE_PROJECT_ID,
      // No JWKS override here on purpose: the deployment path always verifies
      // against Google's real securetoken JWKS. The hermetic-test override
      // exists only in server/server.js behind CHAVRUTA_FIREBASE_TEST=hermetic.
      firebaseClient: env.FIREBASE_API_KEY ? {
        apiKey: env.FIREBASE_API_KEY,
        authDomain: env.FIREBASE_AUTH_DOMAIN || (env.FIREBASE_PROJECT_ID ? `${env.FIREBASE_PROJECT_ID}.firebaseapp.com` : undefined),
        projectId: env.FIREBASE_PROJECT_ID,
        appId: env.FIREBASE_APP_ID,
      } : null,
      neonJwksUrl: env.NEON_AUTH_JWKS_URL,
      neonIssuer: env.NEON_AUTH_ISSUER,
      neonAudience: env.NEON_AUTH_AUDIENCE || undefined,
      // Account-deletion erasure of the vendor identity record (community
      // mode). Secret lives only in the Worker env; never sent to clients.
      neonManagement: env.NEON_MANAGEMENT_API_KEY ? {
        apiKey: env.NEON_MANAGEMENT_API_KEY,
        projectId: env.NEON_PROJECT_ID,
        branchId: env.NEON_BRANCH_ID,
      } : null,
      db: createDb({
        appUrl: env.HYPERDRIVE_APP.connectionString,
        adminUrl: env.HYPERDRIVE_ADMIN.connectionString,
        perRequest: true, // workerd tears sockets down between requests
      }),
      env: {
        GOOGLE_SIGNIN_ENABLED: 'false',
        FIREBASE_SIGNIN_ENABLED: env.FIREBASE_SIGNIN_ENABLED === 'true' ? 'true' : 'false',
        NEON_AUTH_URL: env.NEON_AUTH_URL || '',
        // Synthetic preview demo entry. 'true' ONLY for this gated preview
        // deployment; absent/false everywhere else = the route does not exist.
        PREVIEW_DEMO_MODE: env.PREVIEW_DEMO_MODE === 'true' ? 'true' : 'false',
      },
    });
  }
  return apiHandler;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Gate submission sets the cookie. Constant-time check; failure is a
    // fresh gate page with 403, never an error that reveals key state.
    if (url.pathname === '/__gate' && request.method === 'POST') {
      const form = await request.formData().catch(() => null);
      const key = form && typeof form.get('key') === 'string' ? form.get('key') : '';
      const probe = new Request(request.url, { headers: { cookie: `preview_gate=${encodeURIComponent(key)}` } });
      if (!(await gateOk(probe, env))) return gatePage(403);
      return new Response(null, {
        status: 303,
        headers: {
          location: '/',
          'set-cookie': `preview_gate=${encodeURIComponent(key)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${7 * 24 * 3600}`,
        },
      });
    }

    if (!(await gateOk(request, env))) {
      if (url.pathname.startsWith('/api/')) {
        return new Response(JSON.stringify({ error: 'preview_gate_required' }), { status: 403, headers: { 'content-type': 'application/json' } });
      }
      return gatePage(403);
    }

    if (url.pathname.startsWith('/api/') || (authModeIsNeon(env) && url.pathname.startsWith('/vendor-auth/'))) {
      const bodyText = ['GET', 'HEAD'].includes(request.method) ? '' : await request.text();
      const req = shimReq(request, bodyText);
      const { res, toResponse } = shimRes();
      await getApi(env)(req, res);
      return toResponse();
    }

    return env.ASSETS.fetch(request);
  },
};
