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
const btn = await page.evaluate(() => { const a = [...document.querySelectorAll('a')].find((e) => e.href.includes('sign-in/social')); return a ? { text: a.textContent.trim(), href: a.href } : null; });
check(`Google button ${EXPECT ? 'rendered' : 'NOT rendered'}`, EXPECT ? !!btn : btn === null, JSON.stringify(btn));
if (EXPECT && btn) {
  check('button text localized', btn.text.includes('Google'), btn.text);
  const u = new URL(btn.href);
  check('button targets vendor social endpoint', u.pathname.endsWith('/sign-in/social') && u.searchParams.get('provider') === 'google' && !!u.searchParams.get('callbackURL'), btn.href);
}
await browser.close();
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
