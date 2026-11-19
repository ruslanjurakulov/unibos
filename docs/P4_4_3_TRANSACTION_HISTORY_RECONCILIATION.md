# P4.4.3 Transaction History and Reconciliation

## Scope

P4.4.3 adds a read-only, branch-scoped payment history and reconciliation view to the internal cash payment module. It does not add refunds, payment edits, external payment processing, fiscal receipts, or legal accounting claims.

## API

`GET /api/v1/organizations/:organizationId/branches/:branchId/cash-payments`

Supported query parameters:

- `from`, `to`: inclusive calendar dates in ISO `YYYY-MM-DD` format.
- `cashierId`: verified-auth user ID text matching `[A-Za-z0-9_-]{1,128}`.
- `shiftId`, `orderId`: UUID filters.
- `paymentStatus`: `RECORDED` (the only persisted payment status in P4.4.2).
- `page`: one-based page, bounded to 100,000.
- `pageSize`: 1–100, defaults to 25.

The organization and branch come from the route and must be authorized by the current session. Query filters cannot widen that scope. The API returns immutable payment facts, order line snapshots, table/pickup context, cash received and change, event history, ledger entries, pagination metadata, branch reconciliation totals, anomaly counts, and up to 50 recent shift reconciliations. Accountants have read-only access through the same capability and RLS checks as other authorized finance readers.

## Reconciliation rules

- Order settlement amount is the payment amount and the net cash drawer addition. Customer tender and change are shown separately; tender is not revenue.
- Each cash payment has two immutable ledger entries: `CASH_DRAWER` debit and `ORDER_RECEIVABLE` credit for the same amount and currency.
- Branch-level payment and ledger totals are grouped by currency; minor units from different currencies are never added together.
- Shift expected cash is opening cash plus signed drawer movements plus settled payment amounts. Closed-shift counted cash and variance are retained as immutable closure facts.
- Duplicate-payment orders, incomplete or unbalanced ledger/event records, paid orders without a payment, and shift-to-ledger mismatches are reported as anomalies.
- Payment writes are atomic with order status, payment event, ledger, shift event, and audit record. Consequently, the database has no separate persisted `UNKNOWN` status. A browser timeout remains a client-side pending operation and retries with the original idempotency key.
- A payment row cannot be edited or deleted. Corrections require a separately authorized compensating-event design; no refund or correction flow is enabled here.

## Known limits

- Payment method is restricted to internal cash recording.
- History pagination is bounded and branch-scoped; the endpoint does not aggregate across branches.
- Reconciliation totals are operational checks, not statutory accounting or fiscal certification.
- Vercel Preview remains frontend-only unless separately configured with the authenticated API and isolated test database.
