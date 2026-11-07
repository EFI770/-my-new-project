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
- `FIREBASE_JWKS_URL` - hermetic-test override ONLY. Never set in production.

Local node server: same variables via `CHAVRUTA_AUTH_MODE=firebase` + env.

## Hermetic tests

`scripts/test-api-firebase-local.sh` boots a throwaway Postgres, starts the API
in firebase mode with a LOCAL JWKS override, and runs
`server/harness/api-firebase.mjs` (18 assertions): garbage/forged/wrong-audience/
wrong-issuer/expired tokens all 401; register validation (gender + 18+
attestation mandatory); auth_sub binding incl. re-register 409; same-gender RLS
visibility; contact-free candidate payloads; providers endpoint shape; deletion
leaves the user anonymous. All tokens are locally signed RS256 test doubles -
no vendor contact.

These tests prove the verification and binding code paths. They do NOT prove
the live Google OAuth popup flow, authorized-domain config, or real-config
end-to-end sign-in: those need the real web config + enabled Google provider
on a gated preview.

## Deletion design (presented for owner review)

`DELETE /api/me` removes all app data and the auth_sub binding first (the ID
token is still valid at that point), then the CLIENT erases the Firebase
identity record (`user.delete()`, re-authenticating via a fresh Google popup if
Firebase requires a recent sign-in). If the vendor erasure fails, local data is
still gone and the session ends; the failure is not hidden. Server-side vendor
erasure is impossible by design (no admin credentials held).

## Owner console steps (one-time)

1. Firebase console > Authentication > Get started > Google > Enable > Save.
2. Project settings > Your apps > web app > copy the `firebaseConfig` values
   into the secrets store (never into chat, never into the repo).
3. Optional: restrict the API key (console > Credentials) to Firebase APIs.
