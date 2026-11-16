"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./integrated-pos.module.css";
import WorkspaceNavigation from "../workspace-navigation";

type Organization = { id: string; name: string };
type Branch = { id: string; name: string };
type Product = {
  id: string;
  name: string;
  description: string | null;
  image_key: string | null;
  category_id: string;
  category_name: string;
  available: boolean;
  price_version: string | null;
  price_minor: string | null;
  currency_code: string | null;
};
type RestaurantTable = {
  id: string;
  table_code: string;
  display_name: string;
  seats: number;
  status: string;
};
type CartLine = { product: Product; quantity: string; notes: string };
type PendingRequest = {
  key: string;
  body: Record<string, unknown>;
  url: string;
  summary?: {
    branch: string;
    orderType: string;
    table: string;
    items: Array<{ name: string; quantity: string; lineTotal: string }>;
    total: string;
    currency: string;
  };
};

const formatInteger = (value: string | bigint) =>
  String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const quantityMilli = (value: string) => {
  if (!/^(?:0|[1-9]\d{0,3})(?:\.\d{1,3})?$/.test(value)) return 0n;
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 1000n + BigInt((fraction + "000").slice(0, 3));
};
const lineTotal = (product: Product, quantity: string) => {
  if (product.price_minor === null) return 0n;
  return (BigInt(product.price_minor) * quantityMilli(quantity) + 500n) / 1000n;
};
const displayMoney = (value: string | bigint, currency: string) =>
  `${formatInteger(value)} ${currency}`;

export default function IntegratedPos() {
  const router = useRouter();
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [cashierId, setCashierId] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [tables, setTables] = useState<RestaurantTable[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [fulfillment, setFulfillment] = useState<"DINE_IN" | "PICKUP">(
    "DINE_IN",
  );
  const [cart, setCart] = useState<CartLine[]>([]);
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [contextLoading, setContextLoading] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [pendingRestored, setPendingRestored] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<{
    id: string;
    status: string;
    total: string;
    currency: string;
  } | null>(null);
  const [mobileCart, setMobileCart] = useState(false);
  const cartTrigger = useRef<HTMLButtonElement>(null);
  const cartDialog = useRef<HTMLElement>(null);
  const wasMobileCart = useRef(false);
  const contextRequestVersion = useRef(0);

  useEffect(() => {
    const onWorkspaceScope = (event: Event) => {
      const detail = (
        event as CustomEvent<{ organizationId: string; branchId: string }>
      ).detail;
      if (pending || cart.length > 0 || !detail) return;
      if (
        !organizations.some(
          (organization) => organization.id === detail.organizationId,
        )
      )
        return;
      setError("");
      setProducts([]);
      setTables([]);
      setSelectedTable("");
      setCart([]);
      setOrganizationId(detail.organizationId);
      setBranchId(detail.branchId);
    };
    window.addEventListener("unibos:workspace-scope", onWorkspaceScope);
    return () =>
      window.removeEventListener("unibos:workspace-scope", onWorkspaceScope);
  }, [organizations, pending, cart.length]);

  const request = useCallback(
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
      } catch {
        /* handled by status */
      }
      return { response, data };
    },
    [],
  );

  const loadSession = useCallback(async () => {
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
      if (
        identity.response.status === 401 ||
        identity.data.mfaVerified !== true
      ) {
        router.replace("/sign-in");
        return;
      }
      setCashierId(
        typeof identity.data.userId === "string" ? identity.data.userId : "",
      );
      const result = await request("/api/organizations");
      if (result.response.status === 503) {
        setApiUnavailable(true);
        return;
      }
      if (!result.response.ok || !Array.isArray(result.data.organizations))
        throw new Error("Tashkilotlar ro‘yxatini yuklab bo‘lmadi.");
      const rows = result.data.organizations as Organization[];
      setOrganizations(rows);
      const requestedOrganization = new URLSearchParams(
        window.location.search,
      ).get("organizationId");
      setOrganizationId((current) =>
        rows.some((org) => org.id === current)
          ? current
          : (rows.find((org) => org.id === requestedOrganization)?.id ??
            rows[0]?.id ??
            ""),
      );
      if (!rows.length)
        setNotice("Kassir POS uchun avval tashkilot va filial yarating.");
    } catch {
      setError("API bilan bog‘lanib bo‘lmadi. Sahifani qayta yuklang.");
    } finally {
      setLoading(false);
    }
  }, [request, router]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("unibos.cashier.pending-order");
      if (stored) {
        const candidate = JSON.parse(stored) as Partial<PendingRequest>;
        const body = candidate.body as Record<string, unknown> | undefined;
        if (
          typeof candidate.key === "string" &&
          /^[0-9a-f-]{36}$/i.test(candidate.key) &&
          typeof candidate.url === "string" &&
          /^\/api\/v1\/organizations\/[0-9a-f-]+\/branches\/[0-9a-f-]+\/orders$/i.test(
            candidate.url,
          ) &&
          body &&
          typeof body === "object" &&
          body.idempotencyKey === candidate.key
        ) {
          setPending(candidate as PendingRequest);
          setNotice(
            "Oldingi buyurtma javobi noaniq. Davom etish uchun aynan o‘sha so‘rovni xavfsiz qayta yuboring.",
          );
        } else sessionStorage.removeItem("unibos.cashier.pending-order");
      }
    } catch {
      setError(
        "Saqlangan qayta urinishni o‘qib bo‘lmadi. Shu oynani yopmay, buyurtmani qayta urinib ko‘ring.",
      );
    } finally {
      setPendingRestored(true);
    }
  }, []);

  useEffect(() => {
    if (!pendingRestored) return;
    try {
      if (pending)
        sessionStorage.setItem(
          "unibos.cashier.pending-order",
          JSON.stringify(pending),
        );
      else sessionStorage.removeItem("unibos.cashier.pending-order");
    } catch {
      setError(
        "Brauzerda qayta urinish holatini saqlab bo‘lmadi. Javob noaniq bo‘lsa, yangi buyurtma boshlamang.",
      );
    }
  }, [pending, pendingRestored]);

  useEffect(() => {
    document.body.dataset.unibosWorkspaceLocked =
      pending || cart.length > 0 ? "true" : "false";
    return () => {
      delete document.body.dataset.unibosWorkspaceLocked;
    };
  }, [pending, cart.length]);

  useEffect(() => {
    if (!organizationId) {
      setBranches([]);
      setBranchId("");
      return;
    }
    let active = true;
    void (async () => {
      setContextLoading(true);
      setError("");
      try {
        const result = await request(
          `/api/organizations/${encodeURIComponent(organizationId)}/branches`,
        );
        if (result.response.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (!result.response.ok || !Array.isArray(result.data.branches))
          throw new Error("Filiallarni yuklab bo‘lmadi.");
        const rows = result.data.branches as Branch[];
        if (!active) return;
        setBranches(rows);
        const requestedBranch = new URLSearchParams(window.location.search).get(
          "branchId",
        );
        setBranchId((current) =>
          rows.some((branch) => branch.id === current)
            ? current
            : (rows.find((branch) => branch.id === requestedBranch)?.id ??
              rows[0]?.id ??
              ""),
        );
        if (!rows.length)
          setNotice(
            "Tanlangan tashkilotda sizga biriktirilgan filial topilmadi.",
          );
      } catch (reason) {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Filiallarni yuklab bo‘lmadi.",
          );
      } finally {
        if (active) setContextLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [organizationId, request, router]);

  const refreshContext = useCallback(async () => {
    const version = ++contextRequestVersion.current;
    if (!organizationId || !branchId) {
      setProducts([]);
      setTables([]);
      return;
    }
    setContextLoading(true);
    setError("");
    try {
      const result = await request(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(branchId)}/pos`,
      );
      if (version !== contextRequestVersion.current) return;
      if (result.response.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (result.response.status === 503) {
        setApiUnavailable(true);
        return;
      }
      if (
        !result.response.ok ||
        !Array.isArray(result.data.products) ||
        !Array.isArray(result.data.tables)
      )
        throw new Error("Filial katalogini yuklab bo‘lmadi.");
      setProducts(result.data.products as Product[]);
      setTables(result.data.tables as RestaurantTable[]);
      const available = (result.data.tables as RestaurantTable[]).filter(
        (table) => table.status === "available",
      );
      setSelectedTable((current) =>
        available.some((table) => table.id === current)
          ? current
          : (available[0]?.id ?? ""),
      );
      setCart([]);
      setCreatedOrder(null);
      if (
        !(result.data.products as Product[]).some(
          (product) => product.available && product.price_version,
        )
      )
        setNotice(
          "Bu filialda hozir sotuvga tayyor narxli mahsulot topilmadi.",
        );
      else setNotice("");
    } catch (reason) {
      if (version === contextRequestVersion.current)
        setError(
          reason instanceof Error
            ? reason.message
            : "Filial katalogini yuklab bo‘lmadi.",
        );
    } finally {
      if (version === contextRequestVersion.current) setContextLoading(false);
    }
  }, [organizationId, branchId, request, router]);

  useEffect(() => {
    void refreshContext();
  }, [refreshContext]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && mobileCart) setMobileCart(false);
      else if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-pos-search]")?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileCart]);

  useEffect(() => {
    if (mobileCart)
      cartDialog.current
        ?.querySelector<HTMLElement>("button, input, select")
        ?.focus();
    else if (wasMobileCart.current) cartTrigger.current?.focus();
    wasMobileCart.current = mobileCart;
  }, [mobileCart]);

  const categoryList = useMemo(
    () => [
      { id: "all", name: "Barcha mahsulotlar" },
      ...Array.from(
        new Map(
          products.map((product) => [
            product.category_id,
            { id: product.category_id, name: product.category_name },
          ]),
        ).values(),
      ),
    ],
    [products],
  );
  const visible = useMemo(
    () =>
      products.filter(
        (product) =>
          (category === "all" || product.category_id === category) &&
          product.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [products, category, query],
  );
  const count = cart.reduce(
    (sum, item) =>
      sum +
      (quantityMilli(item.quantity)
        ? Number(quantityMilli(item.quantity)) / 1000
        : 0),
    0,
  );
  const currency =
    cart[0]?.product.currency_code ??
    products.find(
      (product) => product.price_minor !== null && product.currency_code,
    )?.currency_code ??
    "—";
  const total = cart.reduce(
    (sum, item) => sum + lineTotal(item.product, item.quantity),
    0n,
  );

  function addProduct(product: Product) {
    if (pending) return;
    if (
      !product.available ||
      !product.price_version ||
      product.price_minor === null
    )
      return;
    const currentCurrency = cart[0]?.product.currency_code;
    if (currentCurrency && currentCurrency !== product.currency_code) {
      setError("Savatda turli valyutalar aralashmasligi kerak.");
      return;
    }
    setError("");
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      return existing
        ? current.map((item) =>
            item.product.id === product.id
              ? { ...item, quantity: String(Number(item.quantity) + 1) }
              : item,
          )
        : [...current, { product, quantity: "1", notes: "" }];
    });
    setCreatedOrder(null);
  }
  function updateQuantity(productId: string, value: string) {
    if (pending) return;
    if (value !== "" && !/^(?:0|[1-9]\d{0,3})(?:\.\d{0,3})?$/.test(value))
      return;
    setCart((current) =>
      current.flatMap((item) =>
        item.product.id !== productId
          ? [item]
          : value === "0"
            ? []
            : [{ ...item, quantity: value }],
      ),
    );
    setCreatedOrder(null);
  }
  function removeProduct(productId: string) {
    if (pending) return;
    setCart((current) =>
      current.filter((item) => item.product.id !== productId),
    );
  }
  function clearPending() {
    try {
      sessionStorage.removeItem("unibos.cashier.pending-order");
    } catch {
      /* state remains fail-closed in memory */
    }
    setPending(null);
    setSubmitting(false);
  }

  async function checkOrderStatus() {
    if (!createdOrder || checkingStatus) return;
    setCheckingStatus(true);
    setError("");
    try {
      const result = await request(
        `/api/v1/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(branchId)}/orders/${encodeURIComponent(createdOrder.id)}`,
      );
      if (result.response.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (
        !result.response.ok ||
        !result.data.order ||
        typeof result.data.order !== "object"
      )
        throw new Error("Buyurtma holatini tekshirib bo‘lmadi.");
      const order = result.data.order as {
        id: string;
        status: string;
        total_minor: string;
        currency_code: string;
      };
      setCreatedOrder({
        id: order.id,
        status: order.status,
        total: order.total_minor,
        currency: order.currency_code,
      });
      setNotice("Buyurtma holati serverdan yangilandi.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Buyurtma holatini tekshirib bo‘lmadi.",
      );
    } finally {
      setCheckingStatus(false);
    }
  }

  async function sendOrder(retry = false) {
    if (submitting) return;
    if (pending && !retry) {
      setError(
        "Oldingi so‘rov natijasi aniqlanmaguncha faqat o‘sha kalit bilan qayta urinib ko‘ring.",
      );
      return;
    }
    let operation = pending;
    if (!retry) {
      if (!cart.length) {
        setError("Buyurtmaga mahsulot qo‘shing.");
        return;
      }
      if (fulfillment === "DINE_IN" && !selectedTable) {
        setError("Davom etish uchun faol stol tanlang.");
        return;
      }
      const invalid = cart.some(
        (item) =>
          quantityMilli(item.quantity) < 1n || !item.product.price_version,
      );
      if (invalid) {
        setError(
          "Miqdor yoki ko‘rilgan narx o‘zgargan. Katalogni yangilab, buyurtmani qayta ko‘rib chiqing.",
        );
        return;
      }
      const currencies = new Set(
        cart.map((item) => item.product.currency_code),
      );
      if (currencies.size !== 1) {
        setError(
          "Savatchadagi valyutalar mos emas. Bitta valyutada buyurtma yarating.",
        );
        return;
      }
      operation = {
        key: crypto.randomUUID(),
        url: `/api/v1/organizations/${encodeURIComponent(organizationId)}/branches/${encodeURIComponent(branchId)}/orders`,
        summary: {
          branch:
            branches.find((branch) => branch.id === branchId)?.name ?? branchId,
          orderType:
            fulfillment === "DINE_IN" ? "Stolda ovqatlanish" : "Olib ketish",
          table:
            fulfillment === "DINE_IN"
              ? (tables.find((item) => item.id === selectedTable)
                  ?.display_name ?? "Stol")
              : "",
          items: cart.map((item) => ({
            name: item.product.name,
            quantity: item.quantity,
            lineTotal: lineTotal(item.product, item.quantity).toString(),
          })),
          total: total.toString(),
          currency: currency,
        },
        body: {
          idempotencyKey: "",
          fulfillmentType: fulfillment,
          ...(fulfillment === "DINE_IN" ? { tableId: selectedTable } : {}),
          items: cart.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            priceVersion: item.product.price_version,
            notes: item.notes || null,
          })),
          note: orderNote || null,
        },
      };
      operation.body.idempotencyKey = operation.key;
      try {
        sessionStorage.setItem(
          "unibos.cashier.pending-order",
          JSON.stringify(operation),
        );
      } catch {
        setError(
          "Xavfsiz qayta urinish kalitini saqlab bo‘lmadi; buyurtma yuborilmadi.",
        );
        return;
      }
      setPending(operation);
    }
    if (!operation) return;
    setSubmitting(true);
    setError("");
    setNotice(
      retry
        ? "Xuddi shu idempotency kaliti bilan xavfsiz qayta urinish…"
        : "Buyurtma serverga yuborilmoqda…",
    );
    try {
      const result = await request(operation.url, "POST", operation.body);
      if (result.response.status === 409) {
        clearPending();
        const messages: Record<string, string> = {
          STALE_PRICE:
            "Mahsulot narxi savat ochilgandan beri o‘zgargan. Katalogni yangilang va yangi narxni tasdiqlang.",
          PRODUCT_UNAVAILABLE:
            "Mahsulot hozir sotuvda yo‘q. Katalogni yangilab, savatni tekshiring.",
          TABLE_UNAVAILABLE:
            "Tanlangan stol endi bo‘sh emas. Boshqa faol stol tanlang.",
          CURRENCY_MISMATCH:
            "Buyurtmada bir nechta valyuta bor. Savatni tekshiring.",
          IDEMPOTENCY_KEY_REUSED:
            "So‘rov kaliti boshqa buyurtma uchun ishlatilgan. Sahifani yangilang.",
        };
        setError(
          messages[String(result.data.reason)] ??
            "Buyurtma holati ziddiyatli. Katalogni yangilang va qayta ko‘rib chiqing.",
        );
        return;
      }
      if (result.response.status === 401) {
        clearPending();
        router.replace("/sign-in");
        return;
      }
      if (result.response.status === 403) {
        clearPending();
        setError("Joriy hisobda kassir ruxsati yoki tasdiqlangan MFA kerak.");
        return;
      }
      if (
        result.response.status >= 400 &&
        result.response.status < 500 &&
        result.response.status !== 408 &&
        result.response.status !== 425
      ) {
        clearPending();
        setError(
          result.response.status === 429
            ? "So‘rov tezlik chekloviga uchradi va buyurtma qabul qilinmadi. Biroz kutib qayta tasdiqlang."
            : "Server buyurtmani rad etdi. Savat va filial holatini tekshirib, tuzatgandan so‘ng qayta yuboring.",
        );
        return;
      }
      if (
        !result.response.ok ||
        !result.data.order ||
        typeof result.data.order !== "object"
      )
        throw new Error("Serverdan buyurtma tasdig‘i kelmadi.");
      const order = result.data.order as {
        id: string;
        status: string;
        total_minor: string;
        currency_code: string;
      };
      clearPending();
      setCreatedOrder({
        id: order.id,
        status: order.status,
        total: order.total_minor,
        currency: order.currency_code,
      });
      setCart([]);
      setOrderNote("");
      setNotice("Buyurtma ma’lumotlar bazasida saqlandi.");
    } catch {
      setPending(operation);
      setError(
        "Javob vaqti tugadi yoki ulanish uzildi. Buyurtma saqlangan bo‘lishi mumkin; yangi buyurtma yaratmang. Xuddi shu kalit bilan qayta urinib, takroriy natijani tekshiring.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading)
    return (
      <main className={styles.page}>
        <div className={styles.centerState}>
          Sessiya va kassir ruxsatlari tekshirilmoqda…
        </div>
      </main>
    );
  if (apiUnavailable || process.env.NEXT_PUBLIC_AUTH_CONFIGURED !== "true")
    return (
      <main className={styles.page}>
        <div className={styles.centerState}>
          <span className={styles.demoLabel}>API ULANMAGAN</span>
          <h1>Integrated POS hozir mavjud emas</h1>
          <p>
            Autentifikatsiya yoki backend sozlanmagan. Demo’ga avtomatik
            o‘tilmadi.
          </p>
          <a href="/demo/pos">Sintetik POS demo’ni alohida ochish</a>
        </div>
      </main>
    );

  return (
    <main className={`${styles.page} ${styles.withWorkspace}`}>
      <header className={styles.header}>
        <a className={styles.brand} href="/dashboard">
          <img src="/brand/mark-dark.svg" alt="" />
          <span>
            UniBOS <small>OPERATIONS</small>
          </span>
        </a>
        <div className={styles.scope}>
          <i />{" "}
          <span>
            <b>Live API · PostgreSQL</b>
            <small>Autentifikatsiyalangan ish muhiti</small>
          </span>
        </div>
        <div className={styles.selects}>
          <label>
            Tashkilot
            <select
              value={organizationId}
              disabled={Boolean(pending) || !pendingRestored}
              onChange={(e) => {
                setOrganizationId(e.target.value);
                setBranchId("");
                setCart([]);
              }}
            >
              <option value="">Tashkilotni tanlang</option>
              {organizations.map((org) => (
                <option value={org.id} key={org.id}>
                  {org.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Faol filial
            <select
              value={branchId}
              disabled={
                Boolean(pending) || !pendingRestored || !branches.length
              }
              onChange={(e) => {
                setBranchId(e.target.value);
                setCart([]);
              }}
            >
              <option value="">Filialni tanlang</option>
              {branches.map((branch) => (
                <option value={branch.id} key={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <WorkspaceNavigation />
      <div className={styles.connection}>
        <span>● Ulangan sessiya</span>
        <span>·</span>
        <span>
          Kassir: {cashierId ? `${cashierId.slice(0, 8)}…` : "tasdiqlangan"}
        </span>
        <span>·</span>
        <span>Smena P4.4’da ulanadi</span>
        <span>·</span>
        <span>Demo ma’lumot ishlatilmaydi</span>
        <button
          onClick={() => void refreshContext()}
          disabled={
            !branchId || contextLoading || Boolean(pending) || !pendingRestored
          }
        >
          Katalogni yangilash
        </button>
      </div>
      <div className={styles.workspace}>
        <section className={styles.catalog} aria-label="Filial katalogi">
          <div className={styles.heading}>
            <div>
              <span className={styles.eyebrow}>KASSIR ISH JOYI</span>
              <h1>Yangi buyurtma</h1>
              <p>Filial katalogi va narxlari serverdan olinadi.</p>
            </div>
            <span className={styles.liveTag}>LIVE · PostgreSQL</span>
          </div>
          <div
            className={styles.modeRow}
            role="group"
            aria-label="Buyurtma turi"
          >
            <button
              disabled={Boolean(pending) || !pendingRestored}
              aria-pressed={fulfillment === "DINE_IN"}
              className={fulfillment === "DINE_IN" ? styles.modeSelected : ""}
              onClick={() => {
                setFulfillment("DINE_IN");
                setCreatedOrder(null);
              }}
            >
              Stolda ovqatlanish
            </button>
            <button
              disabled={Boolean(pending) || !pendingRestored}
              aria-pressed={fulfillment === "PICKUP"}
              className={fulfillment === "PICKUP" ? styles.modeSelected : ""}
              onClick={() => {
                setFulfillment("PICKUP");
                setCreatedOrder(null);
              }}
            >
              Olib ketish
            </button>
            {fulfillment === "DINE_IN" ? (
              <label className={styles.tableSelect}>
                Faol stol
                <select
                  value={selectedTable}
                  disabled={Boolean(pending) || !pendingRestored}
                  onChange={(e) => setSelectedTable(e.target.value)}
                >
                  <option value="">Stol tanlang</option>
                  {tables
                    .filter((item) => item.status === "available")
                    .map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.display_name} · {item.table_code}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <span className={styles.pickupNote}>
                Olib ketish · stol talab qilinmaydi
              </span>
            )}
          </div>
          <label className={styles.search}>
            <span aria-hidden="true">⌕</span>
            <input
              data-pos-search
              value={query}
              disabled={Boolean(pending) || !pendingRestored}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Mahsulot qidirish…"
              aria-label="Mahsulot qidirish"
            />
            <kbd>/</kbd>
          </label>
          <div
            className={styles.categories}
            role="group"
            aria-label="Kategoriyalar"
          >
            {categoryList.map((item) => (
              <button
                disabled={Boolean(pending) || !pendingRestored}
                key={item.id}
                aria-pressed={category === item.id}
                className={category === item.id ? styles.categorySelected : ""}
                onClick={() => setCategory(item.id)}
              >
                {item.name}
              </button>
            ))}
          </div>
          {contextLoading ? (
            <div className={styles.empty}>
              Filial ma’lumotlari yangilanmoqda…
            </div>
          ) : (
            <div className={styles.productGrid}>
              {visible.map((product) => (
                <article className={styles.product} key={product.id}>
                  <div className={styles.productImage}>
                    {product.image_key ? (
                      <img src={product.image_key} alt="" />
                    ) : (
                      <span aria-hidden="true">◈</span>
                    )}
                    <small>{product.category_name}</small>
                    {!product.available && <b>Tugagan</b>}
                  </div>
                  <div className={styles.productInfo}>
                    <div>
                      <h2>{product.name}</h2>
                      {product.description && (
                        <small
                          className={styles.productDescription}
                          title={product.description}
                        >
                          {product.description}
                        </small>
                      )}
                      <p>
                        {product.price_minor !== null && product.currency_code
                          ? displayMoney(
                              product.price_minor,
                              product.currency_code,
                            )
                          : "Narx belgilanmagan"}
                      </p>
                    </div>
                    <button
                      disabled={
                        Boolean(pending) ||
                        !pendingRestored ||
                        !product.available ||
                        !product.price_version ||
                        product.price_minor === null
                      }
                      onClick={() => addProduct(product)}
                      aria-label={`${product.name} savatga qo‘shish`}
                    >
                      ＋
                    </button>
                  </div>
                </article>
              ))}
              {!visible.length && !contextLoading && (
                <div className={styles.empty}>
                  Bu filialda mos mahsulot topilmadi.
                </div>
              )}
            </div>
          )}
        </section>
        {mobileCart && (
          <div className={styles.cartBackdrop} aria-hidden="true" />
        )}
        <aside
          ref={cartDialog}
          className={`${styles.cartPanel} ${mobileCart ? styles.cartOpen : ""}`}
          aria-label="Buyurtma savati"
          role={mobileCart ? "dialog" : undefined}
          aria-modal={mobileCart ? true : undefined}
          onKeyDown={(event) => {
            if (!mobileCart || event.key !== "Tab") return;
            const focusable = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),select,[href]",
              ),
            ).filter((element) => element.offsetParent !== null);
            if (!focusable.length) return;
            const first = focusable[0]!,
              last = focusable.at(-1)!;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div className={styles.cartHeader}>
            <div>
              <span className={styles.eyebrow}>JORIY BUYURTMA</span>
              <h2>
                Savat <span>{count}</span>
              </h2>
            </div>
            <button
              className={styles.close}
              onClick={() => setMobileCart(false)}
              aria-label="Savatni yopish"
            >
              ×
            </button>
          </div>
          <div className={styles.cartContext}>
            <b>
              {fulfillment === "DINE_IN"
                ? (tables.find((item) => item.id === selectedTable)
                    ?.display_name ?? "Stol tanlanmagan")
                : "Olib ketish"}
            </b>
            <span>·</span>
            {branches.find((branch) => branch.id === branchId)?.name ??
              "Filial tanlanmagan"}
          </div>
          <div className={styles.lines}>
            {cart.length ? (
              cart.map((item) => (
                <article className={styles.line} key={item.product.id}>
                  <div className={styles.lineHeading}>
                    <div>
                      <h3>{item.product.name}</h3>
                      <small>
                        {displayMoney(
                          item.product.price_minor ?? "0",
                          item.product.currency_code ?? "—",
                        )}{" "}
                        / dona
                      </small>
                    </div>
                    <button
                      className={styles.remove}
                      aria-label={`${item.product.name}ni olib tashlash`}
                      onClick={() => removeProduct(item.product.id)}
                      disabled={Boolean(pending) || !pendingRestored}
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.lineTotal}>
                    <div className={styles.stepper}>
                      <button
                        disabled={Boolean(pending) || !pendingRestored}
                        aria-label={`${item.product.name} miqdorini kamaytirish`}
                        onClick={() =>
                          updateQuantity(
                            item.product.id,
                            String(Math.max(0, Number(item.quantity) - 1)),
                          )
                        }
                      >
                        −
                      </button>
                      <input
                        aria-label={`${item.product.name} miqdori`}
                        disabled={Boolean(pending) || !pendingRestored}
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={(e) =>
                          updateQuantity(item.product.id, e.target.value)
                        }
                        onBlur={() => {
                          if (quantityMilli(item.quantity) < 1n)
                            removeProduct(item.product.id);
                        }}
                      />
                      <button
                        disabled={Boolean(pending) || !pendingRestored}
                        aria-label={`${item.product.name} miqdorini oshirish`}
                        onClick={() =>
                          updateQuantity(
                            item.product.id,
                            String(Number(item.quantity) + 1),
                          )
                        }
                      >
                        ＋
                      </button>
                    </div>
                    <b>
                      {displayMoney(
                        lineTotal(item.product, item.quantity),
                        item.product.currency_code ?? "—",
                      )}
                    </b>
                  </div>
                  <label className={styles.note}>
                    Mahsulot izohi
                    <input
                      value={item.notes}
                      disabled={Boolean(pending) || !pendingRestored}
                      maxLength={300}
                      onChange={(e) =>
                        setCart((current) =>
                          current.map((line) =>
                            line.product.id === item.product.id
                              ? { ...line, notes: e.target.value }
                              : line,
                          ),
                        )
                      }
                      placeholder="Masalan, achchiqsiz"
                    />
                  </label>
                </article>
              ))
            ) : (
              <div className={styles.cartEmpty}>
                <span>＋</span>
                <b>Savat hozircha bo‘sh</b>
                <p>Katalogdan mahsulot qo‘shing.</p>
              </div>
            )}
          </div>
          <label className={styles.orderNote}>
            Buyurtma izohi{" "}
            <textarea
              value={orderNote}
              disabled={Boolean(pending) || !pendingRestored}
              maxLength={500}
              onChange={(e) => setOrderNote(e.target.value)}
              placeholder="Oshxonaga qo‘shimcha izoh"
            />
          </label>
          <div className={styles.summary}>
            <div>
              <span>Mahsulotlar ({count})</span>
              <b>{displayMoney(total, currency)}</b>
            </div>
            <div className={styles.grandTotal}>
              <span>Jami</span>
              <b>{displayMoney(total, currency)}</b>
            </div>
            <button
              className={styles.submit}
              disabled={
                !cart.length ||
                submitting ||
                Boolean(pending) ||
                !pendingRestored ||
                !branchId ||
                (fulfillment === "DINE_IN" && !selectedTable)
              }
              onClick={() => void sendOrder(false)}
            >
              {submitting ? "Yuborilmoqda…" : "Buyurtmani tasdiqlash"}
              <span>→</span>
            </button>
            {pending && (
              <div className={styles.pendingOrder} role="status">
                <b>Natijasi kutilayotgan buyurtma</b>
                {pending.summary ? (
                  <>
                    <span>
                      {pending.summary.branch} · {pending.summary.orderType}
                      {pending.summary.table
                        ? ` · ${pending.summary.table}`
                        : ""}
                    </span>
                    {pending.summary.items.map((item, index) => (
                      <span key={`${item.name}-${index}`}>
                        {item.quantity} × {item.name} ·{" "}
                        {displayMoney(
                          item.lineTotal,
                          pending.summary!.currency,
                        )}
                      </span>
                    ))}
                    <strong>
                      Jami{" "}
                      {displayMoney(
                        pending.summary.total,
                        pending.summary.currency,
                      )}
                    </strong>
                  </>
                ) : (
                  <span>
                    {pending.url.match(
                      /branches\/([0-9a-f-]+)\/orders/i,
                    )?.[1] ?? "Oldingi filial"}
                  </span>
                )}
                <span>
                  Faqat shu so‘rovni qayta yuborish yoki natijani tasdiqlash
                  mumkin.
                </span>
              </div>
            )}
            {pending && (
              <button
                className={styles.retry}
                disabled={submitting}
                onClick={() => void sendOrder(true)}
              >
                Xuddi shu so‘rov bilan xavfsiz qayta urinish
              </button>
            )}
            <p>To‘lov qabul qilinmaydi · kassa smenasi ulanmagan</p>
          </div>
          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          {createdOrder && (
            <div className={styles.success} role="status">
              <b>Buyurtma saqlandi</b>
              <small>
                {createdOrder.id} · {createdOrder.status} ·{" "}
                {displayMoney(createdOrder.total, createdOrder.currency)}
              </small>
              <button
                className={styles.retry}
                disabled={checkingStatus}
                onClick={() => void checkOrderStatus()}
              >
                {checkingStatus
                  ? "Tekshirilmoqda…"
                  : "Buyurtma holatini tekshirish"}
              </button>
            </div>
          )}
        </aside>
      </div>
      <button
        ref={cartTrigger}
        className={styles.mobileCart}
        onClick={() => setMobileCart(true)}
      >
        Savatni ko‘rish · {count}
        <b>{displayMoney(total, currency)}</b>
      </button>
    </main>
  );
}
