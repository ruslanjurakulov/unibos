# Website engineering shell

This is a local Next.js application scaffold, not the P3 marketing website or a deployed business service. There are no authentication, ordering, payment or subscription flows. No external fonts, analytics, APIs or paid services are contacted by the page. Arial/Helvetica are temporary local system fallbacks; licensed self-hosted product typography is a later interface milestone.

From the repository root, use the website workspace's `dev`, `build`, `start` and `typecheck` scripts. Development and production-preview commands bind to `127.0.0.1` by default. The build uses webpack explicitly for a predictable baseline across local and CI hosts.

The original central-bar logo and favicon are byte-for-byte copies from `assets/brand/`. The checked-in security headers are a local baseline. The script/style CSP currently allows inline bootstrap/style content required by this Next.js shell; a nonce/hash policy must be designed and verified before introducing untrusted content or production deployment. HSTS is intentionally not enabled on a local HTTP-only preview. `robots` noindex is a crawler hint, not access control.
