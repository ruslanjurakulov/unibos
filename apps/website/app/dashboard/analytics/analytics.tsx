"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import WorkspaceNavigation from "../workspace-navigation";
import { formatWorkspaceMoney } from "../money";
import { labels, type Labels, type Language } from "./copy";
import {
  dateRange,
  isoDate,
  reportCsv,
  reportSpreadsheetXml,
  type Period,
  type Report,
} from "./report";
import styles from "./analytics.module.css";

type RequestState = "loading" | "ready" | "denied" | "unavailable" | "expired";
type Scope = {
  organizationId: string;
  branchId: string;
  from: string;
  to: string;
};

async function fetchReport(scope: Scope, signal: AbortSignal): Promise<Report> {
  const params = new URLSearchParams({ from: scope.from, to: scope.to });
  const response = await fetch(
    `/api/v1/organizations/${encodeURIComponent(scope.organizationId)}/branches/${encodeURIComponent(scope.branchId)}/analytics?${params}`,
    { cache: "no-store", credentials: "same-origin", signal },
  );
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "denied"
        : response.status === 401
          ? "expired"
          : "unavailable",
    );
  const data: Report = await response.json();
  if (
    data.version !== 1 ||
    data.organizationId !== scope.organizationId ||
    data.branchId !== scope.branchId ||
    data.from !== scope.from ||
    data.to !== scope.to ||
    !Array.isArray(data.currencies) ||
    !Array.isArray(data.products) ||
    !Array.isArray(data.cashiers) ||
    !Array.isArray(data.kitchen)
  )
    throw new Error("unavailable");
  return data;
}

function failure(error: unknown): RequestState {
  return error instanceof Error &&
    (error.message === "denied" || error.message === "expired")
    ? error.message
    : "unavailable";
}

function Metrics({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className={styles.metrics}>
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function Results({ scope, lang }: { scope: Scope; lang: Language }) {
  const t = labels[lang];
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<RequestState>("loading");
  const [refresh, setRefresh] = useState(0);
  const [exporting, setExporting] = useState<"csv" | "xml" | null>(null);
  const download = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetchReport(scope, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setReport(result);
          setState("ready");
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setReport(null);
          setState(failure(error));
        }
      });
    return () => {
      controller.abort();
      download.current?.abort();
    };
  }, [scope.organizationId, scope.branchId, scope.from, scope.to, refresh]); // scope values identify the report

  async function exportReport(format: "csv" | "xml") {
    if (exporting) return;
    const controller = new AbortController();
    download.current = controller;
    setExporting(format);
    try {
      const current = await fetchReport(scope, controller.signal);
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(
        new Blob(
          [
            format === "xml"
              ? reportSpreadsheetXml(current)
              : reportCsv(current),
          ],
          {
            type:
              format === "xml"
                ? "application/xml;charset=utf-8"
                : "text/csv;charset=utf-8",
          },
        ),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `unibos-${scope.branchId}-${scope.from}-${scope.to}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      if (!controller.signal.aborted) {
        setReport(null);
        setState(failure(error));
      }
    } finally {
      if (!controller.signal.aborted) setExporting(null);
    }
  }

  function reload() {
    setReport(null);
    setState("loading");
    setRefresh((n) => n + 1);
  }

  if (state !== "ready" || !report)
    return (
      <div className={styles.notice} role="status" aria-live="polite">
        {state !== "expired" && t[state === "ready" ? "loading" : state]}
        {state === "unavailable" && <button onClick={reload}>{t.retry}</button>}
        {state === "expired" && <a href="/sign-in">{t.expired}</a>}
      </div>
    );
  const money = (minor: string | null, currency: string) =>
    minor === null ? (
      "—"
    ) : (
      <span className={styles.money}>
        {formatWorkspaceMoney(minor, currency, lang)}
      </span>
    );
  const empty =
    !report.currencies.length &&
    !report.products.length &&
    !report.cashiers.length &&
    !report.kitchen.length &&
    report.averagePreparationSeconds === null;
  return (
    <>
      <div className={styles.reportBar}>
        <p>
          {scope.from} — {scope.to} <span>UTC</span>
        </p>
        <div>
          <button disabled={Boolean(exporting)} onClick={reload}>
            {t.refresh}
          </button>
          {(["csv", "xml"] as const).map((format) => (
            <button
              type="button"
              key={format}
              disabled={Boolean(exporting)}
              onClick={() => void exportReport(format)}
            >
              {exporting === format
                ? t.downloading
                : format === "csv"
                  ? t.download
                  : t.excel}
            </button>
          ))}
        </div>
      </div>
      {empty ? (
        <p className={styles.notice} role="status">
          {t.empty}
        </p>
      ) : (
        <>
          <section className={styles.section}>
            <h2>{t.sales}</h2>
            <p>{t.explanation}</p>
            {report.currencies.length === 0 ? (
              <p>{t.none}</p>
            ) : (
              report.currencies.map((row) => (
                <article className={styles.card} key={row.currency}>
                  <h3>{row.currency}</h3>
                  <Metrics
                    items={[
                      [t.value, money(row.orderTotalMinor, row.currency)],
                      [t.settled, money(row.settledMinor, row.currency)],
                      [t.average, money(row.averageOrderMinor, row.currency)],
                      [t.orders, row.orderCount],
                      [t.cancelled, row.cancelledCount],
                      [t.payments, row.settlementCount],
                      [t.ledger, row.ledgerAlerts],
                    ]}
                  />
                </article>
              ))
            )}
          </section>
          <section className={styles.section}>
            <h2>{t.products}</h2>
            <p>{t.ranking}</p>
            {report.products.length === 0 ? (
              <p>{t.none}</p>
            ) : (
              <div className={styles.tableBox}>
                <table aria-label={t.products}>
                  <thead>
                    <tr>
                      <th scope="col">{t.name}</th>
                      <th scope="col">{t.quantity}</th>
                      <th scope="col">{t.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.products.map((row) => (
                      <tr key={row.currency + row.productId}>
                        <th scope="row">{row.name}</th>
                        <td>{row.quantity}</td>
                        <td>{money(row.totalMinor, row.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className={styles.section}>
            <h2>{t.staff}</h2>
            <p>{t.shiftInfo}</p>
            {report.cashiers.length === 0 ? (
              <p>{t.none}</p>
            ) : (
              report.cashiers.map((row) => (
                <article
                  className={styles.card}
                  key={row.cashierId + row.currency}
                >
                  <h3>
                    {t.cashier} · {row.cashierId} · {row.currency}
                  </h3>
                  <Metrics
                    items={[
                      [t.settled, money(row.settledMinor, row.currency)],
                      [t.payments, row.settlementCount],
                      [t.closed, row.closedShifts],
                      [t.expected, money(row.expectedMinor, row.currency)],
                      [t.counted, money(row.countedMinor, row.currency)],
                      [t.variance, money(row.varianceMinor, row.currency)],
                      [t.alerts, row.varianceAlerts],
                    ]}
                  />
                </article>
              ))
            )}
          </section>
          <section className={styles.section}>
            <h2>{t.kitchen}</h2>
            <p>{t.queueInfo}</p>
            <article className={styles.card}>
              <Metrics
                items={[
                  [
                    t.preparation,
                    report.averagePreparationSeconds === null
                      ? "—"
                      : `${report.averagePreparationSeconds.toLocaleString(lang)} ${t.sec}`,
                  ],
                  ...report.kitchen.map((row): [string, number] => [
                    t[row.status as keyof Labels] ?? row.status,
                    row.ticketCount,
                  ]),
                ]}
              />
            </article>
          </section>
        </>
      )}
    </>
  );
}

function ReportPanel({
  organizationId,
  branchId,
  lang,
}: {
  organizationId: string;
  branchId: string;
  lang: Language;
}) {
  const t = labels[lang];
  const [period, setPeriod] = useState<Period>("week");
  const [anchor, setAnchor] = useState("");
  useEffect(() => setAnchor(isoDate(new Date())), []);
  const range = dateRange(anchor, period);
  return (
    <>
      <div className={styles.filters}>
        <fieldset>
          <legend>{t.period}</legend>
          <div>
            {(["day", "week", "month"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={value === period}
                onClick={() => setPeriod(value)}
              >
                {t[value]}
              </button>
            ))}
          </div>
        </fieldset>
        <label>
          {t.date}
          <input
            type="date"
            value={anchor}
            onChange={(e) => setAnchor(e.target.value)}
            required
          />
        </label>
      </div>
      {range && (
        <Results
          key={[organizationId, branchId, range.from, range.to].join(":")}
          scope={{ organizationId, branchId, ...range }}
          lang={lang}
        />
      )}
    </>
  );
}

export default function Analytics() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
  }, []);
  return (
    <main className={styles.page} data-dark={dark}>
      <WorkspaceNavigation dark={dark}>
        {({ language, status, organization, branch }) => {
          const t = labels[language];
          return (
            <div className={styles.content} lang={language}>
              <header className={styles.heading}>
                <div>
                  {organization && branch && (
                    <p>
                      {organization.name} · {branch.name}
                    </p>
                  )}
                  <h1>{t.title}</h1>
                </div>
                <button
                  type="button"
                  aria-pressed={dark}
                  onClick={() => setDark((v) => !v)}
                >
                  {t.theme}
                </button>
              </header>
              {status === "ready" &&
              branch?.capabilities.includes("analytics.read") &&
              organization ? (
                <ReportPanel
                  key={organization.id + branch.id}
                  organizationId={organization.id}
                  branchId={branch.id}
                  lang={language}
                />
              ) : (
                <p role="status" className={styles.notice}>
                  {status === "ready" ? t.denied : t[status]}
                </p>
              )}
            </div>
          );
        }}
      </WorkspaceNavigation>
    </main>
  );
}
