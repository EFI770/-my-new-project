// OAuth code-prep verification: provider discovery + gated button rendering.
import puppeteer from 'puppeteer-core';
const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const EXPECT = process.env.EXPECT_GOOGLE === '1';
let pass = 0, fail = 0;
const check = (n, c, x = '') => { if (c) { console.log(`ok - ${n}`); pass++; } else { console.log(`FAIL - ${n} ${x}`); fail++; } };

const res = await fetch(BASE + '/api/auth/providers');
const body = await res.json();
check('providers endpoint 200', res.status === 200);
check('email provider always enabled', body.email?.enabled === true);
check(`google.enabled === ${EXPECT}`, body.google?.enabled === EXPECT, JSON.stringify(body));
if (EXPECT) check('google.authUrl exposed when enabled', typeof body.google?.authUrl === 'string' && body.google.authUrl.length > 0);
if (!EXPECT) check('google.authUrl null when disabled', body.google?.authUrl === null);

const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage', '--lang=he'], headless: 'new' });
const page = await browser.newPage();
await page.goto(BASE + '/#/auth', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));
const btn = await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((e) => e.textContent.includes('Google')); return b ? b.textContent.trim() : null; });
check(`Google button ${EXPECT ? 'rendered' : 'NOT rendered'}`, EXPECT ? !!btn : btn === null, String(btn));
if (EXPECT && btn) {
  check('button text localized', btn.includes('Google'), btn);
  // intercept the vendor POST and the redirect target; assert POST shape + navigation
  await page.setRequestInterception(true);
  const seen = { post: null };
  page.on('request', (req) => {
    const u = req.url();
    if (u.includes('/sign-in/social')) {
      if (req.method() === 'OPTIONS') {
        req.respond({ status: 204, headers: {
          'access-control-allow-origin': req.headers()['origin'] || '*',
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
        }, body: '' });
      } else {
        seen.post = { method: req.method(), body: req.postData() };
        req.respond({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': req.headers()['origin'] || '*' }, body: JSON.stringify({ url: 'https://oauth-init.invalid/start', redirect: true }) });
      }
    } else if (u.startsWith('https://oauth-init.invalid/')) {
      req.respond({ status: 200, contentType: 'text/html', body: '<title>init</title>' });
    } else { req.continue(); }
  });
  await page.evaluate(() => { [...document.querySelectorAll('button')].find((e) => e.textContent.includes('Google'))?.click(); });
  await new Promise((r) => setTimeout(r, 2500));
  check('button POSTs to vendor social endpoint', seen.post?.method === 'POST' && seen.post.body?.includes('"provider":"google"') && seen.post.body?.includes('callbackURL'), JSON.stringify(seen.post));
  check('browser follows the returned init URL', page.url().startsWith('https://oauth-init.invalid/'), page.url());
}
await browser.close();
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
