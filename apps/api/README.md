# API foundation

NestJS/TypeScript infrastructure scaffold; not a business API or production deployment.

- `GET /health/live` returns200 without accessing dependencies.
- `GET /health/ready` performs real PostgreSQL `SELECT1` and Redis `PING`, returns200 only when both succeed, otherwise sanitized503. Dependency errors/URLs/credentials are not returned.
- Unknown routes return sanitized404; there are no tenant, identity, ordering or payment routes. No CORS origins are enabled.
- Local default binding is127.0.0.1:3001. Database/Redis credentials must be explicitly configured. Production TLS validation is configuration hygiene, not production-readiness certification.
- PostgreSQL connection/query and Redis connection/command probes have bounded timeouts; application shutdown closes the pool. Readiness endpoints should remain inside the infrastructure network before deployment.
- Structured JSON logs accept only fixed event/status/dependency fields and timestamp; no request bodies, paths, config, URLs or raw errors. Full OpenTelemetry exporters, alerting and production log transport are not implemented.

At repository root build the runtime package before the API: `npm run build -w @unibos/runtime && npm run build -w @unibos/api`. `npm run start -w @unibos/api` loads the ignored root `.env` if present. `npm run dev -w @unibos/api` watches compiled `dist`; after editing source rerun the build (source transpilation watching is not supplied).

`npm test -w @unibos/api` builds and executes actual loopback HTTP tests and real refused-connection probe tests without touching business data. Root smoke tests separately verify healthy disposable local infrastructure. PostgreSQL/Redis local credentials are development-only; restricted roles, RLS, authentication and tenant negative tests are P2 prerequisites before any business-data endpoints.

## Manual tracing

A local OpenTelemetry tracer initializes before the HTTP application accepts requests. It creates a manual `api.readiness` span with only a fixed service/route and enum dependency status attributes; it does not record URLs, credentials, raw exceptions, requests or response bodies. Default export is disabled. Set `OTEL_ENABLED=true` to enable a console exporter for local inspection; explicit `false` disables it and unknown values fail configuration. Provider shutdown flushes/closes the processor with the application. There is no global provider, auto-instrumentation, OTLP collector, hosted backend, alerting or production-monitoring claim. The in-memory-exporter test checks real HTTP readiness-failure spans and absence of credential/error data.

With disposable local services running, `npm run test:integration -w @unibos/api` loads the ignored root.env and tests actual200 readiness against authenticated PostgreSQL/Redis. It rejects production mode and nonlocal service URLs. Normal unit/HTTP tests do not require these services.
