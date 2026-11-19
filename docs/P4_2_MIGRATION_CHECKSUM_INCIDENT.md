# P4.2 local migration checksum incident

## Finding

The persistent local PostgreSQL volume was not on the current P4 branch's migration lineage. Its `unibos_business_migrations` ledger recorded `unibos-business-003` with SHA-256 `1135a14f97d76329565bb6ad77ddc193d89633dd7ab79cf3d96d86d7ed52493c` (applied at `2026-11-15T19:00:31.077Z`). That digest matches the uncommitted `003-menu-catalog.sql` in the separate `feat/p4-menu-catalog` worktree. The current P4 branch's immutable `003-restaurant-catalog-tables.sql` hashes to `26915d6cb3c29a1a9d569ec727258a3abcef7135d72bc67bf63aac924527bd33`.

The discrepancy is therefore a branch/worktree migration-ID collision, not an edited file on the active branch. The persistent volume has the menu-schema tables `menu_categories`, `menu_product_prices`, and `menu_products`; they were empty when inspected. Current-branch catalog/table/QR tables and order tables were absent. No customer or business row contents were inspected.

## Preservation and recovery

The persistent volume and its checksum ledger were left unchanged. No migration was run against it, no checksum was rewritten, and no table or volume was dropped. The other worktree's uncommitted files were not changed. P4.2 adds `004-unified-orders.sql` after the committed current-branch `003-restaurant-catalog-tables.sql` and will be validated only against a newly created disposable integration database using the strict checksum runner.

For local use of the persistent volume, preserve its current lineage and use its owning worktree, or make a separately reviewed forward migration/reconciliation plan after both branches' intended schemas are known. Do not make the current branch pretend that its `003` has been applied there. Production/staging adoption requires a backup and an explicit migration plan; no persistent-database repair is claimed here.

## P4.2 schema and recovery

Migration 004 adds canonical orders, immutable order item snapshots, append-only order events, and actor/branch scoped idempotency keys, with composite tenant/branch foreign keys, `ENABLE` and `FORCE ROW LEVEL SECURITY`, restricted app grants, and order audit logging. There is intentionally no destructive down migration. Recovery is forward-only: restore a tested backup if migration execution must be reversed operationally, then apply a reviewed corrective migration. Integration tests use only an owned disposable database which is dropped after the test run.

## Limitations

The Vercel website project has no deployed NestJS API or PostgreSQL service. `/demo/pos` is synthetic, browser-local interaction only. Integrated API behavior is exercised against local disposable PostgreSQL tests; no deployed integration is implied. The persistent local database remains unreconciled.
