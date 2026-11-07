// Shared client/server validation. Empty is unspecified, never "all day".
export const STUDY_DURATIONS = [15, 30, 45, 60, 90, 120];
export const COMMUNITY_TIMEZONE = 'Asia/Jerusalem';
export function cleanStudyAvailability(body) {
  const windows = body.availableWindows === undefined ? [] : body.availableWindows;
  const duration = body.studyDurationMinutes === undefined || body.studyDurationMinutes === '' ? null : body.studyDurationMinutes;
  if (!Array.isArray(windows) || windows.length > 4 || (duration !== null && !STUDY_DURATIONS.includes(duration))) return null;
  const validTime = t => typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
  if (windows.some(w => !w || typeof w !== 'object' || !validTime(w.start) || !validTime(w.end) || w.start === w.end)) return null;
  const keys=windows.map(w=>`${w.start}/${w.end}`);
  if (new Set(keys).size !== keys.length) return null;
  return {windows:windows.map(w=>({start:w.start,end:w.end})),duration};
}
