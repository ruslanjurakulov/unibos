# Database security boundary

Business001 creates organizations/branches/memberships/append-only audit with FORCE RLS;002 adds typed permission-change audit details. Both are checksum-protected forward migrations. `createRuntimeRoles` and `migrateBusiness` are explicit administrative tooling, not request handlers. Runtime uses only the restricted unibos_app pool and verified-user transaction helpers. No arbitrary tenant ID or unverified user may be passed from clients.

Run root `npm run setup:local`, `npm run infra:up`, `npm run build`, `npm run db:migrate`, then `npm run test:security`. Integration tests use MIGRATION_DATABASE_URL only to create/drop owned scratch databases and provision constrained roles; the real assertions connect as unibos_app. Do not run against customer/production data. See docs/P2_SECURITY.md for exact roles, policies, migration order and limitations.
