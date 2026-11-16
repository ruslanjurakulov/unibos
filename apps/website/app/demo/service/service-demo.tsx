"use client";

import { useMemo, useState } from "react";
import styles from "./service-demo.module.css";

type Role = "cashier" | "kitchen" | "waiter";
type TicketStatus = "QUEUED" | "ACCEPTED" | "PREPARING" | "READY" | "SERVED";
type Ticket = {
  id: number;
  number: number;
  lines: string[];
  status: TicketStatus;
};
type Language = "uz" | "ru" | "en";
const labels = {
  uz: {
    title: "Buyurtma oqimi",
    subtitle: "Kassir → Oshxona → Ofitsiant",
    demo: "SINTETIK DEMO",
    warning:
      "Namoyish ma’lumotlari shu sahifa xotirasida. Haqiqiy bazaga yuborilmaydi va boshqa qurilmalar bilan sinxronlanmaydi.",
    cashier: "Kassir",
    kitchen: "Oshxona",
    waiter: "Ofitsiant",
    create: "Demo buyurtma yaratish",
    add: "Yangi mahsulot qo‘shish",
    send: "Oshxonaga yuborish",
    accept: "Qabul qilish",
    start: "Tayyorlashni boshlash",
    ready: "Tayyor deb belgilash",
    served: "Mijozga yetkazildi",
    empty: "Hozircha faol ticket yo‘q.",
    order: "Buyurtma",
    table: "Stol 04",
    items: "Taomlar",
    queued: "Navbatda",
    accepted: "Qabul qilindi",
    preparing: "Tayyorlanmoqda",
    readyLabel: "Tayyor",
    servedLabel: "Yetkazildi",
    lang: "Til",
    theme: "Mavzu",
    light: "Yorug‘",
    dark: "Qorong‘i",
    note: "Eslatma: demo. To‘lov yoki haqiqiy buyurtma amalga oshmaydi.",
  },
  ru: {
    title: "Поток заказа",
    subtitle: "Кассир → Кухня → Официант",
    demo: "СИНТЕТИЧЕСКОЕ ДЕМО",
    warning:
      "Данные демо хранятся только в памяти этой страницы. Они не отправляются в базу и не синхронизируются с другими устройствами.",
    cashier: "Кассир",
    kitchen: "Кухня",
    waiter: "Официант",
    create: "Создать демо-заказ",
    add: "Добавить позицию",
    send: "Отправить на кухню",
    accept: "Принять",
    start: "Начать приготовление",
    ready: "Отметить готовым",
    served: "Подано гостю",
    empty: "Активных тикетов пока нет.",
    order: "Заказ",
    table: "Стол 04",
    items: "Блюда",
    queued: "В очереди",
    accepted: "Принят",
    preparing: "Готовится",
    readyLabel: "Готов",
    servedLabel: "Подан",
    lang: "Язык",
    theme: "Тема",
    light: "Светлая",
    dark: "Тёмная",
    note: "Демо: реальный заказ или оплата не выполняются.",
  },
  en: {
    title: "Order flow",
    subtitle: "Cashier → Kitchen → Waiter",
    demo: "SYNTHETIC DEMO",
    warning:
      "Demo data lives only in this page session. It is not sent to a database or synchronized with other devices.",
    cashier: "Cashier",
    kitchen: "Kitchen",
    waiter: "Waiter",
    create: "Create demo order",
    add: "Add another item",
    send: "Send to kitchen",
    accept: "Accept",
    start: "Start preparing",
    ready: "Mark ready",
    served: "Mark served",
    empty: "No active tickets yet.",
    order: "Order",
    table: "Table 04",
    items: "Items",
    queued: "Queued",
    accepted: "Accepted",
    preparing: "Preparing",
    readyLabel: "Ready",
    servedLabel: "Served",
    lang: "Language",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    note: "Demo only: no real order or payment is performed.",
  },
} satisfies Record<Language, Record<string, string>>;

export default function ServiceDemo() {
  const [role, setRole] = useState<Role>("cashier");
  const [language, setLanguage] = useState<Language>("uz");
  const [dark, setDark] = useState(false);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [orderNumber, setOrderNumber] = useState(2401);
  const [notice, setNotice] = useState("");
  const t = labels[language];
  const active = useMemo(
    () => tickets.filter((ticket) => ticket.status !== "SERVED"),
    [tickets],
  );

  function addTicket(lines: string[]) {
    const number = orderNumber;
    setOrderNumber((value) => value + 1);
    setTickets((current) => [
      ...current,
      { id: Date.now(), number, lines, status: "QUEUED" },
    ]);
    setNotice(`${t.order} #${number}: ${t.queued.toLocaleLowerCase()}`);
  }
  function advance(ticket: Ticket) {
    const transition: Record<TicketStatus, TicketStatus | null> = {
      QUEUED: "ACCEPTED",
      ACCEPTED: "PREPARING",
      PREPARING: "READY",
      READY: "SERVED",
      SERVED: null,
    };
    const next = transition[ticket.status];
    if (!next) return;
    setTickets((current) =>
      current.map((item) =>
        item.id === ticket.id ? { ...item, status: next } : item,
      ),
    );
    setNotice(next === "SERVED" ? t.served : (statusLabel(next, t) ?? ""));
  }

  return (
    <main className={`${styles.page} ${dark ? styles.dark : ""}`}>
      <header className={styles.header}>
        <a href="/demo" className={styles.brand}>
          <img src="/brand/mark-dark.svg" alt="" />
          UniBOS <span>OPERATIONS</span>
        </a>
        <div className={styles.headerActions}>
          <label>
            {t.lang}
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as Language)}
            >
              <option value="uz">O‘zbekcha</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>
          <button
            className={styles.secondary}
            onClick={() => setDark((value) => !value)}
          >
            {t.theme}: {dark ? t.dark : t.light}
          </button>
        </div>
      </header>
      <div className={styles.wrap}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>UNIFIED ORDER ENGINE · P4.3</p>
            <h1>{t.title}</h1>
            <p>{t.subtitle}</p>
          </div>
          <span className={styles.badge}>{t.demo}</span>
        </div>
        <div className={styles.alert} role="note">
          <strong>DEMO</strong> {t.warning}
        </div>
        <nav className={styles.roles} aria-label="Ish roli">
          {(["cashier", "kitchen", "waiter"] as Role[]).map((item) => (
            <button
              key={item}
              className={role === item ? styles.selected : ""}
              onClick={() => setRole(item)}
              aria-pressed={role === item}
            >
              {t[item]}
            </button>
          ))}
        </nav>
        <section className={styles.workspace} aria-live="polite">
          <div className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span className={styles.kicker}>
                  {t[role].toUpperCase()} · DEMO FILIALI
                </span>
                <h2>
                  {role === "cashier"
                    ? t.create
                    : role === "kitchen"
                      ? t.kitchen
                      : t.waiter}
                </h2>
              </div>
              <span className={styles.connection}>
                <i /> SESSIYA DEMOSI
              </span>
            </div>
            {role === "cashier" && (
              <div className={styles.cashierActions}>
                <p>
                  <strong>{t.table}</strong>
                  <span>{t.items}: To‘y oshi × 2 · Ko‘k choy × 1</span>
                </p>
                <button
                  className={styles.primary}
                  onClick={() =>
                    addTicket(["2 × To‘y oshi · kam ziravor", "1 × Ko‘k choy"])
                  }
                >
                  {t.create}
                </button>
              </div>
            )}
            {role === "waiter" && (
              <div className={styles.cashierActions}>
                <p>
                  <strong>{t.table}</strong>
                  <span>
                    {t.items}: qo‘shimcha Achchiq-chuchuk × 1 · Non × 2
                  </span>
                </p>
                <button
                  className={styles.primary}
                  disabled={!tickets.length}
                  onClick={() =>
                    addTicket(["1 × Achchiq-chuchuk", "2 × Tandir non"])
                  }
                >
                  {t.send}
                </button>
                <small>
                  {tickets.length
                    ? "Yangi qo‘shimchalar alohida ticket bo‘ladi."
                    : "Avval kassir demo buyurtma yaratsin."}
                </small>
              </div>
            )}
            {role === "kitchen" && (
              <div className={styles.ticketList}>
                {active
                  .filter((ticket) => ticket.status !== "READY")
                  .map((ticket) => (
                    <TicketCard
                      key={ticket.id}
                      ticket={ticket}
                      t={t}
                      onAdvance={() => advance(ticket)}
                    />
                  ))}
                {!active.some((ticket) => ticket.status !== "READY") && (
                  <p className={styles.empty}>{t.empty}</p>
                )}
              </div>
            )}
          </div>
          <aside className={styles.panel}>
            <div className={styles.panelHead}>
              <div>
                <span className={styles.kicker}>{t.waiter.toUpperCase()}</span>
                <h2>{t.readyLabel}</h2>
              </div>
              <span className={styles.count}>
                {active.filter((ticket) => ticket.status === "READY").length}
              </span>
            </div>
            <div className={styles.ticketList}>
              {active
                .filter((ticket) =>
                  role === "waiter"
                    ? ticket.status !== "SERVED"
                    : ticket.status === "READY",
                )
                .map((ticket) => (
                  <TicketCard
                    key={ticket.id}
                    ticket={ticket}
                    t={t}
                    onAdvance={() => advance(ticket)}
                    waiter={role === "waiter"}
                  />
                ))}
              {!active.length && <p className={styles.empty}>{t.empty}</p>}
            </div>
          </aside>
        </section>
        <p className={styles.notice} role="status">
          {notice || t.note}
        </p>
        <div className={styles.footerLinks}>
          <a href="/demo/pos">Kassir POS demo</a>
          <a href="/demo/operations">Katalog va stollar demo</a>
          <a href="/">UniBOS</a>
        </div>
      </div>
    </main>
  );
}

function statusLabel(status: TicketStatus, t: Record<string, string>) {
  return {
    QUEUED: t.queued,
    ACCEPTED: t.accepted,
    PREPARING: t.preparing,
    READY: t.readyLabel,
    SERVED: t.servedLabel,
  }[status];
}

function TicketCard({
  ticket,
  t,
  onAdvance,
  waiter = false,
}: {
  ticket: Ticket;
  t: Record<string, string>;
  onAdvance: () => void;
  waiter?: boolean;
}) {
  const nextLabel = waiter
    ? t.served
    : (
        {
          QUEUED: t.accept,
          ACCEPTED: t.start,
          PREPARING: t.ready,
          READY: t.served,
          SERVED: t.served,
        } as Record<TicketStatus, string>
      )[ticket.status];
  return (
    <article className={styles.ticket}>
      <div className={styles.ticketTop}>
        <strong>
          {t.order} #{ticket.number}
        </strong>
        <span className={styles[`status${ticket.status}`]}>
          {statusLabel(ticket.status, t)}
        </span>
      </div>
      <p>{t.table}</p>
      <ul>
        {ticket.lines.map((line, index) => (
          <li key={`${line}-${index}`}>{line}</li>
        ))}
      </ul>
      {(waiter ? ticket.status === "READY" : ticket.status !== "READY") && (
        <button className={styles.secondary} onClick={onAdvance}>
          {nextLabel}
        </button>
      )}
    </article>
  );
}
