# Owner analytics verification

The application reads synthetic staging data through the restricted PostgreSQL role. Staging used PostgreSQL 17.10, Redis 8.6.2 and separate runtime and migration credentials. Both services were bound to loopback. The existing local cluster with the conflicting migration 003 was left in place.

## Browser and API

A cashier with a verified MFA session submitted a pickup order containing two items at 13,575 minor units each. The owner opened the same branch through a production build of the website connected to the local API. The report returned one order worth 271.50 UZS, zero recorded cash and a downloadable CSV. A cashier in the same branch could not export the report and received HTTP 403 from the endpoint. The separate API/database suite covers settled orders and discrepancies in the ledger.

The browser suite in `tests/website/p45-owner-analytics.cjs` uses synthetic API fixtures for deterministic dates, branch changes, authorization loss during export, failed reads and recovery. It exercises keyboard input, light and dark themes, Uzbek, Russian and English, and widths from 320 to 1920 pixels. The integrated browser check above used an actual MFA enrollment and PostgreSQL records.

## Synthetic workload

On one disposable database the test generated 12,000 orders, lines and kitchen tickets and 48,000 ticket events across two branches and 120 days. The restricted runtime role read a 92-day interval in one branch. All three reads returned 4,550 orders and ready tickets, 11,375,000 UZS minor units and a 180-second average preparation time. End-to-end transaction times in this environment were 953, 1,187 and 819 milliseconds. A separate `EXPLAIN (ANALYZE, BUFFERS)` run took 680 ms and the finishing-event scan filtered 19,450 extra events. This workload used one reader and had no recorded payments. Concurrent reads, larger settlement volumes and service-level objectives still need staging measurements.

## Release environments

Vercel builds the frontend and shows the availability of its configured authenticated API. Real account and database checks above ran in a disposable local environment. A durable remote staging service, production release and customer onboarding require separate operational setup.
