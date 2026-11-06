// Narrow-width + keyboard verification (320px, smallest common mobile).
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { console.log(`ok - ${n}`); pass++; } else { console.log(`FAIL - ${n} ${x}`); fail++; } };

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=he'],
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 320, height: 568, deviceScaleFactor: 2 });

await page.goto(BASE, { waitUntil: 'networkidle0' });
const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('K1 no horizontal page overflow at 320px', overflow <= 1, `overflow=${overflow}px`);
await page.screenshot({ path: '/downloads/rebuild-a11y-landing-320.png' });

// keyboard: tab from top reaches the auth CTA, Enter activates it
await page.keyboard.press('Tab');
await page.keyboard.press('Tab');
const secondFocus = await page.evaluate(() => document.activeElement?.textContent?.trim());
check('K2 auth button reachable by keyboard', (secondFocus || '').includes('התחברות'), `got "${secondFocus}"`);
await page.keyboard.press('Enter');
await page.waitForSelector('form', { timeout: 8000 });
check('K3 auth form opened via keyboard', true);

// tab through form fields in order
const order = [];
for (let i = 0; i < 8; i++) {
  await page.keyboard.press('Tab');
  order.push(await page.evaluate(() => document.activeElement?.tagName + ':' + (document.activeElement?.type || document.activeElement?.textContent?.trim()?.slice(0, 12))));
}
check('K4 tab order reaches email, password, submit', order.some((o) => o.includes('email')) && order.some((o) => o.includes('password')) && order.some((o) => o.includes('submit')), order.join(' | '));

// focus visibility: focused element has a visible outline
await page.evaluate(() => document.querySelector('input[type="email"]')?.focus());
const outline = await page.evaluate(() => {
  const el = document.activeElement;
  const s = getComputedStyle(el);
  return s.outlineWidth !== '0px' && s.outlineStyle !== 'none';
});
check('K5 focused input has visible outline', outline);

// overflow check on auth page too
const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check('K6 no horizontal overflow on auth at 320px', overflow2 <= 1, `overflow=${overflow2}px`);
await page.screenshot({ path: '/downloads/rebuild-a11y-auth-320.png' });

await browser.close();
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
