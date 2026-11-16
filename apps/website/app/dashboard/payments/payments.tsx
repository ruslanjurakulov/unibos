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
};
type Data = {
  activeShift: { id: string; currency_code: string } | null;
  unpaidOrders: Order[];
  payments: Payment[];
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
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(minor) / 100);
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
        setError(t.cash);
        return;
      }
      const response = await fetch(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(branchId)}/cash-payments`,
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
  }, [organizationId, branchId, router, t.auth, t.cash, t.error]);
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
    setPending(operation);
    sessionStorage.setItem(
      "unibos.cash-payment.pending",
      JSON.stringify(operation),
    );
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
      if (!response.ok) throw new Error("Payment request failed");
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
              {data?.activeShift
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
        <div className={styles.grid}>
          <section className={styles.card}>
            <h2>{t.order}</h2>
            {loading ? (
              <p>{t.intro}</p>
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
                    </div>
                    <span>{payment.order_id.slice(0, 8)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{loading ? "…" : t.empty}</p>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
