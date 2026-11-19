const assert = require("node:assert/strict");
const test = require("node:test");
const {
  requestStagingOrigin,
  stagingPreviewHost,
} = require("../../apps/website/staging-preview.ts");
const env = {
  UNIBOS_STAGING_API: "1",
  VERCEL: "1",
  VERCEL_ENV: "preview",
  VERCEL_GIT_REPO_OWNER: "ruslanjurakulov",
  VERCEL_GIT_REPO_SLUG: "unibos",
  VERCEL_GIT_COMMIT_REF: "feat/p4-6-integrated-preview",
  VERCEL_BRANCH_URL: "unibos-git-stage-example.vercel.app",
  AUTH_BASE_URL: "https://unibos-git-stage-example.vercel.app",
};
test("embedded staging requires an explicit opt-in on the expected repository, branch, target and origin", () => {
  assert.equal(stagingPreviewHost(env), env.VERCEL_BRANCH_URL);
  for (const key of Object.keys(env))
    assert.equal(
      stagingPreviewHost({ ...env, [key]: undefined }),
      undefined,
      key,
    );
  for (const overrides of [
    { VERCEL_ENV: "production" },
    { VERCEL_GIT_COMMIT_REF: "main" },
    { VERCEL_GIT_REPO_OWNER: "fork" },
    { VERCEL_GIT_REPO_SLUG: "other" },
    { AUTH_BASE_URL: "https://unibos.vercel.app" },
    { AUTH_BASE_URL: "http://" + env.VERCEL_BRANCH_URL },
    {
      VERCEL_BRANCH_URL: "staging.vercel.app.example.invalid",
      AUTH_BASE_URL: "https://staging.vercel.app.example.invalid",
    },
  ])
    assert.equal(stagingPreviewHost({ ...env, ...overrides }), undefined);
});

test("embedded API serves only its pinned same-origin branch hostname", () => {
  assert.equal(
    requestStagingOrigin(env, env.VERCEL_BRANCH_URL),
    env.AUTH_BASE_URL,
  );
  for (const host of [
    undefined,
    "unibos.vercel.app",
    env.VERCEL_BRANCH_URL + ":8080",
    "different.vercel.app",
  ])
    assert.equal(requestStagingOrigin(env, host), undefined);
  assert.equal(
    requestStagingOrigin(
      { ...env, VERCEL_ENV: "production" },
      env.VERCEL_BRANCH_URL,
    ),
    undefined,
  );
});

const {
  acceptsBasic,
  gatePassword,
  requiresStagingAdmission,
  signAdmission,
  validAdmission,
} = require("../../apps/website/staging-admission.ts");
const { randomBytes } = require("node:crypto");
test("private staging requires admission even if runtime configuration is incomplete", () => {
  assert.equal(
    requiresStagingAdmission({ ...env, UNIBOS_STAGING_API: undefined }),
    true,
  );
  assert.equal(
    requiresStagingAdmission({ ...env, VERCEL_GIT_COMMIT_REF: undefined }),
    true,
  );
  assert.equal(requiresStagingAdmission({ UNIBOS_STAGING_API: "1" }), true);
  assert.equal(
    requiresStagingAdmission({ ...env, VERCEL_ENV: "production" }),
    false,
  );
  assert.equal(
    requiresStagingAdmission({
      ...env,
      UNIBOS_STAGING_API: undefined,
      VERCEL_GIT_COMMIT_REF: "feature",
    }),
    false,
  );
});
test("staging credentials and request admission are distinct and confined to a single operation", () => {
  const password = randomBytes(48).toString("base64url");
  assert.equal(gatePassword({}), undefined);
  assert.equal(
    gatePassword({ UNIBOS_STAGING_GATE_PASSWORD: "short" }),
    undefined,
  );
  assert.equal(
    gatePassword({ UNIBOS_STAGING_GATE_PASSWORD: password }),
    password,
  );
  const basic = (user, pass) =>
    "Basic " + Buffer.from(user + ":" + pass).toString("base64");
  assert.equal(acceptsBasic(basic("unibos", password), password), true);
  for (const value of [
    null,
    "Bearer unknown",
    basic("owner", password),
    basic("unibos", "invalid"),
  ])
    assert.equal(acceptsBasic(value, password), false);
  const time = Date.now(),
    url = new URL("/api/me?scope=x", env.AUTH_BASE_URL),
    proof = signAdmission(password, "GET", url, time);
  assert.equal(validAdmission(proof, password, "GET", url, time + 1), true);
  assert.equal(validAdmission(proof, password, "POST", url, time + 1), false);
  assert.equal(
    validAdmission(
      proof,
      password,
      "GET",
      new URL("/api/me?scope=y", url),
      time + 1,
    ),
    false,
  );
  assert.equal(
    validAdmission(
      proof,
      password,
      "GET",
      new URL(url.pathname, "https://other.vercel.app"),
      time + 1,
    ),
    false,
  );
  assert.equal(
    validAdmission(proof, password, "GET", url, time + 61_000),
    false,
  );
  assert.equal(validAdmission(password, password, "GET", url, time), false);
});

test("staging proxy challenges HTML, assets and API, preserves session cookies and removes admission credentials", (t) => {
  const { NextRequest } = require("next/server.js");
  const { proxy } = require("../../apps/website/proxy.ts");
  const password = randomBytes(48).toString("base64url");
  const settings = { ...env, UNIBOS_STAGING_GATE_PASSWORD: password };
  const previous = Object.fromEntries(
    Object.keys(settings).map((key) => [key, process.env[key]]),
  );
  Object.assign(process.env, settings);
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  const request = (path, headers = {}) =>
    new NextRequest(new URL(path, env.AUTH_BASE_URL), {
      headers: { host: env.VERCEL_BRANCH_URL, ...headers },
    });
  const basic = "Basic " + Buffer.from("unibos:" + password).toString("base64");
  for (const path of [
    "/",
    "/brand/mark-light.svg",
    "/_next/static/chunks/app.js",
    "/api/auth/get-session",
  ]) {
    const anon = proxy(request(path));
    assert.equal(anon.status, 401);
    assert.match(anon.headers.get("www-authenticate"), /^Basic /);
    assert.match(anon.headers.get("cache-control"), /no-store/);
    assert.equal(
      proxy(request(path, { authorization: "Basic invalid" })).status,
      401,
    );
    const admitted = proxy(
      request(path, {
        authorization: basic,
        cookie: "session=synthetic",
        "x-unibos-staging-admission": "invalid",
      }),
    );
    assert.equal(admitted.headers.get("x-middleware-next"), "1");
    assert.equal(admitted.headers.get("vercel-cdn-cache-control"), "no-store");
    assert.equal(
      admitted.headers.get("x-middleware-request-authorization"),
      null,
    );
    assert.equal(
      admitted.headers.get("x-middleware-request-cookie"),
      "session=synthetic",
    );
    const proof = admitted.headers.get(
      "x-middleware-request-x-unibos-staging-admission",
    );
    if (path.startsWith("/api/"))
      assert.ok(
        validAdmission(
          proof,
          password,
          "GET",
          new URL(path, env.AUTH_BASE_URL),
        ),
      );
    else assert.equal(proof, null);
  }
  assert.equal(
    proxy(
      request("/", { host: "old.example.vercel.app", authorization: basic }),
    ).status,
    404,
  );
  assert.equal(
    proxy(request("/", { "x-forwarded-proto": "http", authorization: basic }))
      .status,
    404,
  );
  delete process.env.UNIBOS_STAGING_GATE_PASSWORD;
  assert.equal(proxy(request("/")).status, 503);
  delete process.env.UNIBOS_STAGING_API;
  process.env.VERCEL_GIT_COMMIT_REF = "feat/demo";
  assert.equal(proxy(request("/")).headers.get("x-middleware-next"), "1");
});

test("staging module diagnostics expose only allowlisted codes", () => {
  const {
    previewModuleDiagnostic,
  } = require("../../apps/website/staging-module-diagnostic.ts");
  const error = Object.assign(new Error("Cannot find module 'pg'"), {
    code: "MODULE_NOT_FOUND",
  });
  assert.equal(
    previewModuleDiagnostic(error),
    "unibos.preview.init.ADAPTER_MODULE.PG",
  );
  error.message =
    "Cannot find module 'postgres://private:secret@example.invalid/db'";
  assert.equal(
    previewModuleDiagnostic(error),
    "unibos.preview.init.ADAPTER_MODULE.MISSING",
  );
  error.code = "ERR_REQUIRE_ESM";
  assert.equal(
    previewModuleDiagnostic(error),
    "unibos.preview.init.ADAPTER_MODULE.ESM",
  );
  assert.equal(
    previewModuleDiagnostic("sensitive"),
    "unibos.preview.init.ADAPTER_MODULE",
  );
});
