"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Organization = { id: string; name: string };
type Branch = { id: string; name: string };

export default function DashboardPage() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [branches, setBranches] = useState<Record<string, Branch[]>>({});
  const [name, setName] = useState("");
  const [branchName, setBranchName] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const [dark, setDark] = useState(false);
  const [loading, setLoading] = useState(true);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [error, setError] = useState("");

  const request = useCallback(
    async (path: string, method = "GET", body?: Record<string, string>) => {
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data: Record<string, unknown> = {};
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch {
        /* fixed messages below */
      }
      return { response, data };
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    if (process.env.NEXT_PUBLIC_AUTH_CONFIGURED !== "true") {
      setApiUnavailable(true);
      setLoading(false);
      return;
    }
    try {
      const identity = await request("/api/me");
      if (identity.response.status === 503) {
        setApiUnavailable(true);
        return;
      }
      if (identity.response.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (!identity.response.ok)
        throw new Error("Account status could not be confirmed.");
      if (identity.data.mfaVerified !== true) {
        router.replace("/sign-in");
        return;
      }
      const result = await request("/api/organizations");
      if (result.response.status === 503) {
        setApiUnavailable(true);
        return;
      }
      if (!result.response.ok)
        throw new Error("Your workspace could not be loaded.");
      const rows = Array.isArray(result.data.organizations)
        ? (result.data.organizations as Organization[])
        : [];
      setOrganizations(rows);
      const branchResults = await Promise.all(
        rows.map(async (organization) => {
          const branchResult = await request(
            `/api/organizations/${encodeURIComponent(organization.id)}/branches`,
          );
          return [
            organization.id,
            branchResult.response.ok &&
            Array.isArray(branchResult.data.branches)
              ? (branchResult.data.branches as Branch[])
              : [],
          ] as const;
        }),
      );
      setBranches(Object.fromEntries(branchResults));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "The workspace could not be loaded.",
      );
    } finally {
      setLoading(false);
    }
  }, [request, router]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const result = await request("/api/organizations", "POST", {
      name: name.trim(),
    });
    if (!result.response.ok) {
      setError(
        result.response.status === 403
          ? "An active verified MFA session is required to create an organization."
          : "The organization could not be created.",
      );
      return;
    }
    setName("");
    await refresh();
  }

  async function createBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!active) return;
    setError("");
    const result = await request(
      `/api/organizations/${encodeURIComponent(active)}/branches`,
      "POST",
      { name: branchName.trim() },
    );
    if (!result.response.ok) {
      setError(
        result.response.status === 403
          ? "Your role or MFA session does not permit this action."
          : "The branch could not be created.",
      );
      return;
    }
    setBranchName("");
    await refresh();
  }

  async function signOut() {
    try {
      const result = await request("/api/auth/sign-out", "POST", {});
      if (!result.response.ok) {
        setError("Sign-out could not be confirmed. Please try again.");
        return;
      }
      router.replace("/");
    } catch {
      setError(
        "Sign-out could not be confirmed. Check your connection and try again.",
      );
    }
  }

  return (
    <main className={`dashboard-page${dark ? " theme-dark" : ""}`}>
      <header className="dashboard-header">
        <Link href="/" className="dashboard-brand">
          <Image
            src={dark ? "/brand/mark-dark.svg" : "/brand/mark-light.svg"}
            alt=""
            width={27}
            height={31}
            unoptimized
          />
          <b>UniBOS</b>
        </Link>
        <nav>
          <a href="#businesses">Businesses</a>
          <a href="#branches">Branches</a>
          <Link href="/demo">Explore demos</Link>
          <button
            className="theme-toggle"
            onClick={() => setDark((value) => !value)}
            aria-pressed={dark}
          >
            {dark ? "Light" : "Dark"} mode
          </button>
          {process.env.NEXT_PUBLIC_AUTH_CONFIGURED === "true" && (
            <button onClick={() => void signOut()}>Sign out</button>
          )}
        </nav>
      </header>
      <div className="dashboard-wrap">
        <div className="dashboard-welcome">
          <div>
            <p className="eyebrow">
              <span />
              BUSINESS WORKSPACE
            </p>
            <h1>Your business, in focus.</h1>
            <p>Manage organizations and locations from one workspace.</p>
          </div>
          {!loading && (
            <span className="ui-badge">
              {apiUnavailable ? "Preview only" : "MFA verified"}
            </span>
          )}
        </div>
        {error && (
          <p role="alert" className="dashboard-alert">
            {error}
          </p>
        )}
        {loading ? (
          <div className="ui-card">Loading your workspace…</div>
        ) : apiUnavailable ? (
          <section className="preview-unavailable">
            <span className="ui-badge">Preview</span>
            <h2>Business service not connected</h2>
            <p>
              This deployment has no authentication or business API. Account and
              organization actions are disabled; no business data is stored
              here.
            </p>
            <Link className="ui-button" href="/demo/workspace">
              View sample workspace
            </Link>
          </section>
        ) : (
          <>
            <section className="dashboard-section" id="businesses">
              <div className="dashboard-section-title">
                <div>
                  <h2>Your businesses</h2>
                  <p>Organizations available to your account.</p>
                </div>
                <span className="ui-badge">
                  {organizations.length} organizations
                </span>
              </div>
              {organizations.length === 0 ? (
                <div className="empty-state">
                  <div className="empty-mark">U</div>
                  <h3>Start with your first business</h3>
                  <p>
                    Create an organization to set up a business workspace. Only
                    verified MFA sessions can create one.
                  </p>
                  <form
                    className="dashboard-form"
                    onSubmit={createOrganization}
                  >
                    <label htmlFor="org-name">Business name</label>
                    <div>
                      <input
                        id="org-name"
                        className="ui-input"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        minLength={1}
                        maxLength={120}
                        required
                      />
                      <button className="ui-button">
                        Create organization ›
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <div className="organization-grid">
                  {organizations.map((organization) => (
                    <article
                      className="organization-card"
                      key={organization.id}
                    >
                      <div className="organization-icon">
                        {organization.name.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="organization-copy">
                        <h3>{organization.name}</h3>
                        <p>Organization workspace</p>
                      </div>
                      <button
                        className="organization-open"
                        onClick={() =>
                          setActive(
                            active === organization.id ? null : organization.id,
                          )
                        }
                        aria-expanded={active === organization.id}
                      >
                        Manage ›
                      </button>
                      {active === organization.id && (
                        <div className="branch-manager" id="branches">
                          <div className="dashboard-section-title">
                            <div>
                              <h3>Locations</h3>
                              <p>
                                Business locations within this organization.
                              </p>
                            </div>
                            <span className="ui-badge">
                              {branches[organization.id]?.length ?? 0} branches
                            </span>
                          </div>
                          {branches[organization.id]?.length ? (
                            <ul>
                              {branches[organization.id]?.map((branch) => (
                                <li key={branch.id}>
                                  <span>{branch.name}</span>
                                  <small>Branch</small>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="dashboard-note">
                              No branches yet. Add a location to organize
                              branch-level work.
                            </p>
                          )}
                          <form
                            className="dashboard-form"
                            onSubmit={createBranch}
                          >
                            <label htmlFor="branch-name">New branch</label>
                            <div>
                              <input
                                id="branch-name"
                                className="ui-input"
                                value={branchName}
                                onChange={(event) =>
                                  setBranchName(event.target.value)
                                }
                                minLength={1}
                                maxLength={120}
                                required
                              />
                              <button className="ui-button">
                                Add branch ›
                              </button>
                            </div>
                          </form>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
            <div className="dashboard-note wide-note">
              <span className="ui-badge">Workspace foundation</span>
              <span>
                Menus, orders, team management and analytics are not available
                in this release.
              </span>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
