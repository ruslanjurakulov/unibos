# P4.4.0 Verified Workspace Capabilities

## Contract

`GET /api/v1/me/workspace-capabilities` derives its response from the verified Better Auth session and current membership rows. It returns no role or organization input from the request. The endpoint reads the caller's organization memberships with `withUserTransaction`, then queries each organization's branches inside `withTenantTransaction`, where PostgreSQL RLS filters visible branches. Responses use `Cache-Control: no-store, private`.

Capabilities are scoped per organization and branch. Organization-level roles remain separate from branch assignments; the branch response includes both local `roles` and `effectiveRoles`. Branch administrator catalog writes use `catalog.branch.manage`; organization-wide catalog changes use `catalog.manage`. UI capabilities only decide navigation visibility. Existing route authorization and database RLS remain authoritative.

Navigation is emitted only for implemented authenticated surfaces: workspace, cashier POS, waiter, and kitchen. Shift, payment, transaction, and reporting capabilities are intentionally absent until their gated phases exist.

## Workspace UI

The reusable Global Corporate shell provides organization and branch selectors, scoped role labels, active-route navigation, UZ/RU/EN labels, a mobile navigation menu, and light/dark styling. Selector changes dispatch a shared workspace-scope event and update the URL. POS and staff pages consume that event, clear branch-bound display data, reload for the new scope, and ignore stale responses. POS cart state, unresolved order submissions, waiter additions, and other pending staff operations lock scope selectors and navigation. Browser Back/Forward scope changes are revalidated against the current capability response before updating page data.

The shell does not grant API access. Mutating requests continue to use the existing authenticated routes and their role, tenant, branch, MFA, and RLS checks.

## Verification

- API unit tests cover capability mapping for owner, director, administrator, accountant, cashier, waiter, and kitchen.
- Disposable PostgreSQL integration tests cover actual membership/RLS scope and a user who is a director in one organization and cashier in another.
- Browser QA covers capability-filtered links, organization/branch switching in POS, waiter and KDS, unresolved-cart locking, Back/Forward behavior, locale labels, Escape focus handling, theme, and 320–1920px overflow.
- The local Vercel Preview remains frontend-only; integrated roles cannot be validated there without the authenticated API.

No database migration was needed for this phase.
