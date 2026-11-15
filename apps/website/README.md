# UniBOS website and interface previews

The Next.js app now contains Uzbek, English and Russian marketing and guest-menu interfaces, self-hosted licensed typography, sign-in/sign-up and TOTP setup screens, a Business Workspace that reads the authenticated P2 organization/branch API, plus clearly labeled workspace and guest-menu demos. Authentication and the current workspace screen remain English-only. The sample guest cart stays in browser memory; it cannot submit an order or payment. The dashboard currently covers account business organizations and locations only. Menus, orders, team management, analytics, subscriptions and deployed service flows are not available.

The local API proxy uses `UNIBOS_API_ORIGIN`, defaulting to `http://127.0.0.1:3001` outside Vercel. For local authentication, open the site at `http://127.0.0.1:3000`; that exact origin is present in the generated local API trusted-origin configuration. If a Vercel preview has no configured backend, same-origin API routes return a fixed 503 and the sign-in form stays disabled; credentials are not collected. Production requires an explicitly configured secure API origin and verified TLS, plus reviewed email verification and delivery before signup is enabled.

Run the website workspace `dev`, `build`, `start` and `typecheck` scripts from the repository root. Development binds to loopback by default; the preview server also binds to loopback. The build uses webpack explicitly. Font binaries are self-hosted and covered by the OFL notices in `assets/brand/`.

The website workspace declares its own TypeScript and Node type development dependencies so Vercel can type-check it when building from `apps/website` as the monorepo root directory. Vercel project build settings use Node 24.x, matching the repository engine range.

The original central-bar logo and favicon remain unchanged. Security headers are a local baseline; CSP allows Next's inline bootstrap/style content. Production needs a reviewed nonce/hash policy and HTTPS/HSTS configuration. `robots` noindex is a crawler hint, not access control. See `docs/DESIGN_SYSTEM.md` for visual and content rules.
