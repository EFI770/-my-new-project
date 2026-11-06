// Visual + interactive verification of the rebuilt frontend against the dev emulator.
// Drives real Chromium through: landing -> register -> onboarding -> candidates ->
// interest -> matches -> connection -> consent -> contact reveal. Screenshots to /downloads.
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const SHOT_DIR = '/downloads';
const ts = Date.now().toString(36);
const A = { email: `a-${ts}@test.dev`, name: `דבורה לוי ${ts}` };
const B = { email: `b-${ts}@test.dev`, name: `שרה כהן ${ts}` };
const PW = 'visual-pass-123';
let pass = 0, fail = 0;
const check = (n, c, extra = '') => { if (c) { console.log(`ok - ${n}`); pass++; } else { console.log(`FAIL - ${n} ${extra}`); fail++; } };

async function apiCall(method, path, body, cookie) {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const setC = res.headers.get('set-cookie');
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data, cookie: setC ? setC.split(';')[0] : cookie };
}

// Seed user B via API (profile + contact + interest in A happens later)
let r = await apiCall('POST', '/api/auth/register', { email: B.email, password: PW, displayName: B.name, gender: 'woman' });
const bCookie = r.cookie; const bId = r.data?.userId;
await apiCall('PUT', '/api/me/profile', {
  displayName: B.name, bio: 'מחפשת חברותא נעימה לפרשת שבוע', learningTopics: ['פרשת שבוע', 'גמרא'],
  learningLevel: 'beginner', preferredModes: ['in_person', 'video'], availableDays: ['mon', 'tue'], availabilityNotes: '',
}, bCookie);
await apiCall('PUT', '/api/me/contact-methods', { methods: [{ kind: 'whatsapp', value: '050-0000000', isPrimary: true }] }, bCookie);

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none', '--lang=he'],
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); // mobile-first

// 1. landing
await page.goto(BASE, { waitUntil: 'networkidle0' });
check('V1 landing hero visible', await page.$eval('h1', (e) => e.textContent.includes('מתחברים לתורה')));
await page.screenshot({ path: `${SHOT_DIR}/rebuild-01-landing.png` });

// 2. register via UI
await page.evaluate(() => [...document.querySelectorAll('header button')].find((b) => b.textContent.includes('התחברות'))?.click());
await page.waitForSelector('form');
check('V2 auth screen opened', true);
await page.screenshot({ path: `${SHOT_DIR}/rebuild-02-auth.png` });
const [regTab] = await page.$x ? [null] : [null];
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')];
  btns.find((b) => b.textContent.trim() === 'הרשמה')?.click();
});
await page.waitForSelector('input[placeholder="למשל: יעקב כהן"]');
await page.type('input[placeholder="למשל: יעקב כהן"]', A.name);
await page.evaluate(() => [...document.querySelectorAll('form button[type="button"]')].find((b) => b.textContent.trim() === 'אישה')?.click());
check('V2b gender selected in UI', await page.evaluate(() => [...document.querySelectorAll('form button[type="button"]')].some((b) => b.textContent.trim() === 'אישה' && b.getAttribute('aria-pressed') === 'true')));
const inputs = await page.$$('form input');
await inputs[1].type(A.email);
await inputs[2].type(PW);
await page.evaluate(() => document.querySelector('form button[type="submit"]')?.click());
await page.waitForFunction(() => document.body.textContent.includes('מועמדים'), { timeout: 8000 });
check('V3 registered and landed on candidates', true);
await page.screenshot({ path: `${SHOT_DIR}/rebuild-03-candidates-empty.png` });

// 3. complete profile via UI (me tab)
await page.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('אזור אישי'))?.click());
await page.waitForSelector('textarea');
await page.type('textarea', 'אוהב ללמוד בסגנון עיון, מחפש התמדה');
await page.evaluate(() => {
  const pick = (label) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === label)?.click();
  pick('גמרא'); pick('פרשת שבוע'); pick('בינוני'); pick('וידאו'); pick('ב׳');
});
await page.screenshot({ path: `${SHOT_DIR}/rebuild-04-profile.png` });
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'שמירת פרופיל')?.click());
await page.waitForFunction(() => document.body.textContent.includes('הפרופיל נשמר'), { timeout: 8000 });
check('V4 profile saved via UI', true);

// 4. candidates: B appears, select interest
await page.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('מציאת חברותא'))?.click());
await page.waitForFunction((name) => document.body.textContent.includes(name), { timeout: 8000 }, B.name);
check('V5 candidate card visible', true);
await page.evaluate((name) => {
  const card = [...document.querySelectorAll('div.rounded-\\[20px\\]')].find((d) => d.textContent.includes(name));
  [...card.querySelectorAll('button')].find((b) => b.textContent.includes('מעוניין'))?.click();
}, B.name);
await page.waitForFunction(() => document.body.textContent.includes('✓ נבחר (פרטי)'), { timeout: 8000 });
check('V6 interest toggled in UI', true);
await page.screenshot({ path: `${SHOT_DIR}/rebuild-05-candidates.png` });

// 5. B reciprocates via API -> A sees a match
const bCand = await apiCall('GET', '/api/candidates', undefined, bCookie);
const aId = bCand.data.candidates.find((c) => c.displayName === A.name)?.id;
const rec = await apiCall('POST', '/api/interests', { candidateId: aId, interested: true }, bCookie);
check('V6b B reciprocated via API', rec.status === 200, JSON.stringify(rec));
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'התאמות')?.click());
await page.waitForFunction(() => document.body.textContent.includes('יש התאמה הדדית'), { timeout: 8000 });
check('V7 mutual match visible in UI', true);
await page.screenshot({ path: `${SHOT_DIR}/rebuild-06-match.png` });

// 6. A sends connection request via UI
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('שליחת בקשת חיבור'))?.click());
await page.type('textarea', 'נשמח לחברותא בפרשת שבוע');
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'שליחת בקשת חיבור' && b.closest('div.pt-3'))?.click());
await page.waitForFunction(() => document.body.textContent.includes('בקשת החיבור נשלחה') || document.body.textContent.includes('יוצאת'), { timeout: 8000 });
check('V8 connection request sent from UI', true);

// 7. B accepts + both consent via API; A reveals contact in UI
const bConns = await apiCall('GET', '/api/connections', undefined, bCookie);
const conn = bConns.data.connections.find((c) => c.direction === 'incoming' && c.status === 'pending');
await apiCall('POST', `/api/connections/${conn.id}/respond`, { decision: 'accepted' }, bCookie);
await apiCall('POST', `/api/connections/${conn.id}/consent`, { consent: true }, bCookie);
await page.reload({ waitUntil: 'networkidle0' });
await page.evaluate(() => [...document.querySelectorAll('nav button')].find((b) => b.textContent.includes('חיבורים'))?.click());
await page.waitForFunction(() => document.body.textContent.includes('מאושר'), { timeout: 8000 });
await page.evaluate(() => {
  const box = [...document.querySelectorAll('label')].find((l) => l.textContent.includes('מסכים'));
  box?.querySelector('input')?.click();
});
await new Promise((r) => setTimeout(r, 800));
await page.waitForFunction(() => document.body.textContent.includes('הצגת פרטי קשר'), { timeout: 8000 });
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('הצגת פרטי קשר'))?.click());
await page.waitForFunction(() => document.body.textContent.includes('050-0000000'), { timeout: 8000 });
check('V9 contact revealed in UI after mutual consent', true);
await page.screenshot({ path: `${SHOT_DIR}/rebuild-07-contact.png`, fullPage: true });

// 8. RTL + direction sanity
const dir = await page.evaluate(() => document.documentElement.dir);
check('V10 document is RTL', dir === 'rtl');

// 9. language switch: Hebrew -> English -> Hebrew
await page.evaluate(() => document.querySelector('button[aria-label*="Switch language"]')?.click());
await new Promise((r) => setTimeout(r, 500));
check('V11a English switches direction to LTR', await page.evaluate(() => document.documentElement.dir === 'ltr' && document.documentElement.lang === 'en'));
check('V11b English UI strings render', await page.evaluate(() => document.body.textContent.includes('Connections')));
await page.screenshot({ path: `${SHOT_DIR}/rebuild-08-english.png` });
await page.evaluate(() => document.querySelector('button[aria-label*="Switch language"]')?.click());
await new Promise((r) => setTimeout(r, 500));
check('V12 switching back restores RTL Hebrew', await page.evaluate(() => document.documentElement.dir === 'rtl' && document.body.textContent.includes('חיבורים')));

await browser.close();
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
