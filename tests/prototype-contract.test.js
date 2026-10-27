import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the page declares Hebrew RTL document semantics', async () => {
  const html = await read('../index.html');
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.match(html, /<meta name="viewport"/);
});

test('the live entry page warns against real-user registration', async () => {
  const html = await read('../index.html');
  assert.match(html, /גרסת הדגמה/);
  assert.match(html, /אין להזין פרטים אישיים/);
});

test('the entry page references the checked-in stylesheet and app bundle', async () => {
  const html = await read('../index.html');
  assert.match(html, /\.\/assets\/styles\.css/);
  assert.match(html, /\.\/assets\/app\.js/);
  await read('../assets/styles.css');
  await read('../assets/app.js');
});

test('package test command uses the built-in Node test runner', async () => {
  const pkg = JSON.parse(await read('../package.json'));
  assert.equal(pkg.scripts?.test, 'node --test');
  assert.ok(Number.parseInt(pkg.engines?.node?.replace(/^>=\s*/, ''), 10) >= 18);
});
