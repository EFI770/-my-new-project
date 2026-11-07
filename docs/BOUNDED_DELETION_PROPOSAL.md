# Approved rollout

Owner approved the explained bounded policy on2026-11-07 at21:53:51 Jerusalem time. Integrated with current release using migration0011_bounded_firebase_deletion.sql, bounded-v1 flag and 15-minute scheduled cleanup. Earlier proposal record follows; not a statement of current deployment.

# Proposed bounded Firebase deletion policy, NOT deployed or approved

Prepared2026-11-07. Branch dev/bounded-deletion-proposal is separate from live.

## Proposed user decision

App profile/contact/relationships are removed immediately in a committed local
transaction. Then Firebase's client deletes its identity, asking the user to
sign in again if Firebase requires it. A failure is shown as incomplete vendor
erasure, with an explicit retry. No Google account is deleted: only this app's
Firebase identity record is targeted.

Keep only Firebase subject identifier plus deletion timestamp for one hour to
block old sessions from recreating the profile. This is a separate private table,
not a retained profile/email/contact. After one hour the marker no longer blocks
reentry. A new signup ALWAYS requires a Google authentication within five minutes;
a refreshed token's recent issue time is not enough. This protects after expiry
even if vendor erasure failed, because Firebase refresh keeps old auth_time.
An explicit fresh Google signin after the wait may rejoin under a new profile.
No permanent operator-mediated rejoin ban.

A scheduled purge every15minutes would erase expired rows, ordinarily within
75minutes of deletion. This schedule is not yet configured. It is not a hard
75minute guarantee: platform/database outage can delay the purge. Monitoring and
failure alerting are required before enabling the policy. Provider backups/logs
have separately unverified lifetimes; this proposal does not erase their copies.
Current production has zero deletion markers; no legacy markers are migrated.

## Failure/retry behavior

- Local deletion fails: local transaction rolls back, profile and marker unchanged.
- Local delete succeeds, Firebase delete fails/cancelled: local app data stays
  gone; Firebase record may remain; current session is kept only for user retry.
- Crash between local delete and Firebase erase: same partial state, marker blocks
  old session; next signin screen offers explicit retry. No automatic claim of
  vendor deletion is made.
- At/after marker expiry: old auth_time still rejected even if refreshed hourly.
  User must explicitly sign in again to register; no typed profile data invented.
- Rejoin and deletion races: same per-subject advisory transaction lock; marker
  check and binding/profile insert are atomic. Expired marker cleared only with
  successful rejoin or purge.
- Purge failure: cleanup must be retried and surfaced, not hidden. No schedule or
  promise of fixed maximum retention is approved in this branch.

## Implemented but disabled

FIREBASE_DELETION_POLICY=bounded-v1 activates proposal only. Separate migration0010
creates private table. Worker scheduled handler can purge; no cron or feature flag
is in the deployed config. Default behavior unchanged, Neon legacy table untouched.
No optional live lookup/vendor self-delete from server was implemented: current
client provider-deletion contract is retained. Live lookup alternative adds
cross-system failure complexity; the recent-auth rule supplies bounded safety
without an extra vendor request on every ordinary member call.

## Evidence and limits

Root47/47. Local signed-JWT and real-Postgres HTTP harness34/34, including expired
marker plus freshly issued token with old auth_time rejection, explicit fresh
signin rejoin, rollback and concurrency. Official Firebase emulator confirms
self-delete, old-token lookup rejection, refresh rejection and unrelated-account
survival. Emulator tokens are unsigned; this is not real Google deletion proof.
No owner account deletion or second real Google account was used.

Sources:
- https://firebase.google.com/docs/reference/admin/node/firebase-admin.auth.decodedidtoken
- https://firebase.google.com/docs/auth/admin/manage-sessions
- https://firebase.google.com/docs/auth/web/manage-users
- https://firebase.google.com/docs/reference/rest/auth
- https://docs.cloud.google.com/identity-platform/docs/reference/rest/v1/accounts/delete
- https://firebase.google.com/docs/emulator-suite/connect_auth
