# P4 repository audit

Audit date: 2026-11-16  
Audit branch: `feat/p4-restaurant-operations`  
Dependency baseline: P3.3 commit `80257b46ebec29c9501473c2e8aac86ce0549838` on `feat/p3-website-preview`  
PR #4 remains a separate, unmerged dependency.

## Implementation inventory

| Area      | Verified implementation                                                                                                                                              | Not implemented                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Website   | Next.js App Router; marketing, sign-in/MFA surfaces, dashboard, guest demo and role-labeled interface previews.                                                      | Role-specific live operational workspaces and a shared order feed.                                                   |
| Guest     | Menu category selection and browser-local sample cart.                                                                                                               | Table-bound QR/NFC tokens, server order submission, status lookup and payments.                                      |
| Dashboard | Authenticated P2 workspace can read the signed-in user's organization and branch data through the API.                                                               | Products, tables, orders, shifts, sales, staff operations and real operational metrics.                              |
| API       | NestJS host; verified Better Auth session/MFA; `/api/me`, organization/branch/membership/audit endpoints; bounded Postgres/Redis readiness probes.                   | Catalog, table/token, order, kitchen, payment, shift, transaction, reporting and outbox endpoints.                   |
| Database  | Restricted runtime roles; organization, branch, membership and audit tables; forced RLS and composite tenant/branch constraints; auth/session/factor infrastructure. | Categories, products, price versions, availability, tables, QR tokens, orders, tickets, shifts, payments and ledger. |
| Preview   | Vercel project is connected to the Next.js website. The same-origin API route returns a fixed 503 when no supported API is connected.                                | Preview PostgreSQL, Redis, NestJS API, auth database, job workers or integrated staging.                             |

## Evidence and boundaries

- `apps/api/src/security-routes.ts` is a custom, session-gated route handler mounted before NestJS. It currently handles auth, identity, organizations, branches, memberships and audit only.
- `packages/database/migrations/001-business-security.sql` and `002-audit-permission-details.sql` create the business security foundation. There are no applied P4 business migrations on the P3.3 baseline.
- `apps/website/app/api/[...path]/route.ts` returns an explicit 503 instead of proxying to an unavailable backend. `apps/website/next.config.ts` only rewrites to an explicitly configured API origin; production auth configuration is separately gated.
- `apps/website/app/demo/guest` uses local demo cart state. `/demo/dashboard`, `/demo/workspace` and `/demo/super-admin` are illustrative surfaces. `/dashboard` is the authenticated P2 organization/branch workspace.
- `ARCHITECTURE.md` and `DATABASE.md` describe a proposed modular monolith and logical future schema. Their catalog, order, payments, ledger, outbox, workers and reporting sections are plans, not existing code.
- Local integration uses the root Docker Compose PostgreSQL and Redis. Vercel Preview is the website only. No production backend, customer data or payment service is connected.
- The supported path for a public Preview without an API is a clearly labeled synthetic-data interactive demo. UI-only demonstrations are not backend or end-to-end integration evidence.

## P4 deployment assessment

The existing Next.js frontend can deploy to Vercel Preview. The NestJS service and stateful dependencies have no verified deployed target in this repository. P4 Preview must therefore run in synthetic-data mode with API operations disabled unless a separately verified Preview API origin is explicitly configured. Do not set production credentials, production endpoints or customer data in the Preview project. Do not provision external infrastructure as part of this audit.

## Existing permission model to extend

P2 currently defines organization-scoped `owner` and `director`, and branch-scoped `administrator`, `accountant`, `cashier`, `waiter` and `kitchen`. RLS helpers implement organization membership, branch access and branch-manager checks. P4 must reuse verified session identity, derive organization/branch access on the server and retain database-enforced tenant and branch isolation. New app roles must not be inferred from a request body or client state.

## P4.0 exit criteria

- Approved role-to-workflow and role-to-permission matrix.
- Explicit order, kitchen and payment state transitions with authorized actors.
- Touch-first cashier, waiter and kitchen flows; guest ordering and pay-at-cashier flow.
- Empty, loading, error, unauthorized, offline and retry states documented.
- Clear separation of interactive synthetic Preview from integrated local API/database tests.
- No production authentication, real charge, fiscal receipt, customer data or paid infrastructure assumption.
