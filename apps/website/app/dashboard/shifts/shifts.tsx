"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceNavigation from "../workspace-navigation";
import styles from "./shifts.module.css";

type Organization = { id: string; name: string };
type Shift = {
  id: string;
  status: "OPEN" | "CLOSING" | "CLOSED";
  currency_code: string;
  opening_amount_minor: string;
  expected_current_minor?: string;
  closing_expected_minor?: string;
  counted_cash_minor?: string;
  variance_minor?: string;
  version: number;
  opened_at?: string;
  closed_at?: string;
};
type Branch = { id: string; name: string; capabilities?: string[] };
type ScopeOrganization = Organization & { branches?: Branch[] };
type Payload = {
  organizations?: ScopeOrganization[];
  activeShift?: Shift | null;
  movements?: Array<{
    movement_type: string;
    amount_minor: string;
    reason: string;
  }>;
  history?: Shift[];
  shift?: Shift;
  error?: string;
};
type Language = "uz" | "ru" | "en";
type ShiftOperation = "open" | "movement" | "begin-close" | "confirm-close";
type PendingShiftOperation = {
  operation: ShiftOperation;
  idempotencyKey: string;
  body: Record<string, unknown>;
  shiftId: string | null;
};

const words = {
  uz: {
    title: "Kassa smenalari",
    intro: "Smena va kassa qoldig‘ini boshqaring.",
    connected: "Himoyalangan API",
    demo: "Demo emas · API ulangan",
    loading: "Ma’lumot yuklanmoqda…",
    branch: "Filial",
    currency: "Valyuta kodi",
    opening: "Boshlang‘ich naqd pul (tiyin) ",
    open: "Smenani ochish",
    expected: "Kutilayotgan naqd pul",
    openingBalance: "Boshlang‘ich qoldiq",
    cashReceived: "Kassaga kirim",
    cashRemoved: "Kassadan chiqim",
    varianceValue: "Farq",
    count: "Sanab chiqilgan naqd pul (tiyin)",
    begin: "Yopishni boshlash",
    confirm: "Yopishni tasdiqlash",
    cashIn: "Kassaga kirim",
    cashOut: "Kassadan chiqim",
    amount: "Miqdor (tiyin)",
    reason: "Sabab",
    add: "Harakatni qayd etish",
    active: "Joriy smena",
    none: "Faol smena yo‘q",
    movements: "Kassa harakatlari",
    history: "Yopilgan smenalar",
    variance: "Farq",
    refresh: "Yangilash",
    error:
      "So‘rov bajarilmadi. Holatni yangilang; qayta urinishda o‘sha amal kaliti saqlanadi.",
    unauthorized: "Ushbu filial uchun smena vakolati tasdiqlanmadi.",
    unavailable: "API ulanmagan. Moliyaviy demo rejimi mavjud emas.",
    note: "Miqdorlar eng kichik valyuta birligida yuboriladi. Ushbu ekran real pulni ko‘chirmaydi; API’dagi yozuvlar audit qilinadi.",
    signedOut: "Kirish seansi tasdiqlanmadi.",
    role: "Faqat vakolatli foydalanuvchilar smenani boshqarishi mumkin.",
    closeWarning: "Smenani yopishni qaytarib bo‘lmaydi.",
    empty: "Harakatlar hozircha yo‘q.",
    startError: "MFA tasdiqlangan seans talab qilinadi.",
    language: "Til",
    theme: "Ko‘rinish",
    light: "Yorug‘",
    dark: "Qorong‘i",
    unknown:
      "Server javobi noaniq. Shu amalni qayta yuboring; o‘sha amal kaliti saqlanadi.",
    pending:
      "Quyidagi amal yakunlangani hali tasdiqlanmagan. Filial almashtirish bloklandi.",
    retry: "Shu amalni xavfsiz qayta tekshirish",
  },
  ru: {
    title: "Кассовые смены",
    intro: "Управление сменой и остатком кассы.",
    connected: "Защищённый API",
    demo: "Не демо · API подключён",
    loading: "Загрузка…",
    branch: "Филиал",
    currency: "Код валюты",
    opening: "Начальная наличность (в минорных единицах)",
    open: "Открыть смену",
    expected: "Ожидаемая наличность",
    openingBalance: "Начальный остаток",
    cashReceived: "Поступления",
    cashRemoved: "Выдачи",
    varianceValue: "Разница",
    count: "Пересчитанная наличность (минорные единицы)",
    begin: "Начать закрытие",
    confirm: "Подтвердить закрытие",
    cashIn: "Приход наличных",
    cashOut: "Расход наличных",
    amount: "Сумма (минорные единицы)",
    reason: "Причина",
    add: "Записать движение",
    active: "Текущая смена",
    none: "Нет активной смены",
    movements: "Движения кассы",
    history: "Закрытые смены",
    variance: "Разница",
    refresh: "Обновить",
    error:
      "Запрос не выполнен. Обновите статус; повтор использует тот же ключ операции.",
    unauthorized: "Полномочия для этого филиала не подтверждены.",
    unavailable: "API не подключён. Финансового демо режима нет.",
    note: "Суммы передаются в минорных единицах. Экран не перемещает реальные деньги; записи API аудируются.",
    signedOut: "Сеанс не подтверждён.",
    role: "Сменами управляют только уполномоченные пользователи.",
    closeWarning: "Закрытие смены нельзя отменить.",
    empty: "Движений пока нет.",
    startError: "Требуется подтверждённая MFA сессия.",
    language: "Язык",
    theme: "Тема",
    light: "Светлая",
    dark: "Тёмная",
    unknown: "Ответ сервера неясен. Повторите ту же операцию; ключ сохранён.",
    pending:
      "Результат операции пока не подтверждён. Переключение филиала заблокировано.",
    retry: "Безопасно повторить эту операцию",
  },
  en: {
    title: "Cash shifts",
    intro: "Manage a shift and its cash drawer.",
    connected: "Protected API",
    demo: "Not a demo · API connected",
    loading: "Loading…",
    branch: "Branch",
    currency: "Currency code",
    opening: "Opening cash (minor units)",
    open: "Open shift",
    expected: "Expected cash",
    openingBalance: "Opening balance",
    cashReceived: "Cash received",
    cashRemoved: "Cash removed",
    varianceValue: "Variance",
    count: "Counted cash (minor units)",
    begin: "Begin close",
    confirm: "Confirm close",
    cashIn: "Cash in",
    cashOut: "Cash out",
    amount: "Amount (minor units)",
    reason: "Reason",
    add: "Record movement",
    active: "Active shift",
    none: "No active shift",
    movements: "Drawer movements",
    history: "Closed shifts",
    variance: "Variance",
    refresh: "Refresh",
    error: "Request failed. Refresh status; retries retain the operation key.",
    unauthorized: "Shift access for this branch was not verified.",
    unavailable: "API is not connected. No financial demo mode is available.",
    note: "Amounts use integer minor units. This screen does not move physical cash; API records are audited.",
    signedOut: "The session could not be verified.",
    role: "Only authorized users can operate shifts.",
    closeWarning: "Closing a shift cannot be undone.",
    empty: "No movements yet.",
    startError: "A verified MFA session is required.",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    unknown:
      "The server outcome is unclear. Retry the same operation; its key is retained.",
    pending:
      "This operation has not been confirmed yet. Branch switching is locked.",
    retry: "Safely retry this operation",
  },
} satisfies Record<Language, Record<string, string>>;
type Copy = typeof words.uz;

const key = () => crypto.randomUUID();
const currencyList = ["UZS", "USD", "EUR", "RUB"];
const sumMovement = (
  movements: NonNullable<Payload["movements"]>,
  movementType: string,
) =>
  movements
    .filter((movement) => movement.movement_type === movementType)
    .reduce((total, movement) => total + BigInt(movement.amount_minor), 0n);

export default function CashShifts() {
  const router = useRouter();
  const loadSequence = useRef(0);
  const [language, setLanguage] = useState<Language>("uz");
  const [dark, setDark] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [shift, setShift] = useState<Shift | null>(null);
  const [movements, setMovements] = useState<Payload["movements"]>([]);
  const [history, setHistory] = useState<Shift[]>([]);
  const [currency, setCurrency] = useState("UZS");
  const [opening, setOpening] = useState("0");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [movementType, setMovementType] = useState("CASH_IN");
  const [counted, setCounted] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pendingOperation, setPendingOperation] =
    useState<PendingShiftOperation | null>(null);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const t = words[language] as Copy;

  useEffect(() => {
    try {
      const stored = localStorage.getItem("unibos.workspace.language");
      if (stored === "uz" || stored === "ru" || stored === "en")
        setLanguage(stored);
      const params = new URLSearchParams(location.search);
      setOrganizationId(params.get("organizationId") ?? "");
      setBranchId(params.get("branchId") ?? "");
    } catch {}
    const onScope = (event: Event) => {
      const scope = (
        event as CustomEvent<{ organizationId: string; branchId: string }>
      ).detail;
      if (!scope || document.body.dataset.unibosWorkspaceLocked === "true")
        return;
      loadSequence.current += 1;
      setShift(null);
      setMovements([]);
      setHistory([]);
      setError("");
      setPendingOperation(null);
      setOrganizationId(scope.organizationId);
      setBranchId(scope.branchId);
    };
    const onLanguage = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (next === "uz" || next === "ru" || next === "en") setLanguage(next);
    };
    window.addEventListener("unibos:workspace-scope", onScope);
    window.addEventListener("unibos:workspace-language", onLanguage);
    return () => {
      window.removeEventListener("unibos:workspace-scope", onScope);
      window.removeEventListener("unibos:workspace-language", onLanguage);
    };
  }, []);

  const load = useCallback(async () => {
    const requestSequence = ++loadSequence.current;
    const currentRequest = () => requestSequence === loadSequence.current;
    setLoading(true);
    setError("");
    setUnavailable(false);
    try {
      if (process.env.NEXT_PUBLIC_AUTH_CONFIGURED !== "true") {
        setUnavailable(true);
        return;
      }
      const me = await fetch("/api/me", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!currentRequest()) return;
      if (me.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (me.status === 503) {
        setUnavailable(true);
        return;
      }
      if (!me.ok || (await me.json()).mfaVerified !== true) {
        setError(t.signedOut);
        return;
      }
      const capabilities = await fetch("/api/v1/me/workspace-capabilities", {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (!currentRequest()) return;
      if (!capabilities.ok) throw new Error(t.unauthorized);
      const data = (await capabilities.json()) as Payload;
      if (!currentRequest()) return;
      const orgs = data.organizations ?? [];
      const selectedOrg =
        orgs.find((org) => org.id === organizationId) ?? orgs[0];
      if (!selectedOrg) {
        setError(t.unauthorized);
        return;
      }
      const allowedBranches = (selectedOrg.branches ?? []).filter(
        (branch) =>
          branch.capabilities?.includes("shifts.open") ||
          branch.capabilities?.includes("shifts.read"),
      );
      const selectedBranch =
        allowedBranches.find((branch) => branch.id === branchId) ??
        allowedBranches[0];
      if (!selectedBranch) {
        setError(t.unauthorized);
        return;
      }
      if (organizationId !== selectedOrg.id) setOrganizationId(selectedOrg.id);
      if (branchId !== selectedBranch.id) setBranchId(selectedBranch.id);
      const result = await fetch(
        `/api/v1/organizations/${selectedOrg.id}/branches/${selectedBranch.id}/cash-shifts`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (!currentRequest()) return;
      if (result.status === 503) {
        setUnavailable(true);
        return;
      }
      if (result.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (result.status === 403) {
        setError(t.unauthorized);
        setShift(null);
        return;
      }
      if (!result.ok) throw new Error(t.error);
      const shifts = (await result.json()) as Payload;
      if (!currentRequest()) return;
      setShift(shifts.activeShift ?? null);
      setMovements(shifts.movements ?? []);
      setHistory(shifts.history ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.error);
    } finally {
      if (currentRequest()) setLoading(false);
    }
  }, [branchId, organizationId, router, t.error, t.signedOut, t.unauthorized]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!organizationId || !branchId) return;
    for (const operation of [
      "open",
      "movement",
      "begin-close",
      "confirm-close",
    ] as const) {
      const stored = sessionStorage.getItem(
        `unibos.shift.pending.${organizationId}.${branchId}.${operation}`,
      );
      if (!stored) continue;
      try {
        const value = JSON.parse(stored) as Partial<PendingShiftOperation>;
        if (
          value.operation === operation &&
          typeof value.idempotencyKey === "string" &&
          value.body
        ) {
          setPendingOperation({
            operation,
            idempotencyKey: value.idempotencyKey,
            body: value.body,
            shiftId: value.shiftId ?? null,
          });
          return;
        }
      } catch {
        sessionStorage.removeItem(
          `unibos.shift.pending.${organizationId}.${branchId}.${operation}`,
        );
      }
    }
  }, [branchId, organizationId]);

  useEffect(() => {
    if (busy || pendingOperation)
      document.body.dataset.unibosWorkspaceLocked = "true";
    else delete document.body.dataset.unibosWorkspaceLocked;
    return () => {
      delete document.body.dataset.unibosWorkspaceLocked;
    };
  }, [busy, pendingOperation]);

  async function mutate(operation: ShiftOperation) {
    if (
      !organizationId ||
      !branchId ||
      busy ||
      (pendingOperation && pendingOperation.operation !== operation)
    )
      return;
    const endpoint = `/api/v1/organizations/${organizationId}/branches/${branchId}/cash-shifts`;
    const storageKey = `unibos.shift.pending.${organizationId}.${branchId}.${operation}`;
    let pending: PendingShiftOperation;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        const value = JSON.parse(saved) as Partial<PendingShiftOperation>;
        pending = {
          operation,
          idempotencyKey: value.idempotencyKey as string,
          body: value.body ?? {},
          shiftId: value.shiftId ?? shift?.id ?? null,
        };
      } else {
        const body: Record<string, unknown> = { idempotencyKey: key() };
        if (operation === "open")
          Object.assign(body, {
            currencyCode: currency,
            openingAmountMinor: opening,
          });
        else if (shift) Object.assign(body, { expectedVersion: shift.version });
        if (operation === "movement")
          Object.assign(body, {
            movementType,
            amountMinor: amount,
            reason: reason.trim(),
          });
        if (operation === "begin-close") body.countedCashMinor = counted;
        pending = {
          operation,
          idempotencyKey: body.idempotencyKey as string,
          body,
          shiftId: shift?.id ?? null,
        };
        sessionStorage.setItem(storageKey, JSON.stringify(pending));
      }
      setPendingOperation(pending);
    } catch {
      setError(t.error);
      return;
    }
    setBusy(true);
    setError("");
    let outcomeUnknown = true;
    try {
      const url =
        operation === "open"
          ? endpoint
          : `${endpoint}/${pending.shiftId}/${operation === "movement" ? "movements" : operation}`;
      const response = await fetch(url, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pending.body),
      });
      if (!response.ok) {
        if (response.status < 500) {
          outcomeUnknown = false;
          sessionStorage.removeItem(storageKey);
          setPendingOperation(null);
        }
        if (response.status === 409) await load();
        throw new Error(
          response.status === 403
            ? t.startError
            : response.status === 409
              ? "State conflict. Refresh and review the current shift."
              : response.status >= 500
                ? t.unknown
                : t.error,
        );
      }
      outcomeUnknown = false;
      sessionStorage.removeItem(storageKey);
      setPendingOperation(null);
      setAmount("");
      setReason("");
      setError("");
      await load();
    } catch (cause) {
      setError(
        outcomeUnknown
          ? t.unknown
          : cause instanceof Error
            ? cause.message
            : t.error,
      );
    } finally {
      setBusy(false);
    }
  }

  const money = (value?: string) => {
    const minor = BigInt(value ?? "0");
    const negative = minor < 0n;
    const absolute = negative ? -minor : minor;
    const whole = absolute / 100n;
    const fraction = String(absolute % 100n).padStart(2, "0");
    const locale = { uz: "uz-UZ", ru: "ru-RU", en: "en-US" }[language];
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: shift?.currency_code ?? currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).formatToParts(negative ? (whole === 0n ? -1n : -whole) : whole);
    return parts
      .map((part) =>
        part.type === "fraction"
          ? fraction
          : negative && whole === 0n && part.type === "integer"
            ? "0"
            : part.value,
      )
      .join("");
  };
  return (
    <main className={`${styles.page}${dark ? ` ${styles.dark}` : ""}`}>
      <WorkspaceNavigation dark={dark} />
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>{t.connected}</p>
            <h1>{t.title}</h1>
            <p>{t.intro}</p>
          </div>
          <div className={styles.headerControls}>
            <button
              className={styles.themeToggle}
              type="button"
              aria-pressed={dark}
              onClick={() => setDark((value) => !value)}
            >
              {t.theme}: {dark ? t.dark : t.light}
            </button>
          </div>
        </header>
        <p className={styles.notice}>{t.note}</p>
        {error && (
          <p className={styles.alert} role="alert">
            {error}
          </p>
        )}
        {pendingOperation && (
          <section className={styles.pending} role="status" aria-live="polite">
            <p>{t.pending}</p>
            <details>
              <summary>{pendingOperation.operation}</summary>
              <pre>
                {JSON.stringify(
                  Object.fromEntries(
                    Object.entries(pendingOperation.body).filter(
                      ([name]) => name !== "idempotencyKey",
                    ),
                  ),
                  null,
                  2,
                )}
              </pre>
            </details>
            <button
              disabled={busy}
              onClick={() => void mutate(pendingOperation.operation)}
            >
              {t.retry}
            </button>
          </section>
        )}
        {loading ? (
          <section className={styles.card} aria-live="polite">
            {t.loading}
          </section>
        ) : unavailable ? (
          <section className={styles.card}>
            <h2>{t.unavailable}</h2>
            <button onClick={() => void load()}>{t.refresh}</button>
          </section>
        ) : (
          <>
            <div className={styles.grid}>
              <section className={styles.card} aria-busy={busy}>
                <h2>{t.active}</h2>
                {!shift ? (
                  <>
                    <p>{t.none}</p>
                    <div className={styles.form}>
                      <label>
                        {t.currency}
                        <select
                          disabled={Boolean(pendingOperation)}
                          value={currency}
                          onChange={(e) => setCurrency(e.target.value)}
                        >
                          {currencyList.map((item) => (
                            <option key={item}>{item}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {t.opening}
                        <input
                          disabled={Boolean(pendingOperation)}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={opening}
                          onChange={(e) =>
                            setOpening(
                              e.target.value.replace(/\D/g, "").slice(0, 13),
                            )
                          }
                        />
                      </label>
                      <button
                        disabled={
                          busy ||
                          Boolean(pendingOperation) ||
                          !/^[0-9]{1,13}$/.test(opening)
                        }
                        onClick={() => void mutate("open")}
                      >
                        {t.open}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <dl className={styles.summary}>
                      <div>
                        <dt>{t.openingBalance}</dt>
                        <dd>{money(shift.opening_amount_minor)}</dd>
                      </div>
                      <div>
                        <dt>{t.cashReceived}</dt>
                        <dd>
                          {money(
                            sumMovement(movements ?? [], "CASH_IN").toString(),
                          )}
                        </dd>
                      </div>
                      <div>
                        <dt>{t.cashRemoved}</dt>
                        <dd>
                          {money(
                            sumMovement(movements ?? [], "CASH_OUT").toString(),
                          )}
                        </dd>
                      </div>
                      <div className={styles.summaryTotal}>
                        <dt>{t.expected}</dt>
                        <dd>
                          {money(
                            shift.expected_current_minor ??
                              shift.closing_expected_minor,
                          )}
                        </dd>
                      </div>
                    </dl>
                    {shift.status === "OPEN" && (
                      <div className={styles.form}>
                        <fieldset disabled={Boolean(pendingOperation)}>
                          <legend>{t.movements}</legend>
                          <label>
                            <span>{t.cashIn}</span>
                            <input
                              type="radio"
                              checked={movementType === "CASH_IN"}
                              onChange={() => setMovementType("CASH_IN")}
                            />
                          </label>
                          <label>
                            <span>{t.cashOut}</span>
                            <input
                              type="radio"
                              checked={movementType === "CASH_OUT"}
                              onChange={() => setMovementType("CASH_OUT")}
                            />
                          </label>
                          <label>
                            {t.amount}
                            <input
                              inputMode="numeric"
                              value={amount}
                              onChange={(e) =>
                                setAmount(
                                  e.target.value
                                    .replace(/\D/g, "")
                                    .slice(0, 13),
                                )
                              }
                            />
                          </label>
                          <label>
                            {t.reason}
                            <input
                              maxLength={300}
                              value={reason}
                              onChange={(e) => setReason(e.target.value)}
                            />
                          </label>
                          <button
                            disabled={busy || !amount || !reason.trim()}
                            onClick={() => void mutate("movement")}
                          >
                            {t.add}
                          </button>
                        </fieldset>
                        <label>
                          {t.count}
                          <input
                            disabled={Boolean(pendingOperation)}
                            inputMode="numeric"
                            value={counted}
                            onChange={(e) =>
                              setCounted(
                                e.target.value.replace(/\D/g, "").slice(0, 13),
                              )
                            }
                          />
                        </label>
                        <button
                          disabled={
                            busy || Boolean(pendingOperation) || !counted
                          }
                          onClick={() => void mutate("begin-close")}
                        >
                          {t.begin}
                        </button>
                      </div>
                    )}
                    {shift.status === "CLOSING" && (
                      <div className={styles.close}>
                        <p>{t.closeWarning}</p>
                        <div className={styles.metric}>
                          <span>{t.count}</span>
                          <strong>{money(shift.counted_cash_minor)}</strong>
                        </div>
                        <div className={styles.metric}>
                          <span>{t.varianceValue}</span>
                          <strong>
                            {money(
                              (
                                BigInt(shift.counted_cash_minor ?? "0") -
                                BigInt(shift.closing_expected_minor ?? "0")
                              ).toString(),
                            )}
                          </strong>
                        </div>
                        <button
                          disabled={busy || Boolean(pendingOperation)}
                          onClick={() => void mutate("confirm-close")}
                        >
                          {t.confirm}
                        </button>
                      </div>
                    )}
                    <div>
                      <h3>{t.movements}</h3>
                      {movements?.length ? (
                        <ul className={styles.list}>
                          {movements.map((item, index) => (
                            <li key={`${item.movement_type}-${index}`}>
                              <span>
                                {item.movement_type === "CASH_IN"
                                  ? t.cashIn
                                  : t.cashOut}
                                <small>{item.reason}</small>
                              </span>
                              <b>{money(item.amount_minor)}</b>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>{t.empty}</p>
                      )}
                    </div>
                  </>
                )}
              </section>
              <section className={styles.card}>
                <h2>{t.history}</h2>
                {history.length ? (
                  <ul className={styles.list}>
                    {history.map((item) => (
                      <li key={item.id}>
                        <span>
                          {item.closed_at
                            ? new Date(item.closed_at).toLocaleString()
                            : item.id}
                          <small>{item.status}</small>
                        </span>
                        <b>
                          {t.variance}: {money(item.variance_minor)}
                        </b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t.empty}</p>
                )}
                <button
                  className={styles.secondary}
                  disabled={busy || Boolean(pendingOperation)}
                  onClick={() => void load()}
                >
                  {t.refresh}
                </button>
              </section>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
