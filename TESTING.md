# Test and release gates
Unit: prices/tax/discount rounding, states, entitlements, currency and quantity. Integration: tenant A cannot access B through IDs, search, export, files, jobs, webhooks; role/branch matrix; signup/revoke; subscription expiry; malicious webhook, duplicates, out-of-order events, concurrent checkout/refund, fiscal timeout/reconciliation. E2E: QR to order/kitchen/cashier, menu change, cashier shift, admin audit, mobile/desktop and keyboard. Security: SAST, SCA, secret and image scanning, DAST staging, manual authorization review. Performance: establish measured peak and load targets with pilot; graceful overload. Recovery: encrypted backup restore, migration rehearsal, rollback. Never use production data or charge real funds in tests.

Release requires zero known unresolved critical/high vulnerabilities, passing required CI, independent review, verified backup restore, monitoring/alerting, provider/legal signoff where relevant and founder release authorization. Evidence reports include commit, environment, dates, results and exceptions; no fabricated pass. Gates cannot be self-certified by author agent alone.

## Executable P2 gates
After local setup/build/infra/migration, run npm test (20 package tests), npm run test:security (10 restricted-role PostgreSQL +19 full HTTP tests, including parent test cases), and npm run test:smoke. CI runs those real gates with disposable databases. See docs/P2_SECURITY.md for findings, exact coverage and unverified release surfaces.

## PostgreSQL recovery rehearsal

Run `npm ci` and `npm run test:restore` as an unprivileged Unix user. Install PostgreSQL server and client binaries from the same major release (16 or later). `pg_config --bindir` locates the binaries; use `POSTGRES_BINDIR` to select a specific installation. The local staging rehearsal uses PostgreSQL 17.10.

The script initializes two private clusters under `TMPDIR`, each listening only on its own Unix socket. It applies the canonical identity and business migrations, creates two synthetic restaurant owners and takes a custom-format `pg_dump`. It stops the source, creates fresh runtime roles and passwords on the target, and runs `pg_restore --single-transaction` with original ownership and ACLs. It then compares migration IDs, checksums and timestamps, replays the migration runner and connects as the restricted application role to verify tenant isolation and denied access to identity and ledger tables. On exit it stops its own servers and removes its temporary data and archive.

The engineering workflow runs this rehearsal on each PR. Off-host encrypted backup storage, retention, point-in-time recovery and recovery time on a representative dataset require separate staging evidence.
