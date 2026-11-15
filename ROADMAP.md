# Roadmap
Day 1–5: approve blueprint, legal/provider feasibility, pilot interviews, original identity/prototypes. Day 3–10: private repository, CI, tenancy/auth, staging, core schema. Day 5–12: truthful marketing/demo. Day 8–18: menu, branches, roles, onboarding. Day 11–22: QR/NFC, orders, kitchen, cashier. Day 15–25: entitlements/admin/reporting. Day 21–28: independent review, load/security/restore tests. Day 26–30: pilot and pitch if gates pass. Dates aspirational, not guaranteed. Parallelize only independent work. Online payment/fiscal launch blocked until contractual, technical and legal approvals; pilot may use existing certified cash register procedures where lawful.

Days 31–90: improve pilot, validate subscriptions, reconcile provider integrations, measure retention. Later inventory/recipe/procurement/finance, loyalty, staff and AI. No scope expansion without impact assessment. Definition of done: reviewed code, tests, docs, observable errors, acceptance evidence, owner approval when required.

## Current execution gates (2026-11-15)
The day ranges above are the earlier aspirational schedule, not completion evidence. P0 brand alignment, P1 engineering foundation and P2 security foundation are merged. P3 interface work is in progress locally. P4 business operations, P5 monetization and P6 commercial readiness remain future gates. See the phase documents for verified status; do not treat this roadmap as implementation evidence.

## P7 — MCP integrations (after P6 approval)

Model Context Protocol integrations are a future phase. Do not connect an MCP client/server, publish a UniBOS MCP endpoint, grant external tool access or transmit UniBOS data as part of P3.

Before implementation:

- Define bounded use cases and whether UniBOS acts as an MCP server, MCP client, or both. Start with read-only business summaries and approved exports; defer write-capable tools.
- Review every tool/resource/prompt and its input/output schema. Avoid arbitrary SQL, filesystem access, shell execution, unrestricted URL fetches and generic tenant-data search.
- Reuse verified UniBOS identity and current organization/branch authorization for every tool call. Never trust tenant IDs supplied by the model/client; enforce the same server-side checks and PostgreSQL RLS used by the application API.
- Require explicit organization-level consent for each connection, narrow OAuth scopes, secure token storage and rotation, disconnect/revocation, per-tenant rate limits, bounded results and audit records. Secrets and raw authentication tokens must not enter prompts or model-visible results.
- Treat remote tool output as untrusted input. Defend against prompt injection and data exfiltration; allowlist remote servers and resources, bound timeouts and payload sizes, redact sensitive fields and keep access decisions outside the model.
- Require user confirmation for any mutation, financial/fiscal action or external side effect. Preserve idempotency and replay protections, least privilege, and a human-auditable record of the approved action.
- Verify tenant-isolation negative cases, revoked consent, changed membership, unauthorized scopes, malformed/oversized responses, rate limits, outage handling and audit completeness before release.
- Complete independent security review, privacy/legal review and owner approval before connecting production tenants. Use synthetic data and local/approved sandbox endpoints until then; do not create paid provider resources without separate approval.

MCP protocol version, transport, vendors, tool catalog and rollout order are intentionally undecided until use cases and threat model are approved. This roadmap entry authorizes planning only, not implementation, provider access or data sharing.
