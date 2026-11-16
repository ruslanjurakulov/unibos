# P4.4.5 Integration and QA Results

Run date: 2026-11-17 (Asia/Tashkent)

## Catalog implementation

- Added `/dashboard/menu` using P4 canonical organization-scoped category/product APIs and branch-scoped price, availability, and price-history APIs.
- The page uses verified workspace capabilities and selected organization/branch context. Cashiers without catalog management permission do not receive a catalog navigation link.
- Product/category archive, metadata editing, branch availability, append-only price history, stale-version conflicts, loading/error/empty states, and sign-in recovery are covered.
- Product price input is parsed to integer minor units. The API requires the client-observed price version (`expectedPriceVersionId`) and returns HTTP 409 for stale writes.
- Archived products have price editing disabled. Saving archived product metadata does not try to create a price version.
- Product image key is a reference only; upload/storage is not implemented. Tables and QR token APIs remain available, but this page does not add a separate table-management screen.
- No migration was added or edited.

## Database-backed API and authenticated UI

`npm run test:security` used a newly created disposable PostgreSQL database and a real local HTTP API. The API tests created synthetic users and an organization, verified MFA, created catalog entities, tested branch price versioning and availability, then removed the disposable database. The persistent local PostgreSQL volume was not used or changed.

Results:

- PostgreSQL isolation, audit, migration, catalog, QR, and order integration suite: **13/13 PASS**.
- Real HTTP identity/MFA/tenant suite: **20/20 PASS**.
- Additional real authenticated UI run, configured with `P4_4_5_API_PORT=3001` and `P4_4_5_UI_BASE_URL=http://127.0.0.1:3101`: **20/20 PASS**. The test shared the verified MFA session cookie with Chromium, loaded `/dashboard/menu`, and asserted the database-backed product and branch price rendered. Screenshot: `/workspace/work/p4.4.5-qa/catalog-integrated-authenticated.png`.
- The API test verified first-price creation, rejection of stale `expectedPriceVersionId` with 409, valid next-version creation, branch availability update, current catalog response, and two-entry price history.
- Concurrency safety is provided by locking the parent product row before reading the current immutable price version. This serializes writes without granting runtime `UPDATE` privilege on price history.

The optional Chromium leg is enabled only when `P4_4_5_UI_BASE_URL` is set. Normal CI does not import or require Playwright.

## Browser regression

`BASE_URL=http://127.0.0.1:3101 EVIDENCE_DIR=/workspace/work/p4.4.5-qa node tests/website/p445-catalog.cjs` — **PASS**.

- Seven widths: 320, 390, 768, 1024, 1366, 1440, and 1920 px.
- UZ/RU/EN labels, light/dark theme, category/product forms, branch price, availability, price history, stale-price recovery, archived metadata save, and horizontal overflow.
- The contract test uses a synthetic browser API fixture; authenticated local API/PostgreSQL validation is recorded separately above.
- Screenshots: `/workspace/work/p4.4.5-qa/catalog-owner-mobile.png` and `/workspace/work/p4.4.5-qa/catalog-owner-desktop.png`.

Existing P3–P4 browser regression tests were also run against a local production build:

- Auth step-up, P3.1 demo/pricing, P3.2 motion, P3.3 Solutions, P4.3 service demo, P4.3.1 navigation, P4.4.0 workspace navigation, P4.4.1 shifts, P4.4.2 cash payment, and P4.4.3 transaction history all exited successfully.
- P3.3 checked 30 locale/theme/viewport states and 30 reduced-motion states across widths up to 1920 px; six hero cards, all 11 lower modules, keyboard focus, no overflow, and no broken images passed.
- P4.3 cashier → kitchen → waiter demo passed at seven widths from 320 to 1920 px.
- P4.3.1 checked seven demo entries, UZ/RU/EN, mobile navigation, 23 HTTP routes, and seven viewport widths.
- Existing 624-case browser matrix was not rerun as a 624-case matrix; no prior count is presented as a new result.

P3.3 local performance sample (browser lab only, not real-user metrics): desktop LCP 572 ms, CLS 0, transferred JS 182,052 bytes; 390 px mobile LCP 852 ms, CLS 0, transferred JS 179,898 bytes, with one frame over 25 ms during scrolling. These values measure the existing `/solutions` route and are not a P4.4.5 catalog performance claim.

## Quality gates

| Command                                                           | Result                                                                     |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `npm run format:check`                                            | PASS                                                                       |
| `npx prettier --check 'docs/P4_4_5_*.md' tests/website/README.md` | PASS                                                                       |
| `npm run lint`                                                    | PASS                                                                       |
| `npm run typecheck`                                               | PASS                                                                       |
| `npm test`                                                        | PASS: runtime 6, database 3, security 3, API 12                            |
| `npm run test:security`                                           | PASS: PostgreSQL integration 13, real HTTP identity/MFA 20                 |
| `npm run security:secrets`                                        | PASS; scanner states it is heuristic and not a comprehensive history scan  |
| `npm audit --audit-level=high`                                    | PASS: 0 vulnerabilities                                                    |
| `npm run build`                                                   | PASS; optimized Next.js build includes `/dashboard/menu`                   |
| `npm run test:smoke`                                              | PASS with local API, PostgreSQL, and Redis; no persistent-volume migration |

The PostgreSQL integration run emitted a `pg` deprecation warning about a test client receiving a query while already executing a query. All 13 integration assertions passed; the warning remains a non-blocking test-code cleanup item.

## Independent review

An independent read-only reviewer found no blocking issue after re-review. It confirmed price writers serialize on the product row, the price-history table remains immutable to runtime roles, tenant/branch checks remain in place, and optional browser tests do not add a Playwright requirement to CI.

One initial review finding was corrected: archived products now disable price edits, show a translated explanation, and allow metadata saves without a price request. The synthetic browser test covers this behavior.

## Remaining limitations

- The persistent local PostgreSQL volume still contains the incompatible `unibos-business-003` lineage and remains untouched. It is not repaired.
- The page has no dedicated table/QR management screen and no image upload; the UI says so explicitly.
- Vercel Preview has no API/PostgreSQL integration and remains frontend-only. No real customer data is used.
- New remote CI and Preview results will be recorded after the verified commit is pushed.
