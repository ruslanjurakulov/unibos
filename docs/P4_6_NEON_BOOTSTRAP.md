# Bootstrap a dedicated staging database

This one-time command initializes an empty `unibos_staging` database on a separately designated Neon test endpoint. Run it from a trusted maintenance machine with the reviewed source, Node 24 and installed dependencies. The endpoint must belong to an isolated synthetic staging project or branch. Neon roles belong to a branch and span its databases. Before supplying credentials, verify the project, branch, direct endpoint and database against the owner's staging inventory. A hostname or database name alone cannot establish its business purpose.

Provide these variables through the maintenance environment's secret manager:

| Name                           | Value                                                               |
| ------------------------------ | ------------------------------------------------------------------- |
| `UNIBOS_MAINTENANCE_TARGET`    | `dedicated-neon-staging`                                            |
| `UNIBOS_STAGING_NEON_HOST`     | Independently verified direct `ep-…neon.tech` hostname              |
| `UNIBOS_STAGING_MIGRATION_URL` | Direct database owner URL for `/unibos_staging?sslmode=verify-full` |
| `UNIBOS_STAGING_APP_PASSWORD`  | New secret for `unibos_app`, 32–128 URL-safe characters             |
| `UNIBOS_STAGING_AUTH_PASSWORD` | Different new secret for `unibos_auth` with the same format         |

```sh
npm run build --workspace @unibos/database
node packages/database/staging-bootstrap.mjs
```

PostgreSQL 16 or newer must grant the connected database owner effective `CREATEROLE` and `BYPASSRLS`. Maintenance requires a direct connection with verified TLS. The database must be fresh and the four UniBOS roles unused on the branch. The script rejects a superuser, unexpected database, pooled connection, Vercel environment, existing application schema and role collisions. If the provider does not expose the required privileges or its preinstalled schema fails the freshness check, use the private Docker stack or qualify a different dedicated endpoint. See the [Neon role documentation](https://neon.com/docs/manage/roles) and [PostgreSQL function ownership rules](https://www.postgresql.org/docs/17/sql-alterfunction.html).

The bootstrap applies the existing migration SQL and checksums inside one transaction. The maintenance owner temporarily receives membership options to assume the newly created roles and the two nonlogin function owners temporarily receive `CREATE` on the `private` schema. Before commit the script removes these privileges and verifies the final permissions. PostgreSQL retains its standard administrative membership for the non-superuser creator, with no `SET` or `INHERIT` option. Store only the two restricted login URLs in application runtime secrets. Keep the maintenance credential separate.

A failure rolls back role creation, schema changes and grants. If the connection drops during commit, inspect the two migration ledgers read-only before taking further action. Running the initializer against a populated database fails closed. Subsequent schema upgrades require a separately reviewed maintenance migration. `npm run test:restore` exercises the restricted maintenance owner, rollback, restored role restrictions and refusal to reinitialize in a disposable PostgreSQL cluster. This test does not validate a particular Neon endpoint.
