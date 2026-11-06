// End-to-end execution tests: HTTP -> dev emulator -> real Postgres RLS/RPCs.
// Run via scripts/test-api-local.sh (expects BASE env).
const BASE = process.env.BASE || 'http://127.0.0.1:4591';
let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { console.log(`ok - ${name}`); pass++; }
  else { console.log(`FAIL - ${name} ${extra}`); fail++; }
}
function jar() {
  let cookie = '';
  return {
    async call(method, path, body) {
      const res = await fetch(BASE + path, {
        method,
        headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setC = res.headers.get('set-cookie');
      if (setC) cookie = setC.split(';')[0];
      let data = null;
      try { data = await res.json(); } catch {}
      return { status: res.status, data };
    },
    clear() { cookie = ''; },
    get cookie() { return cookie; },
  };
}

const alice = jar(), bob = jar(), eve = jar(), dana = jar(), anon = jar();
const pw = 'test-pass-1234';

// --- auth ---
let r = await anon.call('GET', '/api/me');
check('A1 unauthenticated /api/me -> 401', r.status === 401);
r = await alice.call('POST', '/api/auth/register', { email: 'alice@test.dev', password: 'short', displayName: 'אליס' });
check('A2 short password rejected', r.status === 400);
r = await alice.call('POST', '/api/auth/register', { email: 'alice@test.dev', password: pw, displayName: 'אליס' });
check('A2b register without gender rejected', r.status === 400 && r.data?.error === 'invalid_gender', JSON.stringify(r.data));
r = await alice.call('POST', '/api/auth/register', { email: 'alice@test.dev', password: pw, displayName: 'אליס', gender: 'other' });
check('A2c register with invalid gender rejected', r.status === 400 && r.data?.error === 'invalid_gender');
r = await alice.call('POST', '/api/auth/register', { email: 'alice@test.dev', password: pw, displayName: 'אליס', gender: 'man' });
check('A2d register without 18+ attestation rejected', r.status === 400 && r.data?.error === 'age_attestation_required', JSON.stringify(r.data));
r = await alice.call('POST', '/api/auth/register', { email: 'alice@test.dev', password: pw, displayName: 'אליס', gender: 'man', attestAdult: true });
check('A3 alice registers (with attestation)', r.status === 201, JSON.stringify(r));
const aliceId = r.data?.userId;
r = await alice.call('POST', '/api/auth/register', { email: 'alice@test.dev', password: pw, displayName: 'אליס', gender: 'man', attestAdult: true });
check('A4 duplicate email rejected', r.status === 409);
r = await bob.call('POST', '/api/auth/register', { email: 'bob@test.dev', password: pw, displayName: 'בוב', gender: 'man', attestAdult: true });
const bobId = r.data?.userId;
r = await eve.call('POST', '/api/auth/register', { email: 'eve@test.dev', password: pw, displayName: 'איב', gender: 'man', attestAdult: true });
const eveId = r.data?.userId;
r = await dana.call('POST', '/api/auth/register', { email: 'dana@test.dev', password: pw, displayName: 'דנה', gender: 'woman', attestAdult: true });
check('A7 dana (woman) registers', r.status === 201, JSON.stringify(r));
const danaId = r.data?.userId;
r = await alice.call('GET', '/api/me');
check('A8 /api/me returns gender', r.data?.profile?.gender === 'man', JSON.stringify(r.data?.profile));
// --- adults-only gate: fail closed on member APIs until attested ---
if (process.env.PGHOST && process.env.PGDATABASE) {
  const pg = (await import('pg')).default;
  const adm = new pg.Client({ host: process.env.PGHOST, database: process.env.PGDATABASE, user: 'postgres' });
  await adm.connect();
  await adm.query('update public.profiles set age_attested_at = null where id = $1', [aliceId]);
  r = await alice.call('GET', '/api/candidates');
  check('A3g un-attested user blocked from member API (fail closed)', r.status === 403 && r.data?.error === 'age_attestation_required', JSON.stringify(r));
  r = await alice.call('GET', '/api/me');
  check('A3h /api/me stays readable while gated', r.status === 200 && r.data?.profile?.age_attested_at === null, JSON.stringify(r.data?.profile));
  r = await alice.call('POST', '/api/me/attest-age', {});
  check('A3i attestation without explicit flag rejected', r.status === 400 && r.data?.error === 'age_attestation_required');
  r = await alice.call('POST', '/api/me/attest-age', { attestAdult: true });
  check('A3j attestation accepted', r.status === 200, JSON.stringify(r));
  r = await alice.call('GET', '/api/candidates');
  check('A3k member API open after attestation', r.status === 200, JSON.stringify(r.status));
  await adm.end();
} else {
  check('A3g age gate DB access for test', false, 'PGHOST/PGDATABASE not set - gate untested');
}

const bobLogin = jar();
r = await bobLogin.call('POST', '/api/auth/login', { email: 'bob@test.dev', password: 'wrong-pass-1' });
check('A5 wrong password rejected', r.status === 401);
r = await bobLogin.call('POST', '/api/auth/login', { email: 'bob@test.dev', password: pw });
check('A6 bob logs in', r.status === 200);

// --- profile & contact methods ---
r = await bob.call('PUT', '/api/me/profile', {
  displayName: 'בוב', bio: 'לומד גמרא', learningTopics: ['גמרא'],
  learningLevel: 'intermediate', preferredModes: ['video'], availableDays: ['sun', 'tue'], availabilityNotes: '',
});
check('P1 bob updates profile', r.status === 200, JSON.stringify(r.data));
r = await bob.call('PUT', '/api/me/profile', { displayName: 'בוב', bio: 'x', learningTopics: [], learningLevel: 'wizard', preferredModes: [], availableDays: [], availabilityNotes: '' });
check('P2 invalid level rejected', r.status === 400);
r = await bob.call('PUT', '/api/me/contact-methods', { methods: [{ kind: 'phone', value: '0500000000', isPrimary: true }] });
check('P3 bob saves contact method', r.status === 200);
r = await alice.call('PUT', '/api/me/profile', {
  displayName: 'אליס', bio: 'לומדת תנ"ך', learningTopics: ['תנ"ך'],
  learningLevel: 'beginner', preferredModes: ['in_person'], availableDays: ['mon'], availabilityNotes: '',
});
check('P4 alice updates profile', r.status === 200);
r = await eve.call('PUT', '/api/me/profile', {
  displayName: 'איב', bio: '', learningTopics: ['גמרא'], learningLevel: 'advanced',
  preferredModes: ['phone'], availableDays: ['wed'], availabilityNotes: '',
});
check('P5 eve updates profile', r.status === 200);
r = await dana.call('PUT', '/api/me/profile', {
  displayName: 'דנה', bio: '', learningTopics: ['משנה'], learningLevel: 'beginner',
  preferredModes: ['in_person'], availableDays: ['sun'], availabilityNotes: '',
});
check('P6 dana updates profile', r.status === 200);

// --- candidates: allowlisted fields only, no contact data ---
r = await alice.call('GET', '/api/candidates');
check('C1 alice lists candidates', r.status === 200);
const bobCard = r.data.candidates.find((c) => c.id === bobId);
check('C2 bob appears for alice', !!bobCard);
check('C3 candidate card has no contact fields', bobCard && !('contactMethods' in bobCard) && !('value' in bobCard) && !('email' in bobCard) && !('phone' in bobCard));
check('C4 self excluded', !r.data.candidates.some((c) => c.id === aliceId));
check('C5 myInterest starts null', bobCard && bobCard.myInterest === null);

// --- private interest: no leak until mutual ---
r = await alice.call('POST', '/api/interests', { candidateId: bobId, interested: true });
check('I1 alice selects bob privately', r.status === 200);
r = await bob.call('GET', '/api/matches');
check('I2 one-sided interest yields no match for bob', r.data.matches.length === 0);
r = await alice.call('GET', '/api/matches');
check('I3 one-sided interest yields no match for alice', r.data.matches.length === 0);
r = await bob.call('POST', '/api/interests', { candidateId: aliceId, interested: true });
check('I4 bob selects alice', r.status === 200);
r = await alice.call('GET', '/api/matches');
check('I5 mutual interest matches', r.data.matches.length === 1 && r.data.matches[0].candidateId === bobId);
check('I6 match card has no contact fields', !('email' in (r.data.matches[0].card || {})) && !('contactMethods' in (r.data.matches[0].card || {})) && !('phone' in (r.data.matches[0].card || {})) && !('value' in (r.data.matches[0].card || {})));
r = await alice.call('GET', '/api/candidates');
check('I7 myInterest reflects own selection only', r.data.candidates.find((c) => c.id === bobId)?.myInterest === true);

// --- study requests ---
r = await bob.call('POST', '/api/study-requests', { title: 'חברותא בבבא קמא', topic: 'גמרא', description: 'פרק ב', learningLevel: 'intermediate', preferredModes: ['video'], availableDays: ['tue'] });
check('S1 bob creates study request', r.status === 201, JSON.stringify(r.data));
const srId = r.data?.id;
r = await alice.call('GET', '/api/study-requests');
check('S2 alice sees open request with owner name', r.data.studyRequests.some((s) => s.id === srId && s.ownerName === 'בוב'));
check('S2b study-request payload has no contact fields', r.data.studyRequests.every((x) => !('contactMethods' in x) && !('email' in x) && !('phone' in x) && !('value' in x)));
r = await alice.call('PUT', `/api/study-requests/${srId}`, { status: 'closed' });
check('S3 alice cannot edit bob request', r.status === 404 || r.status === 403);
r = await bob.call('PUT', `/api/study-requests/${srId}`, { status: 'paused' });
check('S4 bob edits own request', r.status === 200);
r = await bob.call('PUT', `/api/study-requests/${srId}`, { status: 'open' });

// --- connections + consent + contact disclosure ---
r = await alice.call('POST', '/api/connections', { recipientId: bobId, studyRequestId: srId, message: 'נשמח לחברותא' });
check('N1 alice requests connection', r.status === 201, JSON.stringify(r.data));
const connId = r.data?.id;
r = await alice.call('POST', '/api/connections', { recipientId: bobId, message: 'x' });
check('N2 duplicate active pair rejected', r.status === 409);
r = await bob.call('POST', `/api/connections/${connId}/consent`, { consent: true });
check('N2b consent impossible while pending (accept != consent)', r.status === 403, JSON.stringify(r));
r = await alice.call('GET', `/api/connections/${connId}/contact`);
check('N3 contact denied while pending', r.status === 403);
r = await alice.call('POST', `/api/connections/${connId}/respond`, { decision: 'accepted' });
check('N4 requester cannot accept own request', r.status === 403);
r = await bob.call('POST', `/api/connections/${connId}/respond`, { decision: 'accepted' });
check('N5 bob accepts', r.status === 200, JSON.stringify(r.data));
r = await bob.call('POST', `/api/connections/${connId}/consent`, { consent: true });
check('N6 bob consents', r.status === 200);
r = await alice.call('GET', `/api/connections/${connId}/contact`);
check('N7 contact denied with one-sided consent', r.status === 403);
r = await alice.call('POST', `/api/connections/${connId}/consent`, { consent: true });
check('N8 alice consents', r.status === 200);
r = await alice.call('GET', `/api/connections/${connId}/contact`);
check('N9 contact revealed after mutual consent', r.status === 200 && r.data.contactMethods.some((m) => m.value === '0500000000'), JSON.stringify(r.data));
r = await bob.call('GET', `/api/connections/${connId}/contact`);
check('N10 bob gets empty list (alice has no methods)', r.status === 200 && r.data.contactMethods.length === 0);
r = await eve.call('GET', `/api/connections/${connId}/contact`);
check('N11 third party denied contact', r.status === 403);
r = await bob.call('POST', `/api/connections/${connId}/consent`, { consent: false });
r = await alice.call('GET', `/api/connections/${connId}/contact`);
check('N12 revoked consent closes disclosure', r.status === 403);
r = await bob.call('POST', `/api/connections/${connId}/consent`, { consent: true });

// --- blocks ---
r = await alice.call('POST', '/api/blocks', { blockedId: eveId });
check('B1 alice blocks eve', r.status === 201);
r = await eve.call('GET', '/api/candidates');
check('B2 eve no longer sees alice', !r.data.candidates.some((c) => c.id === aliceId));
r = await alice.call('GET', '/api/candidates');
check('B3 alice no longer sees eve', !r.data.candidates.some((c) => c.id === eveId));
r = await eve.call('POST', '/api/connections', { recipientId: aliceId, message: 'hi' });
check('B4 eve cannot request blocked alice', r.status === 403);
r = await alice.call('POST', '/api/connections', { recipientId: eveId, message: 'hi' });
check('B5 alice cannot request blocked eve', r.status === 403);
r = await alice.call('DELETE', `/api/blocks/${eveId}`);
check('B6 unblock works', r.status === 200);
r = await eve.call('GET', '/api/candidates');
check('B7 eve sees alice again after unblock', r.data.candidates.some((c) => c.id === aliceId));

// --- gender separation: enforced server-side, fail-closed ---
r = await dana.call('GET', '/api/candidates');
check('GS1 dana sees no men as candidates', r.status === 200 && r.data.candidates.length === 0, JSON.stringify(r.data.candidates?.length));
r = await alice.call('GET', '/api/candidates');
check('GS2 alice does not see dana', !r.data.candidates.some((c) => c.id === danaId));
r = await dana.call('POST', '/api/interests', { candidateId: aliceId, interested: true });
check('GS3 cross-gender interest rejected', r.status === 403, JSON.stringify(r));
r = await alice.call('POST', '/api/connections', { recipientId: danaId, message: 'hi' });
check('GS4 cross-gender connection rejected', r.status === 403, JSON.stringify(r));
r = await dana.call('POST', '/api/study-requests', { title: 'משנה בבוקר', topic: 'משנה', description: '', learningLevel: 'beginner', preferredModes: ['in_person'], availableDays: ['sun'] });
check('GS5a dana creates study request', r.status === 201);
const danaSrId = r.data?.id;
r = await alice.call('GET', '/api/study-requests');
check('GS5b cross-gender study request hidden', !r.data.studyRequests.some((x) => x.id === danaSrId));
r = await dana.call('GET', '/api/study-requests');
check('GS5c dana sees own request but no men requests', r.data.studyRequests.some((x) => x.id === danaSrId) && !r.data.studyRequests.some((x) => x.id === srId));
r = await bob.call('PUT', '/api/me/profile', { displayName: 'בוב', bio: 'x', learningTopics: [], learningLevel: null, preferredModes: [], availableDays: [], availabilityNotes: '', gender: 'other' });
check('GS6 invalid gender change rejected', r.status === 400 && r.data?.error === 'invalid_gender');
// gender is immutable once set (provisional fail-closed policy): the attempt
// is rejected and every existing tie stays fully intact
r = await bob.call('PUT', '/api/me/profile', { displayName: 'בוב', bio: 'לומד גמרא', learningTopics: ['גמרא'], learningLevel: 'intermediate', preferredModes: ['video'], availableDays: ['sun', 'tue'], availabilityNotes: '', gender: 'woman' });
check('GS7 gender change rejected fail-closed', r.status === 400 && r.data?.error === 'gender_immutable', JSON.stringify(r));
r = await alice.call('GET', '/api/matches');
check('GS8 match with bob intact after rejected change', r.data.matches.length === 1 && r.data.matches[0].candidateId === bobId);
r = await alice.call('GET', `/api/connections/${connId}/contact`);
check('GS9 contact still available after rejected change', r.status === 200 && r.data.contactMethods.some((m) => m.value === '0500000000'));
r = await alice.call('GET', '/api/connections');
check('GS10 connection still accepted', r.data.connections.find((c) => c.id === connId)?.status === 'accepted');
r = await alice.call('GET', '/api/candidates');
check('GS11 alice still sees bob', r.data.candidates.some((c) => c.id === bobId));
r = await bob.call('GET', '/api/candidates');
check('GS12 bob still sees alice, not dana', r.data.candidates.some((c) => c.id === aliceId) && !r.data.candidates.some((c) => c.id === danaId));
r = await bob.call('PUT', '/api/me/profile', { displayName: 'בוב', bio: 'לומד גמרא', learningTopics: ['גמרא'], learningLevel: 'intermediate', preferredModes: ['video'], availableDays: ['sun', 'tue'], availabilityNotes: '', gender: 'man' });
check('GS13 same-gender no-op update allowed', r.status === 200);

// --- reports ---
r = await eve.call('POST', '/api/reports', { reportedUserId: bobId, reason: 'התנהגות פוגענית', details: 'פרטים' });
check('R1 report accepted', r.status === 201);
r = await eve.call('POST', '/api/reports', { reason: 'x', details: '' });
check('R2 invalid report rejected', r.status === 400);

// --- account deletion ---
r = await eve.call('DELETE', '/api/me');
check('D1 eve deletes own account', r.status === 200);
r = await eve.call('GET', '/api/me');
check('D2 deleted session is dead', r.status === 401);
r = await alice.call('GET', '/api/candidates');
check('D3 deleted user gone from candidates', !r.data.candidates.some((c) => c.id === eveId));
const eveRelog = jar();
r = await eveRelog.call('POST', '/api/auth/login', { email: 'eve@test.dev', password: pw });
check('D4 deleted user cannot login', r.status === 401);

// --- input abuse ---
r = await alice.call('PUT', '/api/me/profile', { displayName: 'א'.repeat(81), bio: '', learningTopics: [], learningLevel: null, preferredModes: [], availableDays: [], availabilityNotes: '' });
check('X1 oversized display name rejected', r.status === 400);
{
  const raw = await fetch(BASE + '/api/me/profile', { method: 'PUT', headers: { 'content-type': 'text/plain', cookie: '' }, body: 'displayName=x' });
  check('X2 non-JSON body rejected', raw.status === 400 || raw.status === 401);
  let huge = 'x'.repeat(70 * 1024);
  const raw2 = await fetch(BASE + '/api/me/profile', { method: 'PUT', headers: { 'content-type': 'application/json', cookie: alice.cookie }, body: JSON.stringify({ displayName: huge }) });
  check('X3 oversized payload rejected', raw2.status === 413 || raw2.status === 400, `status=${raw2.status}`);
  const raw3 = await fetch(BASE + '/api/interests', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{not json' });
  check('X4 malformed JSON rejected', raw3.status === 400 || raw3.status === 401);
}
// XSS-shaped input is stored as data (React escapes on render) but must not break API
r = await bob.call('PUT', '/api/me/profile', { displayName: '<b>בוב</b>', bio: '<script>alert(1)</script>', learningTopics: [], learningLevel: null, preferredModes: [], availableDays: [], availabilityNotes: '' });
check('X5 markup-shaped input handled safely', r.status === 200);
r = await alice.call('GET', '/api/candidates');
check('X6 markup returned as plain data', r.data.candidates.find((c) => c.id === bobId)?.displayName === '<b>בוב</b>');
await bob.call('PUT', '/api/me/profile', { displayName: 'בוב', bio: 'לומד גמרא', learningTopics: ['גמרא'], learningLevel: 'intermediate', preferredModes: ['video'], availableDays: ['sun', 'tue'], availabilityNotes: '' });

// --- auth rate limiting ---
const rl = jar();
let lastStatus = 0;
for (let i = 0; i < 21; i++) {
  const rr = await rl.call('POST', '/api/auth/login', { email: 'rl@test.dev', password: 'wrong-pass-123' });
  lastStatus = rr.status;
}
check('X7 login rate limit kicks in', lastStatus === 429, `last=${lastStatus}`);

// --- logout ---
r = await alice.call('POST', '/api/auth/logout');
check('L1 logout ok', r.status === 200);
r = await alice.call('GET', '/api/me');
check('L2 session gone after logout', r.status === 401);

console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
