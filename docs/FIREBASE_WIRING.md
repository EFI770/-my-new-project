# חברותא — Firebase Google sign-in wiring (owner decision 2026-11-07)

Firebase Authentication (Google provider only) replaces the Neon-Auth Google plan
for community sign-in. This document is the wiring reference; the launch ledger
stays in LAUNCH_READINESS.md.

## Why

Neon Auth's shared Google credentials are development-only
(https://neon.com/docs/auth/production-checklist). Firebase Authentication on the
Spark plan carries the community pilot (~5 users, no payment method; usage fails
closed at quotas, nothing auto-upgrades). The API keeps all three auth modes
(`dev`, `neon`, `firebase`) so the app stays portable if the owner later migrates.

## Security shape

- The server verifies Firebase ID tokens with `jose` against Google's public
  securetoken JWKS (issuer `https://securetoken.google.com/<projectId>`,
  audience = project id). NO service-account JSON, NO firebase-admin, NO
  management credentials: verification needs only public keys + the project id.
- The verified `sub` (Firebase uid) binds to exactly one app user via
  `auth.users.auth_sub` (migration 0005). The app user id - never the token - is
  what RLS sees via `app.sub`. No authorization decisions in the API layer.
- The Firebase web config (apiKey/appId/...) is public by design per
  https://firebase.google.com/docs/projects/api-keys. It is served from env to
  clients via `GET /api/auth/providers` and is NEVER committed to the repo.

## Env wiring

Worker (`AUTH_MODE=firebase`):
- `FIREBASE_PROJECT_ID` - Firebase project id (public).
- `FIREBASE_SIGNIN_ENABLED=true` - serves the client config via /api/auth/providers.
- `FIREBASE_API_KEY`, `FIREBASE_APP_ID` - public web config values (from the
  Firebase console; keep in secrets store anyway, per project policy).
- `FIREBASE_AUTH_DOMAIN` - optional; defaults to `<projectId>.firebaseapp.com`.
- `FIREBASE_JWKS_URL` + `CHAVRUTA_FIREBASE_TEST=hermetic` - hermetic-test JWKS
  override ONLY. Both must be set together; `createFirebaseAuth` throws
  (`jwks_override_not_allowed`) when a JWKS override arrives without the flag,
  and the Worker deployment path never passes an override at all. Never set in
  production: a hostile JWKS URL would let an attacker mint valid-looking tokens.

Local node server: same variables via `CHAVRUTA_AUTH_MODE=firebase` + env.

## Hermetic tests

`scripts/test-api-firebase-local.sh` boots a throwaway Postgres, starts the API
in firebase mode with a LOCAL JWKS override, and runs
`server/harness/api-firebase.mjs` (25 assertions): garbage/forged/wrong-audience/
wrong-issuer/expired tokens all 401; register validation (gender + 18+
attestation mandatory); auth_sub binding incl. re-register 409; same-gender RLS
visibility; contact-free candidate payloads; providers endpoint shape; deletion
leaves the user anonymous. All tokens are locally signed RS256 test doubles -
no vendor contact. The suite also injects a database deletion failure to
verify rollback preserves the account and removes the uncommitted tombstone;
it races eight registration attempts against deletion and verifies none can
recreate the binding. Per-subject advisory transaction locks serialize these
lifecycle changes. `asService` alone is not transactional: the API explicitly
begins/commits/rolls back this lifecycle transaction.

`node server/harness/ui-firebase.mjs` runs the local browser with synthetic
Firebase module and HTTP responses only. It checks retry cancellation and the
persistent support error, retry success, Google-only forms, and busy-state
reset after the popup-success early return. These are UI tests, not vendor
OAuth or real identity-deletion proof.

Firebase documents both recent-sign-in requirements and console user deletion:
https://firebase.google.com/docs/auth/web/manage-users
Firebase user state persists across refreshes:
https://firebase.google.com/docs/auth/users

These tests prove the verification and binding code paths. They do NOT prove
the live Google OAuth popup flow, authorized-domain config, or real-config
end-to-end sign-in: those need the real web config + enabled Google provider
on a gated preview.

## Deletion design (presented for owner review)

`DELETE /api/me` removes all app data and the auth_sub binding first (the ID
token is still valid at that point), then the CLIENT erases the Firebase
identity record (`user.delete()`, re-authenticating via a fresh Google popup if
Firebase requires a recent sign-in). Server-side vendor erasure is impossible
by design (no admin credentials held).

Invalidation policy (migration 0007): the deleted vendor subject is TOMBSTONED
(`auth.deleted_subs`) in the same transaction as the data delete. A still-valid
token (Firebase ID tokens live ~1h) cannot re-register the deleted account -
register returns 403 `account_deleted`. A returning user asks the operator to
clear the tombstone row (pilot scale makes this practical). Fail-closed by
default.

Honest partial failure: if the client-side vendor erasure fails (network, or
the user cancels the re-auth popup), app data is still gone, the Firebase
session is KEPT, and the sign-in screen offers an explicit "remove sign-in
record" retry plus the support route: the operator deletes the user in the
Firebase console (Authentication > Users). The user is told all of this in a
toast - it is not a silent console log. NOTE: revoking the app's access under
Google Account > Security > connections is NOT Firebase identity deletion and
is never presented as one. Identity erasure at the vendor is NOT claimed
verified.

RETENTION RECORD (PROVISIONAL - owner decision pending, 2026-11-07):
- Retained identifier: the vendor subject string (Firebase uid) in
  auth.deleted_subs. No profile data, no email, no tokens.
- Purpose: prevent a deleted account's silent re-creation by its still-valid
  vendor token (~1h Firebase ID-token lifetime) or a cached token.
- Cleanup: no automatic expiry; the operator deletes the row to allow re-entry.
- Open re-entry question for the owner: is operator-mediated re-entry the
  intended policy, or should tombstones expire (e.g. after N days), or be
  cleared on verified vendor deletion? Until the owner decides, the policy is
  fail-closed (blocked re-register) and the identifier is retained.

## Owner console steps (one-time)

1. Firebase console > Authentication > Get started > Google > Enable > Save.
2. Project settings > Your apps > web app > copy the `firebaseConfig` values
   into the secrets store (never into chat, never into the repo).
3. Optional: restrict the API key (console > Credentials) to Firebase APIs.
