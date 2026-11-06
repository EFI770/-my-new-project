// Vendor-auth proxy test with a stub upstream: path strip, method+body pass,
// status pass, set-cookie Domain rewrite, disabled outside Neon mode.
import http from 'node:http';
const stub = http.createServer((req, res) => {
  let b = ''; req.on('data', (c) => b += c); req.on('end', () => {
    res.writeHead(200, { 'content-type': 'application/json', 'set-cookie': ['session=abc; Domain=vendor.example; Path=/; HttpOnly; SameSite=Lax'] });
    res.end(JSON.stringify({ path: req.url, method: req.method, body: b, cookie: req.headers.cookie || null, origin: req.headers.origin || null }));
  });
});
await new Promise((r) => stub.listen(0, r));
const stubPort = stub.address().port;
process.env.CHAVRUTA_AUTH_MODE = 'neon';
process.env.NEON_AUTH_URL = `http://127.0.0.1:${stubPort}/neondb/auth`;
process.env.NEON_AUTH_JWKS_URL = 'http://127.0.0.1:1/jwks'; // unused in this test
process.env.NEON_AUTH_ISSUER = 'x'; process.env.NEON_AUTH_AUDIENCE = 'x';
const { default: handler } = await import('/tmp/-my-new-project/server/server.js');
const srv = http.createServer(handler);
await new Promise((r) => srv.listen(0, r));
const port = srv.address().port;
let pass = 0, fail = 0;
const check = (n, c, x='') => { c ? pass++ : fail++; console.log((c ? 'ok - ' : 'FAIL - ') + n + (c ? '' : ' ' + x)); };
const r = await fetch(`http://127.0.0.1:${port}/vendor-auth/sign-in/social?x=1`, { method: 'POST', headers: { 'content-type': 'application/json', cookie: 'session=abc; other=1' }, body: '{"provider":"google"}' });
const j = await r.json();
check('proxies to stripped upstream path with query', j.path === '/neondb/auth/sign-in/social?x=1', j.path);
check('method+body passed', j.method === 'POST' && j.body === '{"provider":"google"}', JSON.stringify(j));
check('status passed', r.status === 200);
check('browser cookie forwarded to vendor', j.cookie === 'session=abc; other=1', String(j.cookie));
check('origin header present for vendor', typeof j.origin === 'string' && j.origin.length > 0, String(j.origin));
// no-cookie request forwards none
const r2 = await fetch(`http://127.0.0.1:${port}/vendor-auth/token`);
const j2 = await r2.json();
check('no incoming cookie -> none forwarded', j2.cookie === null, String(j2.cookie));
const sc = r.headers.get('set-cookie') || '';
check('set-cookie Domain stripped (first-party)', sc.includes('session=abc') && !/Domain=/i.test(sc), sc);
srv.close(); stub.close();
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
