import { randomBytes } from "node:crypto";
import { readFile, writeFile, rename, chmod } from "node:fs/promises";
import { parseEnv } from "node:util";
async function setup() {
  const target = new URL("../.env", import.meta.url);
  let values = {};
  try {
    values = parseEnv(await readFile(target, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (values.NODE_ENV === "production")
    throw new Error("Local setup refuses production configuration");
  const fresh = () => randomBytes(32).toString("hex");
  const put = (key, value) => {
    if (values[key] === undefined || values[key] === "") values[key] = value;
  };
  put("NODE_ENV", "development");
  put("OTEL_ENABLED", "false");
  put("HOST", "127.0.0.1");
  put("PORT", "3001");
  put("POSTGRES_USER", "unibos");
  put("POSTGRES_DB", "unibos");
  put("POSTGRES_PASSWORD", fresh());
  put("REDIS_PASSWORD", fresh());
  put("APP_DATABASE_PASSWORD", fresh());
  put("AUTH_DATABASE_PASSWORD", fresh());
  const admin =
    values.MIGRATION_DATABASE_URL ||
    values.DATABASE_URL ||
    `postgresql://${values.POSTGRES_USER}:${values.POSTGRES_PASSWORD}@127.0.0.1:5432/${values.POSTGRES_DB}`;
  const adminURL = new URL(admin);
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(adminURL.hostname) ||
    adminURL.username === "unibos_app" ||
    adminURL.username === "unibos_auth"
  ) {
    throw new Error(
      "Local setup requires a separate loopback migration database URL",
    );
  }
  put("MIGRATION_DATABASE_URL", admin);
  const roleURL = (role, password) => {
    const url = new URL(admin);
    url.username = role;
    url.password = password;
    return url.href;
  };
  if (
    !values.DATABASE_URL ||
    new URL(values.DATABASE_URL).username !== "unibos_app"
  )
    values.DATABASE_URL = roleURL("unibos_app", values.APP_DATABASE_PASSWORD);
  put(
    "AUTH_DATABASE_URL",
    roleURL("unibos_auth", values.AUTH_DATABASE_PASSWORD),
  );
  put("REDIS_URL", `redis://:${values.REDIS_PASSWORD}@127.0.0.1:6379`);
  put("AUTH_ENABLED", "true");
  put("AUTH_ALLOW_SIGNUP", "true");
  put("BETTER_AUTH_SECRET", fresh());
  put("AUTH_BASE_URL", `http://127.0.0.1:${values.PORT}`);
  put("AUTH_TRUSTED_ORIGINS", `${values.AUTH_BASE_URL},http://127.0.0.1:3000`);
  const runtimeKeys = [
    "NODE_ENV",
    "OTEL_ENABLED",
    "HOST",
    "PORT",
    "DATABASE_URL",
    "REDIS_URL",
    "AUTH_ENABLED",
    "AUTH_ALLOW_SIGNUP",
    "BETTER_AUTH_SECRET",
    "AUTH_BASE_URL",
    "AUTH_TRUSTED_ORIGINS",
    "AUTH_DATABASE_URL",
  ];
  const serialize = (entries) =>
    entries
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") + "\n";
  async function replace(file, text) {
    const temporary = new URL(file.href + ".tmp");
    await writeFile(temporary, text, { mode: 0o600 });
    await chmod(temporary, 0o600);
    await rename(temporary, file);
    await chmod(file, 0o600);
  }
  await replace(target, serialize(Object.entries(values)));
  await replace(
    new URL("../.env.runtime", import.meta.url),
    serialize(runtimeKeys.map((key) => [key, values[key]])),
  );
  console.log(
    "Local configuration ready; existing credentials retained, runtime file excludes bootstrap/migration credentials. No values printed.",
  );
}
await setup().catch(() => {
  console.error(
    "Local configuration setup failed; verify non-production loopback configuration without sharing credential values",
  );
  process.exitCode = 1;
});
