/**
 * Privacy-first selection rules for the Chavruta matching flow.
 * Pure domain logic only; production authorization must also be enforced server-side.
 */
export function isMutualInterest({ viewerInterested, candidateInterested }) {
  return viewerInterested === true && candidateInterested === true;
}

export function canInitiateContact({
  viewerInterested, candidateInterested, viewerContactConsent,
  candidateContactConsent, viewerActive = true, candidateActive = true,
}) {
  return isMutualInterest({ viewerInterested, candidateInterested }) &&
    viewerContactConsent === true && candidateContactConsent === true &&
    viewerActive === true && candidateActive === true;
}

/** Rank active profiles against stated preferences. Not an access-control boundary. */
export function rankCandidates(candidates, preferences = {}) {
  const wantedTopics = new Set(preferences.topics ?? []);
  const wantedTimes = new Set(preferences.times ?? []);
  const wantedLevels = new Set(preferences.levels ?? []);
  return candidates
    .filter((candidate) => candidate.active !== false)
    .map((candidate) => {
      let score = 0;
      if (candidate.topic && wantedTopics.has(candidate.topic)) score += 3;
      if (candidate.level && wantedLevels.has(candidate.level)) score += 2;
      if (Array.isArray(candidate.times)) {
        score += candidate.times.filter((time) => wantedTimes.has(time)).length;
      }
      return { ...candidate, matchScore: score };
    })
    .sort((a, b) => b.matchScore - a.matchScore);
}

/** Return only allowlisted, non-identifying candidate fields. */
export function toPublicCandidateCard(candidate) {
  return {
    id: candidate.id,
    displayName: candidate.displayName,
    topic: candidate.topic,
    level: candidate.level,
    times: [...(candidate.times ?? [])],
    about: candidate.about ?? "",
  };
}
