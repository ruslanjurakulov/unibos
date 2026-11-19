# P4.4.1 Cash Shift Management

## Scope

Cash shifts are authenticated operational records. The application records shift counts and drawer movements; it does not move physical cash. Cash payments are intentionally excluded from this phase.

## State model

`OPEN -> CLOSING -> CLOSED`

An active shift cannot be reopened. A partial unique index permits one `OPEN` or `CLOSING` shift per organization, branch, and cashier. Opening records a currency and integer minor-unit amount. Closing snapshots the server-calculated expected cash and a cashier-entered count. The final variance is `counted_cash_minor - closing_expected_minor`.

For P4.4.1, expected cash is opening cash plus recorded `CASH_IN` minus `CASH_OUT` drawer movements. P4.4.2 must include successfully recorded cash payments in the same calculation before payment recording is enabled. A movement cannot take the drawer below zero or above the configured integer ceiling.

## Security and integrity

- Every shift table uses `FORCE ROW LEVEL SECURITY` and tenant/branch composite foreign keys.
- A cashier can read and mutate only their own shift. Branch administrators, organization owners/directors, and accountants receive only the phase-specific read or operate access.
- Mutations require a verified MFA session, an idempotency key, and the current shift version.
- Each mutation, shift event, and drawer movement is written within one transaction and produces an append-only audit event.
- The database guard prevents invalid state transitions, updates to immutable shift identity fields, incorrect close snapshots, and version jumps.
- Amounts use integer minor units; no client-provided totals are trusted.

## API

- `GET /api/v1/organizations/:organizationId/branches/:branchId/cash-shifts`
- `POST /api/v1/organizations/:organizationId/branches/:branchId/cash-shifts`
- `POST /api/v1/organizations/:organizationId/branches/:branchId/cash-shifts/:shiftId/movements`
- `POST /api/v1/organizations/:organizationId/branches/:branchId/cash-shifts/:shiftId/begin-close`
- `POST /api/v1/organizations/:organizationId/branches/:branchId/cash-shifts/:shiftId/confirm-close`

The integrated workspace has no synthetic fallback. If its authenticated API is unavailable, the page reports that state instead of displaying invented shift data.

## Migration and verification

Migration `006-cash-shifts.sql` is forward-only and is exercised only on the disposable PostgreSQL database created by the integration suite. The persistent local database and its known migration-ID collision are not modified.

The integration suite covers migration repeatability, RLS, same-key concurrent retries, conflicting retries, active-shift uniqueness, movement totals, close variance, closed-shift immutability, accountant read-only access, kitchen denial, cross-branch denial, and cashier-to-cashier data isolation.

## Known limitation

Cash payments are not implemented in P4.4.1. Until P4.4.2 is complete, expected cash includes opening balance and drawer movements only. This phase is not a production cash-handling or fiscal system.
