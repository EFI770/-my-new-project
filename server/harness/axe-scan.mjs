// axe-core WCAG 2.x A/AA scan across all screens, dev emulator.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const RUN = Date.now().toString(36);
const email = `a11y-axe-${RUN}@example.com`;

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=he'],
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

async function scan(name) {
  await new Promise((r) => setTimeout(r, 700));
  const res = await page.evaluate(async () => {
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, target: v.nodes[0]?.target?.join(' ') || '' }));
  });
  if (res.length === 0) { console.log(`ok - ${name}: 0 violations`); return 0; }
  for (const v of res) console.log(`VIOLATION [${name}] ${v.id} impact=${v.impact} nodes=${v.n} first=${v.target}`);
  return res.length;
}
async function inject() { await page.addScriptTag({ path: new URL('../node_modules/axe-core/axe.min.js', import.meta.url).pathname }); }

let total = 0;
await page.goto(BASE, { waitUntil: 'networkidle0' });
await inject();
total += await scan('landing');

// open auth, scan register form (with 18+ checkbox)
await page.evaluate(() => { [...document.querySelectorAll('button,a')].find((e) => e.textContent.includes('התחברות'))?.click(); });
await page.waitForSelector('form', { timeout: 8000 });
await inject();
total += await scan('auth-login-form');
// switch to register mode via the exact toggle
await page.evaluate(() => { [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'הרשמה' && e.closest('div.grid'))?.click(); });
await new Promise((r) => setTimeout(r, 500));
await inject();
total += await scan('auth-register-form');

// register via UI (includes 18+ attestation checkbox)
await page.type('form input:not([type])', 'Axe בודק'); // display name
await page.evaluate(() => { const b = [...document.querySelectorAll('form button[aria-pressed]')]; b[0]?.click(); }); // gender
await page.type('input[type="email"]', email);
await page.type('input[type="password"]', 'Axe-Test-1234');
await page.evaluate(() => { const c = document.querySelector('input[type="checkbox"]'); if (c && !c.checked) c.click(); });
await page.evaluate(() => { document.querySelector('form button[type="submit"]')?.click(); });
await new Promise((r) => setTimeout(r, 3000));
const loggedIn = await page.evaluate(() => !!document.querySelector('nav[aria-label]') && !document.querySelector('form input[type="password"]'));
if (!loggedIn) {
  const err = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent || 'no alert');
  console.log('FAIL - register via UI did not complete: ' + err);
  await browser.close(); process.exit(1);
}
console.log('ok - registered via UI (18+ checkbox + gender toggle)');

for (const r of ['profile', 'candidates', 'matches', 'requests', 'connections']) {
  await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle0' }).catch(() => {});
  await page.reload({ waitUntil: 'networkidle0' }).catch(() => {});
  await inject();
  total += await scan(`screen-${r}`);
}
await browser.close();
console.log(`TOTAL_VIOLATIONS=${total}`);
process.exit(0);
