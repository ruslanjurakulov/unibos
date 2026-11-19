import assert from "node:assert/strict";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { randomBytes, randomUUID } from "node:crypto";

// Run on an opt-in synthetic-signup instance, through the same origin used by its browser.
const origin = "http://127.0.0.1:4300";
const capabilities = "/api/v1/me/workspace-capabilities";
const request = (path, init) =>
  fetch(origin + path, {
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    ...init,
  });
assert.equal((await request("/")).status, 200);
assert.equal((await request(capabilities)).status, 401);
const [mode, file] = process.argv.slice(2);
assert.ok(
  ["create", "resume"].includes(mode) && file,
  "Use create|resume and a private temporary probe file",
);
async function newSession() {
  const email = `${randomUUID()}@stage.example.invalid`;
  const register = await request("/api/auth/sign-up/email", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Synthetic staging user",
      email,
      password: randomBytes(24).toString("hex"),
    }),
  });
  assert.ok(register.ok, `Signup returned ${register.status}`);
  const headers = register.headers.getSetCookie();
  const hasSessionCookie = headers.some(
    (value) =>
      value.split(";", 1)[0].includes("session_token=") &&
      /;\s*HttpOnly(?:;|$)/i.test(value) &&
      /;\s*SameSite=Lax(?:;|$)/i.test(value) &&
      /;\s*Path=\/(?:;|$)/i.test(value),
  );
  assert.ok(
    hasSessionCookie,
    "Expected HttpOnly, root-scoped SameSite=Lax session cookie",
  );
  const cookie = headers.map((value) => value.split(";", 1)[0]).join("; ");
  const identity = { cookie, email };
  writeFileSync(file, JSON.stringify(identity), { mode: 0o600, flag: "wx" });
  return identity;
}
const { cookie, email } =
  mode === "create"
    ? await newSession()
    : JSON.parse(readFileSync(file, "utf8"));
const forged = await request("/api/auth/sign-out", {
  method: "POST",
  headers: {
    cookie,
    origin: "https://untrusted.invalid",
    "content-type": "application/json",
  },
  body: "{}",
});
assert.equal(forged.status, 403);
const session = await request("/api/auth/get-session", { headers: { cookie } });
assert.equal(session.status, 200);
assert.equal((await session.json()).user.email, email);
const verified = await request(capabilities, { headers: { cookie } });
assert.equal(verified.status, 200);
assert.deepEqual((await verified.json()).organizations, []);
if (mode === "resume") unlinkSync(file);
console.log(
  `PASS: ${mode} synthetic session, same-origin website, verified identity, denied cross-origin write, and empty membership scope`,
);
