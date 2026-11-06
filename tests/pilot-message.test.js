import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMessage, isValid, whatsappUrl } from '../src/pilotMessage.js';

test('message contains all fields in Hebrew', () => {
  const m = buildMessage({ name: 'דוד כהן', topic: 'מסכת ברכות', level: 'מתקדם', days: 'ב,ה', hours: '21:00', mode: 'טלפון', notes: 'רק בלי שאלות קשות' });
  for (const part of ['שם: דוד כהן', 'נושא לימוד: מסכת ברכות', 'רמה: מתקדם', 'ימים מתאימים: ב,ה', 'שעות מתאימות: 21:00', 'אופן לימוד: טלפון', 'הערות: רק בלי שאלות קשות']) {
    assert.ok(m.includes(part), 'missing: ' + part);
  }
});

test('notes omitted when empty; fields truncated to limits', () => {
  const m = buildMessage({ name: 'אב', topic: 'גמרא', level: '', days: '', hours: '', mode: '' });
  assert.ok(!m.includes('הערות'));
  assert.ok(buildMessage({ name: 'x'.repeat(500), topic: 'גמרא' }).length < 700);
});

test('validation requires name and topic', () => {
  assert.ok(isValid({ name: 'דוד', topic: 'גמרא' }));
  assert.ok(!isValid({ name: '', topic: 'גמרא' }));
  assert.ok(!isValid({ name: 'דוד', topic: '' }));
});

test('whatsappUrl encodes the message and strips non-digits; empty phone gives empty url', () => {
  const url = whatsappUrl('+972-50-000-0000', 'שלום עולם');
  assert.ok(url.startsWith('https://wa.me/972500000000?text='));
  assert.ok(url.includes(encodeURIComponent('שלום עולם')));
  assert.equal(whatsappUrl('', 'x'), '');
});
