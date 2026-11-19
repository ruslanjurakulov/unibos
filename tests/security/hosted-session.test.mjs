import assert from "node:assert/strict";
import test from "node:test";
import helper from "../../scripts/staging/hosted-session.cjs";
import journey from "../../scripts/staging/hosted-journey.cjs";

test("hosted QA limits requests to the staging alias and rejects redirects", async (t) => {
  const fetchMock = t.mock.method(
    globalThis,
    "fetch",
    async (_url, options) => {
      assert.equal(options.redirect, "manual");
      return new Response(null, {
        status: 302,
        headers: { Location: "https://different.invalid" },
      });
    },
  );
  const client = helper.session("qa", "synthetic", "unused");
  for (const path of ["https://different.invalid/api/me", "/dashboard"]) {
    await assert.rejects(client.request("test", path), /host guard/);
  }
  assert.equal(fetchMock.mock.callCount(), 0);
  await assert.rejects(
    client.request("test", "/api/me"),
    /unexpected HTTP status/,
  );
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("cashier and kitchen QA sessions keep separate HTTP cookies", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url.origin, helper.origin);
    requests.push(options.headers);
    return Response.json(
      {},
      {
        headers: {
          "Set-Cookie":
            "__Secure-session_token=fixture; Secure; HttpOnly; SameSite=Lax; Path=/",
        },
      },
    );
  });
  const cashier = helper.session("qa-cashier", "fixture", "unused");
  const kitchen = helper.session("qa-kitchen", "fixture", "unused");
  await cashier.request("fixture", "/api/me");
  await cashier.request("fixture", "/api/me");
  await kitchen.request("fixture", "/api/me");
  assert.equal(requests[0].Cookie, undefined);
  assert.equal(requests[1].Cookie, "__Secure-session_token=fixture");
  assert.equal(requests[2].Cookie, undefined);
});

test("QA TOTP matches RFC 6238 SHA-1 and business request keys bind branch and operation", () => {
  assert.equal(
    helper.codeFor("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", 59000),
    "287082",
  );
  const branch = "6cbf2c46-ee31-4dfb-90b3-7a449944afcb";
  const key = journey.stableKey(branch, "cash");
  assert.equal(key, journey.stableKey(branch, "cash"));
  assert.notEqual(key, journey.stableKey(branch, "order"));
  assert.notEqual(
    key,
    journey.stableKey("6cbf2c46-ee31-4dfb-90b3-7a449944afca", "cash"),
  );
});
