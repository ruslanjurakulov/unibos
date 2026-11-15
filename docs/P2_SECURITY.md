# P2 security foundation

P2 adds local identity/session security, organization and branch authorization, database-enforced tenant isolation and append-only permission auditing. It is a backend foundation, not a deployed service or a completed sign-in UI. The Next.js placeholder remains from P1; product/authentication screens belong to P3.

## Reproduce

Use Node24.22.1/npm11 and local Docker Compose on Linux. Run:

```sh
npm ci
npm run setup:local
npm run infra:up
npm run build
npm run db:migrate
npm test
npm run test:security
npm run test:smoke
npm run dev:api
```

`setup:local` upgrades the P1 configuration without rotating existing passwords. It creates missing random role passwords and a random Better Auth secret, and writes mode0600 ignored files: `.env` for local bootstrap/migrations and `.env.runtime` for runtime-only app/auth/Redis connections. API start/dev and smoke load the latter; migration/scratch-database tests load the former. Runtime does not connect with bootstrap credentials and defensively drops any inherited administrative environment keys. Copying `.env.example` does not supply usable credentials; setup fills empty placeholders. Existing persistent PostgreSQL passwords are not reset by recreating configuration files. Preserve the files or perform an explicit reviewed rotation; no automatic volume deletion is provided.

The local migration CLI rejects production/non-loopback connections and non-UniBOS database names. It is not a production migration/deployment procedure. API startup rejects superuser, BYPASSRLS, ownership, inherited role membership, schema/database CREATE or inappropriate identity/business privileges, including column-only grants. Migration credentials are never used by request handlers.

## Identity and sessions

Self-hosted Better Auth1.7.25 uses the existing PostgreSQL driver. No Clerk, Supabase, Neon, email provider, OAuth account or hosted database was provisioned. The official migration planner generated the initial identity tables; its preview script writes only ignored `work/` output and never overwrites applied migration files. Better Auth handles password hashing, cookie signing, password validation, session expiration/revocation, TOTP and backup codes. No manual password hashing or JWT issuer was introduced.

Session cookies are HttpOnly, SameSiteLax and Secure in production; development uses loopback HTTP. Cookie caching and account linking are disabled. Every protected request checks the live server session and current database membership. Login and MFA rotate sessions; logout/expiration reject old cookies without a cache grace period. Sessions expire after24h, with Better Auth's normal update policy; privileged assurance expires independently after15min. Remembered devices are rejected.

MFA enrollment alone grants no elevated privilege. Only successful library-verified TOTP/backup-code routes create recent, session-bound assurance. A fresh library session/cookie is issued and the previous bearer revoked before assurance is recorded. An expired/non-assured bearer cannot retrieve the TOTP secret, regenerate recovery codes, disable/re-enroll MFA, change password/email, delete the account or revoke other sessions once MFA is enabled. Those factor-material endpoints were a High finding in independent review; expired403 and recent200 regressions now cover them. Recovery-code reuse and consumed login-challenge replay are denied.

Signup is explicitly enabled only for the generated local setup. Production signup is rejected by configuration until a verified email-delivery integration is reviewed. Production requires HTTPS auth origins and verified PostgreSQL/Redis TLS; this does not imply a production deployment was tested. Email verification/reset delivery, OAuth/SSO, passkeys, privileged platform administration, support access and production authentication UI are not claimed implemented. There is no Super Admin route or automatic Super Admin seed.

## Origin, input and rate boundaries

State-changing API/auth requests require an exact trusted Origin. No wildcard origin, CSRF disable switch, arbitrary redirect trust or client-provided identity/tenant context is used. Node body limits16KiB, bounded read/database timeouts, field allowlists, length/control-character checks and UUID validation apply. Database statements use parameters. Public errors contain fixed messages/status codes rather than raw driver errors, connection strings, request bodies or stack traces. Unexpected Better Auth errors are configured to escape to the sanitized Node boundary; the upstream console fallback is disabled by propagation. A forced backend-error regression captures output in memory and verifies no sentinel detail reaches either logs or clients.

The server overwrites the internal client-IP header from the socket; forwarded headers are not trusted. Better Auth's shared database limiter remains enabled. A separate atomic SQL budget prevents concurrent read/modify/write races: global60/min/IP, signup3/min/IP, password login and factor verification5/min/IP/category; existing-session factor attempts also have a per-user budget. Counters use HMAC keys, closed route categories and capped counts. Bounded cleanup removes up to1000 rows older10min per budget operation, including upstream counters, with a supporting `(lastRequest,id)` index. Cleanup is opportunistic; idle rows may remain until new requests arrive. No unreviewed proxy/IP configuration, distributed edge/WAF deployment or unlimited-load resistance is claimed.

## Database roles and tenant scope

| Role | Purpose | Boundary |
|---|---|---|
| Local bootstrap/migration role | Explicit local role/schema provisioning | Never used by API request pools; local CLI only |
| unibos_auth | Seven global identity/session/factor/rate tables | Non-owner, non-superuser, no BYPASSRLS, no tenant access |
| unibos_app | Organizations, branches, memberships and permitted audit reads | Non-owner, non-superuser, no BYPASSRLS, no identity access |
| unibos_rls_guard | Fixed membership lookup functions | NOLOGIN/BYPASSRLS, SELECT memberships only, no runtime role membership |
| unibos_onboarding | Atomic onboarding and automatic audit functions | NOLOGIN/BYPASSRLS, narrowly granted INSERT, fixed functions only |

All four tenant tables use ENABLE and FORCE RLS. Transaction-local verified user/organization context is set with parameters, then reset/released after commit/rollback; failed cleanup discards the connection. Selecting a tenant does not grant membership: database policies recheck actual membership. The application role cannot SET ROLE to either helper. Helpers use fixed fully qualified tables and `search_path=pg_catalog`; default public function execution is revoked. As with any shared-backend RLS design, context is trusted only after server-side session verification; this is not a promise of safety after compromise of the entire backend or migration credentials.

Composite `(organization_id,branch_id)` foreign keys prevent cross-tenant references. Owner/director memberships have organization scope; administrator/accountant/cashier/waiter/kitchen memberships require a branch. Multiple branch memberships are possible. Owners may grant directors; directors may grant branch roles. Owner rows cannot be edited/deleted by the app. Ownership transfer, custom role creation and tenant deletion are deliberately unavailable.

Automatic database triggers audit organization/branch/membership writes in the same transaction. The app cannot forge, update, delete or truncate audit records. Permission audit retains actor, target user, entity, old/new role and old/new branch even after membership deletion; details are fixed typed columns, not arbitrary client JSON. Historical rows from before the002 expansion may have NULL details. Organization/branch name history and full authentication-event forensics are not represented as complete. This is database immutability for ordinary roles, not external tamper-proof retention against a privileged operator. External audit retention, backup/restore and legal retention policy remain release gates.

No tenant data is cached in Redis, exported, uploaded to storage or sent to background workers in this phase; those surfaces are not implemented. Future modules must carry the same tenant identity/constraints and add negative tests before exposing data.

## API contract

Protected collections return at most100 rows. Cursor pagination belongs to later product work; no complete unbounded export is claimed.

| Method/path | Authorization |
|---|---|
| Better Auth /api/auth/* | Library auth endpoints, strict origin/IP/body budgets and step-up guards |
| GET /api/me | Verified live session; returns userId and MFA assurance flag |
| GET /api/organizations | Current user's memberships, RLS filtered |
| POST /api/organizations | Recent MFA; atomic organization/owner membership/audit creation |
| GET /api/organizations/:id/branches | Current membership and branch-scoped RLS |
| POST /api/organizations/:id/branches | Owner/director and recent MFA |
| GET/POST /api/organizations/:id/memberships | Owner/director and recent MFA; director grants restricted |
| PATCH/DELETE /api/organizations/:id/memberships/:membershipId | Same scope; database preserves owner/role constraints; changes revoke privileges on next request |
| GET /api/organizations/:id/audit | Owner/director and recent MFA; tenant scoped |

Unknown/foreign tenant access returns generic403; invalid identifiers400; absent/expired/revoked session401; unknown protected routes404. No menu/order/payment or public guest business operation is provided.

## Migrations and tests

Auth001 and business001 are immutable snapshots. Forward-only002 migrations add the rate-retention index and typed permission audit details. Each migration uses a checksum ledger, transaction and advisory lock. Unchanged reruns are idempotent; modified applied files fail closed. Migrations are never executed inside runtime requests. Do not edit an applied file to repair schema; add a reviewed forward migration, with backup/recovery planning for non-test data.

Actual local gates on2026-11-15: format/lint/typecheck/workspace build;20 package unit/HTTP tests;10 real PostgreSQL isolation tests and19 full HTTP identity/tenant tests (Node includes each parent in those integration totals); live healthy/degraded infrastructure smoke; known-format credential scan; npm audit0 vulnerabilities. Final CI/exact reviewed SHA are recorded in the PR rather than predeclared green here.

Fixtures create uniquely named disposable local databases, use synthetic identities, and drop only their owned databases. Tests cover actual restricted roles, role-grant drift, FORCE RLS, unknown/forged tenant, branch isolation, role escalation/owner immutability, composite foreign keys, transactional rollback/pool reuse, immediate membership/session revocation, session/MFA expiration, password-only login challenges, TOTP/recovery flows, consumed challenge/code replay, forbidden factor-material retrieval, immutable detailed audit, shared concurrent limits, spoofed IP headers, bounded counter categories and cleanup. No production data, real emails or charges are used.

A separate reviewer found and verified fixes for the factor-material MFA bypass (High), symmetric credential privilege-drift guards, counter retention/key growth and an upstream raw-error logging fallback (Medium). Initial implementation agents stopped on usage limits; the parent completed remaining work. Reviewer subsequently resumed, independently read/reran real tests and must approve the final exact commit before merge. No author self-review is counted as independent approval. Browser/physical-device auth UI, penetration testing, provider/legal signoff and production recovery/monitoring are later gates, not implied by this phase.

## Visibility and costs

The owner explicitly authorized temporary Public source work for P2 after the P1 private-restoration attempt returned GitHub403. That authorization does not cover a P3 Public phase, public application deployment, real customer data, secrets, paid services or Nightshift access. Verify visibility before uploads. Restore Private after P2 verification if repository administration access permits; otherwise report the exact blocker and owner action. No plan upgrade, payment or new financial commitment was created.

A local one-off setup diagnostic originally compared raw environment-file strings; a key-order difference caused the assertion framework to echo generated dev credentials into internal tool output. It was reported and all local database/cache/auth secrets were rotated before further verification; none were committed or belonged to production/customers. The corrected check compares semantic values through a boolean result and never prints expected/actual secret content. Credential scanning now also compares current local secret values in memory against candidate files and reports filenames only; CI runs it again after configuration generation. No claim of comprehensive historical-secret or external disclosure auditing is made.
