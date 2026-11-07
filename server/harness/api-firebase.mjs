// Hermetic Firebase-mode execution tests: HTTP -> API in AUTH_MODE=firebase ->
// real local Postgres RLS. Firebase ID tokens are replaced by locally signed
// RS256 JWTs; the API verifies them against a LOCAL JWKS server started here
// (FIREBASE_JWKS_URL override). Proves: token verification (garbage/forged/
// wrong-audience/wrong-issuer/expired all rejected), auth_sub binding, register
// validation (gender + 18+ attestation mandatory), same-gender RLS visibility,
// contact-free candidate payloads, and deletion. Synthetic users only.
// Usage: BASE=http://127.0.0.1:PORT JWKS_PORT=PORT node harness/api-firebase.mjs
import http from 'node:http';
import pg from 'pg';
import { generateKeyPair, SignJWT, exportJWK } from 'jose';

const BASE = (process.env.BASE || 'http://127.0.0.1:4594').replace(/\/$/, '');
const JWKS_PORT = Number(process.env.JWKS_PORT || 4595);
const PROJECT = 'chavruta-hermetic-test';
const ISSUER = `https://securetoken.google.com/${PROJECT}`;
const RUN = Date.now().toString(36);
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log(`ok - ${name}`); } else { fail++; console.log(`FAIL - ${name} ${extra}`); } };

// Local JWKS server: one RS256 keypair, public half served as JWKS.
const { publicKey, privateKey } = await generateKeyPair('RS256', { extractable: true });
const jwk = await exportJWK(publicKey);
jwk.kid = 'hermetic-key-1';
jwk.alg = 'RS256';
jwk.use = 'sig';
const jwksServer = http.createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ keys: [jwk] }));
});
await new Promise((r) => jwksServer.listen(JWKS_PORT, '127.0.0.1', r));

async function mintToken({ sub, email, name, issuer = ISSUER, audience = PROJECT, expiresIn = '1h', key = privateKey, kid = 'hermetic-key-1' }) {
  return new SignJWT({ sub, email: email || `${sub}@example.com`, name: name || sub, email_verified: true })
    .setProtectedHeader({ alg: 'RS256', kid })
    .setIssuedAt()
    .setIssuer(issuer)
    .setAudience(audience)
    .setExpirationTime(expiresIn)
    .sign(key);
}

async function api(method, path, { jwt, body, localAddress } = {}) {
  if (localAddress) {
    return new Promise((resolve, reject) => {
      const req = http.request(`${BASE}${path}`, {method, localAddress, headers: {
        authorization: `Bearer ${jwt}`, 'content-type': 'application/json',
      }}, (res) => {
        let text = ''; res.on('data', b => text += b);
        res.on('end', () => resolve({status:res.statusCode,data:JSON.parse(text)}));
      });
      req.on('error',reject); req.end(JSON.stringify(body));
    });
  }
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers: { ...(jwt ? { authorization: `Bearer ${jwt}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data };
}

const CONTACT_FIELD_RE = /"(email|phone|contactMethods?|telegram|whatsapp|value)"/i;
function scanContact(obj) { return CONTACT_FIELD_RE.test(JSON.stringify(obj)); }

// F1 health reports firebase-vendor
const h = await api('GET', '/api/health');
ok('F1 health firebase-vendor', h.status === 200 && h.data?.mode === 'firebase-vendor', JSON.stringify(h.data));

// F2 garbage token rejected
const g = await api('GET', '/api/me', { jwt: 'not.a.token' });
ok('F2 garbage token 401', g.status === 401);

// F3 forged token: RS256 self-signed with a DIFFERENT key, honest claims
const forgedKey = await generateKeyPair('RS256', { extractable: true });
const forged = await mintToken({ sub: 'forged-sub', key: forgedKey.privateKey });
const f = await api('GET', '/api/me', { jwt: forged });
ok('F3 forged token 401', f.status === 401);

// F4 wrong audience rejected
const wrongAud = await mintToken({ sub: 'aud-sub', audience: 'some-other-project' });
const wa = await api('GET', '/api/me', { jwt: wrongAud });
ok('F4 wrong audience 401', wa.status === 401);

// F5 wrong issuer rejected
const wrongIss = await mintToken({ sub: 'iss-sub', issuer: 'https://securetoken.google.com/other-project' });
const wi = await api('GET', '/api/me', { jwt: wrongIss });
ok('F5 wrong issuer 401', wi.status === 401);

// F6 expired token rejected
const expired = await mintToken({ sub: 'exp-sub', expiresIn: '-10s' });
const ex = await api('GET', '/api/me', { jwt: expired });
ok('F6 expired token 401', ex.status === 401);

// Valid identities: A man, B woman, C man
const A = { sub: `uid-a-${RUN}`, email: `a-${RUN}@example.com` };
const B = { sub: `uid-b-${RUN}`, email: `b-${RUN}@example.com` };
const C = { sub: `uid-c-${RUN}`, email: `c-${RUN}@example.com` };
A.jwt = await mintToken(A); B.jwt = await mintToken(B); C.jwt = await mintToken(C);

// F7 register validation: gender + 18+ attestation mandatory
const rg = await api('POST', '/api/auth/register', { jwt: A.jwt, body: { displayName: 'Test A' } });
ok('F7 register without gender 400', rg.status === 400);
const rg2 = await api('POST', '/api/auth/register', { jwt: A.jwt, body: { displayName: 'Test A', gender: 'man' } });
ok('F7b register without attestation 400', rg2.status === 400 && rg2.data?.error === 'age_attestation_required', JSON.stringify(rg2.data));

// F8 register A(man) B(woman) C(man); re-register rejected
const rA = await api('POST', '/api/auth/register', { jwt: A.jwt, body: { displayName: 'אבי אשכנזי', gender: 'man', attestAdult: true } });
const rB = await api('POST', '/api/auth/register', { jwt: B.jwt, body: { displayName: 'ברכה לוי', gender: 'woman', attestAdult: true } });
const rC = await api('POST', '/api/auth/register', { jwt: C.jwt, body: { displayName: 'חיים כהן', gender: 'man', attestAdult: true } });
ok('F8 three registrations 201', [rA, rB, rC].every((r) => r.status === 201), JSON.stringify([rA.status, rB.status, rC.status]));
const rA2 = await api('POST', '/api/auth/register', { jwt: A.jwt, body: { displayName: 'אבי אשכנזי', gender: 'man', attestAdult: true } });
ok('F8b re-register same sub 409', rA2.status === 409);

// F9 /api/me bound to verified sub; email comes from token claims
const meA = await api('GET', '/api/me', { jwt: A.jwt });
ok('F9 /api/me bound user + email', meA.status === 200 && meA.data?.profile?.gender === 'man' && meA.data?.email === A.email, JSON.stringify(meA.data));

// F10 same-gender visibility through RLS (no authorization logic in API layer)
const candA = await api('GET', '/api/candidates', { jwt: A.jwt });
const candB = await api('GET', '/api/candidates', { jwt: B.jwt });
const namesA = JSON.stringify(candA.data); const namesB = JSON.stringify(candB.data);
ok('F10 man sees man not woman', namesA.includes('חיים כהן') && !namesA.includes('ברכה לוי'));
ok('F10b woman sees woman not man', !namesB.includes('חיים כהן') && !namesB.includes('אבי אשכנזי'));

// F11 candidate payloads are contact-free
ok('F11 candidates have no contact fields', !scanContact(candA.data) && !scanContact(candB.data));

// F12 unauthenticated member API rejected
const noTok = await api('GET', '/api/candidates');
ok('F12 no token 401/403', noTok.status === 401 || noTok.status === 403);

// F13 providers endpoint: firebase entry present and shaped (synthetic config)
const prov = await api('GET', '/api/auth/providers');
const fb = prov.data?.firebase;
ok('F13 providers firebase enabled with public config fields',
  prov.status === 200 && fb?.enabled === true && !!fb.config?.projectId && !!fb.config?.appId
  && typeof fb.config?.apiKey === 'string' && fb.config.apiKey.length > 0
  && fb.config.projectId === PROJECT,
  JSON.stringify({ enabled: fb?.enabled, projectId: fb?.config?.projectId, hasKey: !!fb?.config?.apiKey }));

// F14 deletion: app data + sessions removed, user anonymous again
const del = await api('DELETE', '/api/me', { jwt: A.jwt });
ok('F14 delete 200', del.status === 200, `got ${del.status}`);
const afterA = await api('GET', '/api/me', { jwt: A.jwt });
ok('F14b deleted user is anonymous again', afterA.status === 401);

// F15 tombstone: the still-valid token of the deleted user CANNOT re-register
const reReg = await api('POST', '/api/auth/register', { jwt: A.jwt, body: { displayName: 'אבי אשכנזי', gender: 'man', attestAdult: true } });
ok('F15 deleted+still-valid token re-register 403 account_deleted', reReg.status === 403 && reReg.data?.error === 'account_deleted', JSON.stringify(reReg));

const ownDeleted = await api('GET', '/api/auth/status', {jwt:A.jwt});
ok('F20 own deleted state is explicit', ownDeleted.status === 200 && ownDeleted.data?.state === 'deleted');
const invalidState = await api('GET', '/api/auth/status', {jwt:'garbage'});
ok('F20b state requires valid own token', invalidState.status === 401);
const New = await mintToken({sub:`new-state-${RUN}`});
const ownNew = await api('GET', '/api/auth/status', {jwt:New});
const ownExisting = await api('GET', '/api/auth/status', {jwt:B.jwt});
ok('F20c new versus existing state distinguished', ownNew.data?.state === 'new' && ownExisting.data?.state === 'registered');

// F16 no over-blocking: a different vendor subject still registers fine
const D = { sub: `uid-d-${RUN}`, email: `d-${RUN}@example.com` };
D.jwt = await mintToken(D);
const rD = await api('POST', '/api/auth/register', { jwt: D.jwt, body: { displayName: 'דוד שלום', gender: 'man', attestAdult: true } });
ok('F16 fresh subject still registers 201', rD.status === 201);

// F17 JWKS override is fail-closed without the explicit hermetic flag
let threw = false;
try {
  const { createFirebaseAuth } = await import('../firebaseAuth.js');
  createFirebaseAuth({ projectId: PROJECT, jwksUrl: 'http://127.0.0.1:1/evil.json' });
} catch (e) { threw = e?.message === 'jwks_override_not_allowed'; }
ok('F17 jwks override without flag throws', threw);


// Fault injection: failure AFTER the tombstone INSERT must roll back both
// tombstone and account deletion. Uses only the throwaway test database.
const sql = new pg.Client({ host: process.env.PGHOST, database: process.env.PGDATABASE, user: 'postgres' });
await sql.connect();
await sql.query(`create function auth.fail_test_delete() returns trigger language plpgsql as $$
  begin raise exception 'synthetic_delete_failure'; end $$`);
await sql.query(`create trigger fail_test_delete before delete on auth.users for each row execute function auth.fail_test_delete()`);
try {
  const failed = await api('DELETE', '/api/me', { jwt: D.jwt });
  const stillMember = await api('GET', '/api/me', { jwt: D.jwt });
  const tomb = await sql.query('select 1 from auth.deleted_subs where auth_sub=$1', [D.sub]);
  ok('F18 failed delete 500 with member preserved', failed.status === 500 && stillMember.status === 200);
  ok('F18b failed delete rolls tombstone back', tomb.rowCount === 0);
} finally {
  await sql.query('drop trigger fail_test_delete on auth.users');
  await sql.query('drop function auth.fail_test_delete()');
}
// Race existing-member registration replays with deletion. No replay may
// create a new account, regardless of lock acquisition order.
const raced = await Promise.all([
  api('DELETE', '/api/me', { jwt: D.jwt }),
  ...Array.from({length: 8}, (_, i) => api('POST', '/api/auth/register', {
    localAddress: `127.0.0.${i+2}`, jwt: D.jwt, body: {displayName: 'race', gender: 'man', attestAdult: true},
  })),
]);
ok('F19 racing delete succeeds; registration never recreates', raced[0].status === 200 && raced.slice(1).every(r => [403,409].includes(r.status)), JSON.stringify(raced.map(r=>r.status)));
const replay = await api('POST', '/api/auth/register', {localAddress:'127.0.0.20',jwt:D.jwt,body:{displayName:'race',gender:'man',attestAdult:true}});
const binding = await sql.query('select 1 from auth.users where auth_sub=$1',[D.sub]);
ok('F19b replay remains blocked and binding absent', replay.status === 403 && binding.rowCount === 0);
await sql.end();

await new Promise((r) => jwksServer.close(r));
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
