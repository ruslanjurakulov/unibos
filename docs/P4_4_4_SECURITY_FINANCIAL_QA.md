# P4.4.4 Security and Financial QA

## Scope and environment

P4.4.4 verifies the financial operations implemented in P4.4.0–P4.4.3 using synthetic users and a disposable local PostgreSQL database. The persistent local database and its known migration-ID collision are not modified by the disposable integration suite. No production service, live payment processor, refund flow, fiscal system, paid infrastructure, DNS, or Nightshift repository is used.

## Verified scenarios

The PostgreSQL-backed API integration suite verifies:

- Shift opening and closure state/version checks, drawer movement idempotency, and payment rejection after the cashier's shift is closed.
- Cash change calculation, same-key idempotent retry, conflicting retry rejection, and two cashiers racing to pay one order (one payment succeeds, one receives a conflict).
- A browser receives a definitive 409 after a competing cashier settles the order; it clears that rejected pending operation, refreshes payment history, and does not offer an endless retry. Network failures and ambiguous server failures retain the same idempotency key.
- Atomic order payment status, immutable payment row, payment event, balanced cash/receivable ledger, shift event, and audit persistence.
- A served kitchen ticket may belong to a canonical order that remains `SUBMITTED` and `UNPAID`; kitchen state and payment state remain separate.
- Finance reader access for an accountant, denial to kitchen users, read-only accountant authorization, and denied cross-tenant/cross-branch API access.
- `FORCE ROW LEVEL SECURITY` on payment, payment-event, ledger, and idempotency tables; no tenant rows without authenticated context.
- Transaction-history date, cashier, shift, order and status filters; bounded pagination; immutable item/event/ledger details; currency-grouped ledger totals; shift-to-ledger reconciliation; malformed date and out-of-range page rejection.

The production-build browser check stubs authenticated and financial API responses with clearly synthetic fixture data. It checks payment filters, pagination, large minor-unit formatting above `Number.MAX_SAFE_INTEGER`, known-409 recovery, UZ/RU/EN switching, light/dark theme, reduced motion, and horizontal overflow at 320, 390, 768, 1024, 1366, 1440 and 1920 px. It is a frontend contract test, not an integrated backend or Vercel test.

## Accounting assumptions

- Cash tender received and change are retained as operational details. Only the order's settled amount is added to expected drawer cash and journaled as cash debit / receivable credit.
- Minor units from different currencies are never summed together.
- A payment row cannot be edited or deleted. No compensation/refund API is present.
- Database payment operations commit atomically; `UNKNOWN` is a client retry state only and is not stored as a payment status.
- Reconciliation checks do not certify compliance with Uzbekistan's accounting, tax, or fiscal requirements.

## Limitations

- P4.4 supports internal cash records only; no real cash movement is initiated by UniBOS.
- No live Vercel API/PostgreSQL service is configured, so remote financial actions remain unavailable. Preview demonstrations remain synthetic.
- Browser tests do not measure real-user performance or native Windows/macOS/Linux/iOS/Android parity.
- An independent reviewer identified known-409 retry deadlock, unsafe large-number formatting, a cashier-ID documentation mismatch, and a session-storage failure edge. These were corrected and regression-tested. The final independent pass reported no remaining blocker or high-severity finding.
