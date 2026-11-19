# API Preview on Vercel

## Eligibility

Vercel creates a **Production** deployment for the first deployment of an empty project. This also applies to dashboard Git imports, feature branches and `vercel deploy --target=preview`. Under the project's Preview-only release scope, stop before importing or deploying a new API project. Continue integrated testing with the isolated stack under `infrastructure/staging/`. [Vercel environment rules](https://vercel.com/docs/deployments/environments#first-deployment)

The manual procedure below is for an already initialized, dedicated UniBOS API project. Verify its team, project ID and at least one retained deployment record for **that API project**. An earlier failed or canceled deployment counts. A project with all deployments deleted is empty. The website project's history applies only to the website.

## Existing project alternatives

The existing website project has deployment history, so the provider's first-deployment rule allows subsequent Previews there. Vercel's deployment creation interface accepts `gitSource`, commit metadata and per-deployment `projectSettings` fields for `rootDirectory`, `framework`, `buildCommand` and access to source files outside the root. A candidate could request the reviewed commit, `apps/api` root and NestJS framework for a single Preview. Compatibility of these overrides with this linked monorepo, branch-specific secrets, protected routing and preservation of the website's branch alias has **not been verified end to end**. A deployment from the existing project must keep its website defaults and Production environment intact. Use an isolated staging branch and record the resulting deployment's effective settings before accepting this option. [Create a deployment](https://vercel.com/docs/rest-api/reference/endpoints/deployments/create-a-new-deployment)

Another implementation option is a separately reviewed same-origin API adapter in one website Preview. That accommodates both web and API entry points under one host, subject to validating the Nest request lifecycle, raw request bodies, restricted database access and cookie behavior. The current website uses an external API rewrite; it does not contain this adapter.

## Build and routing

Use `apps/api` as the API project's Root Directory. Enable source access outside that directory so npm can resolve the shared lockfile and workspaces. Select Node.js 24.x and use npm 11 with the repository lockfile. Vercel's NestJS preset detects `src/main.ts`, which starts the application using `PORT`. The preset serves the Nest application as one Node function. Keep the default output routing. [NestJS on Vercel](https://vercel.com/docs/frameworks/backend/nestjs) · [Monorepos](https://vercel.com/docs/monorepos)

The API-specific `apps/api/vercel.json` installs from the repository root and builds `@unibos/runtime`, `@unibos/database`, `@unibos/security` and then `@unibos/api`. Its boolean `git.deploymentEnabled: false` disables automatic Git deployments on every branch carrying that configuration. Manual deployment remains available. Keep the dedicated API project disconnected from Git if older branches without this file could be pushed. Link the CLI to the intended existing project explicitly. The website project uses its own configuration. [Git deployment settings](https://vercel.com/docs/project-configuration/git-configuration)

## Staging services and identity

The API needs an isolated PostgreSQL database and a Redis TCP endpoint reachable from Vercel over verified TLS. The loopback services in the local Docker rehearsal are accessible only on their own host. Provisioning, networking, billing and DNS decisions are separate from deploying this configuration.

Prepare the schema through an authorized staging maintenance process. The canonical ledger includes auth migrations 001–002 and business migrations 001–007. The current migration CLI accepts a loopback administrative connection to a database whose name begins with `unibos`, outside production runtime mode. It creates restricted login roles and two nonlogin roles with BYPASSRLS for defined database functions. Confirm the staging PostgreSQL service can support those grants before migration. Keep bootstrap credentials in the maintenance environment. The request handler uses separate restricted login roles. Hosted migrations and deployment-time migration hooks are outside this procedure.

Set the following values in the API project's **Preview environment only**, scoped to the staging branch where supported. Use the existing secret manager or provider console for credentials.

| Setting                             | Staging value                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Node runtime mode                   | Verify `NODE_ENV=production` for the deployed build/runtime, with the Vercel deployment target explicitly set to Preview.                                       |
| `AUTH_ENABLED`, `AUTH_ALLOW_SIGNUP` | `true`, `false`. The production-mode runtime requires verified emails for password login and prohibits self-registration pending an email delivery integration. |
| `DATABASE_URL`                      | PostgreSQL URL for `unibos_app`, including `sslmode=verify-full`.                                                                                               |
| `AUTH_DATABASE_URL`                 | PostgreSQL URL for `unibos_auth` on the same staging database, including `sslmode=verify-full`.                                                                 |
| `REDIS_URL`                         | Password-authenticated `rediss://` connection with a trusted certificate.                                                                                       |
| `BETTER_AUTH_SECRET`                | Unique high-entropy staging secret of at least 32 characters.                                                                                                   |
| `AUTH_BASE_URL`                     | Exact stable HTTPS origin for the browser-facing staging website that proxies `/api/auth`.                                                                      |
| `AUTH_TRUSTED_ORIGINS`              | Exact staging browser origin and any separately reviewed API origin. Use HTTPS origins without paths or wildcards.                                              |

Reserve capacity for up to five application, five identity and two health PostgreSQL connections per warm API instance. Test the proposed connection limit with the intended staging concurrency. Synthetic operator accounts must be provisioned through an approved verified-email identity workflow. MFA uses authenticator TOTP or recovery codes. Email delivery and production-mode self-registration require further implementation.

## Manual Preview and verification

1. Use a clean checkout of the approved commit. Run the CLI at the monorepo root, linked to the previously verified dedicated API project and team. Confirm the API project's Root Directory and existing deployment history again. Supply staging secrets using Preview-scoped project settings.
2. For this eligible project only, run `vercel deploy --target=preview`. Record the deployment ID, exact source revision, Preview environment and READY state. Check `/health/live` and `/health/ready` through the authorized staging access path. Readiness requires live PostgreSQL and Redis.
3. Set the **website Preview's** `UNIBOS_API_ORIGIN` to the deployment's verified, stable HTTPS API origin without a trailing slash. Rebuild that website Preview. Next.js forwards browser requests from `/api/:path*` to the API over a server-side rewrite. If API Deployment Protection intercepts these requests, establish an authorized server-to-server access path before connecting the website. The current static rewrite supplies no deployment protection bypass header. Keep any future access credential on the server.
4. Verify protected access, session cookies, TOTP and tenant/branch denial through the website origin. Run the synthetic owner → catalog → POS → kitchen → waiter → internal cash settlement → analytics flow. Observe rate limits behind the actual proxy topology. The application currently derives the rate key from the remote socket address.
5. Record HTTP and UI evidence for the specific API and website Preview revisions. Compare the Production deployment history before and after. To disconnect the website, remove the staging branch's Preview-only API origin and rebuild that website Preview. Recheck that the public demo renders its synthetic state.

A reviewed schema, a successful TypeScript build and a local Docker rehearsal each provide separate evidence. A hosted integrated staging result requires the cloud deployment, access and test results described above.
