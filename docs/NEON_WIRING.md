# Neon wiring plan (DRAFT — dev only, nothing provisioned)

Status: plan only. Pending Efi's answers (owning email + Frankfurt region
consent). No vendor account exists, no migration has been applied to any
vendor service, no production anything.

## What is and is not a blocker for the dev milestone

The dev milestone = the full API + RLS suites passing against a live Neon
project with real vendor-issued JWTs, through a role that does not bypass
RLS.

- Hosting is NOT a dev-milestone blocker. The Express server runs locally
  (dev machine/sandbox) against the live Neon database. No public endpoint
  is needed to prove the vendor path. Public hosting is a launch-stage
  decision, analyzed below so it stops being an unknown.
- Actual blockers today: Efi's owning email + Frankfurt consent. The GitHub
  push credential failing is a distribution nuisance (code is safe on
  origin at 869ae8f), not a vendor-testing blocker.

## Architecture decision

Keep the React frontend + Express API exactly as built. Wire Neon Managed
Auth JWTs into the Express server, and connect user-facing queries through a
custom login-enabled Postgres role. Do NOT rewrite the frontend to the Neon
Data API for this milestone. Do NOT relabel the local dev setup as
"production" later: the wiring below must be proven by execution against
the real vendor before any launch claim.

Why:
- The owner connection string (`neondb_owner`) carries `BYPASSRLS`; running
  user traffic through it silently disables every RLS policy we proved
  locally. A custom LOGIN role without `BYPASSRLS` keeps Postgres as the
  enforcer. Source: https://neon.com/docs/guides/rls-query-execution
- The built-in `authenticated`/`anonymous` roles are `NOLOGIN` (Data API
  only). A backend must use a custom role.
  Source: https://neon.com/docs/guides/rls-query-execution
- Neon Auth issues JWTs carrying `sub` and `role` claims, validated against
  the project's JWKS URL.
  Sources: https://neon.com/docs/data-api/custom-authentication-providers ,
  https://neon.com/docs/data-api/troubleshooting

## JWT subject -> app user mapping (needs execution evidence)

- Neon Auth (Better Auth) user IDs are text UUIDs in the JWT `sub` claim.
- Planned schema addition (part of 0005): `users.auth_sub TEXT UNIQUE`.
- First authenticated call: the app-level register endpoint (which already
  collects gender, name, preferences) verifies the Neon JWT, then binds
  `sub` to the new app user row via `auth_sub`. Every later request resolves
  the app user by `auth_sub = verified_sub`.
- Uniqueness on `auth_sub` guarantees one app identity per vendor identity.
- Execution evidence required at the milestone: two real vendor signups,
  JWT for each, prove user A's token can never resolve to user B's row,
  and a forged/expired token is rejected (JWKS verification failure -> 401,
  no DB touch).

## GUC pool isolation (needs execution evidence)

Policies read `app.user_id`. With pooled connections (Neon pooled endpoint
or the serverless driver Pool), a session-level `SET` can leak the previous
request's user into the next request on the same connection. Design rule:
every user-facing request runs inside an explicit transaction and sets
`app.user_id` with `SET LOCAL` (transaction-scoped) from the VERIFIED JWT
sub — never from client input. The pg_session_jwt docs warn that claim
GUCs are ordinary parameters settable by any DB user; the server sets them,
the client never does. Source: https://neon.com/docs/extensions/pg_session_jwt
Execution evidence required: pool size forced to 1, interleaved concurrent
requests as two different users, assert zero cross-contamination (each
response contains only the caller's rows). Plus a negative test: a request
that never authenticated runs with no GUC and is denied by RLS.

## Step sequence

1. Efi answers (via main): which email owns the Neon account; yes/no to
   Frankfurt (`aws-eu-central-1`). Region is fixed at project creation and
   cannot be changed later; Neon's only EU options are Frankfurt and London
   (no Israel region). Source: https://neon.com/docs/introduction/regions
2. Browser signup at https://console.neon.tech/signup with email+password
   (no Google, no GitHub OAuth, no card).
   Source: https://neon.com/docs/get-started/signing-up
   - Password: vault-generated (vault create --generate-password), copy_url
     reported to Efi verbatim. Never in chat.
   - Email verification code: read from Efi's connected inbox if the owning
     address is one we can read; otherwise ask Efi for the one-time code.
3. Create ONE project, dev only: name `chavruta-dev`, region
   `aws-eu-central-1` — on the same authorized run once email+region are
   clear (no repeated approval for the already-authorized setup).
4. Database credentials: the console shows connection strings at project
   creation; the agent reads them in the browser and saves them directly to
   the vault (write value to a local file, vault create --password-path,
   delete file). No copying chore for Efi; secrets never touch chat or git.
5. Migrations 0001-0004 plus new 0005 applied with the OWNER connection —
   migrations are the one legitimate `BYPASSRLS` use.
6. Planned migration 0005 (not yet written as a migration file):

   ```sql
   CREATE ROLE chavruta_app WITH LOGIN PASSWORD '<vault-generated>';
   GRANT USAGE ON SCHEMA public TO chavruta_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chavruta_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chavruta_app;
   ALTER TABLE users ADD COLUMN auth_sub TEXT UNIQUE;
   ```

   No `BYPASSRLS` on chavruta_app. RLS policies apply to every API query.
7. Server config: `DATABASE_AUTHENTICATED_URL` (chavruta_app) for all
   user-facing queries; `DATABASE_URL` (owner) for the migration runner
   only; `NEON_AUTH_JWKS_URL` for JWT verification.
8. Real vendor verification (the milestone): two users signed up through
   Neon Auth on the live project; real JWTs; full API suite (83 checks) and
   RLS suites against live Neon through chavruta_app, including the JWT
   mapping and GUC isolation evidence above.

## Hosting for launch (grounded now, decided later — NOT needed for dev)

| Option | Free? | Pauses? | Key constraints | Sources |
|---|---|---|---|---|
| Cloudflare Workers Free | $0, no card mentioned | No cold starts, always on | 100k req/day per account; 10ms CPU per request (network wait excluded; Cloudflare notes auth-heavy handlers typically use 10-20ms — needs measurement); Express needs Workers-runtime adaptation; 6 concurrent outgoing connections/request | https://developers.cloudflare.com/workers/platform/limits/ , https://developers.cloudflare.com/workers/platform/pricing/ |
| Vercel Hobby | $0 | Serverless, no spin-down | Non-commercial personal use ONLY per fair-use terms; 4 CPU-hours + 1M invocations per month; 300s max function duration; full Node | https://vercel.com/docs/plans/hobby , https://vercel.com/docs/limits/fair-use-guidelines |
| Render Free | $0 | SPINS DOWN after 15 min idle (~1 min cold start) — fails the non-pausing bar; free Postgres expires after 30 days | REJECTED for any always-on use | https://render.com/docs/free |

No public hosting is provisioned or implied by this plan.

## Known gaps that remain AFTER the milestone (launch blockers, not dev)

- Custom SMTP provider for verification emails — shared dev SMTP sends
  codes only and is rate-limited; verification links require custom SMTP.
  Source: https://neon.com/docs/auth/production-checklist
- "Allow Localhost" auth setting must be disabled at launch (on by default
  for dev). Source: https://neon.com/docs/auth/production-checklist
- If OAuth sign-in is ever added: shared dev Google credentials must be
  replaced with Efi's own OAuth app.
  Source: https://neon.com/docs/auth/production-checklist
- Data API is beta; not used by this architecture anyway.

## Cost

Free tier, no card required. Source: https://neon.com/pricing
