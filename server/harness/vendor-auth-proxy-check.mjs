// Vendor-auth proxy check against api.js directly (self-contained; no server.js/DB): path strip, method+body pass, cookie pass, REAL origin forwarding (vendor substitution rejected), set-cookie Domain rewrite.
import http from 'node:http';
const stub = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => b += c); req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['session=abc; Domain=vendor.example; Path=/; HttpOnly; SameSite=Lax'] });
    res.end(JSON.stringify({ path: req.url, method: req.method, body: b, cookie: req.headers.cookie || null, origin: req.headers.origin ?? null }));
  });
});
await new Promise((r) => stub.listen(0, r));
const stubPort = stub.address().port;
const { createApiHandler } = await import('/tmp/-my-new-project/server/api.js');
const api = createApiHandler({ authMode: 'neon', neonJwksUrl: 'http://127.0.0.1:1/jwks', neonIssuer: 'x', neonAudience: 'x', db: {}, env: { NEON_AUTH_URL: `http://127.0.0.1:${stubPort}/neondb/auth` } });
const srv = http.createServer((req, res) => Promise.resolve(api(req, res)).catch((e) => { console.log('THROW', e.message); res.writeHead(500); res.end('x'); }));
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
let pass = 0, fail = 0;
const check = (n, c, x = '') => { c ? pass++ : fail++; console.log((c ? 'ok - ' : 'FAIL - ') + n + (c ? '' : ' ' + x)); };
const APP_ORIGIN = `http://127.0.0.1:${port}`;
const r = await fetch(`http://127.0.0.1:${port}/vendor-auth/sign-in/social?x=1`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'session=abc; other=1', origin: APP_ORIGIN }, body: '{"provider":"google"}' });
const j = await r.json();
check('proxies to stripped upstream path with query', j.path === '/neondb/auth/sign-in/social?x=1', j.path);
check('method+body passed', j.method === 'POST' && j.body === '{"provider":"google"}', JSON.stringify(j));
check('status passed', r.status === 200);
check('browser cookie forwarded to vendor', j.cookie === 'session=abc; other=1', String(j.cookie));
check('REAL app origin forwarded unchanged (no vendor substitution)', j.origin === APP_ORIGIN, String(j.origin));
const r2 = await fetch(`http://127.0.0.1:${port}/vendor-auth/token`);
const j2 = await r2.json();
check('no incoming cookie -> none forwarded', j2.cookie === null, String(j2.cookie));
check('no incoming origin -> none forwarded', j2.origin === null, String(j2.origin));
const sc = r.headers.get('set-cookie') || '';
check('set-cookie Domain stripped (first-party)', sc.includes('session=abc') && !/Domain=/i.test(sc), sc);
const r3 = await fetch(`http://127.0.0.1:${port}/vendor-auth/token`, { headers: { origin: 'https://evil.example' } });
const j3 = await r3.json();
check('foreign origin forwarded as-is (vendor enforces trust, we do not hide it)', j3.origin === 'https://evil.example', String(j3.origin));
srv.close(); stub.close();
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
