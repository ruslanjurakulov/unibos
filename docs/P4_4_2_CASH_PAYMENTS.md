# P4.4.2 Cash Payment Recording

## Scope

This stage adds internal cash settlement records for canonical UniBOS orders. It does not connect a payment provider, move funds, issue fiscal receipts, process refunds, or support partial/split payments.

Only a branch cashier with a verified MFA session and an open cashier-owned shift may record a payment. The server obtains the order total and currency from PostgreSQL. The client submits only cash received and an idempotency key; it cannot set the payable amount, change, currency, cashier, or shift.

## API

- `GET /api/v1/organizations/{organizationId}/branches/{branchId}/cash-payments` returns the authenticated cashier's open shift, payable orders, and authorized branch payment history. Read-only accountants receive payment history and no cashier order queue.
- `POST /api/v1/organizations/{organizationId}/branches/{branchId}/cash-payments/orders/{orderId}` records one full cash settlement. Body: `{ "idempotencyKey": "<uuid>", "cashReceivedMinor": "<integer string>" }`.

Retrying the same operation key and body returns its original payment. Reusing the key with a different body is rejected. A second settlement for an already paid order is prevented by the unique order constraint and the locked database payment guard.

## Persistence and integrity

Migration `007-cash-payments.sql` adds an independent `orders.payment_status` (`UNPAID` / `PAID`) and `paid_at`, keeping kitchen/fulfillment order status independent.

The payment, payment event, order event, shift event, audit event, order paid marker and two balanced ledger entries are committed in one PostgreSQL transaction. Ledger debits to `CASH_DRAWER` and credits to `ORDER_RECEIVABLE` equal the order total. Cash tender above the total becomes change and is not recognized as extra revenue. Shift expected cash adds the net order tender, not the handed-over amount.

Payment, event, and ledger tables use FORCE RLS, tenant/branch composite foreign keys and immutable rows. The database rechecks the order, exact amount, currency, cashier identity and active shift under row locks. The runtime role cannot update catalog prices or payment records.

## Known limits

- Settlement is full amount, cash only, and single-payment-per-order.
- Refunds, voids after settlement, split tender, card/bank methods, fiscal receipts and provider integration are out of scope.
- Vercel Preview has no deployed NestJS/PostgreSQL backend; the authenticated screen must display the API-unavailable state and never synthesize a real payment.
- Minor amounts use the existing two-decimal currency contract for supported currencies.
