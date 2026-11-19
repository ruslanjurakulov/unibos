"use strict";
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const { setTimeout: delay } = require("node:timers/promises");

const origin =
  "https://unibos-git-feat-p4-6-integrated-preview-ruslanjurakulov9-1482.vercel.app";

class SafeFailure extends Error {}
function check(value, message) {
  if (!value) throw new SafeFailure(message);
}
const uuid = (value) =>
  typeof value === "string" &&
  /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value);
function codeFor(seed, time = Date.now()) {
  check(
    typeof seed === "string" && /^[A-Z2-7]{16,128}$/i.test(seed),
    "invalid protected TOTP seed",
  );
  const bits = [...seed.toUpperCase()]
    .map((c) =>
      "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"
        .indexOf(c)
        .toString(2)
        .padStart(5, "0"),
    )
    .join("");
  const key = Buffer.from(bits.match(/.{8}/g).map((x) => parseInt(x, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const hash = crypto.createHmac("sha1", key).update(counter).digest();
  const offset = hash[hash.length - 1] & 15;
  return String((hash.readUInt32BE(offset) & 0x7fffffff) % 1000000).padStart(
    6,
    "0",
  );
}
function seedPath(alias) {
  check(
    process.platform === "win32" && process.env.LOCALAPPDATA,
    "MFA storage requires Windows CurrentUser DPAPI",
  );
  return path.join(
    process.env.LOCALAPPDATA,
    "UniBOS",
    "staging-qa",
    `p46-hosted-${alias}.dpapi`,
  );
}
function dpapi(alias, operation, input) {
  check(
    ["Protect", "Unprotect"].includes(operation),
    "invalid vault operation",
  );
  const script = [
    "$ErrorActionPreference='Stop'",
    "Add-Type -AssemblyName System.Security",
    "$inputBytes=[Convert]::FromBase64String([Console]::In.ReadToEnd())",
    `$entropy=[Text.Encoding]::UTF8.GetBytes('UniBOS:p46:${alias}@unibos-staging.invalid')`,
    "$outputBytes=[Security.Cryptography.ProtectedData]::" +
      operation +
      "($inputBytes,$entropy,[Security.Cryptography.DataProtectionScope]::CurrentUser)",
    "[Console]::Out.Write([Convert]::ToBase64String($outputBytes))",
  ].join(";");
  const exe = path.join(
    process.env.SystemRoot || "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const result = spawnSync(
    exe,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      // The child gets DPAPI input through its private stdin. No vault material in argv or logs.
      input: input.toString("base64"),
      encoding: "utf8",
      timeout: 20000,
      windowsHide: true,
      env: Object.fromEntries(
        [
          "SystemRoot",
          "LOCALAPPDATA",
          "APPDATA",
          "USERPROFILE",
          "TEMP",
          "TMP",
          "PATH",
          "PSModulePath",
        ]
          .filter((k) => process.env[k])
          .map((k) => [k, process.env[k]]),
      ),
    },
  );
  check(
    result.status === 0 && !!result.stdout && !result.error,
    "CurrentUser DPAPI unavailable",
  );
  return Buffer.from(result.stdout.trim(), "base64");
}
function saveSeed(alias, seed, backupCodes) {
  const target = seedPath(alias);
  const encrypted = dpapi(
    alias,
    "Protect",
    Buffer.from(JSON.stringify({ seed, backupCodes }), "utf8"),
  );
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = target + "." + crypto.randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temp, encrypted, { flag: "wx", flush: true });
    const restored = JSON.parse(
      dpapi(alias, "Unprotect", fs.readFileSync(temp)).toString("utf8"),
    );
    check(restored.seed === seed, "DPAPI read-back failed");
    fs.renameSync(temp, target);
  } finally {
    if (fs.existsSync(temp)) fs.unlinkSync(temp);
  }
}
function loadSeed(alias) {
  const target = seedPath(alias);
  check(
    fs.existsSync(target),
    "missing protected TOTP for " +
      alias +
      "; supply the corresponding one-time code",
  );
  return JSON.parse(
    dpapi(alias, "Unprotect", fs.readFileSync(target)).toString("utf8"),
  ).seed;
}
function storeCookies(cookies, response) {
  for (const raw of response.headers.getSetCookie()) {
    const [entry, ...parts] = raw.split(";");
    const at = entry.indexOf("=");
    check(at > 0, "invalid cookie syntax");
    const name = entry.slice(0, at),
      value = entry.slice(at + 1);
    const attrs = parts.map((x) => x.trim().toLowerCase());
    if (!value || attrs.includes("max-age=0")) {
      cookies.delete(name);
      continue;
    }
    if (/session_token$/.test(name)) {
      check(
        attrs.includes("secure") &&
          attrs.includes("httponly") &&
          attrs.includes("samesite=lax"),
        "session cookie attributes invalid",
      );
    }
    cookies.set(name, value);
  }
}
function session(alias, gate, password, suppliedCode) {
  check(
    ["qa", "qa-cashier", "qa-kitchen", "qa-waiter"].includes(alias),
    "invalid QA alias",
  );
  check(!suppliedCode || /^\d{6}$/.test(suppliedCode), "invalid optional TOTP");
  const email = alias + "@unibos-staging.invalid";
  const cookies = new Map();
  async function request(label, route, options = {}) {
    label = alias + " " + label;
    const { method = "GET", body, admit = true, expected = 200 } = options;
    const url = new URL(route, origin);
    check(
      url.origin === origin && url.pathname.startsWith("/api/"),
      "host guard rejected route",
    );
    const attempts = method === "GET" ? 3 : 1;
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const headers = { Accept: "application/json", Origin: origin };
      if (admit)
        headers.Authorization =
          "Basic " + Buffer.from("unibos:" + gate, "utf8").toString("base64");
      if (admit && cookies.size)
        headers.Cookie = [...cookies].map(([k, v]) => k + "=" + v).join("; ");
      if (body !== undefined) headers["Content-Type"] = "application/json";
      let res;
      try {
        res = await fetch(url, {
          method,
          headers,
          redirect: "manual",
          signal: AbortSignal.timeout(30000),
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
      } catch {
        if (attempt < attempts) {
          console.log("RETRY " + label + " network");
          await delay(1200 * attempt);
          continue;
        }
        throw new SafeFailure(label + ": network failure or timeout");
      }
      if ([502, 503, 504].includes(res.status) && attempt < attempts) {
        await res.body?.cancel();
        console.log("RETRY " + label + " HTTP " + res.status);
        await delay(1200 * attempt);
        continue;
      }
      if (![].concat(expected).includes(res.status)) {
        console.log(
          "FAIL " + label + " HTTP " + res.status + " expected " + expected,
        );
        await res.body?.cancel();
        throw new SafeFailure("unexpected HTTP status");
      }
      if (!admit) {
        check(
          /^Basic realm="UniBOS staging"/i.test(
            res.headers.get("www-authenticate") || "",
          ),
          "expected staging Basic challenge",
        );
        await res.body?.cancel();
        console.log("PASS " + label + " HTTP " + res.status);
        return null;
      }
      storeCookies(cookies, res);
      const obj = await res.json().catch(() => null);
      check(obj && typeof obj === "object", "expected JSON response");
      console.log("PASS " + label + " HTTP " + res.status);
      return obj;
    }
  }
  async function login() {
    const signed = await request(
      "QA password sign-in",
      "/api/auth/sign-in/email",
      { method: "POST", body: { email, password } },
    );
    let code;
    if (signed.twoFactorRedirect === true) {
      code = suppliedCode || codeFor(loadSeed(alias));
    } else {
      const identity = await request("QA session before enrollment", "/api/me");
      check(typeof identity.userId === "string", "invalid identity");
      if (!identity.mfaVerified) {
        const probe = crypto.randomBytes(32);
        check(
          dpapi(alias, "Unprotect", dpapi(alias, "Protect", probe)).equals(
            probe,
          ),
          "DPAPI verification failed",
        );
        let seed;
        if (fs.existsSync(seedPath(alias))) {
          // A previous run may have saved the pending factor before a lost verification response.
          seed = loadSeed(alias);
        } else {
          const enabled = await request(
            "QA TOTP enrollment",
            "/api/auth/two-factor/enable",
            { method: "POST", body: { password } },
          );

          const uri = new URL(enabled.totpURI);
          check(
            uri.protocol === "otpauth:" && uri.hostname === "totp",
            "unexpected OTP URI",
          );
          seed = uri.searchParams.get("secret");
          codeFor(seed);
          saveSeed(alias, seed, enabled.backupCodes || []);
          console.log(
            "PASS " + alias + " factor stored with CurrentUser DPAPI",
          );
        }
        code = codeFor(seed);
      }
    }
    if (code)
      await request("verify QA TOTP", "/api/auth/two-factor/verify-totp", {
        method: "POST",
        body: { code },
      });
    const me = await request("MFA-assured QA identity", "/api/me");
    check(
      me.mfaVerified === true && typeof me.userId === "string",
      "MFA assurance missing",
    );
    check(
      [...cookies.keys()].some((k) => /session_token$/.test(k)),
      "no secure session cookie",
    );
    return me.userId;
  }
  return {
    request,
    login,
    async signOut() {
      if ([...cookies.keys()].some((name) => /session_token$/.test(name))) {
        await request("sign out", "/api/auth/sign-out", {
          method: "POST",
          body: {},
        });
      }
    },
    clear: () => cookies.clear(),
  };
}
async function acquireRunLock() {
  const server = net.createServer((socket) => socket.destroy());
  await new Promise((resolve, reject) => {
    server.once("error", () =>
      reject(
        new SafeFailure("another QA run is active or local lock unavailable"),
      ),
    );
    server.listen("\\\\.\\pipe\\unibos-p46-hosted-qa-smoke", resolve);
  });
  return server;
}

module.exports = {
  session,
  acquireRunLock,
  SafeFailure,
  check,
  uuid,
  codeFor,
  origin,
};
