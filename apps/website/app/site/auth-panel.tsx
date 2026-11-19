"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";

type Phase =
  "credentials" | "totp" | "step-up" | "setup" | "verify-setup" | "backup";
type AuthResponse = {
  twoFactorRedirect?: unknown;
  totpURI?: unknown;
  backupCodes?: unknown;
  status?: string;
};

async function post(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; data: AuthResponse }> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: AuthResponse = {};
  try {
    data = (await response.json()) as AuthResponse;
  } catch {
    /* fixed user facing errors below */
  }
  return { ok: response.ok, data };
}

export function AuthPanel({ mode }: { mode: "sign-in" | "sign-up" }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("credentials");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [totpUri, setTotpUri] = useState("");
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const authConfigured = process.env.NEXT_PUBLIC_AUTH_CONFIGURED === "true";

  useEffect(() => {
    if (!authConfigured) return;
    let active = true;
    void fetch("/api/me", { credentials: "same-origin" })
      .then(async (response) => {
        if (!active || !response.ok) return;
        const identity = (await response.json()) as { mfaVerified?: boolean };
        if (!active) return;
        if (identity.mfaVerified) router.replace("/dashboard");
        else setPhase("setup");
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [authConfigured, router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (phase === "credentials") {
        const path =
          mode === "sign-up"
            ? "/api/auth/sign-up/email"
            : "/api/auth/sign-in/email";
        const payload: Record<string, unknown> = {
          email: email.trim(),
          password,
        };
        if (mode === "sign-up") payload.name = name.trim();
        const result = await post(path, payload);
        if (!result.ok)
          throw new Error(
            result.data.status === "error"
              ? "Check your details and try again. Sign-up may be disabled for this environment."
              : "Authentication could not be completed.",
          );
        if (result.data.twoFactorRedirect === true) setPhase("totp");
        else {
          const identity = await fetch("/api/me", {
            credentials: "same-origin",
          });
          if (!identity.ok)
            throw new Error(
              "The session could not be confirmed. Please try again.",
            );
          const user = (await identity.json()) as { mfaVerified?: boolean };
          if (user.mfaVerified) router.push("/dashboard");
          else setPhase("setup");
        }
      } else if (phase === "totp" || phase === "step-up") {
        const result = await post(
          useBackupCode
            ? "/api/auth/two-factor/verify-backup-code"
            : "/api/auth/two-factor/verify-totp",
          { code: code.trim() },
        );
        if (!result.ok)
          throw new Error(
            "That code was not accepted. Check your authenticator and try again.",
          );
        router.push("/dashboard");
      } else if (phase === "setup") {
        const result = await post("/api/auth/two-factor/enable", { password });
        if (!result.ok)
          throw new Error(
            "We could not start security setup. Check your password and try again.",
          );
        setTotpUri(
          typeof result.data.totpURI === "string" ? result.data.totpURI : "",
        );
        setBackupCodes(
          Array.isArray(result.data.backupCodes)
            ? result.data.backupCodes.filter(
                (item): item is string => typeof item === "string",
              )
            : [],
        );
        setPhase("verify-setup");
      } else if (phase === "verify-setup") {
        const result = await post("/api/auth/two-factor/verify-totp", {
          code: code.trim(),
        });
        if (!result.ok)
          throw new Error(
            "That code was not accepted. Check the time on your device and try again.",
          );
        if (backupCodes.length) setPhase("backup");
        else router.push("/dashboard");
      } else {
        router.push("/dashboard");
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The request could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const heading =
    phase === "step-up"
      ? "Verify your account"
      : phase === "totp"
        ? "Verify your sign-in"
        : phase === "setup"
          ? "Protect your account"
          : phase === "verify-setup"
            ? "Confirm your authenticator"
            : phase === "backup"
              ? "Save your recovery codes"
              : mode === "sign-up"
                ? "Create your account"
                : "Welcome back";
  return (
    <main className="auth-page">
      <header className="auth-nav">
        <Link href="/">
          <Image
            src="/brand/wordmark-light.svg"
            alt="UniBOS"
            width={165}
            height={59}
            unoptimized
          />
        </Link>
        <Link href="/">← Back to UniBOS</Link>
      </header>
      <section className="auth-card">
        <div className="auth-brand-mark">
          <Image
            src="/brand/mark-light.svg"
            alt=""
            width={34}
            height={40}
            unoptimized
          />
        </div>
        <p className="eyebrow">
          <span />
          UNIBOS ACCOUNT
        </p>
        <h1>{heading}</h1>
        {phase === "verify-setup" && (
          <div className="auth-instructions">
            <p>
              Open an authenticator app and add an account using this setup key.
            </p>
            <code>
              {new URLSearchParams(totpUri.split("?")[1] ?? "").get("secret") ??
                "Key available in your authenticator setup URI"}
            </code>
            <small>
              Enter the six-digit code shown in your app to finish setup.
            </small>
          </div>
        )}
        {!authConfigured ? (
          <p className="auth-unavailable" role="status">
            Sign-in is not connected in this preview. No account details are
            sent to an authentication service.
          </p>
        ) : phase === "backup" ? (
          <div className="auth-instructions">
            <p>
              Store these one-time recovery codes somewhere private. Each code
              can be used once.
            </p>
            <pre>{backupCodes.join("\n")}</pre>
            <button
              className="ui-button"
              onClick={() => router.push("/dashboard")}
            >
              Continue to workspace
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={onSubmit}>
            {phase === "setup" && (
              <div className="auth-instructions">
                <p>
                  Already set up two-factor authentication? Verify your existing
                  authenticator or a recovery code to renew access. Otherwise,
                  enter your password below to set up an authenticator.
                </p>
                <button
                  type="button"
                  className="auth-alternate"
                  disabled={busy}
                  onClick={() => {
                    setPhase("step-up");
                    setUseBackupCode(false);
                    setCode("");
                    setPassword("");
                    setError("");
                  }}
                >
                  Verify an existing authenticator or recovery code
                </button>
              </div>
            )}
            {phase === "credentials" && mode === "sign-up" && (
              <label>
                Full name
                <input
                  className="ui-input"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  minLength={1}
                  maxLength={120}
                />
              </label>
            )}
            {(phase === "credentials" || phase === "setup") && (
              <label>
                {phase === "setup" ? "Account password" : "Email"}
                {phase === "setup" ? (
                  <input
                    className="ui-input"
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={12}
                    maxLength={128}
                  />
                ) : (
                  <input
                    className="ui-input"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    maxLength={254}
                  />
                )}
              </label>
            )}
            {phase === "credentials" && (
              <label>
                Password
                <input
                  className="ui-input"
                  type="password"
                  autoComplete={
                    mode === "sign-up" ? "new-password" : "current-password"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={12}
                  maxLength={128}
                />
                <small>Use at least 12 characters.</small>
              </label>
            )}
            {(phase === "totp" ||
              phase === "step-up" ||
              phase === "verify-setup") && (
              <label>
                {(phase === "totp" || phase === "step-up") && useBackupCode
                  ? "Recovery code"
                  : "Authenticator code"}
                <input
                  className={`ui-input${useBackupCode ? "" : " code-input"}`}
                  inputMode={useBackupCode ? "text" : "numeric"}
                  autoComplete={useBackupCode ? "off" : "one-time-code"}
                  pattern={useBackupCode ? undefined : "[0-9]{6}"}
                  maxLength={useBackupCode ? 64 : 6}
                  value={code}
                  onChange={(e) =>
                    setCode(
                      useBackupCode
                        ? e.target.value
                        : e.target.value.replace(/\D/g, ""),
                    )
                  }
                  required
                  aria-label={
                    useBackupCode
                      ? "One-time recovery code"
                      : "Six digit authenticator code"
                  }
                />
                <small>
                  {useBackupCode
                    ? "Each recovery code can be used once."
                    : "Enter the current six-digit code from your authenticator app."}
                </small>
              </label>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            {(phase === "totp" || phase === "step-up") && (
              <button
                type="button"
                className="auth-alternate"
                disabled={busy}
                onClick={() => {
                  setUseBackupCode((value) => !value);
                  setCode("");
                  setError("");
                }}
              >
                {useBackupCode
                  ? "Use an authenticator code"
                  : "Use a recovery code instead"}
              </button>
            )}
            {phase === "step-up" && (
              <button
                type="button"
                className="auth-alternate"
                disabled={busy}
                onClick={() => {
                  setPhase("setup");
                  setUseBackupCode(false);
                  setCode("");
                  setError("");
                }}
              >
                Back to authenticator setup
              </button>
            )}
            <button className="ui-button auth-submit" disabled={busy}>
              {busy
                ? "Please wait…"
                : phase === "credentials"
                  ? mode === "sign-up"
                    ? "Create account"
                    : "Continue"
                  : phase === "setup"
                    ? "Set up authenticator"
                    : "Verify and continue"}
              <span>›</span>
            </button>
          </form>
        )}
        {phase === "credentials" && (
          <p className="auth-switch">
            {mode === "sign-up" ? "Already have an account?" : "New to UniBOS?"}{" "}
            <Link href={mode === "sign-up" ? "/sign-in" : "/sign-up"}>
              {mode === "sign-up" ? "Sign in" : "Create an account"}
            </Link>
          </p>
        )}
        <p className="auth-footnote">
          Account creation may be restricted while the service is being
          prepared. MFA is required before protected business actions.
        </p>
      </section>
      <footer className="auth-footer">
        Made in Uzbekistan. Built for the world.
      </footer>
    </main>
  );
}
