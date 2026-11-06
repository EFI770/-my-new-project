import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--lang=he'], headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 360, height: 640 });
const AXE = '/tmp/-my-new-project/server/node_modules/axe-core/axe.min.js';
let total = 0;
for (const route of ['privacy', 'accessibility']) {
  await page.goto(`http://127.0.0.1:4173/#/${route}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 500));
  await page.addScriptTag({ path: AXE });
  const v = await page.evaluate(async () => {
    const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] } });
    return r.violations.map((x) => `${x.id}(${x.impact})`);
  });
  const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent);
  console.log(`${route}: violations=${v.length} h1="${h1}" ${v.join(', ')}`);
  total += v.length;
}
await page.goto('http://127.0.0.1:4173/#/', { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 500));
await page.addScriptTag({ path: AXE });
const lv = await page.evaluate(async () => { const r = await axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'] } }); return r.violations.length; });
console.log(`landing(with new footer links): violations=${lv}`);
await browser.close();
console.log(`TOTAL=${total + lv}`);
process.exit(total + lv ? 1 : 0);
