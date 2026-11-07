# One Chavruta, independent local communities

Preparation only,2026-11-07. Not deployed, not a new public website. Based on the actual public app source09d1654, not deployment-only main. Existing users, profiles, consent and storage stay unchanged until a reviewed migration is chosen.

## Owner request

One worldwide Chavruta with independent local community management. No decision yet on community/global visibility, membership in several communities, who creates a community, or local managers' powers. Git work must remain free, without cards or paid upgrades.

## Model prepared for discussion, not selected policy

- One Google/Firebase identity and one app account, not a new login for each community.
- Community record: stable ID, display name, slug, status and independently editable public information. Public operator/contact responsibilities must be explicit before listing a community publicly; existing operator approval is not permission to publish another person's name/email.
- Membership records separated from identity: community ID, member ID, role, status, joined time. A composite key can support several communities without forcing that policy now. Active context is validated by the server, never accepted from a client-controlled selector alone.
- Community role is tied to that community. A manager role in A never authorizes reads/writes in B. No role obtained from a profile field, public signup form or client storage. Initial manager assignment and subsequent delegation need a verified authority path.
- Study requests belong to an explicit context. Profile visibility, selections, matches and connection requests need the same context rule throughout; adding community_id only to profile cards is insufficient.
- Global discovery, if selected, must be a separate explicit scope. Existing users must not be silently opted into a larger audience or assigned to a locality from a name/IP/address guess.

## Decisions that change the implementation

1. Discovery: community-only, or user-selectable community/global discovery? If global, does the member explicitly opt in and can they opt out without losing local membership?
2. Membership: one or several communities? New joins automatic or manager-approved/invitation? Who may create a new community and assign its first manager?
3. Manager powers: proposed initial tools are community details, membership approvals and membership moderation, plus only reports specifically addressed to that community. Confirm the actual minimum. No inferred access to users' private selections, unrelated reports or contact information.

These are decisions, not demands that the owner design database fields. Present an understandable first-stage choice and a recommendation, then implement the chosen boundary.

## Privacy and security invariants

- Keep age attestation, same-gender matching, blocks and fixture isolation independently enforced. Community membership cannot bypass these restrictions.
- Managers do not see who selected whom. Reciprocal matching stays the members' own outcome.
- Contact reveal still requires accepted connection and both parties' current consent. Manager status alone does not authorize contact lookup.
- Manager actions do not delete the global account, Google identity or other memberships. Suspending/removing a membership must not erase another community's data.
- Joining/leaving/suspension semantics for prior relationships must be chosen explicitly: do not silently revoke or disclose existing relationships in a migration.
- Security-definer RPCs and triggers must enforce context too; RLS on tables alone is not enough because current match/contact/respond RPCs bypass it.
- Existing auth.synthetic_members isolation stays intact. Synthetic fixtures cannot become public community members through migration.
- Data export/member lists are a distinct disclosure, not included merely by naming someone manager.
- No automatic content/message/invite sent on an unapproved recipient's behalf. Community invitations need recipient/content authority.
- Global self-deletion still removes the account's profile, relationships and memberships atomically under the existing identity lock, then runs the approved bounded marker/Firebase retry flow. Community-scoped removal is a different operation.

## Additive rollout sequence after decisions

1. Preserve pre-change source tag and aggregate current rows. Inspect live deployment/schema before applying anything.
2. Add community/membership tables and scoped permission helpers with fail-closed RLS. No owner admin assignment or membership backfill inferred from current data.
3. Add authenticated API routes that read server-verified role/membership. Bound public community fields and audit manager actions without recording tokens/contact/selection bodies.
4. Add context fields to relevant records only with a reviewed historical-data plan. Keep existing data readable under explicitly chosen compatibility rules until migration verified; don't invent a legacy community policy.
5. Update matching, interest creation, request creation/respond, block/report audience and bilateral-contact RPC checks together, including known-ID attacks and stale sessions.
6. Add mobile HE/EN community selector and manager screen. Current Google login is retained. Do not show inactive features as working or publish an admin link to unauthorized users.
7. Test migration rollback and concurrency with locally signed tokens/real local Postgres. No owner Google deletion or extra real Google signup required for these tests. Keep two-real-session proof limitations explicit.
8. Verify actual pixels at320/390/desktop and direct unauthorized route/API attempts. Deploy only after decisions, authorization and data checks. Old Pages remains a fixed handoff, not another community installation.

## Required acceptance matrix

- ManagerA/memberA cannot read or edit B by changing URL, JSON, slug, community ID or record IDs.
- Member cannot self-promote or approve their own pending membership.
- Removed/suspended manager's next request loses admin capability; no long-lived cached role authority.
- Two managers editing membership do not remove the last authorized manager or race a role promotion.
- Member who shares several communities follows the chosen context policy, no duplicate contacts or cross-context consent reuse by accident.
- Global discovery obeys the user's actual visibility choice and fixture/age/gender/block rules.
- Same member's old interests/matches/requests remain unchanged by a feature preparation branch.
- Local manager does not get contact data before bilateral consent, selections before reciprocity or unrelated reports.
- Community removal leaves global account and other memberships intact; global account deletion handles memberships atomically and retains no profile in deletion marker.
- Membership changes during a match/request/contact operation cannot bypass the chosen context rule.
- Prepared migration creates no new real memberships, operators, public email addresses or default global audience by inference.

## Current technical touch points

Database: public.profiles, study_requests, interest_selections, connection_requests, contact_methods, user_blocks, user_reports; security-definer list_my_matches, get_connection_contact, respond/consent functions; population/gender/block guard triggers. Current auth.subject binding and lifecycle transactions are in server/api.js. Availability remains a display preference, not a new eligibility rule.

Frontend: App.jsx context/router; Candidates, Requests, Connections, Profile; auth/signup form; legal pages. New fields must remain optional until the chosen migration is complete. Current simplistic hash router does not support arbitrary nested community routes without deliberate parsing.

Hosting: real source dev/frontend-rebuild; deployment-only main must never be blindly merged into this branch. Workers/Neon/Firebase existing free architecture retained; quotas remain finite, no claim of unlimited worldwide scale. Actual headroom must be measured against use before expansion, not paid-upgraded silently.
