# P4.4.5 Migration Reconciliation

## Finding

Two worktrees used the same business migration identifier, `unibos-business-003`, for different schemas:

| Lineage                 | File                                | SHA-256                                                            | Model                                                                                               |
| ----------------------- | ----------------------------------- | ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| Canonical P4 branch     | `003-restaurant-catalog-tables.sql` | `26915d6cb3c29a1a9d569ec727258a3abcef7135d72bc67bf63aac924527bd33` | Organization-scoped categories/products; branch price versions, availability, tables, and QR tokens |
| Preserved menu worktree | `003-menu-catalog.sql`              | `1135a14f97d76329565bb6ad77ddc193d89633dd7ab79cf3d96d86d7ed52493c` | Separate `menu_categories`, `menu_products`, and `menu_product_prices` lineage                      |

This is a migration-ID collision between branches, not an edited canonical migration. The menu worktree's schema is incompatible with P4's canonical model. Its useful authenticated UI flow is being adapted to the canonical API; its database migration and alternate API are not included.

## Canonical decision

Retain the existing P4 migration lineage without edits:

1. `001-business-security.sql`
2. `002-audit-permission-details.sql`
3. `003-restaurant-catalog-tables.sql`
4. `004-unified-orders.sql`
5. `005-kitchen-operations.sql`
6. `006-cash-shifts.sql`
7. `007-cash-payments.sql`

No additional migration is needed for the catalog UI or price-version compare-and-swap. No migration file or migration identifier was changed.

## Persistent database preservation

The persistent local PostgreSQL volume's ledger entry still records `unibos-business-003` with checksum `1135a14f97d76329565bb6ad77ddc193d89633dd7ab79cf3d96d86d7ed52493c`. A read-only transaction found the legacy `menu_categories`, `menu_products`, and `menu_product_prices` tables; all three had zero rows at the time of inspection. No business row contents were read.

The volume, schema, ledger, and checksums were not changed. The persistent database is **not repaired** and remains on the alternate lineage.

## Validation and recovery

Canonical P4 migrations must be applied from the beginning only to a new disposable PostgreSQL database for integration testing, then repeated to verify the migration runner's checksum/idempotency behavior. Do not point the migration runner at the persistent volume. Its checksum guard must remain enabled.

Before any future persistent or production adoption, the owner must approve a separate migration plan based on a verified backup, schema comparison, reviewed forward migration, and recovery rehearsal. Do not rewrite migration history, delete tables, or remove the volume.

## Remaining risks

- The persistent local lineage remains unreconciled.
- Empty legacy tables do not prove that other environments have no data.
- The final P4 disposable PostgreSQL suite result is recorded in `P4_4_5_INTEGRATION_QA.md` after execution.
