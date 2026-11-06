// Live-vendor execution tests: the API server in CHAVRUTA_AUTH_MODE=neon against
// the real Neon project (chavruta-dev, aws-us-east-1), with real Neon Auth JWTs.
// Proves RLS enforcement through the chavruta_app role (no BYPASSRLS), vendor JWT
// verification, auth_sub binding, and pool isolation. Synthetic users only.
// Usage: AUTH_URL=... API=http://127.0.0.1:4593 node harness/api-neon.mjs
import { generateKeyPair, SignJWT, exportJWK } from 'jose';

const AUTH = process.env.AUTH_URL.replace(/\/$/, '');
const API = (process.env.API || 'http://127.0.0.1:4593').replace(/\/$/, '');
const RUN = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log(`ok - ${name}`); } else { fail++; console.log(`FAIL - ${name} ${extra}`); } };

async function vendorSignup(label) {
  const email = `chavruta-test-${RUN}-${label}@example.com`;
  const password = `T3st!${RUN}${label}xYz`;
  const r = await fetch(`${AUTH}/sign-up/email`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'http://localhost:3000' },
    body: JSON.stringify({ name: `Test ${label}`, email, password }),
  });
  if (r.status !== 200) throw new Error(`vendor signup ${label}: ${r.status} ${await r.text()}`);
  const setCookie = r.headers.get('set-cookie') || '';
  const cookie = setCookie.split(';')[0];
  const t = await fetch(`${AUTH}/token`, { headers: { cookie, origin: 'http://localhost:3000' } });
  const { token: jwt } = await t.json();
  const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'));
  return { email, password, jwt, sub: payload.sub };
}

async function api(method, path, { jwt, body } = {}) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

const CONTACT_FIELD_RE = /"(email|phone|contactMethods?|telegram|whatsapp|value)"/i;
function scanContact(obj) { return CONTACT_FIELD_RE.test(JSON.stringify(obj)); }

const A = await vendorSignup('a'); // will be man
const B = await vendorSignup('b'); // will be woman
const C = await vendorSignup('c'); // will be man
const D = await vendorSignup('d'); // will be woman

// N1 health
const h = await api('GET', '/api/health');
ok('N1 health neon-vendor', h.status === 200 && h.data?.mode === 'neon-vendor');

// N2 garbage token
const g = await api('GET', '/api/me', { jwt: 'not.a.token' });
ok('N2 garbage token 401', g.status === 401);

// N3 forged token: self-signed EdDSA, honest claims, wrong key
const { privateKey } = await generateKeyPair('EdDSA', { extractable: true });
const forged = await new SignJWT({ sub: A.jwt ? '00000000-0000-0000-0000-000000000000' : 'x', role: 'authenticated' })
  .setProtectedHeader({ alg: 'EdDSA' }).setIssuedAt().setExpirationTime('15m')
  .setIssuer('https://ep-royal-darkness-bcfll6ma.neonauth.c-16.us-east-1.aws.neon.tech')
  .setAudience('https://ep-royal-darkness-bcfll6ma.neonauth.c-16.us-east-1.aws.neon.tech').sign(privateKey);
const f = await api('GET', '/api/me', { jwt: forged });
ok('N3 forged token 401', f.status === 401);

// N4 expired self-signed token (wrong key AND expired) - exp enforced
const expired = await new SignJWT({ sub: '00000000-0000-0000-0000-000000000000' })
  .setProtectedHeader({ alg: 'EdDSA' }).setIssuedAt(Math.floor(Date.now() / 1000) - 3600)
  .setExpirationTime(Math.floor(Date.now() / 1000) - 1800)
  .setIssuer('https://ep-royal-darkness-bcfll6ma.neonauth.c-16.us-east-1.aws.neon.tech')
  .setAudience('https://ep-royal-darkness-bcfll6ma.neonauth.c-16.us-east-1.aws.neon.tech').sign(privateKey);
const ex = await api('GET', '/api/me', { jwt: expired });
ok('N4 expired/forged token 401', ex.status === 401);

// N5 register validation
const rg = await api('POST', '/api/auth/register', { jwt: A.jwt, body: { displayName: 'Test A' } });
ok('N5 register without gender 400', rg.status === 400);

// N5b register without 18+ attestation rejected
const rg2 = await api('POST', '/api/auth/register', { jwt: A.jwt, body: { displayName: 'Test A', gender: 'man' } });
ok('N5b register without 18+ attestation 400', rg2.status === 400 && rg2.data?.error === 'age_attestation_required', JSON.stringify(rg2.data));

// N6 register A(man) B(woman) C(man) D(woman)
const rA = await api('POST', '/api/auth/register', { jwt: A.jwt, body: { displayName: 'אבי אשכנזי', gender: 'man', attestAdult: true } });
const rB = await api('POST', '/api/auth/register', { jwt: B.jwt, body: { displayName: 'ברכה לוי', gender: 'woman', attestAdult: true } });
const rC = await api('POST', '/api/auth/register', { jwt: C.jwt, body: { displayName: 'חיים כהן', gender: 'man', attestAdult: true } });
const rD = await api('POST', '/api/auth/register', { jwt: D.jwt, body: { displayName: 'דבורה מזרחי', gender: 'woman', attestAdult: true } });
ok('N6 four registrations 201', [rA, rB, rC, rD].every((r) => r.status === 201), JSON.stringify([rA.status, rB.status, rC.status, rD.status]));
const rA2 = await api('POST', '/api/auth/register', { jwt: A.jwt, body: { displayName: 'אבי אשכנזי', gender: 'man', attestAdult: true } });
ok('N6b re-register same sub 409', rA2.status === 409);

// N6c adults-only gate: fail closed on member APIs until attested (service
// connection nulls the column to simulate a profile predating attestation)
if (process.env.DATABASE_ADMIN_URL) {
  const pg = (await import('pg')).default;
  const adm = new pg.Client({ connectionString: process.env.DATABASE_ADMIN_URL });
  await adm.connect();
  await adm.query('update public.profiles set age_attested_at = null where id = (select id from auth.users where auth_sub = $1)', [A.sub]);
  let g = await api('GET', '/api/candidates', { jwt: A.jwt });
  ok('N6c un-attested user blocked from member API (fail closed)', g.status === 403 && g.data?.error === 'age_attestation_required', JSON.stringify(g));
  g = await api('GET', '/api/me', { jwt: A.jwt });
  ok('N6d /api/me stays readable while gated', g.status === 200 && g.data?.profile?.age_attested_at === null, JSON.stringify(g.data?.profile));
  g = await api('POST', '/api/me/attest-age', { jwt: A.jwt, body: {} });
  ok('N6e attestation without explicit flag 400', g.status === 400 && g.data?.error === 'age_attestation_required');
  g = await api('POST', '/api/me/attest-age', { jwt: A.jwt, body: { attestAdult: true } });
  ok('N6f attestation accepted', g.status === 200, JSON.stringify(g));
  g = await api('GET', '/api/candidates', { jwt: A.jwt });
  ok('N6g member API open after attestation', g.status === 200, JSON.stringify(g.status));
  await adm.end();
} else {
  ok('N6c age gate DB access for test', false, 'DATABASE_ADMIN_URL not set - gate untested');
}

// N7 me resolves via auth_sub, own email from token, own gender
const meA = await api('GET', '/api/me', { jwt: A.jwt });
ok('N7 /api/me bound user', meA.status === 200 && meA.data?.profile?.gender === 'man' && meA.data?.email === A.email);

// N8 same-gender visibility through RLS
const candA = await api('GET', '/api/candidates', { jwt: A.jwt });
const candB = await api('GET', '/api/candidates', { jwt: B.jwt });
const namesA = JSON.stringify(candA.data); const namesB = JSON.stringify(candB.data);
ok('N8 man sees man not woman', namesA.includes('חיים כהן') && !namesA.includes('ברכה לוי') && !namesA.includes('דבורה מזרחי'));
ok('N8b woman sees woman not man', namesB.includes('דבורה מזרחי') && !namesB.includes('חיים כהן') && !namesB.includes('אבי אשכנזי'));

// N9 candidate payloads are contact-free
ok('N9 candidates have no contact fields', !scanContact(candA.data) && !scanContact(candB.data));

// N10 cross-gender direct request rejected (direct API, not UI)
const otherId = (list, name) => (list?.data?.candidates || list?.data || []).find?.((x) => JSON.stringify(x).includes(name))?.userId
  || (list?.data?.candidates || list?.data || []).find?.((x) => JSON.stringify(x).includes(name))?.id;
const idC = otherId(candA, 'חיים כהן'); const idD = otherId(candB, 'דבורה מזרחי');
const idA = rA.data?.userId; const idB = rB.data?.userId;
const x1 = await api('POST', '/api/connections', { jwt: A.jwt, body: { recipientId: idB } });
ok('N10 cross-gender request man->woman 403/400', x1.status === 403 || x1.status === 400, `got ${x1.status}`);
const x2 = await api('POST', '/api/connections', { jwt: B.jwt, body: { recipientId: idC } });
ok('N10b cross-gender request woman->man 403/400', x2.status === 403 || x2.status === 400, `got ${x2.status}`);

// N11 full same-gender flow: request -> accept != consent -> bilateral consent -> contact
const conn = await api('POST', '/api/connections', { jwt: A.jwt, body: { recipientId: idC } });
ok('N11 same-gender request 201', conn.status === 201, `got ${conn.status} ${JSON.stringify(conn.data)}`);
const connId = conn.data?.id || conn.data?.connectionId;
const contactWhilePending = await api('GET', `/api/connections/${connId}/contact`, { jwt: C.jwt });
ok('N11b contact denied while pending', contactWhilePending.status === 403 || contactWhilePending.status === 404);
const consentPending = await api('POST', `/api/connections/${connId}/consent`, { jwt: C.jwt, body: { consent: true } });
ok('N11c consent impossible while pending', consentPending.status === 400 || consentPending.status === 403 || consentPending.status === 404);
const accept = await api('POST', `/api/connections/${connId}/respond`, { jwt: C.jwt, body: { decision: 'accepted' } });
ok('N11d accept ok', accept.status === 200, `got ${accept.status}`);
const contactAfterAccept = await api('GET', `/api/connections/${connId}/contact`, { jwt: A.jwt });
ok('N11e contact still denied after accept without both consents', contactAfterAccept.status === 403 || contactAfterAccept.status === 404);
const consentA = await api('POST', `/api/connections/${connId}/consent`, { jwt: A.jwt, body: { consent: true } });
ok('N11f consent A ok', consentA.status === 200, `got ${consentA.status}`);
const contactOneConsent = await api('GET', `/api/connections/${connId}/contact`, { jwt: C.jwt });
ok('N11g contact denied with one consent', contactOneConsent.status === 403 || contactOneConsent.status === 404);
const consentC = await api('POST', `/api/connections/${connId}/consent`, { jwt: C.jwt, body: { consent: true } });
ok('N11h consent C ok', consentC.status === 200, `got ${consentC.status}`);
const contactBoth = await api('GET', `/api/connections/${connId}/contact`, { jwt: A.jwt });
ok('N11i contact revealed after both consents', contactBoth.status === 200, `got ${contactBoth.status}`);
const contactThird = await api('GET', `/api/connections/${connId}/contact`, { jwt: D.jwt });
ok('N11j third party denied contact', contactThird.status === 403 || contactThird.status === 404);

// N12 pool isolation: PGPOOL_MAX=1 server; interleave A/C /api/me, each must get own profile
let isolation = true;
for (let i = 0; i < 6; i++) {
  const [ra, rc] = await Promise.all([api('GET', '/api/me', { jwt: A.jwt }), api('GET', '/api/me', { jwt: C.jwt })]);
  if (ra.data?.email !== A.email || rc.data?.email !== C.email) isolation = false;
}
ok('N12 pool isolation interleaved A/C', isolation);

// N13 client-injected identity headers have no effect
const spoof = await api('GET', '/api/me', { jwt: A.jwt, body: undefined, });
const spoof2 = await fetch(`${API}/api/candidates`, { headers: { authorization: `Bearer ${A.jwt}`, 'x-app-sub': idC, 'x-user-id': idC } });
const spoofJson = await spoof2.json();
ok('N13 spoof headers ignored', spoof.status === 200 && spoofJson && !JSON.stringify(spoofJson).includes('error') && spoof.data?.email === A.email);

// N14 cleanup: delete app-level registrations
for (const u of [A, B, C, D]) {
  const del = await api('DELETE', '/api/me', { jwt: u.jwt });
  if (del.status !== 200) { console.log(`cleanup note: DELETE /api/me ${u.email} -> ${del.status}`); }
}
const afterA = await api('GET', '/api/me', { jwt: A.jwt });
ok('N14 deleted user is anonymous again', afterA.status === 401);

console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
