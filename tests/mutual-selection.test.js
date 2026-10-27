import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canInitiateContact, isMutualInterest, rankCandidates, toPublicCandidateCard,
} from '../src/domain/mutualSelection.js';

test('one-sided interest never counts as a mutual match', () => {
  assert.equal(isMutualInterest({ viewerInterested: true, candidateInterested: false }), false);
  assert.equal(isMutualInterest({ viewerInterested: false, candidateInterested: true }), false);
  assert.equal(isMutualInterest({ viewerInterested: true, candidateInterested: true }), true);
});

test('contact requires mutual interest and separate consent from both users', () => {
  const mutual = { viewerInterested: true, candidateInterested: true };
  assert.equal(canInitiateContact({ ...mutual, viewerContactConsent: true, candidateContactConsent: true }), true);
  assert.equal(canInitiateContact({ ...mutual, viewerContactConsent: true, candidateContactConsent: false }), false);
  assert.equal(canInitiateContact({ ...mutual, viewerContactConsent: false, candidateContactConsent: true }), false);
  assert.equal(canInitiateContact({ ...mutual, viewerContactConsent: true }), false);
});

test('contact fails closed if either account is inactive', () => {
  const consented = { viewerInterested: true, candidateInterested: true, viewerContactConsent: true, candidateContactConsent: true };
  assert.equal(canInitiateContact({ ...consented, candidateActive: false }), false);
  assert.equal(canInitiateContact({ ...consented, viewerActive: false }), false);
});

test('ranking excludes inactive profiles and prioritizes preferences', () => {
  const candidates = [
    { id: 'a', active: true, topic: 'Shabbat', level: 'intermediate', times: ['evening'] },
    { id: 'b', active: true, topic: 'Berachot', level: 'beginner', times: ['morning'] },
    { id: 'c', active: false, topic: 'Shabbat', level: 'intermediate', times: ['evening'] },
  ];
  const ranked = rankCandidates(candidates, { topics: ['Shabbat'], levels: ['intermediate'], times: ['evening'] });
  assert.deepEqual(ranked.map((candidate) => candidate.id), ['a', 'b']);
  assert.equal(ranked[0].matchScore, 6);
});

test('public card strips phone, email, address and private interest flags', () => {
  const card = toPublicCandidateCard({
    id: 'a', displayName: 'משתמשת לדוגמה', topic: 'Shabbat', level: 'intermediate', times: ['evening'],
    phone: '+972500000000', email: 'private@example.test', address: 'private address',
    viewerInterested: true, candidateInterested: false,
  });
  assert.deepEqual(Object.keys(card).sort(), ['about', 'displayName', 'id', 'level', 'times', 'topic'].sort());
  assert.equal('phone' in card, false);
  assert.equal('email' in card, false);
  assert.equal('viewerInterested' in card, false);
});

test('unknown consent or interest values fail closed', () => {
  assert.equal(isMutualInterest({ viewerInterested: true, candidateInterested: undefined }), false);
  assert.equal(canInitiateContact({
    viewerInterested: true,
    candidateInterested: true,
    viewerContactConsent: 'yes',
    candidateContactConsent: true,
  }), false);
});
