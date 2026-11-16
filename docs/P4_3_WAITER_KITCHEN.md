# P4.3 Waiter Workspace and Kitchen Display

## Scope and verification status

P4.3 extends the P4.2 `orders` and `order_items` model. Cashier submission creates one canonical order, immutable item snapshots, one initial kitchen ticket, an idempotency result and audit/order events in the same PostgreSQL transaction. Waiter additions append snapshots and make a separate ticket; existing lines and tickets are not modified.

The local PostgreSQL integration suite uses a fresh disposable database. The persistent local database with the known `unibos-business-003` migration collision is untouched and remains unreconciled. Vercel has no NestJS API or PostgreSQL connection; the browser demo is synthetic and session-local.

## Schema

Migration `005-kitchen-operations.sql` adds:

- `kitchen_tickets`, scoped by organization, branch and canonical order, with per-order ticket number, status and optimistic version.
- `kitchen_ticket_items`, immutable links from one ticket to only its new `order_items` snapshots. A unique order-item constraint prevents the same submitted line being sent twice.
- `kitchen_ticket_events`, append-only, versioned actor/status history.
- A nullable `result_ticket_id` on existing idempotency rows for create/add/transition retry results.

Migration 005 backfills each existing order with item snapshots into an initial ticket, maps its current order status to the corresponding ticket status, records a migration-time ticket/audit event using the original actor and timestamp, and fills the `result_ticket_id` for prior `CREATE_ORDER` idempotency keys. It does not rewrite order or line-item snapshots.

All ticket tables use `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`. Composite foreign keys bind each ticket and line to its organization, branch and order. The waiter and kitchen API does not select financial order columns. Narrow definer functions return operational projections and server-computed item inserts; the database role is not granted a waiter/kitchen financial projection.

## API

Routes require a Better Auth verified session and derive organization, branch and actor from membership plus route scope. State changes require recent MFA.

| Method and route                                                              | Purpose                                                                                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/v1/organizations/:org/branches/:branch/waiter`                      | Branch tables, open operational orders without totals, current catalog and active ticket statuses.                                                                                                     |
| `POST /api/v1/organizations/:org/branches/:branch/waiter/:orderId`            | Add price-version-checked products to an open canonical order and create one ticket. Body includes an idempotency UUID and item product IDs, quantities, current price-version IDs and optional notes. |
| `GET /api/v1/organizations/:org/branches/:branch/kitchen/tickets`             | Oldest-first open ticket queue with table context and preparation-only item projections. No totals or payment data.                                                                                    |
| `PATCH /api/v1/organizations/:org/branches/:branch/kitchen/tickets/:ticketId` | Kitchen `ACCEPT`, `START`, `READY`, or reasoned `CANCEL` transition with `expectedVersion` and idempotency UUID.                                                                                       |
| `PATCH /api/v1/organizations/:org/branches/:branch/waiter/:ticketId`          | Waiter `SERVE` transition with `expectedVersion` and idempotency UUID.                                                                                                                                 |
| `POST /api/v1/organizations/:org/branches/:branch/waiter/:orderId/bill`       | Append an idempotent `BILL_REQUESTED` event. It does not confirm payment or expose financial totals.                                                                                                   |

Status transitions are `QUEUED → ACCEPTED → PREPARING → READY → SERVED`; controlled cancellation requires a reason before readiness. Stale versions and illegal transitions return `409`. Identical idempotency retries return their original ticket result; a reused key with a different request is rejected. Order additions lock the canonical order, resolve and validate current product price/availability on the server, and recalculate totals from stored integer-minor-unit snapshots.

Order status is an aggregate of its non-cancelled tickets. Ticket events and canonical `order_events` are written in the same transaction. Kitchen and waiter polling is bounded to five seconds while the tab is visible; it is not push real-time delivery.

## UI modes

- `/dashboard/waiter` and `/dashboard/kitchen` are authenticated integrated workspaces. They show organization/branch selection, loading/error/offline state, polling status, and role-specific controls. They require the API; they never fall back to demo data.
- `/demo/service` is a same-page synthetic role-switching exercise. Cashier, kitchen and waiter use one in-memory state for the active page. Refreshing or opening another browser/device does not synchronize that state. No database/API persistence, payment or real order is implied.
- Cashier POS remains at `/dashboard/pos` and `/demo/pos`.

The browser demo supports Uzbek, Russian and English, dark mode, reduced-motion preference and touch-sized controls. Browser QA covers 320–1920px widths. The local PostgreSQL-backed API integration test is separate from browser demo QA.

## Known limitations

- No hosted backend is connected to Vercel Preview.
- Polling is bounded and visibility-aware, but does not provide server push.
- Waiter table access currently covers branch-active tables and open orders; per-employee table assignment is not modeled.
- Bill requests are append-only operational events; cashier acknowledgement and payment workflows belong to a later authorized stage.
- Cancellation is available only before the ticket is ready; served tickets are terminal.
- The persistent development PostgreSQL migration-ID collision remains unresolved and unchanged.
