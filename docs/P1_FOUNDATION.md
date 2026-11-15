# P1 engineering foundation

## Scope and architecture

Local-only TypeScript/npm workspace monorepo: `apps/website` (Next.js), `apps/api` (NestJS), `packages/runtime` (shared validated configuration). PostgreSQL17 and Redis8 run in isolated Docker Compose services bound to127.0.0.1. Other planned product surfaces/packages will be added when they own real behavior; empty application placeholders are intentionally not represented as implemented products.

No provider account, public application deployment, customer database, payment flow or production resource is created. Identity, organizations, tenant tables, migrations, restricted app roles/RLS, cross-tenant tests and authorization remain P2 requirements before any business endpoint. The development bootstrap database role is privileged; never use this local configuration for tenant or production data.

## Reproduce on Linux x64 / Node24

1. Install Node24.22.1/npm11 and Docker with Compose. `npm ci` installs pinned packages from package-lock.json.
2. `npm run setup:local` creates a mode0600 ignored .env with random development database/cache passwords. Existing files are preserved. Never commit this file.
3. `npm run infra:up` starts only the `unibos-local` services and waits for their healthchecks. Data lives in named development volumes. `npm run infra:down` stops services without deleting volumes.
4. `npm run build` builds runtime, API and website. `npm run dev:api` watches compiled output; rebuild API after source edits. `npm run dev:website` runs local Next.js. Both bind loopback by default. Health routes: API3001, website3000.
5. `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm test`, `npm run security:secrets`, `npm audit --audit-level=high`, `npm run test:smoke` exercise distinct gates. Smoke requires built applications and healthy Docker services; it owns/stops its temporary server processes.

Do not run Compose against production credentials or shared Nightshift infrastructure. Regenerating .env passwords does not rotate passwords already stored in a persistent PostgreSQL volume; retain the original file or perform an explicit reviewed credential rotation. No automatic data deletion/reset command is provided.

## Boundaries and failure behavior

The website is a truthful server-rendered foundation page using the approved original central-bar logo. It has no account/order/payment buttons or API-driven business flow. Local fonts avoid external build requests. Next CSP permits inline bootstrap scripts/styles; nonce/hash production hardening and font performance belong to the interface/release gates. No TLS/deployed security posture is claimed.

The API only exposes `/health/live` and `/health/ready`. Liveness is independent of dependencies; readiness performs actual bounded `SELECT1` and RedisPING checks concurrently. Dependency failure returns a generic503 without credentials/raw exceptions; unknown business routes404. Pool cleanup/shutdown and minimal enum-only structured logs are implemented. Health checks do not authorize users, read tenant data or establish payment correctness.

OpenTelemetry provides safe manual readiness spans with no network exporter by default; `OTEL_ENABLED=true` opts into console export for local diagnosis. No hosted collector, alerts, metrics pipeline or production monitoring is provisioned. See apps/api/README.md for the precise implementation and tests.

## CI and supply chain

Engineering workflow: pinned read-only checkout; Node24 archive checksum verification over HTTPS; npm ci; format/lint/typecheck/tests/build; known-format credential scan; npm audit; disposable Compose infrastructure; actual healthy/degraded HTTP smoke; cleanup even on failure. No deployment job or repository secret is used. Linux x64 is the tested CI platform; macOS/Windows and real devices are not certified.

TypeScript5.9.3 is intentionally selected because the current typescript-eslint peer range is below6.1; upgrading to registry latest TypeScript7 would violate that peer contract. ESLint10 is used instead of the unsupported9 series. A scoped override moves typescript-estree's minimatch to11.0.8 to resolve the registry-reported denial-of-service advisory; parser/lint/type checks must keep passing when this override is changed. No force audit fix/downgrade is used.

Known-format credential scanning is a scoped guard, not a comprehensive secret or external security audit. Do not infer certification from passing CI. Version and local test evidence are recorded in the PR; exact-head independent review is required before merge.

## P0 completion and temporary visibility

P0 PR#1 merged at `2a1e350a0fbb77a7aa3bb1bc0f3aa60e24a6b872` after run43724281048 was re-executed successfully on reviewed head77ca0d2. Main was fetched and the17-file SVG gate/committed whitespace checks rerun successfully. Earlier billing-blocked results in docs/P0_REVIEW.md are a historical snapshot.

The owner explicitly authorized temporary Public repository visibility to build the foundation, then a return to Private. This exception permits the current source workflow; it does not authorize secret disclosure, paid resources, Nightshift access or public application deployment. Return to Private after foundation verification; public history may have been copied while visible. Future private-repository hosted CI quota must be resolved separately rather than bypassing gates.

## Actual local verification

On2026-11-15, Linux/Node24.22.1: workspace builds/typecheck/lint/format checks passed; runtime3 and API5 tests passed, including credential-safe configuration/HTTP failures and in-memory OpenTelemetry export. Real healthy local PostgreSQL/Redis integration and root smoke passed. Smoke also verifies dependency-unavailable503, liveness200, unknown business route404, original logo equality, no X-Powered-By and an inaccessible.env route. Known-format credential scan passed; npm audit returned0 vulnerabilities after the scoped minimatch fix.

The first actual healthy smoke failed because Redis6 startup AUTH/HELLO/SETINFO exceeded a queue capacity of1. The bounded capacity was corrected to32; fresh healthy and refused-connection tests passed. The earlier failure is not counted as a pass.

Browser verification uses Chromium/Linux and eight viewport widths320/375/390/430/768/1024/1440/1920. Screenshots and exact results are in docs/p1-evidence/. This verifies the foundation page, not unimplemented business flows. No Firefox/WebKit, physical-device, cross-tenant, legal or production-release pass is claimed. Final CI run, reviewed SHA and merge result are recorded in the PR.
