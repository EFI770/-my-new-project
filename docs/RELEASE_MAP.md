# Release map

Status verified2026-11-07. This document distinguishes source backup, deployment
and acceptance. A branch name alone does not establish what users receive.

## Published legacy app

- Repository: https://github.com/EFI770/-my-new-project
- GitHub Pages: https://efi770.github.io/-my-new-project/
- Source: main, root, workflow publishing.
- Preserved legacy commit: `7fc837c8a879a99f2c40fc836d677769d93497d0`.
- Behavior: local demonstration in browser storage, not shared real accounts.
- Old root assets remain in this development branch for historical compatibility.
- No legacy files, browser data, branches or repositories were deleted to organize
  the project. The main branch and old deployment remain unchanged.

The legacy commit is the archive reference. There is no copied second app or
new archived publication. Existing historical branches are not production targets
and must not be merged or deleted in bulk merely to reduce the branch count.

## Current real application

- Source branch: dev/frontend-rebuild.
- Accepted application code checkpoint: `adbf014db78459b52d5b2da1a0aa55443fb3e714`.
- Hosting: https://chavruta-preview.efie770.workers.dev/
- Active application deployment: `3b8ed1bd-b821-458c-82a6-c60bf21abd08`.
- Access: private gate; Google-only real Firebase authentication.
- Data: existing Neon database, fixture population isolated at policy boundaries.
- Real signup and a real explicit time-preference save confirmed persisted.
- Source is backed up on the existing development branch, not a separate repo.

Documentation commits after this checkpoint do not imply a new Worker deployment.

## Rollback references

- Before optional study hours: source `4e1b755`, deployment
  `44e11abe-779e-4592-8720-43274194f10d`.
- Before member-lookup cost reduction: deployment
  `d62b6c97-2f63-473e-86eb-db6c813338e4`.
- Hours migration is additive. Never undo it by deleting profiles or columns as a
  shortcut. Application rollback can leave unused nullable columns safely.
- Fixture isolation and auth role grants are live DB state, not rolled back by
  selecting an older frontend deployment.

## Pending, not deployed

Bounded-deletion policy preparation is isolated from this branch. The current
indefinite marker policy is not a finalized owner decision. The proposed bounded
alternative must be reconciled against current code, use a new migration number
and complete cleanup/alerting review before any approved activation. Never deploy
an older proposal branch wholesale over the current accepted application.

## One production target, not two long-term apps

Owner clarified that there is no need for the old active site once the new one
works. Selected transition: one canonical real app on its existing origin, old
GitHub URL as a compatibility redirect. A shorter canonical hostname remains a
separate optional choice; no additional frontend or data migration is needed.

Prepared artifact: deploy/legacy-entry/index.html. It redirects to the verified
current host, includes an accessible manual fallback, does not relay query/hash
values and never reads or clears local browser data. It is NOT the active Pages
artifact. Main and the live old site remain untouched until readiness.

At approved activation, publish only the compatibility artifact, not the whole
repository. Old code remains in Git history only, not a second active archive
site. Keep the real profile/database and Google origin unchanged. No cross-origin
API rewrite is required for this route. Do not infer that preparing this entry
has changed the physical old iPhone icon yet.

## Acceptance boundary

Passed: actual Google registration and explicit preference save; strict signed
Firebase token contract; no/forged-token rejection; live DB contexts for private
interest, mutual match, same-gender rules, bilateral contact consent, withdrawal,
third-party denial and fixture separation; mobile UI320px and API persistence.

Unproven: full real Google multi-user lifecycle and production Firebase identity
erasure/reauthentication. Layered tests are evidence, not a claim those exact
external paths occurred. Do not delete an existing account to manufacture proof.

Latest measured ordinary traffic showed no runtime resource failures, but mixed
request telemetry is not an authenticated load benchmark. Free quotas apply.

Public operator identity/contact and final deletion/reentry policy remain open.
Privacy/legal screens still say draft. Public access remains closed until these
are resolved and the chosen release is checked without private access credentials.

## Old iPhone icon

The old served entry and bundle show no manifest or service-worker registration.
That reduces one cache concern but does not prove the physical installed icon's
saved launch URL or behavior. After an approved publication transition, verify
the exact old entry, query variants and any old cache behavior, then confirm on
the existing icon before saying it is fixed. Do not ask the user to clear browser
storage as a first step: that could erase their old local demo data.
