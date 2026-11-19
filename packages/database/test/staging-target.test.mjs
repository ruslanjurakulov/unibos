import assert from "node:assert/strict";
import test from "node:test";
import { stagingConnection } from "../staging-bootstrap.mjs";
const host = "ep-synthetic-demo-123.region.aws.neon.tech";
const uri = `postgresql://owner:synthetic@${host}/unibos_staging?sslmode=verify-full`;
const env = {
  UNIBOS_MAINTENANCE_TARGET: "dedicated-neon-staging",
  UNIBOS_STAGING_NEON_HOST: host,
  UNIBOS_STAGING_MIGRATION_URL: uri,
};
test("dedicated staging connection pins direct host, database and verified TLS", () => {
  const config = stagingConnection(env);
  assert.equal(config.host, host);
  assert.equal(config.ssl.rejectUnauthorized, true);
  for (const uriOverride of [
    uri.replace("unibos_staging", "postgres"),
    uri.replace(host, "ep-elsewhere.us.aws.neon.tech"),
    uri.replace("verify-full", "require"),
    uri + "&options=extra",
  ])
    assert.throws(() =>
      stagingConnection({ ...env, UNIBOS_STAGING_MIGRATION_URL: uriOverride }),
    );
  for (const overrides of [
    { NODE_ENV: "production" },
    { VERCEL_ENV: "preview" },
    { UNIBOS_MAINTENANCE_TARGET: "" },
    { UNIBOS_STAGING_NEON_HOST: "127.0.0.1" },
    { UNIBOS_STAGING_NEON_HOST: host.replace(".region", "-pooler.region") },
  ])
    assert.throws(() => stagingConnection({ ...env, ...overrides }));
});
