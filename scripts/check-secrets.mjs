import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /gh[pousr]_[A-Za-z0-9]{30,}/,
  /github_pat_[A-Za-z0-9_]{50,}/,
  /AKIA[A-Z0-9]{16}/,
];
// Compare generated local secrets in memory only. Never serialize the values in
// assertions/errors or copy credential reference files into candidate output.
const secretKeys = [
  "POSTGRES_PASSWORD",
  "APP_DATABASE_PASSWORD",
  "AUTH_DATABASE_PASSWORD",
  "REDIS_PASSWORD",
  "BETTER_AUTH_SECRET",
  "MIGRATION_DATABASE_URL",
  "DATABASE_URL",
  "AUTH_DATABASE_URL",
  "REDIS_URL",
];
const values = new Set();
for (const name of [".env", ".env.runtime"]) {
  try {
    const env = parseEnv(
      await readFile(new URL(`../${name}`, import.meta.url), "utf8"),
    );
    for (const key of secretKeys)
      if (env[key]?.length >= 12) values.add(env[key]);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Secret reference check unavailable; no values printed");
      process.exit(1);
    }
  }
}
let failures = 0;
for (const file of new Set(files)) {
  if (/\.(?:png|pdf|zip|ico)$/.test(file)) continue;
  const text = await readFile(file, "utf8");
  if (
    patterns.some((pattern) => pattern.test(text)) ||
    [...values].some((value) => text.includes(value))
  ) {
    console.error(`Potential credential in ${file}; value redacted`);
    failures++;
  }
}
if (failures) process.exitCode = 1;
else
  console.log(
    "PASS: tracked/candidate text checked for known formats and available local secret values; not a comprehensive secret audit",
  );
