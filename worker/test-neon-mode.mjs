// Worker-level neon-mode check: /vendor-auth routes through the shim to the stub vendor.
import http from 'node:http';
const stub = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => b += c); req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['vend_sess=xyz; Domain=neonauth.example; Path=/; HttpOnly'] });
    res.end(JSON.stringify({ path: req.url, method: req.method, cookie: req.headers.cookie || null, origin: req.headers.origin ?? null }));
  });
});
await new Promise((r) => stub.listen(0, r));
const stubPort = stub.address().port;
process.env.PREVIEW_GATE_KEY = 'test-gate-key-0123456789';
const { default: worker } = await import('/tmp/-my-new-project/worker/index.js');
const env = {
  AUTH_MODE: 'neon',
  NEON_AUTH_URL: `http://127.0.0.1:${stubPort}/neondb/auth`,
  NEON_AUTH_JWKS_URL: 'http://127.0.0.1:1/jwks',
  NEON_AUTH_ISSUER: 'http://127.0.0.1:1',
  PREVIEW_GATE_KEY: 'test-gate-key-0123456789',
  HYPERDRIVE_APP: { connectionString: 'postgres://unused:unused@127.0.0.1:1/x' },
  HYPERDRIVE_ADMIN: { connectionString: 'postgres://unused:unused@127.0.0.1:1/x' },
  ASSETS: { fetch: () => new Response('asset', { status: 200 }) },
};
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok - ' : 'FAIL - ') + n + (c ? '' : ' ' + x)); };
const gate = { cookie: 'preview_gate=test-gate-key-0123456789' };
const r = await worker.fetch(new Request('https://preview.example/vendor-auth/get-session', { headers: { ...gate, origin: 'https://preview.example' } }), env);
const j = await r.json();
check('worker routes /vendor-auth to vendor (path stripped)', j.path === '/neondb/auth/get-session', j.path);
check('real app origin forwarded through shim', j.origin === 'https://preview.example', String(j.origin));
check('set-cookie domain stripped', (r.headers.get('set-cookie') || '').includes('vend_sess=xyz') && !/Domain=/i.test(r.headers.get('set-cookie') || ''), r.headers.get('set-cookie'));
const r2 = await worker.fetch(new Request('https://preview.example/vendor-auth/get-session'), env);
check('ungated /vendor-auth still 403 at gate', r2.status === 403, String(r2.status));
const r3 = await worker.fetch(new Request('https://preview.example/vendor-auth/token', { headers: gate }), { ...env, AUTH_MODE: 'dev' });
check('vendor-auth NOT routed in dev mode (falls to assets)', r3.status === 200 && (await r3.text()) === 'asset', String(r3.status));
stub.close();
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
