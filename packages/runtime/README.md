# Runtime configuration

`readRuntimeConfig(process.env)` validates NODE_ENV, HOST, PORT, DATABASE_URL and REDIS_URL before API startup. Defaults bind loopback; credential-bearing infrastructure URLs are required. Errors identify keys only and never echo values. Returned configuration is frozen but contains secrets: never log or serialize it.

Production mode requires PostgreSQL `sslmode=verify-full` and Redis `rediss:`. This does not provision a certificate or certify a deployed environment. Defaults and generated root.env are for local development only.

Build before dependent workspaces. Tests cover invalid inputs and secret-safe failures, immutable loopback defaults and TLS guards.
