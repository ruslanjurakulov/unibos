import { randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
const password = () => randomBytes(24).toString("hex");
const postgresPassword = password();
const redisPassword = password();
const contents = [
  "NODE_ENV=development",
  "OTEL_ENABLED=false",
  "HOST=127.0.0.1",
  "PORT=3001",
  "POSTGRES_USER=unibos",
  "POSTGRES_DB=unibos",
  `POSTGRES_PASSWORD=${postgresPassword}`,
  `REDIS_PASSWORD=${redisPassword}`,
  `DATABASE_URL=postgresql://unibos:${postgresPassword}@127.0.0.1:5432/unibos`,
  `REDIS_URL=redis://:${redisPassword}@127.0.0.1:6379`,
  "",
].join("\n");
try {
  await writeFile(new URL("../.env", import.meta.url), contents, {
    flag: "wx",
    mode: 0o600,
  });
  console.log(
    "Created local .env with random credentials. Existing files are never overwritten.",
  );
} catch (error) {
  if (error.code === "EEXIST") console.log("Existing .env preserved.");
  else throw error;
}
