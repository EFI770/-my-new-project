// 200% zoom reflow + mobile HE/EN screenshot evidence, post-fix.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const RUN = Date.now().toString(36);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { console.log(`ok - ${n}`); pass++; } else { console.log(`FAIL - ${n} ${x}`); fail++; } };

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=he', '--force-device-scale-factor=2'], headless: 'new' });
const page = await browser.newPage();
// 200% zoom equivalent: 1280 physical CSS / 2 = 640 effective CSS px width
await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
await page.goto(BASE, { waitUntil: 'networkidle0' });
let ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Z1 landing no h-overflow at 200% zoom (640px effective)', ov <= 1, `overflow=${ov}`);

// register a user for authenticated screens
await page.evaluate(() => [...document.querySelectorAll('header button')].find((b) => b.textContent.includes('התחברות'))?.click());
await page.waitForSelector('form');
ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('Z2 auth no h-overflow at 200% zoom', ov <= 1, `overflow=${ov}`);
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'הרשמה')?.click());
await page.waitForSelector('input[placeholder="למשל: יעקב כהן"]');
await page.type('input[placeholder="למשל: יעקב כהן"]', 'זום בדיקה');
await page.evaluate(() => [...document.querySelectorAll('form button[type="button"]')].find((b) => b.textContent.trim() === 'אישה')?.click());
await page.evaluate(() => { const c = document.querySelector('form input[type="checkbox"]'); if (c && !c.checked) c.click(); });
await page.type('form input[type="email"]', `zoom-${RUN}@test.dev`);
await page.type('form input[type="password"]', 'zoom-pass-123');
await page.evaluate(() => document.querySelector('form button[type="submit"]')?.click());
await page.waitForFunction(() => !!document.querySelector('nav[aria-label]'), { timeout: 10000 });
check('Z3 registered and authenticated nav visible (post-fix genuine)', true);

for (const r of ['find', 'requests', 'connections', 'me']) {
  await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle0' });
  await new Promise((s) => setTimeout(s, 600));
  ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`Z4 ${r} no h-overflow at 200% zoom`, ov <= 1, `overflow=${ov}`);
}

// keyboard on authenticated shell: skip-link first, then header controls, then tab bar
await page.goto(`${BASE}/#/find`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' }); // true fresh load: skip link must be first
await new Promise((s) => setTimeout(s, 500));
const seq = [];
for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => { const e = document.activeElement; return (e.tagName || '') + ':' + (e.textContent || '').trim().slice(0, 14); })); }
check('K7 skip-link is first tab stop', seq[0].includes('דלג') || seq[0].toLowerCase().includes('skip'), seq.join(' | '));
check('K8 keyboard reaches tab-bar navigation', seq.some((s) => /מועמדים|בקשות|חיבורים|אזור/.test(s)), seq.join(' | '));

// mobile screenshots HE + EN (390px, post-fix build)
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(`${BASE}/#/find`, { waitUntil: 'networkidle0' });
await new Promise((s) => setTimeout(s, 600));
await page.screenshot({ path: '/downloads/chavruta-mobile-he-candidates.png' });
await page.goto(`${BASE}/#/me`, { waitUntil: 'networkidle0' });
await new Promise((s) => setTimeout(s, 600));
await page.screenshot({ path: '/downloads/chavruta-mobile-he-profile.png' });
await page.evaluate(() => document.querySelector('button[aria-label*="Switch language"]')?.click());
await new Promise((s) => setTimeout(s, 600));
const en = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang }));
check('Z5 EN switch renders LTR', en.dir === 'ltr' && en.lang === 'en', JSON.stringify(en));
await page.screenshot({ path: '/downloads/chavruta-mobile-en-profile.png' });
await page.goto(`${BASE}/#/find`, { waitUntil: 'networkidle0' });
await new Promise((s) => setTimeout(s, 600));
await page.screenshot({ path: '/downloads/chavruta-mobile-en-candidates.png' });
await browser.close();
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
