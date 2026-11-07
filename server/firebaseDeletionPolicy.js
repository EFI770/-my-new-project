// Owner-approved bounded Firebase deletion policy, 2026-11-07.
// Refresh preserves auth_time. A recent iat is never a recent login.
export const SIGNUP_AUTH_MAX_AGE_SECONDS = 300;
export const DELETION_MARKER_SECONDS = 3600;
export function requireRecentSignupAuth(payload, nowSeconds = Math.floor(Date.now()/1000)) {
  if (!Number.isInteger(payload?.auth_time) || payload.auth_time > nowSeconds
    || payload.auth_time <= nowSeconds-SIGNUP_AUTH_MAX_AGE_SECONDS) {
    throw Object.assign(new Error('recent_login_required'), {status:401});
  }
}
export function markerIsActive(deletedAtSeconds, nowSeconds) {
  return deletedAtSeconds > nowSeconds-DELETION_MARKER_SECONDS;
}
export async function purgeExpiredFirebaseMarkers(db) {
  return db.asService(c=>c.query("delete from auth.firebase_deletion_markers where deleted_at <= now()-interval '1 hour'"));
}
