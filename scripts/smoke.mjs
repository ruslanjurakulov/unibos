import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
const children = [];
async function freePort() {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
function launch(args, env = {}) {
  const child = spawn(process.execPath, args, {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", ...env },
    stdio: "ignore",
  });
  children.push(child);
  return child;
}
async function get(url) {
  return fetch(url, { signal: AbortSignal.timeout(5000) });
}
async function waitFor(url, child) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error("Local application exited before readiness");
    try {
      return await get(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Timed out waiting for local application");
}
try {
  const apiPort = await freePort();
  const api = launch(["apps/api/dist/main.js"], {
    PORT: String(apiPort),
    HOST: "127.0.0.1",
  });
  const apiUrl = `http://127.0.0.1:${apiPort}`;
  assert.equal((await waitFor(`${apiUrl}/health/live`, api)).status, 200);
  const ready = await get(`${apiUrl}/health/ready`);
  assert.equal(
    ready.status,
    200,
    "Actual PostgreSQL and Redis must both be reachable",
  );
  assert.deepEqual(await ready.json(), { status: "ready" });
  assert.equal(ready.headers.get("cache-control"), "no-store");
  assert.equal(ready.headers.get("x-powered-by"), null);
  assert.equal((await get(`${apiUrl}/orders`)).status, 404);
  const badRedis = new URL(process.env.REDIS_URL);
  // Keep identity/application DB role verification live; degrade Redis after startup.
  badRedis.port = "1";
  const failedPort = await freePort();
  const failed = launch(["apps/api/dist/main.js"], {
    PORT: String(failedPort),
    HOST: "127.0.0.1",

    REDIS_URL: badRedis.href,
  });
  const failedUrl = `http://127.0.0.1:${failedPort}`;
  assert.equal((await waitFor(`${failedUrl}/health/live`, failed)).status, 200);
  const unavailable = await get(`${failedUrl}/health/ready`);
  assert.equal(unavailable.status, 503);
  assert.deepEqual(await unavailable.json(), {
    status: "error",
    statusCode: 503,
    message: "Service unavailable",
  });
  const websitePort = await freePort();
  const website = launch([
    "node_modules/next/dist/bin/next",
    "start",
    "apps/website",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(websitePort),
  ]);
  const websiteUrl = `http://127.0.0.1:${websitePort}`;
  const page = await waitFor(websiteUrl, website);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /business services are not available yet/);
  assert.equal(page.headers.get("x-powered-by"), null);
  assert.equal(page.headers.get("x-content-type-options"), "nosniff");
  assert.match(
    page.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  const logo = await get(`${websiteUrl}/brand/wordmark-light.svg`);
  assert.equal(
    await logo.text(),
    await readFile("assets/brand/wordmark-light.svg", "utf8"),
  );
  assert.equal((await get(`${websiteUrl}/.env`)).status, 404);
  console.log(
    "PASS: website/assets/headers, live API -> real PostgreSQL+Redis -> ready200, unavailable dependencies -> safe503, unknown domain route404",
  );
} finally {
  await Promise.all(
    children.map(async (child) => {
      if (child.exitCode !== null) return;
      const stopped = once(child, "exit");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
      await stopped;
      clearTimeout(timer);
    }),
  );
}
