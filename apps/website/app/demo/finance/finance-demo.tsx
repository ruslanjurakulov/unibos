"use client";

import { useEffect, useState } from "react";
import styles from "./finance-demo.module.css";

type Language = "uz" | "ru" | "en";
type Order = { id: string; name: string; total: bigint; items: string[] };
type Receipt = {
  id: string;
  order: string;
  amount: bigint;
  change: bigint;
  createdAt: string;
};
const orders: Order[] = [
  {
    id: "D-1042",
    name: "Stol 4 · Tushlik",
    total: 8_500_000n,
    items: ["2 × Palov", "1 × Achchiq-chuchuk", "2 × Ko‘k choy"],
  },
  {
    id: "P-1043",
    name: "Olib ketish · Buyurtma",
    total: 4_250_000n,
    items: ["1 × Lag‘mon", "1 × Non"],
  },
];
const labels = {
  uz: {
    title: "Kassa va naqd to‘lovlar",
    intro: "Kassir ish jarayoni · Brauzer ichidagi sun’iy demo",
    demo: "SUN’IY DEMO · HAQIQIY TO‘LOV EMAS",
    shift: "Kassa smenasi",
    closed: "Yopiq",
    open: "Smenani ochish",
    active: "Faol smena · Demo kassir",
    expected: "Kutilayotgan naqd pul",
    close: "Smenani yopish",
    order: "Buyurtma tanlang",
    received: "Mijoz bergan pul",
    receivedHint: "Pulni kassada jismonan qabul qilganingizni tasdiqlang.",
    total: "Buyurtma jami",
    change: "Qaytim",
    pay: "Demo naqd to‘lovni qayd etish",
    history: "Tranzaksiyalar",
    empty: "Hozircha demo to‘lov yo‘q.",
    note: "To‘lov brauzer xotirasida vaqtincha saqlanadi. Backend, baza, provayder yoki fiskal chek ulanmagan.",
    success: "Demo to‘lov qayd etildi",
    currency: "UZS",
    method: "Naqd",
    demoOrder: "Demo buyurtma",
    closedNotice: "Smena yopiq. Yangi to‘lov uchun smenani qayta oching.",
    language: "Til",
    theme: "Ko‘rinish",
    light: "Yorug‘",
    dark: "Qorong‘i",
    invalid: "Qabul qilingan summa buyurtma jami qiymatidan kam.",
    opening: "Boshlang‘ich naqd pul",
    openPrompt: "Buyurtma to‘lovini boshlash uchun kassir smenasini oching.",
  },
  ru: {
    title: "Касса и наличные платежи",
    intro: "Рабочий процесс кассира · Синтетическое демо в браузере",
    demo: "СИНТЕТИЧЕСКОЕ ДЕМО · НЕ РЕАЛЬНЫЙ ПЛАТЁЖ",
    shift: "Кассовая смена",
    closed: "Закрыта",
    open: "Открыть смену",
    active: "Активная смена · Демо-кассир",
    expected: "Ожидаемая наличность",
    close: "Закрыть смену",
    order: "Выберите заказ",
    received: "Наличные от гостя",
    receivedHint: "Подтвердите, что физически приняли наличные в кассу.",
    total: "Итого заказа",
    change: "Сдача",
    pay: "Записать демо-платёж",
    history: "Транзакции",
    empty: "Демо-платежей пока нет.",
    note: "Платёж временно хранится в памяти браузера. Backend, база данных, провайдер и фискальный чек не подключены.",
    success: "Демо-платёж записан",
    currency: "UZS",
    method: "Наличные",
    demoOrder: "Демо-заказ",
    closedNotice: "Смена закрыта. Откройте её снова для нового платежа.",
    language: "Язык",
    theme: "Тема",
    light: "Светлая",
    dark: "Тёмная",
    invalid: "Полученная сумма меньше итога заказа.",
    opening: "Начальная наличность",
    openPrompt: "Откройте смену кассира, чтобы начать оплату заказа.",
  },
  en: {
    title: "Cash and payments",
    intro: "Cashier workflow · Synthetic browser-only demo",
    demo: "SYNTHETIC DEMO · NOT A REAL PAYMENT",
    shift: "Cash shift",
    closed: "Closed",
    open: "Open shift",
    active: "Active shift · Demo Cashier",
    expected: "Expected cash",
    close: "Close shift",
    order: "Select an order",
    received: "Cash received from guest",
    receivedHint: "Confirm the physical cash was received in the drawer.",
    total: "Order total",
    change: "Change due",
    pay: "Record demo cash payment",
    history: "Transactions",
    empty: "No demo payments yet.",
    note: "Payment state is temporary in browser memory. No backend, database, provider, or fiscal receipt is connected.",
    success: "Demo payment recorded",
    currency: "UZS",
    method: "Cash",
    demoOrder: "Demo order",
    closedNotice:
      "Shift closed. Open it again before recording another payment.",
    language: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    invalid: "Cash received is less than the order total.",
    opening: "Opening cash",
    openPrompt: "Open a cashier shift before starting an order payment.",
  },
} as const;

function toMinor(value: string): bigint | null {
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  return (
    BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0")
  );
}
function format(minor: bigint) {
  return (
    new Intl.NumberFormat("uz-UZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(minor) / 100) + " UZS"
  );
}

export default function FinanceDemo() {
  const [language, setLanguage] = useState<Language>("uz");
  const [dark, setDark] = useState(false);
  const [shiftOpen, setShiftOpen] = useState(false);
  const [opening, setOpening] = useState("100000");
  const [orderId, setOrderId] = useState(orders[0]!.id);
  const [cash, setCash] = useState("100000");
  const [paidIds, setPaidIds] = useState<string[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [notice, setNotice] = useState("");
  const t = labels[language];
  const order = orders.find((item) => item.id === orderId);
  const receivedMinor = toMinor(cash);
  const openingMinor = toMinor(opening) ?? 0n;
  const change =
    order && receivedMinor !== null && receivedMinor >= order.total
      ? receivedMinor - order.total
      : null;
  const expected =
    openingMinor + receipts.reduce((sum, receipt) => sum + receipt.amount, 0n);
  const eligible = orders.filter((item) => !paidIds.includes(item.id));

  useEffect(() => {
    try {
      const stored = localStorage.getItem("unibos.workspace.language");
      if (stored === "uz" || stored === "ru" || stored === "en")
        setLanguage(stored);
    } catch {}
  }, []);

  function recordPayment() {
    if (
      !shiftOpen ||
      !order ||
      receivedMinor === null ||
      receivedMinor < order.total
    ) {
      setNotice(t.invalid);
      return;
    }
    setReceipts((current) => [
      {
        id: `DEMO-${current.length + 1}`,
        order: order.id,
        amount: order.total,
        change: receivedMinor - order.total,
        createdAt: new Date().toISOString(),
      },
      ...current,
    ]);
    setPaidIds((current) => [...current, order.id]);
    setNotice(t.success);
    const next = eligible.find((item) => item.id !== order.id);
    if (next) {
      setOrderId(next.id);
      setCash("");
    }
  }

  return (
    <main className={`${styles.page} ${dark ? styles.dark : ""}`}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <div>
            <span className={styles.eyebrow}>UNIBOS · DEMO FINANCE</span>
            <h1>{t.title}</h1>
            <p>{t.intro}</p>
          </div>
          <div className={styles.tools}>
            <label>
              {t.language}
              <select
                value={language}
                onChange={(event) => {
                  const next = event.target.value as Language;
                  setLanguage(next);
                  localStorage.setItem("unibos.workspace.language", next);
                }}
              >
                <option value="uz">O‘zbekcha</option>
                <option value="ru">Русский</option>
                <option value="en">English</option>
              </select>
            </label>
            <label>
              {t.theme}
              <button onClick={() => setDark(!dark)}>
                {dark ? t.dark : t.light}
              </button>
            </label>
          </div>
        </header>
        <p className={styles.banner} role="status">
          {t.demo}
        </p>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        <div className={styles.context}>
          <section>
            <span>{t.shift}</span>
            <strong>{shiftOpen ? t.active : t.closed}</strong>
          </section>
          {shiftOpen ? (
            <>
              <section>
                <span>{t.expected}</span>
                <strong>{format(expected)}</strong>
              </section>
              <button
                className={styles.danger}
                onClick={() => {
                  setShiftOpen(false);
                  setNotice(t.closedNotice);
                }}
              >
                {t.close}
              </button>
            </>
          ) : (
            <>
              <label>
                {t.opening}
                <input
                  inputMode="decimal"
                  value={opening}
                  onChange={(event) => setOpening(event.target.value)}
                  aria-label={t.opening}
                />
              </label>
              <button
                onClick={() => {
                  if (toMinor(opening) === null) return;
                  setShiftOpen(true);
                  setNotice("");
                }}
              >
                {t.open}
              </button>
            </>
          )}
        </div>
        <p className={styles.note}>{t.note}</p>
        <div className={styles.grid}>
          <section className={styles.card}>
            <h2>{t.order}</h2>
            {!shiftOpen ? (
              <p>{t.openPrompt}</p>
            ) : !eligible.length ? (
              <p>{t.empty}</p>
            ) : (
              <>
                <label className={styles.field}>
                  {t.order}
                  <select
                    value={order?.id ?? ""}
                    onChange={(event) => setOrderId(event.target.value)}
                  >
                    {eligible.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} · {format(item.total)}
                      </option>
                    ))}
                  </select>
                </label>
                {order && (
                  <>
                    <ul className={styles.items}>
                      {order.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                    <p className={styles.total}>
                      {t.total}
                      <strong>{format(order.total)}</strong>
                    </p>
                    <label className={styles.field}>
                      {t.received}
                      <input
                        inputMode="decimal"
                        value={cash}
                        onChange={(event) => setCash(event.target.value)}
                        placeholder="100000.00"
                      />
                    </label>
                    <small>{t.receivedHint}</small>
                    <p className={styles.total}>
                      {t.change}
                      <strong>{change === null ? "—" : format(change)}</strong>
                    </p>
                    <button
                      className={styles.primary}
                      disabled={change === null}
                      onClick={recordPayment}
                    >
                      {t.pay}
                    </button>
                  </>
                )}
              </>
            )}
          </section>
          <section className={styles.card}>
            <h2>{t.history}</h2>
            {receipts.length ? (
              <ul className={styles.transactions}>
                {receipts.map((receipt) => (
                  <li key={receipt.id}>
                    <div>
                      <strong>
                        {t.demoOrder} {receipt.order}
                      </strong>
                      <small>
                        {new Date(receipt.createdAt).toLocaleString()}
                      </small>
                      <small>
                        {t.method} · {t.currency}
                      </small>
                    </div>
                    <div className={styles.transactionTotal}>
                      <strong>{format(receipt.amount)}</strong>
                      <small>
                        {t.change}: {format(receipt.change)}
                      </small>
                      <small>{receipt.id}</small>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p>{t.empty}</p>
            )}
          </section>
        </div>
        <footer className={styles.footer}>
          <a href="/demo">
            ←{" "}
            {language === "uz"
              ? "Demo Hub’ga qaytish"
              : language === "ru"
                ? "Вернуться в Demo Hub"
                : "Back to Demo Hub"}
          </a>
        </footer>
      </div>
    </main>
  );
}
