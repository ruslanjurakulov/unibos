# Architecture proposal
Modular monolith: Next.js/TypeScript UI, NestJS API, PostgreSQL, Redis for queues/cache (not financial truth), S3-compatible object storage, Docker, OpenTelemetry. GitHub CI; Cloudflare DNS/WAF subject to configuration. Proposed subdomains: unibos.uz marketing, app.unibos.uz workspace, menu.unibos.uz guest, api.unibos.uz API; admin isolated access. Independent deploy artifacts and database backups.

## Boundaries
Identity, organizations/branches, roles, menu, tables/tokens, orders, kitchen, cashier, payments/fiscal adapters, ledger, subscriptions/entitlements, reporting, audit, admin. Future inventory, recipes, suppliers, payroll, loyalty, AI. Modules own writes; versioned contracts/outbox; no circular dependencies. Use transactional outbox with retry/dead-letter and consumer deduplication.

## Trust boundaries
Public guest -> edge -> API -> restricted DB role. Staff -> identity/MFA -> scoped API. Provider webhooks -> verified adapter -> transactional ledger/outbox -> fiscal worker. Admin separate identity policy; no default tenant data access. Storage keys tenant-scoped. Private infrastructure ports; TLS everywhere.

## Deployment
Separate dev/staging/prod accounts, credentials and data. Existing Nightshift server reuse only after capacity, isolation and residency review; no changes authorized. Initial modular deployment may be single node; HA later. Offline mode not promised: clear outage status, safe retries, no fake successful payment. ADRs record decisions and alternatives.
