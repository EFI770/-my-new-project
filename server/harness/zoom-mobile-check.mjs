// Zoom-equivalent reflow + mobile evidence, post-fix.
// Z-series: 640 CSS px layout viewport = 1280 CSS px browser window at 200%
// browser zoom (layout-viewport equivalent; not deviceScaleFactor).
// R-series: 320 CSS px reflow (WCAG 1.4.10) incl. authenticated routes.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const RUN = Date.now().toString(36);
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { console.log(`ok - ${n}`); pass++; } else { console.log(`FAIL - ${n} ${x}`); fail++; } };
const noOverflow = async (page, name) => {
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${name} no h-overflow`, ov <= 1, `overflow=${ov}px`);
};

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=he'], headless: 'new' });
const page = await browser.newPage();

// ---- Z: 640 CSS px (200% zoom equivalent) ----
await page.setViewport({ width: 640, height: 800, deviceScaleFactor: 1 });
await page.goto(BASE, { waitUntil: 'networkidle0' });
await noOverflow(page, 'Z1 landing @640css (200% zoom equiv)');
await page.evaluate(() => [...document.querySelectorAll('header button')].find((b) => b.textContent.includes('התחברות'))?.click());
await page.waitForSelector('form');
await noOverflow(page, 'Z2 auth @640css');
// register
await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'הרשמה')?.click());
await page.waitForSelector('input[placeholder="למשל: יעקב כהן"]');
await page.type('input[placeholder="למשל: יעקב כהן"]', 'זום בדיקה');
await page.evaluate(() => [...document.querySelectorAll('form button[type="button"]')].find((b) => b.textContent.trim() === 'אישה')?.click());
await page.evaluate(() => { const c = document.querySelector('form input[type="checkbox"]'); if (c && !c.checked) c.click(); });
await page.type('form input[type="email"]', `zoom-${RUN}@test.dev`);
await page.type('form input[type="password"]', 'zoom-pass-123');
await page.evaluate(() => document.querySelector('form button[type="submit"]')?.click());
await page.waitForFunction(() => !!document.querySelector('nav[aria-label]'), { timeout: 10000 });
check('Z3 registered, authenticated nav visible', true);
for (const r of ['find', 'requests', 'connections', 'me']) {
  await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise((s) => setTimeout(s, 500));
  await noOverflow(page, `Z4 ${r} @640css (200% zoom equiv)`);
}
// readability at 640: all nav buttons fully inside viewport, no clipped text
const navOk = await page.evaluate(() => {
  const nav = document.querySelector('nav[aria-label]');
  return [...nav.querySelectorAll('button')].every((b) => {
    const r = b.getBoundingClientRect();
    return r.left >= 0 && r.right <= innerWidth && r.height >= 44 && b.scrollWidth <= b.clientWidth + 1;
  });
});
check('Z5 nav buttons unclipped, >=44px tall @640css', navOk);
await page.goto(`${BASE}/#/me`, { waitUntil: 'networkidle0' });
await new Promise((s) => setTimeout(s, 500));
await page.screenshot({ path: '/downloads/chavruta-zoom200-profile.png' });

// ---- R: 320 CSS px reflow incl. authenticated routes ----
await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 1 });
for (const r of ['find', 'requests', 'connections', 'me']) {
  await page.goto(`${BASE}/#/${r}`, { waitUntil: 'networkidle0' });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise((s) => setTimeout(s, 500));
  await noOverflow(page, `R1 ${r} @320css reflow`);
}

// ---- keyboard on fresh load ----
await page.goto(`${BASE}/#/find`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((s) => setTimeout(s, 500));
const seq = [];
for (let i = 0; i < 5; i++) { await page.keyboard.press('Tab'); seq.push(await page.evaluate(() => { const e = document.activeElement; return (e.tagName || '') + ':' + (e.textContent || '').trim().slice(0, 14); })); }
check('K7 skip-link is first tab stop', seq[0].includes('דלג') || seq[0].toLowerCase().includes('skip'), seq.join(' | '));
check('K8 keyboard reaches tab-bar navigation', seq.some((s) => /מועמדים|בקשות|חיבורים|אזור/.test(s)), seq.join(' | '));

// ---- mobile 390px: nav spacing/touch + last-field clearance + HE/EN shots ----
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await page.goto(`${BASE}/#/find`, { waitUntil: 'networkidle0' });
await page.reload({ waitUntil: 'networkidle0' });
await new Promise((s) => setTimeout(s, 500));
await page.screenshot({ path: '/downloads/chavruta-mobile-he-candidates.png' });
// EN switch
await page.evaluate(() => document.querySelector('button[aria-label*="Switch language"]')?.click());
await new Promise((s) => setTimeout(s, 500));
const en = await page.evaluate(() => ({ dir: document.documentElement.dir, lang: document.documentElement.lang }));
check('M1 EN switch renders LTR', en.dir === 'ltr' && en.lang === 'en', JSON.stringify(en));
await page.screenshot({ path: '/downloads/chavruta-mobile-en-candidates.png' });
const navGeom = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('nav[aria-label] button')].map((b) => { const r = b.getBoundingClientRect(); return { l: r.left, r: r.right, h: r.height, clipped: b.scrollWidth > b.clientWidth + 1 }; });
  let overlap = false;
  for (let i = 1; i < btns.length; i++) if (btns[i].l < btns[i - 1].r - 1) overlap = true;
  return { overlap, minH: Math.min(...btns.map((b) => b.h)), clipped: btns.some((b) => b.clipped) };
});
check('M2 EN nav labels no overlap, no clipping, >=44px targets', !navGeom.overlap && !navGeom.clipped && navGeom.minH >= 44, JSON.stringify(navGeom));
// profile: last control must scroll clear of the fixed nav
await page.goto(`${BASE}/#/me`, { waitUntil: 'networkidle0' });
await new Promise((s) => setTimeout(s, 600));
const clearance = await page.evaluate(() => {
  window.scrollTo(0, document.body.scrollHeight);
  const nav = document.querySelector('nav[aria-label]').getBoundingClientRect();
  const controls = [...document.querySelectorAll('main input, main textarea, main select, main button')];
  const last = controls[controls.length - 1].getBoundingClientRect();
  return { gap: nav.top - last.bottom };
});
check('M3 last profile control scrolls clear of fixed nav', clearance.gap >= 8, `gap=${clearance.gap}px`);
await page.screenshot({ path: '/downloads/chavruta-mobile-en-profile.png', fullPage: false });
await page.evaluate(() => document.querySelector('button[aria-label*="מעבר לשפה"]')?.click());
await new Promise((s) => setTimeout(s, 500));
await page.goto(`${BASE}/#/me`, { waitUntil: 'networkidle0' });
await new Promise((s) => setTimeout(s, 400));
await page.screenshot({ path: '/downloads/chavruta-mobile-he-profile.png' });
await browser.close();
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
