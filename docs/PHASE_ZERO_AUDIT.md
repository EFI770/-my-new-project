# חברותא — Phase Zero Repository Audit

**Status:** Initial evidence snapshot; not a security certification and not production approval.  
**Audit method:** GitHub file-content reads against the default branch at the time of inspection.  
**Repository:** https://github.com/EFI770/-my-new-project

## Verified on the default branch

- `README.md` explicitly describes the project as a demo prototype and says not to enter real personal information.
- `index.html` loads `./assets/styles.css` and `./assets/app.js`, and displays a warning that the site is a demo.
- `package.json` defines `npm test` as `node --test` and declares Node.js `>=18`.
- The current visible frontend entry point is the bundled JavaScript asset, not a verified Vite build.

## Paths not found at the inspected locations

The following paths returned GitHub 404 when checked on the default branch:

- `src/App.tsx`
- `src/lib/matchingEngine.ts`
- `src/lib/supabaseClient.ts`
- `supabase/migrations/001_initial_schema.sql`
- `supabase/migrations/002_rls_policies.sql`
- `supabase/migrations/003_security_hardening.sql`
- `supabase/migrations/004_notifications.sql`
- `.github/workflows/ci.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/backup.yml`
- `vitest.config.ts`
- `vite.config.ts`
- `tests/db/rls.test.ts`

A 404 at a specified path does not prove a file is absent from every branch or location. It does mean that the claimed deliverables were not verified at these paths on the default branch.

## Changes introduced by this PR

- Adds a GitHub Actions CI workflow using Node.js 20.
- Adds four prototype contract tests that verify the current entry page, RTL metadata, demo warning, static asset references, and declared test command.
- Adds this evidence-based audit record.

These tests are intentionally limited. They do **not** prove that authentication, matching, data persistence, access control, RLS, notifications, backups, or production deployment work.

## Current release decision

**NO-GO for real-user pilot.**

Before reconsidering:

1. Establish the intended source tree and restore/implement missing application modules through reviewed changes.
2. Build and run the application in CI from a clean checkout.
3. Provision a non-production Supabase project and apply reviewed migrations to a fresh database.
4. Test authorization and privacy with at least two distinct users, including negative tests.
5. Verify the end-to-end learning-match flow across separate devices.
6. Run a backup and restore drill and document operational ownership.
7. Obtain qualified Israeli legal review of privacy and terms before collecting real users' personal data.

## Evidence policy

A test is reported as passed only when its command has actually run and the result is available. A file existing is not evidence that it works. Static inspection is not a substitute for runtime or database authorization tests.
