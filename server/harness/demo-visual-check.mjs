// Visual + a11y verification of the synthetic demo-entry buttons on the gated
// worker preview (real workerd via wrangler dev, demo ON). Screenshots to /downloads.
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:8787';
const GATE = process.env.GATE;
let pass = 0, fail = 0;
const check = (n, c, extra = '') => { if (c) { console.log(`ok - ${n}`); pass++; } else { console.log(`FAIL - ${n} ${extra}`); fail++; } };

// Get a gate cookie the way a browser user would.
const form = new FormData(); form.set('key', GATE);
const gr = await fetch(BASE + '/__gate', { method: 'POST', body: form, redirect: 'manual' });
const gateCookie = (gr.headers.get('set-cookie') || '').split(';')[0];
check('gate form grants cookie', gr.status === 303 && gateCookie.startsWith('preview_gate='), String(gr.status));

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=he'],
  headless: 'new',
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });

// 1. Unauthenticated root must be the gate page (403), not the app.
const resp = await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
check('unauth root gated (403)', resp.status() === 403, String(resp.status()));
await page.screenshot({ path: '/downloads/demo-gate-page.png' });

// 2. With the gate cookie: Auth screen shows the demo block.
await page.setCookie({ name: gateCookie.split('=')[0], value: gateCookie.split('=').slice(1).join('='), domain: '127.0.0.1' });
await page.goto(BASE + '/', { waitUntil: 'networkidle0' });
await new Promise((r) => setTimeout(r, 800));
// Landing -> Auth screen via the sign-in/register button.
await page.evaluate(() => { [...document.querySelectorAll('button, a')].find((b) => b.innerText.includes('התחברות')).click(); });
await new Promise((r) => setTimeout(r, 1500));
const texts = await page.evaluate(() => document.body.innerText);
check('demo title visible', texts.includes('תצוגת דמו סינתטית'));
check('4 named demo buttons visible', ['אברהם','יעקב','שרה','רבקה'].every((n) => texts.includes('כניסה כ' + n)));
check('demo-only note visible', texts.includes('ההרשמה וההתחברות עם סיסמה כבויות'));
const pwdInputs = await page.evaluate(() => document.querySelectorAll('input[type=password], input[type=email]').length);
check('password/email form hidden in demo mode', pwdInputs === 0, String(pwdInputs));

// 3. Keyboard: both demo buttons are real buttons, focusable, with accessible names.
const btnInfo = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button')].filter((b) => b.innerText.includes('כניסה כ'));
  return btns.map((b) => ({ tag: b.tagName, type: b.type, disabled: b.disabled, name: b.innerText.trim(), tabbable: b.tabIndex >= 0 }));
});
check('four demo buttons present', btnInfo.length === 4, JSON.stringify(btnInfo));
check('demo buttons are enabled native buttons', btnInfo.every((b) => b.tag === 'BUTTON' && !b.disabled && b.tabbable));

// 4. axe WCAG scan of the auth screen with the demo block rendered.
await page.addScriptTag({ path: new URL('../node_modules/axe-core/axe.min.js', import.meta.url).pathname });
const viol = await page.evaluate(async () => {
  const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
  return r.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length }));
});
check('axe auth screen 0 violations', viol.length === 0, JSON.stringify(viol));
await page.screenshot({ path: '/downloads/demo-auth-screen.png', fullPage: true });

// 5. Click "demo man" -> synthetic session -> lands past the auth screen.
await page.evaluate(() => { [...document.querySelectorAll('button')].find((b) => b.innerText.includes('כניסה כאברהם')).click(); });
await new Promise((r) => setTimeout(r, 2500));
const after = await page.evaluate(() => ({ url: location.pathname, text: document.body.innerText.slice(0, 400) }));
check('demo man login leaves auth screen', !after.text.includes('כניסה כאברהם'), after.text.slice(0, 120));
await page.screenshot({ path: '/downloads/demo-after-login.png', fullPage: true });

await browser.close();
console.log(`PASS=${pass} FAIL=${fail}`);
process.exit(fail ? 1 : 0);
