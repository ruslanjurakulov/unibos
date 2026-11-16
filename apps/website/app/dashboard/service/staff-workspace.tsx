"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./staff-workspace.module.css";

type Role = "waiter" | "kitchen";
type Organization = { id: string; name: string };
type Branch = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  description: string | null;
  image_key: string | null;
  available: boolean;
  price_version: string | null;
  price_minor: string | null;
  currency_code: string | null;
  category_name: string;
};
type Ticket = {
  id: string;
  order_id: string;
  ticket_number: number;
  status: string;
  version: number;
  table_code: string | null;
  display_name: string | null;
  items: Array<{
    product_name_snapshot: string;
    quantity: string;
    notes: string | null;
  }>;
};
type Order = {
  id: string;
  table_id: string | null;
  status: string;
  version: number;
};
type PendingAddition = {
  organizationId: string;
  branchId: string;
  path: string;
  orderId: string;
  key: string;
  items: Array<{
    productId: string;
    quantity: string;
    priceVersion: string;
    notes: string | null;
  }>;
};
type PendingTransition = {
  organizationId: string;
  branchId: string;
  path: string;
  key: string;
  expectedVersion: number;
  transition: "ACCEPT" | "START" | "READY" | "SERVE";
};
type PendingBillRequest = {
  key: string;
  sent: boolean;
  organizationId: string;
  branchId: string;
  path: string;
};

function isValidOperationPath(
  path: string,
  organizationId: string,
  branchId: string,
  role: Role,
) {
  if (
    !/^[0-9a-f-]{36}$/i.test(organizationId) ||
    !/^[0-9a-f-]{36}$/i.test(branchId)
  )
    return false;
  const base = `/api/v1/organizations/${organizationId}/branches/${branchId}/${role === "waiter" ? "waiter" : "kitchen/tickets"}`;
  return (
    path === base ||
    new RegExp(`^${base}/[0-9a-f-]{36}(?:/bill)?$`, "i").test(path)
  );
}

const tr = {
  uz: {
    org: "Tashkilot",
    branch: "Filial",
    loading: "Yuklanmoqda…",
    choose: "Tanlang",
    refresh: "Yangilash",
    connected: "API ulangan · 5 soniyada tekshiriladi",
    offline: "API bilan aloqa yo‘q",
    demo: "Bu sahifa faqat API bilan ishlaydi. Brauzer demo uchun sintetik oqimni oching.",
    openDemo: "Sintetik demo",
    error: "Ma’lumotni yuklab bo‘lmadi. Qayta urinib ko‘ring.",
    empty: "Faol ticket yo‘q.",
    tables: "Faol stollar",
    orders: "Ochiq buyurtmalar",
    products: "Mahsulotlar",
    search: "Qidirish",
    allCategories: "Barcha toifalar",
    itemNote: "Mahsulot izohi",
    add: "Savatchaga qo‘shish",
    cart: "Yangi ticket",
    send: "Oshxonaga yuborish",
    selectOrder: "Avval ochiq buyurtmani tanlang",
    waiter: "Ofitsiant ish joyi",
    kitchen: "Oshxona ekrani",
    accept: "Qabul qilish",
    start: "Tayyorlashni boshlash",
    ready: "Tayyor deb belgilash",
    served: "Yetkazildi",
    queue: "Oshxona navbati",
    ticket: "Ticket",
    quantity: "Miqdor",
    language: "Til",
    dark: "Qorong‘i mavzu",
    light: "Yorug‘ mavzu",
    success: "Ticket yuborildi.",
    serving: "Buyurtma yetkazildi.",
    status: "Holat",
    requestBill: "Hisob so‘rash",
    billRequested: "Hisob so‘raldi",
  },
  ru: {
    org: "Организация",
    branch: "Филиал",
    loading: "Загрузка…",
    choose: "Выберите",
    refresh: "Обновить",
    connected: "API подключён · обновление каждые 5 секунд",
    offline: "Нет связи с API",
    demo: "Эта страница работает только с API. Откройте синтетический сценарий для демо.",
    openDemo: "Синтетическое демо",
    error: "Не удалось загрузить данные. Повторите попытку.",
    empty: "Активных тикетов нет.",
    tables: "Активные столы",
    orders: "Открытые заказы",
    products: "Товары",
    search: "Поиск",
    allCategories: "Все категории",
    itemNote: "Примечание к позиции",
    add: "Добавить",
    cart: "Новый тикет",
    send: "Отправить на кухню",
    selectOrder: "Сначала выберите открытый заказ",
    waiter: "Рабочее место официанта",
    kitchen: "Экран кухни",
    accept: "Принять",
    start: "Начать приготовление",
    ready: "Отметить готовым",
    served: "Подано",
    queue: "Очередь кухни",
    ticket: "Тикет",
    quantity: "Количество",
    language: "Язык",
    dark: "Тёмная тема",
    light: "Светлая тема",
    success: "Тикет отправлен.",
    serving: "Заказ подан.",
    status: "Статус",
    requestBill: "Попросить счёт",
    billRequested: "Счёт запрошен",
  },
  en: {
    org: "Organization",
    branch: "Branch",
    loading: "Loading…",
    choose: "Select",
    refresh: "Refresh",
    connected: "API connected · polling every 5 seconds",
    offline: "API connection unavailable",
    demo: "This page requires the API. Open the synthetic flow for a demo.",
    openDemo: "Synthetic demo",
    error: "Could not load data. Please retry.",
    empty: "No active tickets.",
    tables: "Active tables",
    orders: "Open orders",
    products: "Products",
    search: "Search",
    allCategories: "All categories",
    itemNote: "Item note",
    add: "Add",
    cart: "New ticket",
    send: "Send to kitchen",
    selectOrder: "Select an open order first",
    waiter: "Waiter workspace",
    kitchen: "Kitchen display",
    accept: "Accept",
    start: "Start preparing",
    ready: "Mark ready",
    served: "Served",
    queue: "Kitchen queue",
    ticket: "Ticket",
    quantity: "Quantity",
    language: "Language",
    dark: "Dark mode",
    light: "Light mode",
    success: "Ticket sent.",
    serving: "Order served.",
    status: "Status",
    requestBill: "Request bill",
    billRequested: "Bill requested",
  },
};

export default function StaffWorkspace({ role }: { role: Role }) {
  const router = useRouter();
  const [language, setLanguage] = useState<keyof typeof tr>("uz");
  const [dark, setDark] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tables, setTables] = useState<
    Array<{
      id: string;
      table_code: string;
      display_name: string;
      status: string;
    }>
  >([]);
  const [orderId, setOrderId] = useState("");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [cart, setCart] = useState<
    Array<{
      productId: string;
      quantity: string;
      priceVersion: string;
      notes: string | null;
    }>
  >([]);
  const [pendingAddition, setPendingAddition] =
    useState<PendingAddition | null>(null);
  const [pendingTransitions, setPendingTransitions] = useState<
    Record<string, PendingTransition>
  >({});
  const [billRequests, setBillRequests] = useState<
    Record<string, PendingBillRequest>
  >({});
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const t = tr[language];
  const categories = useMemo(
    () => [...new Set(products.map((product) => product.category_name))],
    [products],
  );
  const visibleProducts = useMemo(
    () =>
      products.filter(
        (product) =>
          product.available &&
          product.price_version &&
          (!category || product.category_name === category) &&
          product.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [category, products, query],
  );
  const route = useMemo(
    () =>
      organizationId && branchId
        ? `/api/v1/organizations/${organizationId}/branches/${branchId}/${role === "waiter" ? "waiter" : "kitchen/tickets"}`
        : "",
    [organizationId, branchId, role],
  );
  const hasPendingOperation =
    Boolean(pendingAddition) ||
    Object.keys(pendingTransitions).length > 0 ||
    Object.values(billRequests).some((request) => !request.sent);

  useEffect(() => {
    try {
      const rawAddition = sessionStorage.getItem(
        "unibos.waiter.pending-addition",
      );
      if (rawAddition) {
        const saved = JSON.parse(rawAddition) as PendingAddition;
        if (
          saved &&
          /^[0-9a-f-]{36}$/i.test(saved.organizationId) &&
          /^[0-9a-f-]{36}$/i.test(saved.branchId) &&
          saved.path ===
            `/api/v1/organizations/${saved.organizationId}/branches/${saved.branchId}/waiter` &&
          /^[0-9a-f-]{36}$/i.test(saved.orderId) &&
          /^[0-9a-f-]{36}$/i.test(saved.key) &&
          Array.isArray(saved.items) &&
          saved.items.length <= 100
        ) {
          setPendingAddition(saved);
          setOrderId(saved.orderId);
          setCart(saved.items);
        }
      }
      const rawTransitions = sessionStorage.getItem(
        `unibos.${role}.pending-transitions`,
      );
      if (rawTransitions) {
        const saved = JSON.parse(rawTransitions) as Record<
          string,
          PendingTransition
        >;
        setPendingTransitions(
          Object.fromEntries(
            Object.entries(saved).filter(([, item]) =>
              isValidOperationPath(
                item.path,
                item.organizationId,
                item.branchId,
                role,
              ),
            ),
          ),
        );
      }
      const rawBills = sessionStorage.getItem("unibos.waiter.bill-requests");
      if (rawBills)
        setBillRequests(
          JSON.parse(rawBills) as Record<string, PendingBillRequest>,
        );
    } catch {
      sessionStorage.removeItem("unibos.waiter.pending-addition");
    }
  }, [role]);

  const get = useCallback(
    async (path: string, method = "GET", body?: unknown) => {
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data: Record<string, unknown> = {};
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch {}
      return { response, data };
    },
    [],
  );

  const refresh = useCallback(async () => {
    if (!route) return;
    try {
      const result = await get(route);
      if (result.response.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (result.response.status === 503) {
        setOffline(true);
        return;
      }
      if (!result.response.ok) throw new Error(t.error);
      setOffline(false);
      setError("");
      if (role === "waiter") {
        setProducts(
          Array.isArray(result.data.products)
            ? (result.data.products as Product[])
            : [],
        );
        setOrders(
          Array.isArray(result.data.orders)
            ? (result.data.orders as Order[])
            : [],
        );
        setTables(
          Array.isArray(result.data.tables)
            ? (result.data.tables as typeof tables)
            : [],
        );
        setTickets(
          Array.isArray(result.data.tickets)
            ? (result.data.tickets as Ticket[])
            : [],
        );
      } else
        setTickets(
          Array.isArray(result.data.tickets)
            ? (result.data.tickets as Ticket[])
            : [],
        );
    } catch {
      setError(t.error);
    }
  }, [get, role, route, router, t.error]);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        if (process.env.NEXT_PUBLIC_AUTH_CONFIGURED !== "true") {
          setOffline(true);
          return;
        }
        const identity = await get("/api/me");
        if (!active) return;
        if (
          identity.response.status === 401 ||
          identity.data.mfaVerified !== true
        ) {
          router.replace("/sign-in");
          return;
        }
        const orgs = await get("/api/organizations");
        if (!orgs.response.ok || !Array.isArray(orgs.data.organizations)) {
          setOffline(orgs.response.status === 503);
          setError(t.error);
          return;
        }
        const rows = orgs.data.organizations as Organization[];
        setOrganizations(rows);
        let selectedOrg = rows[0]?.id ?? "";
        let savedScope: { organizationId: string; branchId: string } | null =
          null;
        try {
          const rawAddition = sessionStorage.getItem(
            "unibos.waiter.pending-addition",
          );
          if (rawAddition) {
            const addition = JSON.parse(rawAddition) as PendingAddition;
            if (
              addition.path ===
                `/api/v1/organizations/${addition.organizationId}/branches/${addition.branchId}/waiter` &&
              isValidOperationPath(
                addition.path,
                addition.organizationId,
                addition.branchId,
                "waiter",
              )
            )
              savedScope = {
                organizationId: addition.organizationId,
                branchId: addition.branchId,
              };
          }
          if (!savedScope) {
            const rawTransitions = sessionStorage.getItem(
              `unibos.${role}.pending-transitions`,
            );
            if (rawTransitions) {
              const transitions = JSON.parse(rawTransitions) as Record<
                string,
                PendingTransition
              >;
              const transition = Object.values(transitions).find((item) =>
                isValidOperationPath(
                  item.path,
                  item.organizationId,
                  item.branchId,
                  role,
                ),
              );
              if (transition)
                savedScope = {
                  organizationId: transition.organizationId,
                  branchId: transition.branchId,
                };
            }
          }
          if (!savedScope && role === "waiter") {
            const rawBills = sessionStorage.getItem(
              "unibos.waiter.bill-requests",
            );
            if (rawBills) {
              const bills = JSON.parse(rawBills) as Record<
                string,
                PendingBillRequest
              >;
              const bill = Object.values(bills).find(
                (item) =>
                  !item.sent &&
                  isValidOperationPath(
                    item.path,
                    item.organizationId,
                    item.branchId,
                    "waiter",
                  ),
              );
              if (bill)
                savedScope = {
                  organizationId: bill.organizationId,
                  branchId: bill.branchId,
                };
            }
          }
          selectedOrg =
            savedScope?.organizationId ||
            sessionStorage.getItem(`unibos.${role}.org`) ||
            selectedOrg;
        } catch {}
        setOrganizationId(selectedOrg);
        if (selectedOrg) {
          const branchResult = await get(
            `/api/organizations/${selectedOrg}/branches`,
          );
          if (!active) return;
          if (!branchResult.response.ok)
            throw new Error("Branch lookup failed");
          const branchRows = Array.isArray(branchResult.data.branches)
            ? (branchResult.data.branches as Branch[])
            : [];
          setBranches(branchRows);
          let selectedBranch = branchRows[0]?.id ?? "";
          try {
            selectedBranch =
              savedScope?.branchId ||
              sessionStorage.getItem(`unibos.${role}.branch`) ||
              selectedBranch;
          } catch {}
          setBranchId(selectedBranch);
        }
      } catch {
        if (active) {
          setOffline(true);
          setError(t.error);
        }
      } finally {
        if (active) setLoading(false);
      }
    }
    void init();
    return () => {
      active = false;
    };
  }, [get, role, router, t.error]);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!organizationId) return;
    void get(`/api/organizations/${organizationId}/branches`).then((r) =>
      setBranches(
        Array.isArray(r.data.branches) ? (r.data.branches as Branch[]) : [],
      ),
    );
  }, [get, organizationId]);

  async function sendItems() {
    if (!orderId || !cart.length) return;
    if (
      cart.some(
        (item) =>
          !/^\d{1,4}(?:\.\d{1,3})?$/.test(item.quantity) ||
          Number(item.quantity) <= 0,
      )
    ) {
      setError("Miqdor musbat son bo‘lishi kerak.");
      return;
    }
    if (pendingAddition && pendingAddition.orderId !== orderId) {
      setError(
        "Oldingi yuborish natijasi noma’lum. Avval shu buyurtmani yangilang.",
      );
      return;
    }
    const pending = pendingAddition ?? {
      organizationId,
      branchId,
      path: route,
      orderId,
      key: crypto.randomUUID(),
      items: cart,
    };
    setPendingAddition(pending);
    sessionStorage.setItem(
      "unibos.waiter.pending-addition",
      JSON.stringify(pending),
    );
    let response: Awaited<ReturnType<typeof get>>;
    try {
      if (
        pending.path !==
        `/api/v1/organizations/${pending.organizationId}/branches/${pending.branchId}/waiter`
      ) {
        setError(
          "Kutilayotgan yuborishning asl tashkilot va filial doirasi topilmadi. Takror yubormaslik uchun yuborish to‘xtatildi.",
        );
        return;
      }
      response = await get(`${pending.path}/${pending.orderId}`, "POST", {
        idempotencyKey: pending.key,
        items: pending.items,
      });
    } catch {
      setError(
        "Natija noma’lum. Qayta urinishda shu idempotency kaliti ishlatiladi.",
      );
      return;
    }
    if (!response.response.ok) {
      setError(
        response.response.status === 409
          ? "Narx yoki buyurtma holati o‘zgargan. Ma’lumotni yangilab qayta tekshiring."
          : t.error,
      );
      if (
        response.response.status < 500 &&
        response.response.status !== 408 &&
        response.response.status !== 425
      ) {
        setPendingAddition(null);
        sessionStorage.removeItem("unibos.waiter.pending-addition");
      }
      return;
    }
    setPendingAddition(null);
    sessionStorage.removeItem("unibos.waiter.pending-addition");
    setCart([]);
    setNotice(t.success);
    await refresh();
  }

  async function requestBill() {
    if (!orderId) return;
    const pending = billRequests[orderId];
    const key = pending?.key ?? crypto.randomUUID();
    const scopedPending = pending ?? {
      key,
      sent: false,
      organizationId,
      branchId,
      path: route,
    };
    if (
      !isValidOperationPath(
        scopedPending.path,
        scopedPending.organizationId,
        scopedPending.branchId,
        "waiter",
      )
    ) {
      setError(
        "Kutilayotgan hisob so‘rovining asl tashkilot va filial doirasi topilmadi.",
      );
      return;
    }
    setBillRequests((items) => ({ ...items, [orderId]: scopedPending }));
    sessionStorage.setItem(
      "unibos.waiter.bill-requests",
      JSON.stringify({ ...billRequests, [orderId]: scopedPending }),
    );
    let response: Awaited<ReturnType<typeof get>>;
    try {
      response = await get(`${scopedPending.path}/${orderId}/bill`, "POST", {
        idempotencyKey: key,
      });
    } catch {
      setError(
        "Hisob so‘rovi natijasi noma’lum. Qayta bosilganda shu kalit ishlatiladi.",
      );
      return;
    }
    if (!response.response.ok) {
      setError(t.error);
      return;
    }
    const sent = { ...scopedPending, sent: true };
    setBillRequests((items) => ({ ...items, [orderId]: sent }));
    sessionStorage.setItem(
      "unibos.waiter.bill-requests",
      JSON.stringify({ ...billRequests, [orderId]: sent }),
    );
    setNotice(t.billRequested);
  }

  async function transition(
    ticket: Ticket,
    action: "ACCEPT" | "START" | "READY" | "SERVE",
  ) {
    const path = `/api/v1/organizations/${organizationId}/branches/${branchId}/${action === "SERVE" ? "waiter" : "kitchen/tickets"}/${ticket.id}`;
    const existing = pendingTransitions[ticket.id];
    const pending =
      existing &&
      existing.expectedVersion === ticket.version &&
      existing.transition === action &&
      existing.organizationId === organizationId &&
      existing.branchId === branchId
        ? existing
        : {
            organizationId,
            branchId,
            path,
            key: crypto.randomUUID(),
            expectedVersion: ticket.version,
            transition: action,
          };
    const updatedPending = { ...pendingTransitions, [ticket.id]: pending };
    setPendingTransitions(updatedPending);
    sessionStorage.setItem(
      `unibos.${role}.pending-transitions`,
      JSON.stringify(updatedPending),
    );
    let response: Awaited<ReturnType<typeof get>>;
    try {
      response = await get(pending.path, "PATCH", {
        idempotencyKey: pending.key,
        expectedVersion: pending.expectedVersion,
        transition: pending.transition,
      });
    } catch {
      setError("Natija noma’lum. Qayta urinishda shu kalit ishlatiladi.");
      return;
    }
    if (!response.response.ok) {
      setError(
        response.response.status === 409
          ? "Ticket yangilangan. Holat yangilandi; qayta tekshiring."
          : t.error,
      );
      if (
        response.response.status < 500 &&
        response.response.status !== 408 &&
        response.response.status !== 425
      ) {
        const cleared = { ...pendingTransitions };
        delete cleared[ticket.id];
        setPendingTransitions(cleared);
        sessionStorage.setItem(
          `unibos.${role}.pending-transitions`,
          JSON.stringify(cleared),
        );
      }
      await refresh();
      return;
    }
    const cleared = { ...pendingTransitions };
    delete cleared[ticket.id];
    setPendingTransitions(cleared);
    sessionStorage.setItem(
      `unibos.${role}.pending-transitions`,
      JSON.stringify(cleared),
    );
    setNotice(action === "SERVE" ? t.serving : "Ticket yangilandi.");
    await refresh();
  }

  function addProduct(product: Product) {
    if (
      pendingAddition ||
      !product?.available ||
      !product.price_version ||
      !/^\d{1,4}(?:\.\d{1,3})?$/.test(quantity) ||
      Number(quantity) <= 0
    )
      return;
    setCart((items) => {
      const existing = items.find((item) => item.productId === product.id);
      if (existing)
        return items.map((item) =>
          item.productId === product.id
            ? {
                ...item,
                quantity: String(
                  Math.min(9999, Number(item.quantity) + Number(quantity)),
                ),
                priceVersion: product.price_version!,
              }
            : item,
        );
      return [
        ...items,
        {
          productId: product.id,
          quantity,
          priceVersion: product.price_version!,
          notes: null,
        },
      ];
    });
  }

  return (
    <main className={`${styles.page} ${dark ? styles.dark : ""}`}>
      <header className={styles.header}>
        <a href="/dashboard" className={styles.brand}>
          <img src="/brand/mark-dark.svg" alt="" />
          UniBOS <span>GLOBAL CORPORATE</span>
        </a>
        <div className={styles.controls}>
          <label>
            {t.language}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as keyof typeof tr)}
            >
              <option value="uz">O‘zbekcha</option>
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </label>
          <button onClick={() => setDark((v) => !v)}>
            {dark ? t.light : t.dark}
          </button>
        </div>
      </header>
      <div className={styles.wrap}>
        <div className={styles.title}>
          <div>
            <p className={styles.eyebrow}>P4.3 · INTEGRATED MODE</p>
            <h1>{role === "waiter" ? t.waiter : t.kitchen}</h1>
            <p className={styles.sub}>
              {loading ? t.loading : offline ? t.offline : t.connected}
            </p>
          </div>
          <a className={styles.demoLink} href="/demo/service">
            {t.openDemo}
          </a>
        </div>
        <div className={styles.selects}>
          <label>
            {t.org}
            <select
              value={organizationId}
              disabled={hasPendingOperation}
              onChange={(e) => {
                setOrganizationId(e.target.value);
                setBranchId("");
              }}
            >
              <option value="">{t.choose}</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t.branch}
            <select
              value={branchId}
              disabled={hasPendingOperation}
              onChange={(e) => setBranchId(e.target.value)}
            >
              <option value="">{t.choose}</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <button onClick={() => void refresh()}>{t.refresh}</button>
        </div>
        {offline && (
          <div className={styles.alert}>
            {t.demo} <a href="/demo/service">{t.openDemo}</a>
          </div>
        )}
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {role === "waiter" ? (
          <section className={styles.columns}>
            <div className={styles.panel}>
              <h2>{t.orders}</h2>
              {orders.length ? (
                orders.map((order) => (
                  <button
                    key={order.id}
                    className={`${styles.order} ${orderId === order.id ? styles.chosen : ""}`}
                    onClick={() => setOrderId(order.id)}
                  >
                    {tables.find((table) => table.id === order.table_id)
                      ?.display_name ||
                      tables.find((table) => table.id === order.table_id)
                        ?.table_code ||
                      t.tables}
                    <small>{order.status}</small>
                  </button>
                ))
              ) : (
                <p className={styles.empty}>{t.empty}</p>
              )}
              {orderId && (
                <button
                  className={styles.secondaryAction}
                  disabled={billRequests[orderId]?.sent}
                  onClick={() => void requestBill()}
                >
                  {billRequests[orderId]?.sent
                    ? t.billRequested
                    : t.requestBill}
                </button>
              )}
              <h2>{t.products}</h2>
              <div className={styles.catalogControls}>
                <input
                  aria-label={`${t.products} search`}
                  placeholder={`${t.search}…`}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <select
                  aria-label="Category filter"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                >
                  <option value="">{t.allCategories}</option>
                  {categories.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
                <label>
                  {t.quantity}
                  <input
                    aria-label={t.quantity}
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    inputMode="decimal"
                  />
                </label>
              </div>
              <div className={styles.productGrid}>
                {visibleProducts.map((product) => (
                  <button
                    key={product.id}
                    className={styles.productCard}
                    disabled={Boolean(pendingAddition)}
                    onClick={() => addProduct(product)}
                  >
                    <span className={styles.productImage}>
                      {product.image_key ? (
                        <img src={product.image_key} alt="" loading="lazy" />
                      ) : (
                        <span aria-hidden="true">◇</span>
                      )}
                    </span>
                    <strong>{product.name}</strong>
                    <small>{product.category_name}</small>
                    <b>
                      {product.price_minor} {product.currency_code}
                    </b>
                    {product.description && <span>{product.description}</span>}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.panel}>
              <h2>{t.cart}</h2>
              {!orderId && <p className={styles.empty}>{t.selectOrder}</p>}
              {cart.map((item, index) => (
                <div
                  className={styles.cartLine}
                  key={`${item.productId}-${index}`}
                >
                  <strong>
                    {products.find((p) => p.id === item.productId)?.name}
                  </strong>
                  <div className={styles.quantityControl}>
                    <button
                      aria-label="Decrease quantity"
                      disabled={Boolean(pendingAddition)}
                      onClick={() =>
                        setCart((v) =>
                          v.flatMap((line, i) =>
                            i !== index
                              ? [line]
                              : Number(line.quantity) <= 1
                                ? []
                                : [
                                    {
                                      ...line,
                                      quantity: String(
                                        Number(line.quantity) - 1,
                                      ),
                                    },
                                  ],
                          ),
                        )
                      }
                    >
                      −
                    </button>
                    <input
                      aria-label={t.quantity}
                      disabled={Boolean(pendingAddition)}
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(e) =>
                        setCart((v) =>
                          v.map((line, i) =>
                            i === index &&
                            /^\d{0,4}(?:\.\d{0,3})?$/.test(e.target.value)
                              ? { ...line, quantity: e.target.value }
                              : line,
                          ),
                        )
                      }
                    />
                    <button
                      aria-label="Increase quantity"
                      disabled={Boolean(pendingAddition)}
                      onClick={() =>
                        setCart((v) =>
                          v.map((line, i) =>
                            i === index
                              ? {
                                  ...line,
                                  quantity: String(
                                    Math.min(9999, Number(line.quantity) + 1),
                                  ),
                                }
                              : line,
                          ),
                        )
                      }
                    >
                      +
                    </button>
                    <button
                      aria-label="Remove item"
                      disabled={Boolean(pendingAddition)}
                      onClick={() =>
                        setCart((v) => v.filter((_, i) => i !== index))
                      }
                    >
                      ×
                    </button>
                  </div>
                  <input
                    aria-label={t.itemNote}
                    disabled={Boolean(pendingAddition)}
                    placeholder={t.itemNote}
                    value={item.notes ?? ""}
                    onChange={(e) =>
                      setCart((v) =>
                        v.map((line, i) =>
                          i === index
                            ? {
                                ...line,
                                notes: e.target.value.slice(0, 300) || null,
                              }
                            : line,
                        ),
                      )
                    }
                  />
                </div>
              ))}
              <button
                className={styles.primary}
                disabled={!orderId || !cart.length}
                onClick={() => void sendItems()}
              >
                {t.send}
              </button>
              <h2>{t.tables}</h2>
              {tickets
                .filter((ticket) => ticket.status === "READY")
                .map((ticket) => (
                  <Ticket
                    key={ticket.id}
                    ticket={ticket}
                    t={t}
                    onAction={() => void transition(ticket, "SERVE")}
                    action={t.served}
                  />
                ))}
            </div>
          </section>
        ) : (
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <h2>{t.queue}</h2>
              <span>{tickets.length}</span>
            </div>
            {tickets.length ? (
              tickets.map((ticket) => (
                <Ticket
                  key={ticket.id}
                  ticket={ticket}
                  t={t}
                  onAction={() =>
                    void transition(
                      ticket,
                      ticket.status === "QUEUED"
                        ? "ACCEPT"
                        : ticket.status === "ACCEPTED"
                          ? "START"
                          : "READY",
                    )
                  }
                  action={
                    ticket.status === "QUEUED"
                      ? t.accept
                      : ticket.status === "ACCEPTED"
                        ? t.start
                        : ticket.status === "PREPARING"
                          ? t.ready
                          : null
                  }
                />
              ))
            ) : (
              <p className={styles.empty}>{t.empty}</p>
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Ticket({
  ticket,
  t,
  onAction,
  action,
}: {
  ticket: Ticket;
  t: typeof tr.uz;
  onAction: () => void;
  action: string | null;
}) {
  return (
    <article className={styles.ticket}>
      <header>
        <strong>
          {t.ticket} #{ticket.ticket_number} ·{" "}
          {ticket.table_code || ticket.display_name || "Pickup"}
        </strong>
        <span>{ticket.status}</span>
      </header>
      <ul>
        {ticket.items.map((item, index) => (
          <li key={index}>
            {item.quantity} × {item.product_name_snapshot}
            {item.notes && <small>{item.notes}</small>}
          </li>
        ))}
      </ul>
      {action && <button onClick={onAction}>{action}</button>}
    </article>
  );
}
