/**
 * Vendor-neutral matching service. All persistence goes through a small db
 * adapter interface so the same code runs on Supabase (Postgres+RLS),
 * Cloudflare D1 (SQLite), or the in-memory stub used in tests.
 *
 * Adapter contract:
 *   listProfiles({ activeOnly }) -> Promise<profile[]>
 *   getInterest(viewerId, candidateId) -> Promise<{interested: bool|null, contactConsent: bool|null}|null>
 *   isActive(userId) -> Promise<bool>
 *
 * Privacy rules come from src/domain/mutualSelection.js (fail-closed).
 */
import { isMutualInterest, canInitiateContact, rankCandidates, toPublicCandidateCard } from '../domain/mutualSelection.js';

export function createMatchingService(db) {
  return {
    /** Public candidate cards for a viewer: self excluded, inactive excluded, only allowlisted fields. */
    async listCandidateCards(viewerId, preferences = {}) {
      const profiles = await db.listProfiles({ activeOnly: true });
      const others = profiles.filter((p) => p.id !== viewerId);
      return rankCandidates(others, preferences).map(toPublicCandidateCard);
    },

    /** True only when interest is mutual. Unknown/null interest fails closed. */
    async isMatch(viewerId, candidateId) {
      if (viewerId === candidateId) return false;
      const [a, b] = await Promise.all([
        db.getInterest(viewerId, candidateId),
        db.getInterest(candidateId, viewerId),
      ]);
      return isMutualInterest({
        viewerInterested: a?.interested,
        candidateInterested: b?.interested,
      });
    },

    /**
     * Gate for revealing ANY contact channel. Fail-closed on unknown consent
     * or inactive accounts. Never returns the contact details themselves.
     */
    async mayContact(viewerId, candidateId) {
      if (viewerId === candidateId) return false;
      const [a, b, viewerActive, candidateActive] = await Promise.all([
        db.getInterest(viewerId, candidateId),
        db.getInterest(candidateId, viewerId),
        db.isActive(viewerId),
        db.isActive(candidateId),
      ]);
      return canInitiateContact({
        viewerInterested: a?.interested,
        candidateInterested: b?.interested,
        viewerContactConsent: a?.contactConsent,
        candidateContactConsent: b?.contactConsent,
        viewerActive,
        candidateActive,
      });
    },
  };
}

/** In-memory adapter for tests and local development. */
export function createMemoryDb({ profiles = [], interests = [] } = {}) {
  const key = (a, b) => `${a}->${b}`;
  const interestMap = new Map(interests.map((i) => [key(i.from, i.to), i]));
  return {
    async listProfiles({ activeOnly = true } = {}) {
      return profiles.filter((p) => !activeOnly || p.active !== false);
    },
    async getInterest(from, to) {
      return interestMap.get(key(from, to)) ?? null;
    },
    async isActive(id) {
      const p = profiles.find((x) => x.id === id);
      return !!p && p.active !== false;
    },
  };
}
