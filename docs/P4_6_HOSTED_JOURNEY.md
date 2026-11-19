# Hosted synthetic restaurant journey

Run this acceptance check on Windows with Node 24 using the staging QA operator’s Windows user. Only the integrated Preview branch alias embedded in `scripts/staging/hosted-session.cjs` is supported. The run requires a ready staging API and four preprovisioned, verified synthetic identities.

| Identity                          | Session password in the launching process |
| --------------------------------- | ----------------------------------------- |
| qa@unibos-staging.invalid         | `UNIBOS_QA_PASSWORD`                      |
| qa-cashier@unibos-staging.invalid | `UNIBOS_QA_CASHIER_PASSWORD`              |
| qa-kitchen@unibos-staging.invalid | `UNIBOS_QA_KITCHEN_PASSWORD`              |
| qa-waiter@unibos-staging.invalid  | `UNIBOS_QA_WAITER_PASSWORD`               |

Set `UNIBOS_GATE_PASSWORD` and the four passwords privately using the existing staging vault. Keep shell history, repository files and terminal logs free of their values. For an identity already enrolled using another device, its password variable's `_PASSWORD` suffix can be replaced with `_TOTP` to supply a current six-digit second factor. Otherwise the runner stores and reads its enrolled factors under the current user’s DPAPI protection. Enrollments are persisted before verification. Both JavaScript files must be in the same directory.

```powershell
node scripts/staging/hosted-journey.cjs
```

The test checks the anonymous admission challenge and authenticated readiness, then signs in four distinct actors. The QA owner creates or recovers the named synthetic organization and branch and assigns the three staff accounts only if their current scopes are empty. Mismatched or broader scopes stop the test. The owner creates one synthetic menu item and table in that organization.

The cashier submits two units at 12,500 minor units. The kitchen accepts the ticket, starts preparation and marks it ready. The waiter serves it. The cashier records an **internal synthetic** cash settlement for 25,000 minor units, with 30,000 tendered and 5,000 change. The shift starts at 5,000, closes at 30,000 and has zero variance. The owner’s report must show one order, one settlement and one served ticket. The test also verifies that the waiter cannot settle and the kitchen cannot read financial analytics. It uses no payment provider or fiscal service.

After an interrupted request, rerun the same command. Resource IDs are recorded in the current user’s local journal. Branch-scoped deterministic request keys allow the server to recover the existing order, ticket, shift and settlement. Rerunning confirms their identities and the analytics totals. A separate test run from the same machine is prevented by a Windows named-pipe lock. Allow 60 seconds after a previous four-user login attempt if the server responds with HTTP 429. Keep this branch dedicated to this fixture so the exact totals remain meaningful.

Successful output includes only public synthetic record identifiers and minor-unit amounts. The integration regression discards a successful settlement response and replays the journey against the real disposable HTTP/API/database test stack in `npm run test:security`.
