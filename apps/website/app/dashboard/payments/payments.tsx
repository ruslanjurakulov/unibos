"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceNavigation from "../workspace-navigation";
import styles from "../shifts/shifts.module.css";

type Order = {
  id: string;
  status: string;
  currency_code: string;
  total_minor: string;
  created_at: string;
  items: Array<{ name: string; quantity: string; lineTotalMinor: string }>;
};
type Payment = {
  id: string;
  order_id: string;
  currency_code: string;
  amount_minor: string;
  cash_received_minor: string;
  change_minor: string;
  created_at: string;
  cashier_user_id: string;
  shift_id: string;
  table_id: string | null;
  table_name: string | null;
  order_total_minor: string;
  payment_status: string;
  payment_method: string;
  order_payment_status: string;
  items: Array<{ name: string; quantity: string; lineTotalMinor: string }>;
  audit_history: Array<{
    eventType: string;
    actorUserId: string;
    createdAt: string;
  }>;
};
type Data = {
  canRecord: boolean;
  activeShift: { id: string; currency_code: string } | null;
  unpaidOrders: Order[];
  payments: Payment[];
  pagination: { page: number; pageSize: number; total: number };
  reconciliation: {
    total: number;
    duplicate_payment_orders: number;
    incomplete_payments: number;
    unmatchedPaidOrders: number;
    unpaid_order_mismatches: number;
    unknownPayments: number;
    by_currency: Array<{
      currencyCode: string;
      paymentCount: number;
      paymentTotalMinor: string;
      ledgerCashDebitMinor: string;
      ledgerReceivableCreditMinor: string;
    }>;
    shifts: Array<{
      id: string;
      status: string;
      currency_code: string;
      cashier_user_id: string;
      expected_cash_minor: string;
      counted_cash_minor: string | null;
      variance_minor: string | null;
      ledger_cash_debit_minor: string;
      ledger_matches: boolean;
    }>;
  };
};
type Pending = {
  orderId: string;
  idempotencyKey: string;
  cashReceivedMinor: string;
};
type Language = "uz" | "ru" | "en";

const copy = {
  uz: {
    title: "Naqd to‘lovlar",
    intro: "Buyurtma bo‘yicha naqd hisob-kitobni qayd eting.",
    order: "To‘lanmagan buyurtma",
    amount: "Mijoz bergan naqd pul",
    record: "Naqd to‘lovni qayd etish",
    shift: "Faol kassa smenasi",
    noShift: "To‘lov uchun kassirning ochiq smenasi kerak.",
    empty: "To‘lanmagan buyurtma yo‘q.",
    history: "So‘nggi to‘lovlar",
    unavailable:
      "Himoyalangan API ulanmagan. Moliyaviy demo ma’lumoti ko‘rsatilmaydi.",
    error: "So‘rov bajarilmadi. Xuddi shu amal kaliti bilan qayta tekshiring.",
    rejected:
      "Server to‘lovni rad etdi. Buyurtma va smena holati yangilandi; ma’lumotlarni tekshirib qayta boshlang.",
    conflict:
      "Buyurtma holati o‘zgargan. Tarix yangilandi; to‘lovni qayta yuborishdan oldin buyurtmani tekshiring.",
    storageBlocked:
      "Brauzer xavfsiz qayta urinish kalitini saqlay olmadi. To‘lov yuborilmadi; sessiya xotirasi ruxsatini tekshiring.",
    unknown:
      "Server javobi noma’lum. Xuddi shu amal kaliti bilan xavfsiz qayta urinishingiz mumkin.",
    retry: "Shu to‘lovni xavfsiz qayta yuborish",
    change: "Qaytim",
    total: "Buyurtma jami",
    received: "Qabul qilinadi",
    note: "Bu modul faqat ichki naqd to‘lov yozuvini qayd etadi. Pul o‘tkazmaydi va fiskal chek bermaydi.",
    auth: "Tasdiqlangan MFA seansi talab qilinadi.",
    cash: "Kassir vakolati va ochiq smena talab qilinadi.",
    done: "To‘lov qayd etildi",
    dateFrom: "Boshlanish sanasi",
    dateTo: "Tugash sanasi",
    cashierId: "Kassir ID",
    shiftId: "Smena ID",
    orderId: "Buyurtma ID",
    applyFilters: "Filtrlash",
    previous: "Oldingi",
    next: "Keyingi",
    reconciliation: "Yarashtirish",
    paymentLedger: "To‘lovlar / kassa debeti / qarz krediti",
    anomalies:
      "Takroriy / ledger muammosi / buyurtma holati nomuvofiq / to‘lovsiz PAID buyurtma",
    shiftCash: "Smena: kutilgan / sanalgan / farq",
    paymentRecorded: "Qayd etilgan",
    pickup: "Olib ketish",
    readOnly:
      "Bu vakolat doirasi moliyaviy tarixni faqat ko‘rishga ruxsat beradi.",
    unknownLabel: "noma’lum",
    ledgerMatched: "Ledger mos",
    ledgerMismatch: "Ledger nomuvofiq",
    paymentStatusFilter: "To‘lov holati",
    allStatuses: "Barchasi",
    language: "Til",
    theme: "Ko‘rinish",
    light: "Yorug‘",
    dark: "Qorong‘i",
  },
  ru: {
    title: "Наличные платежи",
    intro: "Запись наличного расчёта по заказу.",
    order: "Неоплаченный заказ",
    amount: "Наличные от гостя",
    record: "Записать наличный платёж",
    shift: "Активная кассовая смена",
    noShift: "Для платежа нужна открытая смена кассира.",
    empty: "Неоплаченных заказов нет.",
    history: "Последние платежи",
    unavailable:
      "Защищённый API не подключён. Финансовые демо данные не показываются.",
    error: "Запрос не выполнен. Проверьте его тем же ключом операции.",
    rejected:
      "Сервер отклонил платёж. Заказ и смена обновлены; проверьте данные и начните заново.",
    conflict:
      "Статус заказа изменился. История обновлена; проверьте заказ до повтора платежа.",
    storageBlocked:
      "Браузер не сохранил ключ безопасного повтора. Платёж не отправлялся; проверьте доступ к хранилищу сессии.",
    unknown:
      "Ответ сервера неизвестен. Безопасно повторите запрос с тем же ключом.",
    retry: "Безопасно повторить этот платёж",
    change: "Сдача",
    total: "Итого заказа",
    received: "К получению",
    note: "Модуль записывает только внутренний наличный платёж. Он не переводит деньги и не выдаёт фискальный чек.",
    auth: "Требуется подтверждённая MFA сессия.",
    cash: "Нужны права кассира и открытая смена.",
    done: "Платёж записан",
    dateFrom: "Дата с",
    dateTo: "Дата по",
    cashierId: "ID кассира",
    shiftId: "ID смены",
    orderId: "ID заказа",
    applyFilters: "Фильтровать",
    previous: "Назад",
    next: "Далее",
    reconciliation: "Сверка",
    paymentLedger: "Платежи / дебет кассы / кредит долга",
    anomalies:
      "Повторные / проблемы ledger / статус заказа не совпадает / PAID без платежа",
    shiftCash: "Смена: ожидается / пересчитано / разница",
    paymentRecorded: "Записан",
    pickup: "Самовывоз",
    readOnly: "Эта роль может только просматривать финансовую историю.",
    unknownLabel: "неизвестно",
    ledgerMatched: "Сверка совпала",
    ledgerMismatch: "Ошибка сверки",
    paymentStatusFilter: "Статус платежа",
    allStatuses: "Все",
    language: "Язык",
    theme: "Тема",
    light: "Светлая",
    dark: "Тёмная",
  },
  en: {
    title: "Cash payments",
    intro: "Record an internal cash settlement for an order.",
    order: "Unpaid order",
    amount: "Cash received from guest",
    record: "Record cash payment",
    shift: "Active cash shift",
    noShift: "An open cashier shift is required.",
    empty: "No unpaid orders.",
    history: "Recent payments",
    unavailable:
      "Protected API is not connected. No financial demo data is shown.",
    error: "Request failed. Check it again using the same operation key.",
    rejected:
      "The server rejected the payment. Order and shift data were refreshed; review them before starting again.",
    conflict:
      "The order changed. History was refreshed; review the order before attempting another payment.",
    storageBlocked:
      "The browser could not save the safe-retry key. No payment was sent; check session storage access.",
    unknown:
      "The server response is unknown. Safely retry with the same operation key.",
    retry: "Safely retry this payment",
    change: "Change due",
    total: "Order total",
    received: "Cash received",
    note: "This records an internal cash payment only. It does not transfer money or issue a fiscal receipt.",
    auth: "A verified MFA session is required.",
    cash: "Cashier permission and an open shift are required.",
    done: "Payment recorded",
    dateFrom: "From date",
    dateTo: "To date",
    cashierId: "Cashier ID",
    shiftId: "Shift ID",
    orderId: "Order ID",
    applyFilters: "Apply filters",
    previous: "Previous",
    next: "Next",
    reconciliation: "Reconciliation",
    paymentLedger: "Payments / cash debit / receivable credit",
    anomalies:
      "Duplicate / ledger issue / order status mismatch / PAID without payment",
    shiftCash: "Shift: expected / counted / variance",
    paymentRecorded: "Recorded",
    pickup: "Pickup",
    readOnly: "This role can view financial history only.",
    unknownLabel: "unknown",
    ledgerMatched: "Ledger matched",
    ledgerMismatch: "Ledger mismatch",
    paymentStatusFilter: "Payment status",
    allStatuses: "All",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
  },
} as const;

function parseMajor(value: string): string | null {
  const match = /^(0|[1-9]\d{0,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return (
    BigInt(match[1]!) * 100n +
    BigInt((match[2] ?? "").padEnd(2, "0") || "0")
  ).toString();
}
function money(minor: string, currency: string) {
  const amount = BigInt(minor);
  const negative = amount < 0n;
  const absolute = negative ? -amount : amount;
  const major = absolute / 100n;
  const fraction = absolute % 100n;
  const currencyFormatter = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const groupedMajor = new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(major);
  const exactFraction = new Intl.NumberFormat(undefined, {
    minimumIntegerDigits: 2,
    maximumFractionDigits: 0,
    useGrouping: false,
  }).format(fraction);
  let integerReplaced = false;
  return currencyFormatter
    .formatToParts(negative ? -0.01 : 0.01)
    .map((part) => {
      if (part.type === "integer" && !integerReplaced) {
        integerReplaced = true;
        return groupedMajor;
      }
      if (part.type === "fraction") return exactFraction;
      return part.value;
    })
    .join("");
}

export default function CashPayments() {
  const router = useRouter();
  const sequence = useRef(0);
  const [language, setLanguage] = useState<Language>("uz");
  const [dark, setDark] = useState(false);
  const [organizationId, setOrganizationId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [data, setData] = useState<Data | null>(null);
  const [selectedOrder, setSelectedOrder] = useState("");
  const [cashInput, setCashInput] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [filters, setFilters] = useState({
    from: "",
    to: "",
    cashierId: "",
    shiftId: "",
    orderId: "",
    paymentStatus: "",
  });
  const [page, setPage] = useState(1);
  const [appliedFilters, setAppliedFilters] = useState(filters);
  const t = copy[language];

  useEffect(() => {
    try {
      const lang = localStorage.getItem("unibos.workspace.language");
      if (lang === "uz" || lang === "ru" || lang === "en") setLanguage(lang);
      const params = new URLSearchParams(location.search);
      setOrganizationId(params.get("organizationId") ?? "");
      setBranchId(params.get("branchId") ?? "");
      const raw = sessionStorage.getItem("unibos.cash-payment.pending");
      if (raw) setPending(JSON.parse(raw) as Pending);
    } catch {}
    const onScope = (event: Event) => {
      const scope = (
        event as CustomEvent<{ organizationId: string; branchId: string }>
      ).detail;
      if (!scope || document.body.dataset.unibosWorkspaceLocked === "true")
        return;
      sequence.current += 1;
      setData(null);
      setError("");
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

  function changeLanguage(next: Language) {
    setLanguage(next);
    localStorage.setItem("unibos.workspace.language", next);
    window.dispatchEvent(
      new CustomEvent("unibos:workspace-language", { detail: next }),
    );
  }

  const load = useCallback(async () => {
    const current = ++sequence.current;
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
      if (current !== sequence.current) return;
      if (me.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (me.status === 503) {
        setUnavailable(true);
        return;
      }
      if (!me.ok || (await me.json()).mfaVerified !== true) {
        setError(t.auth);
        return;
      }
      if (!organizationId || !branchId) {
        setData(null);
        return;
      }
      const response = await fetch(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(branchId)}/cash-payments?${new URLSearchParams({ page: String(page), pageSize: "25", ...Object.fromEntries(Object.entries(appliedFilters).filter(([, value]) => value)) })}`,
        { credentials: "same-origin", cache: "no-store" },
      );
      if (current !== sequence.current) return;
      if (response.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (response.status === 503) {
        setUnavailable(true);
        return;
      }
      if (response.status === 403) {
        setError(t.cash);
        return;
      }
      if (!response.ok) throw new Error("API request failed");
      const payload = (await response.json()) as Data;
      if (current !== sequence.current) return;
      setData(payload);
      setSelectedOrder((old) =>
        payload.unpaidOrders.some((item) => item.id === old)
          ? old
          : (payload.unpaidOrders[0]?.id ?? ""),
      );
    } catch {
      if (current === sequence.current) setError(t.error);
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [
    organizationId,
    branchId,
    router,
    t.auth,
    t.cash,
    t.error,
    page,
    appliedFilters,
  ]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (busy || pending) document.body.dataset.unibosWorkspaceLocked = "true";
    else delete document.body.dataset.unibosWorkspaceLocked;
    return () => {
      delete document.body.dataset.unibosWorkspaceLocked;
    };
  }, [busy, pending]);
  const order = data?.unpaidOrders.find((item) => item.id === selectedOrder);
  const receivedMinor = parseMajor(cashInput);
  const changeMinor =
    order && receivedMinor && BigInt(receivedMinor) >= BigInt(order.total_minor)
      ? (BigInt(receivedMinor) - BigInt(order.total_minor)).toString()
      : null;

  async function submit(retry = false) {
    if (!organizationId || !branchId || busy) return;
    const operation =
      retry && pending
        ? pending
        : (() => {
            if (!order) return null;
            const cashReceived = parseMajor(cashInput);
            if (
              !cashReceived ||
              BigInt(cashReceived) < BigInt(order.total_minor)
            )
              return null;
            return {
              orderId: order.id,
              idempotencyKey: crypto.randomUUID(),
              cashReceivedMinor: cashReceived,
            };
          })();
    if (!operation) {
      setError(t.error);
      return;
    }
    try {
      sessionStorage.setItem(
        "unibos.cash-payment.pending",
        JSON.stringify(operation),
      );
    } catch {
      setError(t.storageBlocked);
      return;
    }
    setPending(operation);
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(branchId)}/cash-payments/orders/${encodeURIComponent(operation.orderId)}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idempotencyKey: operation.idempotencyKey,
            cashReceivedMinor: operation.cashReceivedMinor,
          }),
        },
      );
      if (!response.ok) {
        if (
          response.status >= 400 &&
          response.status < 500 &&
          response.status !== 408
        ) {
          sessionStorage.removeItem("unibos.cash-payment.pending");
          setPending(null);
          setCashInput("");
          await load();
          setError(response.status === 409 ? t.conflict : t.rejected);
          return;
        }
        throw new Error("Payment request outcome is unknown");
      }
      sessionStorage.removeItem("unibos.cash-payment.pending");
      setPending(null);
      setCashInput("");
      setNotice(t.done);
      await load();
    } catch {
      setError(t.unknown);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className={`${styles.page} ${dark ? styles.dark : ""}`}>
      <WorkspaceNavigation dark={dark} />
      <div className={styles.content}>
        <header className={styles.header}>
          <div>
            <p className={styles.eyebrow}>P4 · INTERNAL CASH RECORDING</p>
            <h1>{t.title}</h1>
            <p>{t.intro}</p>
          </div>
          <div className={styles.headerControls}>
            <label>
              {t.language}
              <select
                value={language}
                onChange={(e) => changeLanguage(e.target.value as Language)}
              >
                <option value="uz">O‘zbekcha</option>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              {t.theme}
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setDark(!dark)}
              >
                {dark ? t.dark : t.light}
              </button>
            </label>
          </div>
        </header>
        {unavailable && (
          <p className={styles.notice} role="status">
            {t.unavailable}
          </p>
        )}
        {error && (
          <p className={styles.alert} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {pending && (
          <div className={styles.pending} role="status">
            <p>{t.unknown}</p>
            <button disabled={busy} onClick={() => void submit(true)}>
              {t.retry}
            </button>
          </div>
        )}
        <section className={styles.context}>
          <div>
            <strong>{t.shift}</strong>
            <p>
              {data?.canRecord === false
                ? t.readOnly
                : data?.activeShift
                  ? `${data.activeShift.currency_code} · ${data.activeShift.id}`
                  : t.noShift}
            </p>
          </div>
          <span>
            {loading
              ? "…"
              : data?.activeShift
                ? data.activeShift.currency_code
                : "—"}
          </span>
        </section>
        <p className={styles.notice}>{t.note}</p>
        <section className={styles.card} aria-label={t.history}>
          <div className={styles.form}>
            <label>
              {t.dateFrom}
              <input
                type="date"
                value={filters.from}
                onChange={(e) =>
                  setFilters({ ...filters, from: e.target.value })
                }
              />
            </label>
            <label>
              {t.dateTo}
              <input
                type="date"
                value={filters.to}
                onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              />
            </label>
            <label>
              {t.cashierId}
              <input
                value={filters.cashierId}
                onChange={(e) =>
                  setFilters({ ...filters, cashierId: e.target.value.trim() })
                }
              />
            </label>
            <label>
              {t.shiftId}
              <input
                value={filters.shiftId}
                onChange={(e) =>
                  setFilters({ ...filters, shiftId: e.target.value.trim() })
                }
              />
            </label>
            <label>
              {t.orderId}
              <input
                value={filters.orderId}
                onChange={(e) =>
                  setFilters({ ...filters, orderId: e.target.value.trim() })
                }
              />
            </label>
            <label>
              {t.paymentStatusFilter}
              <select
                value={filters.paymentStatus}
                onChange={(e) =>
                  setFilters({ ...filters, paymentStatus: e.target.value })
                }
              >
                <option value="">{t.allStatuses}</option>
                <option value="RECORDED">RECORDED</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => {
                setPage(1);
                setAppliedFilters({ ...filters });
              }}
            >
              {t.applyFilters}
            </button>
          </div>
        </section>
        {data?.reconciliation && (
          <section
            className={styles.card}
            aria-labelledby="reconciliation-title"
          >
            <h2 id="reconciliation-title">{t.reconciliation}</h2>
            {data.reconciliation.by_currency.map((currency) => (
              <p key={currency.currencyCode}>
                {currency.currencyCode} · {t.paymentLedger}:{" "}
                {money(currency.paymentTotalMinor, currency.currencyCode)} /{" "}
                {money(currency.ledgerCashDebitMinor, currency.currencyCode)} /{" "}
                {money(
                  currency.ledgerReceivableCreditMinor,
                  currency.currencyCode,
                )}
              </p>
            ))}
            <p>
              {t.anomalies}: {data.reconciliation.duplicate_payment_orders} /{" "}
              {data.reconciliation.incomplete_payments} /{" "}
              {data.reconciliation.unpaid_order_mismatches} /{" "}
              {data.reconciliation.unmatchedPaidOrders}; {t.paymentRecorded}:{" "}
              {data.reconciliation.unknownPayments} {t.unknownLabel}
            </p>
            <h3>{t.shiftCash}</h3>
            <ul className={styles.list}>
              {data.reconciliation.shifts.map((shift) => (
                <li key={shift.id}>
                  <span>
                    {shift.status} · {shift.cashier_user_id} ·{" "}
                    {shift.id.slice(0, 8)}
                  </span>
                  <strong>
                    {money(shift.expected_cash_minor, shift.currency_code)} /{" "}
                    {shift.counted_cash_minor
                      ? money(shift.counted_cash_minor, shift.currency_code)
                      : "—"}{" "}
                    /{" "}
                    {shift.variance_minor
                      ? money(shift.variance_minor, shift.currency_code)
                      : "—"}
                  </strong>
                  <small>
                    {shift.ledger_matches ? t.ledgerMatched : t.ledgerMismatch}
                  </small>
                </li>
              ))}
            </ul>
          </section>
        )}
        <div className={styles.grid}>
          <section className={styles.card}>
            <h2>{t.order}</h2>
            {loading ? (
              <p>{t.intro}</p>
            ) : data?.canRecord === false ? (
              <p>{t.readOnly}</p>
            ) : !data?.unpaidOrders.length ? (
              <p>{t.empty}</p>
            ) : (
              <>
                <label className={styles.form}>
                  {t.order}
                  <select
                    value={selectedOrder}
                    onChange={(e) => setSelectedOrder(e.target.value)}
                  >
                    {data.unpaidOrders.map((item) => (
                      <option key={item.id} value={item.id}>
                        {new Date(item.created_at).toLocaleString()} ·{" "}
                        {money(item.total_minor, item.currency_code)}
                      </option>
                    ))}
                  </select>
                </label>
                {order && (
                  <ul className={styles.list}>
                    {order.items.map((item, index) => (
                      <li key={`${item.name}-${index}`}>
                        <span>
                          {item.quantity} × {item.name}
                        </span>
                        <strong>
                          {money(item.lineTotalMinor, order.currency_code)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                )}
                <label className={styles.form}>
                  {t.amount}
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={cashInput}
                    onChange={(e) => setCashInput(e.target.value)}
                    aria-describedby="cash-change"
                    placeholder="0.00"
                  />
                </label>
                {order && (
                  <div id="cash-change" className={styles.list}>
                    <p>
                      {t.total}:{" "}
                      <strong>
                        {money(order.total_minor, order.currency_code)}
                      </strong>
                    </p>
                    <p>
                      {t.received}:{" "}
                      <strong>
                        {receivedMinor
                          ? money(receivedMinor, order.currency_code)
                          : "—"}
                      </strong>
                    </p>
                    <p>
                      {t.change}:{" "}
                      <strong>
                        {changeMinor
                          ? money(changeMinor, order.currency_code)
                          : "—"}
                      </strong>
                    </p>
                  </div>
                )}
                <button
                  disabled={
                    busy ||
                    loading ||
                    !data.activeShift ||
                    !order ||
                    !changeMinor ||
                    Boolean(pending)
                  }
                  onClick={() => void submit()}
                >
                  {busy ? "…" : t.record}
                </button>
              </>
            )}
          </section>
          <section className={styles.card}>
            <h2>{t.history}</h2>
            {data?.payments.length ? (
              <ul className={styles.list}>
                {data.payments.map((payment) => (
                  <li key={payment.id}>
                    <div>
                      <strong>
                        {money(payment.amount_minor, payment.currency_code)}
                      </strong>
                      <small>
                        {new Date(payment.created_at).toLocaleString()}
                      </small>
                      <small>
                        {t.change}:{" "}
                        {money(payment.change_minor, payment.currency_code)}
                      </small>
                      <small>
                        {payment.cashier_user_id} ·{" "}
                        {payment.shift_id.slice(0, 8)}
                      </small>
                      <small>
                        {payment.table_name ?? t.pickup} ·{" "}
                        {payment.payment_method} · {payment.payment_status} ·{" "}
                        {payment.order_payment_status} ·{" "}
                        {payment.id.slice(0, 8)}
                      </small>
                      <small>
                        {payment.items
                          .map((item) => `${item.quantity}× ${item.name}`)
                          .join(", ")}
                      </small>
                      <small>
                        {payment.audit_history
                          .map(
                            (entry) =>
                              `${entry.eventType} · ${new Date(entry.createdAt).toLocaleString()}`,
                          )
                          .join("; ")}
                      </small>
                    </div>
                    <span>{payment.order_id.slice(0, 8)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{loading ? "…" : t.empty}</p>
            )}
            {data?.pagination && (
              <nav aria-label={t.history} className={styles.headerControls}>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(page - 1)}
                >
                  {t.previous}
                </button>
                <span>
                  {page} /{" "}
                  {Math.max(
                    1,
                    Math.ceil(data.pagination.total / data.pagination.pageSize),
                  )}{" "}
                  · {data.pagination.total}
                </span>
                <button
                  type="button"
                  className={styles.secondary}
                  disabled={
                    loading ||
                    page * data.pagination.pageSize >= data.pagination.total
                  }
                  onClick={() => setPage(page + 1)}
                >
                  {t.next}
                </button>
              </nav>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
