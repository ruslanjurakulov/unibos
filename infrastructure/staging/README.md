# Private Linux staging

Use a dedicated Linux Docker Engine (28 or newer), Compose v2, Git, Bash, OpenSSL and an SSH account on the designated test host. Check out the reviewed commit on that host. This stack uses the fixed Compose project `unibos-private-staging` and its own named PostgreSQL and Redis volumes. Use one installation per Docker engine. The SSH account and host administrators can access synthetic staging data and credentials.

## Start

```sh
infrastructure/staging/stage.sh init-demo
infrastructure/staging/stage.sh validate
infrastructure/staging/stage.sh start
infrastructure/staging/stage.sh status
```

`init-demo` enables account creation for testers who have tunnel access. Use `init` instead for a closed signup policy. Initialization exclusively creates the ignored `infrastructure/staging/.env.staging` with random credentials and mode 0600. Preserve this file across updates. Generating new credentials for existing volumes breaks authentication. Avoid printing the expanded Compose configuration.

From your workstation, keep this tunnel open and visit `http://127.0.0.1:4300`:

```sh
ssh -N -L 127.0.0.1:4300:127.0.0.1:4300 user@staging-host
```

Both ends bind to loopback. Keep this exact browser origin for cookies and trusted-origin checks. Access is subject to the host's SSH policy. The website forwards `/api/` to the API in their shared network namespace. PostgreSQL and Redis have no published ports. The API uses separate application and identity logins. A one-shot migration job shares only the database network namespace, uses its separate migration credential and validates the canonical migration ledger. `start` builds the reviewed source into a commit-tagged image, waits for dependencies, stops the old frontend/API, runs migrations, and starts healthy application processes. If a migration fails, the frontend/API remain stopped pending investigation. Look up container status with `stage.sh status`.

## Verify and stop

`stage.sh stop` removes this project's containers and network and retains its volumes. A subsequent `start` reuses the same credentials and volumes. For application rollback, check schema compatibility first, check out the previous reviewed revision and run `start` again. Migrations are forward-only. Rehearse database recovery separately with `npm run test:restore`.

The PR workflow provisions a temporary stack with synthetic signup, checks the session and origin protections through the website, reruns migrations, and checks that the original session still works. No credentials from a remote host are required. The host's PostgreSQL and Redis data volumes need restricted access and a separate backup policy before using persistent pilot data. Public HTTPS access requires a separately configured TLS endpoint, trusted origins, secure cookies and backend transport review. The loopback and SSH configuration here is for private synthetic staging.
