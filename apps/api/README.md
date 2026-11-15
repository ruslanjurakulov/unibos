# API security foundation

NestJS/TypeScript local API with infrastructure health, verified identity and scoped organization/branch/membership/audit routes. The exact P2 contract, recent-MFA requirements, RLS roles, migration order and unimplemented production surfaces are documented in docs/P2_SECURITY.md.

- GET /health/live is independent of dependencies. GET /health/ready performs actual bounded PostgreSQL/Redis checks and returns200 or sanitized503.
- When AUTH_ENABLED is validated, main creates separate restricted identity/application pools. Startup rejects administrative, owning, inherited and cross-scope privileges. No migration credential is used by request handlers.
- Exact trusted origins,16KiB bodies, bounded timeouts, input/role allowlists, verified sessions, recent-MFA gates and transaction-local database policies protect the P2 routes. Unknown/foreign scopes fail closed. Ordering/payment/Super Admin endpoints are not present.
- Local default binding is127.0.0.1:3001. Headers disable caching/type sniffing; raw driver errors, stack traces, connection strings and secrets are never returned. Logs accept fixed event/status/dependency fields only.

At root use npm run setup:local, npm run infra:up, npm run build and npm run db:migrate before starting. Start/dev load ignored .env.runtime, which excludes bootstrap/migration keys. Dev watches compiled dist only; rebuild after source edits. No source transpilation watcher or deployment is promised.

Unit/HTTP tests run without infrastructure via npm test. Root npm run test:security exercises real authenticated identity/MFA/RLS workflows in owned disposable databases. Root npm run test:smoke checks the built applications and real healthy/degraded infrastructure. The workspace test:integration is an additional health-probe-only test, not a replacement for the full identity/tenant suite.

## Manual tracing

A local OpenTelemetry tracer emits only api.readiness spans with fixed service/route and enum dependency status attributes. Default export is disabled; OTEL_ENABLED=true opts into console output. It does not collect URLs, credentials, raw exceptions, request/response bodies or global auto-instrumentation. Shutdown closes the provider. In-memory exporter tests verify the safe actual failure span. Hosted telemetry, alerts, production log transport and recovery monitoring remain later release gates.
