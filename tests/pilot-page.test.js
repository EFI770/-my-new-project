import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../pilot.html', import.meta.url), 'utf8');

test('pilot page is RTL Hebrew and self-contained (no external scripts/styles)', () => {
  assert.match(html, /<html lang="he" dir="rtl">/);
  assert.ok(!/<script[^>]+src="https?:/i.test(html), 'no external scripts');
  assert.ok(!/<link[^>]+href="https?:/i.test(html), 'no external styles');
  assert.match(html, /<script type="module">/);
});

test('pilot page collects the fields needed for manual matching', () => {
  for (const id of ['name', 'topic', 'level', 'days', 'hours', 'mode', 'notes']) {
    assert.ok(html.includes('id="' + id + '"'), 'missing field ' + id);
  }
});

test('pilot page states no data is stored and send is user-initiated', () => {
  assert.match(html, /לא נשמרים באתר/);
  assert.match(html, /wa\.me|whatsappUrl/);
});

test('no real phone number ships in the page (copy mode until explicit approval)', () => {
  assert.ok(!/\d{10,}/.test(html.replace(/maxlength=\"\d+\"/g, '')), 'no 10+ digit number');
  assert.match(html, /const COORDINATOR_PHONE = ''/);
  assert.match(html, /העתקת ההודעה/);
  assert.match(html, /אישור מפורש/);
});
