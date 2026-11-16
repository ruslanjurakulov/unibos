# P4.2 canonical order engine and cashier POS

## Scope and API contract

P4.2 adds one versioned order API. The cashier source is `CASHIER_POS`; fulfillment is `DINE_IN` or `PICKUP`. `DELIVERY` remains a valid domain value for future modules but is rejected by the cashier request parser. P4.2 only creates `SUBMITTED` orders; it does not implement kitchen transitions, shifts, payments, fiscal receipts or refunds.

- `GET /api/v1/organizations/:organizationId/branches/:branchId/pos` returns the authorized branch catalog (including current branch price and price version), availability and active tables.
- `POST /api/v1/organizations/:organizationId/branches/:branchId/orders` creates an order. The body requires an `idempotencyKey` UUID, `fulfillmentType`, and 1–100 items with `productId`, exact decimal-string `quantity` (up to three decimal places) and the price version the cashier reviewed. Dine-in additionally requires `tableId`. Item and order notes are optional.
- `GET /api/v1/organizations/:organizationId/branches/:branchId/orders/:orderId` performs a same-branch submission-status lookup and returns the canonical order plus immutable line snapshots.

Every mutating request requires a verified Better Auth session, recent MFA, and current owner/director, branch administrator or cashier authorization. Tenant identity and actor come only from that verified session. Read access to order totals/snapshots is limited in both the API and RLS to owner/director, branch administrator, accountant and cashier. Waiter/kitchen roles cannot read financial order history through the app role. API errors return generic messages plus fixed safe `reason` codes for stale price, unavailable product/table, currency mismatch and idempotency key reuse.

## Integrity and retry behavior

The server derives product name, active state, availability, branch price, price version, currency and line total from the current catalog. It never accepts client totals. Money is stored in integer minor units; quantity is PostgreSQL `numeric(12,3)`. Exact line totals use integer arithmetic with half-up rounding at one minor unit. Mixed currencies and a stale reviewed price are rejected with `409`; the client must refresh and ask for confirmation before sending a new request with a new key.

Order, line snapshots, `ORDER_SUBMITTED` event, audit row and idempotency result are written in one PostgreSQL transaction. A stable key is scoped by organization, branch, actor and operation. Identical retries return the same order; changed payloads with the same key return `409 IDEMPOTENCY_KEY_REUSED`. The integrated client stores an unresolved request in the current tab's `sessionStorage`, disables cart/context edits while the result is unknown, and only offers retry with that exact key and payload. A new order cannot replace it. After a confirmed response the cashier can query the order status endpoint. Table/product locks serialize order submission with table status, price version and availability updates without granting catalog write privileges to cashiers.

Orders and line snapshots are append-only in P4.2. Status is initially `SUBMITTED`; kitchen transitions are a later scope. `order_events` is the event boundary for P4.3. There is no separate order table per channel.

## Preview behavior

`/demo/pos` is a synthetic front-end exercise with fictional catalog values and a browser-only demo order result. `/dashboard/pos` is the authenticated integrated cashier UI and requires the configured API and PostgreSQL connection. Vercel has no NestJS/PostgreSQL backend, so the integrated route reports the missing service and links separately to the demo; the demo confirmation is not durable. The integrated API is exercised in the local disposable PostgreSQL HTTP integration test. There is no automatic fallback between integrated mode and demo mode.

## Migration incident

See [P4.2 migration checksum incident](P4_2_MIGRATION_CHECKSUM_INCIDENT.md). The persistent local volume remains on the separate `feat/p4-menu-catalog` migration lineage; P4.2 migration 004 was applied only to disposable databases during tests.

## Limitations

No waiter, guest QR, public menu or delivery order creation is exposed. No kitchen workflow, shift state, payment, fiscal receipt, customer identity, outbox worker or production deployment is included. Rate limiting relies on the existing shared HTTP/auth infrastructure; order-specific capacity limits and operational observability must be evaluated before public launch. The local integration suite proves the runtime-role RLS/API path on a disposable database, not the still-unreconciled persistent volume or a deployed backend.
