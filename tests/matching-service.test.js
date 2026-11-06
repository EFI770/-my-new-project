import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatchingService, createMemoryDb } from '../src/services/matchingService.js';

const profiles = [
  { id: 'u1', displayName: 'אבי', topic: 'גמרא', level: 'מתקדם', times: ['בוקר'], about: '', active: true, phone: '050-SECRET', email: 'avi@x.com' },
  { id: 'u2', displayName: 'ברוך', topic: 'גמרא', level: 'מתקדם', times: ['בוקר'], active: true, phone: '052-SECRET' },
  { id: 'u3', displayName: 'גד', topic: 'הלכה', level: 'מתחיל', times: ['ערב'], active: false },
];

const svc = (interests) => createMatchingService(createMemoryDb({ profiles, interests }));

test('cards exclude the viewer, inactive profiles, and identifying fields', async () => {
  const cards = await svc([]).listCandidateCards('u1', { topics: ['גמרא'] });
  assert.equal(cards.length, 1);
  assert.equal(cards[0].id, 'u2');
  assert.equal('phone' in cards[0], false);
  assert.equal('email' in cards[0], false);
  assert.equal('active' in cards[0], false);
});

test('isMatch true only on mutual interest', async () => {
  assert.equal(await svc([{ from: 'u1', to: 'u2', interested: true }]).isMatch('u1', 'u2'), false);
  assert.equal(await svc([
    { from: 'u1', to: 'u2', interested: true },
    { from: 'u2', to: 'u1', interested: true },
  ]).isMatch('u1', 'u2'), true);
  assert.equal(await svc([
    { from: 'u1', to: 'u2', interested: true },
    { from: 'u2', to: 'u1', interested: false },
  ]).isMatch('u1', 'u2'), false);
});

test('isMatch never matches self', async () => {
  assert.equal(await svc([{ from: 'u1', to: 'u1', interested: true }]).isMatch('u1', 'u1'), false);
});

test('mayContact requires mutual interest AND both consents AND both active', async () => {
  const both = [
    { from: 'u1', to: 'u2', interested: true, contactConsent: true },
    { from: 'u2', to: 'u1', interested: true, contactConsent: true },
  ];
  assert.equal(await svc(both).mayContact('u1', 'u2'), true);

  const oneConsentMissing = [
    { from: 'u1', to: 'u2', interested: true, contactConsent: true },
    { from: 'u2', to: 'u1', interested: true }, // contactConsent unknown
  ];
  assert.equal(await svc(oneConsentMissing).mayContact('u1', 'u2'), false);

  const noInterest = [
    { from: 'u1', to: 'u2', interested: true, contactConsent: true },
    { from: 'u2', to: 'u1', interested: false, contactConsent: true },
  ];
  assert.equal(await svc(noInterest).mayContact('u1', 'u2'), false);
});

test('mayContact fails closed when candidate is inactive', async () => {
  const both = [
    { from: 'u1', to: 'u3', interested: true, contactConsent: true },
    { from: 'u3', to: 'u1', interested: true, contactConsent: true },
  ];
  assert.equal(await svc(both).mayContact('u1', 'u3'), false);
});
