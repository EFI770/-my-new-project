# Neon wiring plan (DRAFT — dev only, nothing provisioned)

Status: plan only. Pending Efi's answers (owning email + Frankfurt region
consent). No vendor account exists, no migration has been applied to any
vendor service, no production anything.

## Architecture decision

Keep the React frontend + Express API exactly as built. Wire Neon Managed
Auth JWTs into the Express server, and connect user-facing queries through a
custom login-enabled Postgres role. Do NOT rewrite the frontend to the Neon
Data API for this milestone.

Why:
- The owner connection string (`neondb_owner`) carries `BYPASSRLS`; running
  user traffic through it silently disables every RLS policy we proved
  locally. A custom LOGIN role without `BYPASSRLS` keeps Postgres as the
  enforcer.
  Source: https://neon.com/docs/guides/rls-query-execution
- The built-in `authenticated`/`anonymous` roles are `NOLOGIN` (Data API
  only). A backend must use a custom role.
  Source: https://neon.com/docs/guides/rls-query-execution
- Neon Auth issues JWTs carrying `sub` and `role` claims, validated against
  the project's JWKS URL. The server verifies the JWT itself (e.g. `jose`),
  maps `sub` to the app user row, and sets the `app.user_id` GUC the RLS
  policies already use. Policy SQL stays unchanged.
  Sources: https://neon.com/docs/data-api/custom-authentication-providers ,
  https://neon.com/docs/data-api/troubleshooting

Caution carried from the docs: without JWK validation, `request.jwt.claims`
/ GUCs are ordinary Postgres parameters settable by any DB user. The server
must set `app.user_id` itself, inside the request transaction, from the
cryptographically verified JWT — never from client input.
Source: https://neon.com/docs/extensions/pg_session_jwt

## Step sequence

1. Efi answers (via main): which email owns the Neon account; yes/no to
   Frankfurt (`aws-eu-central-1`). Region is fixed at project creation and
   cannot be changed later; Neon's only EU options are Frankfurt and London
   (no Israel region). Source: https://neon.com/docs/introduction/regions
2. Browser signup at https://console.neon.tech/signup with email+password
   (no Google, no GitHub OAuth, no card).
   Source: https://neon.com/docs/get-started/signing-up
   - Password: vault-generated, saved to the vault, `copy_url` reported to
     Efi. Never in chat.
   - Email verification code: read from Efi's connected inbox if the owning
     address is one we can read; otherwise ask Efi for the one-time code.
3. Create ONE project, dev only: name `chavruta-dev`, region
   `aws-eu-central-1` — only after explicit go on the exact project+region.
4. Database credentials (connection strings) saved to the vault via a vault
   link. Never in chat, never in git.
5. Migrations 0001–0004 plus new 0005 (below) applied with the OWNER
   connection — migrations are the one legitimate `BYPASSRLS` use.
6. Planned migration 0005 (not yet written as a migration file):

   ```sql
   CREATE ROLE chavruta_app WITH LOGIN PASSWORD '<vault-generated>';
   GRANT USAGE ON SCHEMA public TO chavruta_app;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO chavruta_app;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public
     GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO chavruta_app;
   ```

   No `BYPASSRLS`. RLS policies apply to every query from the API.
7. Server config: `DATABASE_AUTHENTICATED_URL` (chavruta_app) for all
   user-facing queries; `DATABASE_URL` (owner) used by the migration runner
   only; `NEON_AUTH_JWKS_URL` for JWT verification.
8. Real vendor verification (the actual milestone):
   - Sign up two users through Neon Auth on the live project.
   - Obtain real JWTs from the vendor.
   - Run the API suite (83 checks) and RLS suites against the live Neon
     project through the `chavruta_app` role: same-gender matching,
     accept-distinct-from-consent, contact privacy — all proven with real
     vendor-issued JWTs, demonstrating enforcement does not depend on any
     owner-connection bypass.

## Known gaps that remain AFTER this milestone (launch blockers, not dev)

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
