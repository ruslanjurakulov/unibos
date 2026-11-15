# Runtime configuration

readRuntimeConfig validates NODE_ENV/HOST/PORT, credential-bearing infrastructure URLs and optional local AUTH_ENABLED settings before startup. Defaults bind loopback; unknown flags, malformed URLs/origins and short auth secrets fail with key-only messages. The returned config and nested origin list are frozen but contain secrets: never log or serialize them.

Enabled identity requires separate unibos_app/unibos_auth roles, an explicit auth base origin and exact trusted origins. Production requires authentication enabled, HTTPS origins, verified PostgreSQL TLS and RedisTLS, and refuses signup until verified email delivery is approved. Runtime .env.runtime excludes administrative bootstrap/migration credentials; .env is reserved for local provisioning/test CLI tools. These validators do not provision certificates or certify a deployment.

Build before dependent workspaces. Six tests cover immutable defaults, unsafe values/secret redaction, TLS, origin/role separation and closed production signup. Full setup/boundaries: docs/P2_SECURITY.md.
