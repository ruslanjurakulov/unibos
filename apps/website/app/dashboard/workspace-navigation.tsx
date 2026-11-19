"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import styles from "./workspace-navigation.module.css";

type Link = { href: string; id: string };
type Branch = {
  id: string;
  name: string;
  roles: string[];
  effectiveRoles: string[];
  capabilities: string[];
  navigation: Link[];
};
type Organization = {
  id: string;
  name: string;
  roles: string[];
  branches: Branch[];
};
type Response = { organizations?: Organization[] };
type Language = "uz" | "ru" | "en";

type WorkspaceView = {
  language: Language;
  status: "loading" | "ready" | "unavailable" | "denied";
  organization?: Organization;
  branch?: Branch;
};

const roleNames: Record<Language, Record<string, string>> = {
  uz: {
    owner: "Egasi",
    director: "Direktor",
    administrator: "Administrator",
    accountant: "Hisobchi",
    cashier: "Kassir",
    waiter: "Ofitsiant",
    kitchen: "Oshxona",
    shifts: "Smenalar",
    payments: "Naqd to‘lovlar",
    menu: "Katalog",
  },
  ru: {
    owner: "Владелец",
    director: "Директор",
    administrator: "Администратор",
    accountant: "Бухгалтер",
    cashier: "Кассир",
    waiter: "Официант",
    kitchen: "Кухня",
    shifts: "Смены",
    payments: "Наличные платежи",
    menu: "Каталог",
  },
  en: {
    owner: "Owner",
    director: "Director",
    administrator: "Administrator",
    accountant: "Accountant",
    cashier: "Cashier",
    waiter: "Waiter",
    kitchen: "Kitchen",
    shifts: "Cash shifts",
    payments: "Cash payments",
    menu: "Catalog",
  },
};
const copy: Record<Language, Record<string, string>> = {
  uz: {
    label: "Ish joyi navigatsiyasi",
    organization: "Tashkilot",
    branch: "Filial",
    dashboard: "Bosh sahifa",
    pos: "Kassir POS",
    waiter: "Ofitsiant",
    kitchen: "Oshxona",
    shifts: "Smenalar",
    payments: "To‘lovlar",
    analytics: "Analitika",
    loading: "Vakolatlar tekshirilmoqda…",
    unavailable: "Ish joyi API orqali tasdiqlanmadi",
    menu: "Navigatsiya",
    catalog: "Katalog",
    locked: "Amaliyot yakunlanmaguncha filialni almashtirib bo‘lmaydi",
    role: "Vakolat doirasi",
    organizationRole: "Tashkilot",
    branchRole: "Filial",
    language: "Til",
  },
  ru: {
    label: "Навигация рабочего пространства",
    organization: "Организация",
    branch: "Филиал",
    dashboard: "Обзор",
    pos: "Касса POS",
    waiter: "Официант",
    kitchen: "Кухня",
    shifts: "Смены",
    payments: "Платежи",
    analytics: "Аналитика",
    loading: "Проверка прав доступа…",
    unavailable: "Рабочее пространство не подтверждено API",
    menu: "Навигация",
    catalog: "Каталог",
    locked: "Нельзя менять филиал до завершения операции",
    role: "Область доступа",
    organizationRole: "Организация",
    branchRole: "Филиал",
    language: "Язык",
  },
  en: {
    label: "Workspace navigation",
    organization: "Organization",
    branch: "Branch",
    dashboard: "Overview",
    pos: "Cashier POS",
    waiter: "Waiter",
    kitchen: "Kitchen",
    shifts: "Cash shifts",
    payments: "Payments",
    analytics: "Analytics",
    loading: "Verifying access…",
    unavailable: "Workspace was not verified by the API",
    menu: "Navigation",
    catalog: "Catalog",
    locked: "Resolve the pending operation before switching branches",
    role: "Access scope",
    organizationRole: "Organization",
    branchRole: "Branch",
    language: "Language",
  },
};
const linkKey: Record<string, string> = {
  analytics: "analytics",
  workspace: "dashboard",
  pos: "pos",
  waiter: "waiter",
  kitchen: "kitchen",
  shifts: "shifts",
  payments: "payments",
  menu: "catalog",
};

export default function WorkspaceNavigation({
  dark = false,
  children,
}: {
  dark?: boolean;
  children?: (context: WorkspaceView) => ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [status, setStatus] = useState<WorkspaceView["status"]>("loading");
  const [language, setLanguage] = useState<Language>("uz");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [locked, setLocked] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [branchId, setBranchId] = useState("");
  const mobileToggle = useRef<HTMLButtonElement>(null);
  const t = copy[language];

  useEffect(() => {
    try {
      const stored = localStorage.getItem("unibos.workspace.language");
      if (stored === "uz" || stored === "ru" || stored === "en")
        setLanguage(stored);
    } catch {}
    let active = true;
    const load = () =>
      void fetch("/api/v1/me/workspace-capabilities", {
        credentials: "same-origin",
        cache: "no-store",
      })
        .then(async (response) => {
          if (response.status === 401) {
            router.replace("/sign-in");
            throw new Error("Session expired");
          }
          if (!response.ok) throw response.status;
          return (await response.json()) as Response;
        })
        .then((data) => {
          if (active) {
            setStatus("ready");
            setOrganizations(
              Array.isArray(data.organizations) ? data.organizations : [],
            );
          }
        })
        .catch((error: unknown) => {
          if (active) {
            setStatus(error === 403 ? "denied" : "unavailable");
            setOrganizations([]);
          }
        });
    load();
    const onLanguage = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (value !== "uz" && value !== "ru" && value !== "en") return;
      setLanguage(value);
      try {
        localStorage.setItem("unibos.workspace.language", value);
      } catch {}
    };
    window.addEventListener("unibos:workspace-language", onLanguage);
    window.addEventListener("focus", load);
    return () => {
      active = false;
      window.removeEventListener("unibos:workspace-language", onLanguage);
      window.removeEventListener("focus", load);
    };
  }, [router]);

  useEffect(() => {
    const sync = () =>
      setLocked(document.body.dataset.unibosWorkspaceLocked === "true");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-unibos-workspace-locked"],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    document.querySelector<HTMLAnchorElement>("#workspace-links a")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        mobileToggle.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  useEffect(() => {
    if (!organizations.length) return;
    const params = new URLSearchParams(window.location.search);
    const requestedOrg = params.get("organizationId");
    const org =
      organizations.find((item) => item.id === requestedOrg) ??
      organizations[0];
    if (!org) return;
    const requestedBranch = params.get("branchId");
    const branch =
      org.branches.find((item) => item.id === requestedBranch) ??
      org.branches[0];
    setOrganizationId(org.id);
    setBranchId(branch?.id ?? "");
  }, [organizations, pathname]);

  useEffect(() => {
    let restoringHistory = false;
    const syncScopeFromHistory = () => {
      if (restoringHistory) {
        restoringHistory = false;
        return;
      }
      if (document.body.dataset.unibosWorkspaceLocked === "true") {
        restoringHistory = true;
        window.history.forward();
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const nextOrg = organizations.find(
        (item) => item.id === params.get("organizationId"),
      );
      const nextBranch = nextOrg?.branches.find(
        (item) => item.id === params.get("branchId"),
      );
      if (!nextOrg || !nextBranch) return;
      setOrganizationId(nextOrg.id);
      setBranchId(nextBranch.id);
      window.dispatchEvent(
        new CustomEvent("unibos:workspace-scope", {
          detail: { organizationId: nextOrg.id, branchId: nextBranch.id },
        }),
      );
    };
    window.addEventListener("popstate", syncScopeFromHistory);
    return () => window.removeEventListener("popstate", syncScopeFromHistory);
  }, [organizations]);

  const organization = organizations.find((item) => item.id === organizationId);
  const branch = organization?.branches.find((item) => item.id === branchId);
  const links = branch?.navigation ?? [];
  const orgRoles = organization?.roles ?? [];
  const branchRoles = branch?.roles ?? [];
  const roleLabel = useMemo(
    () =>
      [
        ...(orgRoles.length
          ? [
              `${t.organizationRole}: ${orgRoles.map((role) => roleNames[language][role] ?? role).join(", ")}`,
            ]
          : []),
        ...(branchRoles.length
          ? [
              `${t.branchRole}: ${branchRoles.map((role) => roleNames[language][role] ?? role).join(", ")}`,
            ]
          : []),
      ].join(" · "),
    [orgRoles, branchRoles, language, t.branchRole, t.organizationRole],
  );

  function changeScope(nextOrganizationId: string, nextBranchId: string) {
    if (locked || !nextBranchId) return;
    const nextOrganization = organizations.find(
      (item) => item.id === nextOrganizationId,
    );
    const nextBranch = nextOrganization?.branches.find(
      (item) => item.id === nextBranchId,
    );
    const target =
      nextBranch?.navigation.find(
        (item) => item.href.split("?")[0] === pathname,
      ) ?? nextBranch?.navigation.find((item) => item.id === "workspace");
    if (!target) return;
    window.dispatchEvent(
      new CustomEvent("unibos:workspace-scope", {
        detail: { organizationId: nextOrganizationId, branchId: nextBranchId },
      }),
    );
    router.push(target.href);
    setMobileOpen(false);
  }

  function setLocale(value: string) {
    if (value !== "uz" && value !== "ru" && value !== "en") return;
    setLanguage(value);
    window.dispatchEvent(
      new CustomEvent("unibos:workspace-language", { detail: value }),
    );
    try {
      localStorage.setItem("unibos.workspace.language", value);
    } catch {}
  }

  const content = children?.({ language, status, organization, branch });
  if (status === "loading" || !organizations.length)
    return (
      <>
        <div className={styles.status} role="status">
          {status === "loading" ? t.loading : t.unavailable}
        </div>
        {content}
      </>
    );
  const selectedOrganizationId = organization?.id ?? organizations[0]?.id ?? "";

  const navigation = (
    <section className={styles.shell} data-dark={dark} aria-label={t.label}>
      <header className={styles.header}>
        <a className={styles.brand} href="/dashboard">
          UniBOS <small>OPERATIONS</small>
        </a>
        <div className={styles.context}>
          <label>
            {t.organization}
            <select
              value={selectedOrganizationId}
              disabled={locked}
              onChange={(event) => {
                const next = organizations.find(
                  (item) => item.id === event.target.value,
                );
                setOrganizationId(event.target.value);
                if (next?.branches[0]) {
                  setBranchId(next.branches[0].id);
                  changeScope(next.id, next.branches[0].id);
                }
              }}
            >
              {organizations.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.branch}
            <select
              value={branch?.id ?? ""}
              disabled={locked || !organization?.branches.length}
              onChange={(event) => {
                setBranchId(event.target.value);
                changeScope(selectedOrganizationId, event.target.value);
              }}
            >
              {(organization?.branches ?? []).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <span className={styles.role}>
            <small>{t.role}</small>
            <b>{roleLabel || "—"}</b>
          </span>
          <label className={styles.language}>
            {t.language}
            <select
              aria-label="Til / Язык / Language"
              value={language}
              onChange={(event) => setLocale(event.target.value)}
            >
              <option value="uz">UZ</option>
              <option value="ru">RU</option>
              <option value="en">EN</option>
            </select>
          </label>
          <button
            ref={mobileToggle}
            className={styles.mobileToggle}
            type="button"
            aria-expanded={mobileOpen}
            aria-controls="workspace-links"
            onClick={() => setMobileOpen((value) => !value)}
          >
            {t.menu}
          </button>
        </div>
      </header>
      {locked && (
        <p className={styles.locked} role="status">
          {t.locked}
        </p>
      )}
      <nav
        id="workspace-links"
        className={styles.links}
        data-open={mobileOpen}
        aria-label={t.menu}
      >
        {links.map((link) => (
          <a
            key={link.id}
            href={link.href}
            aria-current={
              pathname === link.href.split("?")[0] ? "page" : undefined
            }
            aria-disabled={locked || undefined}
            tabIndex={locked ? -1 : undefined}
            onClick={(event) => {
              if (locked) event.preventDefault();
            }}
          >
            {t[linkKey[link.id] ?? "dashboard"]}
          </a>
        ))}
      </nav>
    </section>
  );
  return (
    <>
      {navigation}
      {content}
    </>
  );
}
