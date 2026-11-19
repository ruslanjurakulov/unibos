# P4.5 Owner Analytics

An organization owner or director can review a selected branch's order activity, recorded cash settlements, drawer differences and kitchen preparation times at `/dashboard/analytics`. The dashboard uses the authenticated branch report.

## API

`GET /api/v1/organizations/{organizationId}/branches/{branchId}/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD`

Both dates are inclusive UTC calendar dates, with a maximum range of 92 days. For example, `from=2026-11-01&to=2026-11-30` covers the half-open interval from November 1 00:00 UTC to December 1 00:00 UTC. Duplicate, missing and unknown parameters return HTTP 400. An invalid date or range also returns HTTP 400.

The API requires a verified session with MFA. The underlying database query checks the branch's organization and the actor's organization-wide owner or director membership. The existing tenant transaction and row-level policies apply. An expired session returns HTTP 401. Missing MFA, an inaccessible organization or a branch outside the organization returns HTTP 403. Branch workspace navigation advertises `analytics.read` to owners and directors. The response sets `Cache-Control: no-store, private`.

One PostgreSQL statement produces all aggregates from a consistent snapshot. The report contains its version (1), organizationId, branchId, from, to, currencies, products, cashiers, kitchen and averagePreparationSeconds. Empty series are empty arrays. All monetary fields are decimal strings of integer minor units. All product quantities are decimal strings. Amounts and rankings are calculated independently per currency.

## Metric definitions

| Measure                                                                            | Source and period                                                                                                                                                                                                                            |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `orderCount`, `orderTotalMinor`, `averageOrderMinor`                               | Orders created during the period whose current status is other than CANCELLED. The arithmetic mean uses the current canonical order totals and rounds to the nearest minor unit in PostgreSQL. With zero qualifying orders the mean is null. |
| `cancelledCount`                                                                   | Orders created during the period whose current status is CANCELLED.                                                                                                                                                                          |
| `settlementCount`, `settledMinor`                                                  | Recorded cash settlements by payment creation time. The sum uses the amount applied to the order. It excludes tendered change and carries no fiscal revenue claim.                                                                           |
| `ledgerAlerts`                                                                     | Number of period settlements lacking either a matching CASH_DRAWER debit or ORDER_RECEIVABLE credit in the settlement currency and amount.                                                                                                   |
| `products`                                                                         | Top ten products per currency from immutable lines of orders settled in the period. Rank by total quantity, breaking ties by product ID. Use the latest contributing line's snapshot name.                                                   |
| `cashiers`                                                                         | Settlement count and applied cash per cashier and currency by settlement creation time. Cashier IDs can be matched against authorized staff records.                                                                                         |
| `closedShifts`, `expectedMinor`, `countedMinor`, `varianceMinor`, `varianceAlerts` | Shifts closed within the period, grouped by cashier and currency. Expected and counted amounts are stored closing snapshots. Each shift with a nonzero difference contributes one alert even if differences cancel in the total.             |
| `kitchen`                                                                          | Ticket counts by current status for tickets created within the period.                                                                                                                                                                       |
| `averagePreparationSeconds`                                                        | Arithmetic mean of observed PREPARING-to-READY durations for tickets reaching READY within the period, rounded to whole seconds. Missing or reversed timestamp pairs are excluded. With no usable pair, the value is null.                   |

Order and ticket status totals reflect their state at the time of the query. A later order addition can change the total for an earlier creation period. Settlement figures use immutable payment records, so the order and settlement cohorts can differ. When a cashier closes a shift on another day, its cash count belongs to that closure day.

## Export and privacy

The same branch permission and MFA requirement apply to the data available for CSV export. The dashboard requests a fresh report for the selected branch and period when the user downloads a CSV. After the API verifies the session and permission, the browser serializes that response to CSV. Monetary columns use integer minor units. CSV files contain business figures and may include internal cashier identifiers. The API returns no customer identity, credentials, order notes or kitchen preparation notes. A downloaded file remains in the possession of its recipient after the session ends.

## Database compatibility

The report uses the existing canonical tables and migrations 001–007. It reads with the application's restricted database role and uses the existing transaction statement timeout. It does not require a schema change, precomputed cache, scheduled job or currency conversion. Before staging acceptance, measure the READY event query with representative branch history. The event key supports the previous-version lookup; the existing schema has no separate date index for READY events. Rolling the application back to its preceding revision removes the report.
