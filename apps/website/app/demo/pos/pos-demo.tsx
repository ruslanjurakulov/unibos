"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./pos-demo.module.css";

type Product = {
  id: string;
  name: string;
  category: string;
  price: number;
  available: boolean;
  image: string;
};
type CartLine = Product & { quantity: number; note: string };

const products: Product[] = [
  {
    id: "plov",
    name: "To‘y oshi",
    category: "Asosiy taomlar",
    price: 48000,
    available: true,
    image: "/images/p3/solutions-restaurant.webp",
  },
  {
    id: "lagman",
    name: "Uy lag‘moni",
    category: "Asosiy taomlar",
    price: 39000,
    available: true,
    image: "/images/p3/hero-scene.jpg",
  },
  {
    id: "samsa",
    name: "Go‘shtli somsa",
    category: "Yengil taomlar",
    price: 14000,
    available: true,
    image: "/images/p3/qr-menu-demo-v2.jpg",
  },
  {
    id: "salad",
    name: "Achchiq-chuchuk",
    category: "Yengil taomlar",
    price: 18000,
    available: true,
    image: "/images/p3/about-scene-v2.jpg",
  },
  {
    id: "tea",
    name: "Ko‘k choy",
    category: "Ichimliklar",
    price: 12000,
    available: true,
    image: "/images/p3/solutions-restaurant.webp",
  },
  {
    id: "juice",
    name: "Anor sharbati",
    category: "Ichimliklar",
    price: 22000,
    available: false,
    image: "/images/p3/qr-menu-demo-v2.jpg",
  },
];
const tables = ["Stol 01", "Stol 02", "Stol 03", "VIP 01"];
const categories = [
  "Barchasi",
  "Asosiy taomlar",
  "Yengil taomlar",
  "Ichimliklar",
];
const money = (n: number) =>
  `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} so‘m`;

export default function PosDemo() {
  const [category, setCategory] = useState("Barchasi");
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"DINE_IN" | "PICKUP">("DINE_IN");
  const [table, setTable] = useState(tables[0]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [quantityDraft, setQuantityDraft] = useState<Record<string, string>>(
    {},
  );
  const [notice, setNotice] = useState("");
  const [orderId, setOrderId] = useState("");
  const [mobileCart, setMobileCart] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeCartRef = useRef<HTMLButtonElement>(null);
  const cartTriggerRef = useRef<HTMLButtonElement>(null);
  const visible = useMemo(
    () =>
      products.filter(
        (p) =>
          (category === "Barchasi" || p.category === category) &&
          p.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      ),
    [category, query],
  );
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && mobileCart) {
        setMobileCart(false);
        cartTriggerRef.current?.focus();
      } else if (
        event.key === "/" &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLTextAreaElement)
      ) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileCart]);

  useEffect(() => {
    if (!mobileCart) return;
    closeCartRef.current?.focus();
  }, [mobileCart]);

  function add(product: Product) {
    if (!product.available) return;
    setCart((current) => {
      const found = current.find((line) => line.id === product.id);
      return found
        ? current.map((line) =>
            line.id === product.id
              ? { ...line, quantity: line.quantity + 1 }
              : line,
          )
        : [...current, { ...product, quantity: 1, note: "" }];
    });
    setNotice(`${product.name} savatga qo‘shildi.`);
    setOrderId("");
  }
  function quantity(id: string, value: number) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 999) return;
    setCart((current) =>
      current.flatMap((line) =>
        line.id !== id
          ? [line]
          : value === 0
            ? []
            : [{ ...line, quantity: value }],
      ),
    );
    setQuantityDraft((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setOrderId("");
  }
  function editQuantity(id: string, value: string) {
    if (value !== "" && !/^\d{1,3}$/.test(value)) return;
    setQuantityDraft((current) => ({ ...current, [id]: value }));
    if (value && Number(value) > 0) {
      const next = Number(value);
      setCart((current) =>
        current.map((line) =>
          line.id === id ? { ...line, quantity: next } : line,
        ),
      );
      setOrderId("");
    }
  }
  function commitQuantity(id: string) {
    const draft = quantityDraft[id];
    if (draft === undefined) return;
    if (draft === "" || Number(draft) === 0) {
      setQuantityDraft((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      return;
    }
    quantity(id, Number(draft));
  }
  function submit() {
    if (!cart.length) {
      setNotice("Avval buyurtmaga mahsulot qo‘shing.");
      return;
    }
    const id = `DEMO-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    setOrderId(id);
    setNotice(
      "Demo buyurtma faqat shu brauzer oynasida namoyish qilindi. Ma’lumotlar bazasiga yuborilmadi.",
    );
    setCart([]);
    setQuantityDraft({});
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <a className={styles.brand} href="/" aria-label="UniBOS bosh sahifasi">
          <img src="/brand/mark-dark.svg" alt="" />
          <span>
            UniBOS <small>OPERATIONS</small>
          </span>
        </a>
        <div className={styles.context}>
          <span className={styles.liveDot} />{" "}
          <span>
            <b>Navbahor · Demo filiali</b>
            <small>Ulanish: demo muhit · Smena: modul mavjud emas</small>
          </span>
        </div>
        <div className={styles.user}>
          <span className={styles.avatar}>K</span>
          <span>
            <b>Kassir demo</b>
            <small>Filial xodimi · Demo</small>
          </span>
        </div>
      </header>
      <div className={styles.demoBanner}>
        <strong>DEMO</strong>
        <span>
          Sun’iy katalog va narxlar. Buyurtma PostgreSQL yoki real kassa
          tizimiga yozilmaydi.
        </span>
        <a href="/demo/operations">Katalog demo</a>
        <a href="/demo/service">Oshxona va ofitsiant demo</a>
      </div>
      <div className={styles.workspace}>
        <section className={styles.catalog} aria-label="Mahsulotlar katalogi">
          <div className={styles.heading}>
            <div>
              <span className={styles.eyebrow}>KASSIR ISH JOYI</span>
              <h1>Yangi buyurtma</h1>
              <p>Buyurtmani qabul qiling va mahsulotlarni tanlang.</p>
            </div>
            <span className={styles.orderChip}>● Yangi buyurtma</span>
          </div>
          <div
            className={styles.modeRow}
            role="group"
            aria-label="Buyurtma turi"
          >
            <button
              className={mode === "DINE_IN" ? styles.modeActive : ""}
              aria-pressed={mode === "DINE_IN"}
              onClick={() => setMode("DINE_IN")}
            >
              Stolda ovqatlanish
            </button>
            <button
              className={mode === "PICKUP" ? styles.modeActive : ""}
              aria-pressed={mode === "PICKUP"}
              onClick={() => setMode("PICKUP")}
            >
              Olib ketish
            </button>
            {mode === "DINE_IN" && (
              <label className={styles.tableSelect}>
                Stol
                <select
                  value={table}
                  onChange={(e) => setTable(e.target.value)}
                >
                  {tables.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </label>
            )}
            {mode === "PICKUP" && (
              <span className={styles.pickupLabel}>
                Olib ketish buyurtmasi · stol talab qilinmaydi
              </span>
            )}
          </div>
          <div className={styles.filters}>
            <label className={styles.search}>
              <span aria-hidden="true">⌕</span>
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Mahsulot qidirish…"
                aria-label="Mahsulot qidirish"
              />
              <kbd>/</kbd>
            </label>
            <div
              className={styles.categories}
              role="group"
              aria-label="Mahsulot kategoriyalari"
            >
              {categories.map((item) => (
                <button
                  key={item}
                  className={category === item ? styles.categoryActive : ""}
                  aria-pressed={category === item}
                  onClick={() => setCategory(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.productGrid}>
            {visible.map((product) => (
              <article
                className={`${styles.product} ${!product.available ? styles.unavailable : ""}`}
                key={product.id}
              >
                <div
                  className={styles.productImage}
                  style={{ backgroundImage: `url("${product.image}")` }}
                >
                  <span>{product.category}</span>
                  {!product.available && <b>Tugagan</b>}
                </div>
                <div className={styles.productInfo}>
                  <h2>{product.name}</h2>
                  <p>{money(product.price)}</p>
                  <button
                    onClick={() => add(product)}
                    disabled={!product.available}
                    aria-label={`${product.name}, savatga qo‘shish`}
                  >
                    ＋
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!visible.length && (
            <div className={styles.empty}>
              Bu qidiruv bo‘yicha mahsulot topilmadi.
            </div>
          )}
        </section>
        <aside
          className={`${styles.cartPanel} ${mobileCart ? styles.cartOpen : ""}`}
          aria-label="Buyurtma savati"
          role={mobileCart ? "dialog" : undefined}
          aria-modal={mobileCart ? true : undefined}
          onKeyDown={(event) => {
            if (!mobileCart || event.key !== "Tab") return;
            const targets = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled),input:not(:disabled),select,[href]",
              ),
            ).filter((target) => target.offsetParent !== null);
            if (!targets.length) return;
            const first = targets[0]!;
            const last = targets[targets.length - 1]!;
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <div className={styles.cartTitle}>
            <div>
              <span className={styles.eyebrow}>JORIY BUYURTMA</span>
              <h2>
                Savat <span>{count}</span>
              </h2>
            </div>
            <button
              ref={closeCartRef}
              className={styles.closeCart}
              onClick={() => {
                setMobileCart(false);
                cartTriggerRef.current?.focus();
              }}
              aria-label="Savatni yopish"
            >
              ×
            </button>
          </div>
          <div className={styles.cartMeta}>
            <span>{mode === "DINE_IN" ? table : "Olib ketish"}</span>
            <span>·</span>
            <span>Kassir buyurtmasi</span>
          </div>
          <div className={styles.lines}>
            {!cart.length ? (
              <div className={styles.cartEmpty}>
                <span>＋</span>
                <b>Savat hozircha bo‘sh</b>
                <p>Buyurtmaga qo‘shish uchun katalogdan mahsulot tanlang.</p>
              </div>
            ) : (
              cart.map((line) => (
                <article className={styles.line} key={line.id}>
                  <div className={styles.lineTop}>
                    <div>
                      <h3>{line.name}</h3>
                      <small>{money(line.price)} / dona</small>
                    </div>
                    <button
                      className={styles.remove}
                      onClick={() => quantity(line.id, 0)}
                      aria-label={`${line.name}ni olib tashlash`}
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.lineBottom}>
                    <div className={styles.stepper}>
                      <button
                        onClick={() => quantity(line.id, line.quantity - 1)}
                        aria-label={`${line.name} miqdorini kamaytirish`}
                      >
                        −
                      </button>
                      <input
                        aria-label={`${line.name} miqdori`}
                        inputMode="numeric"
                        maxLength={3}
                        value={quantityDraft[line.id] ?? line.quantity}
                        onChange={(e) => editQuantity(line.id, e.target.value)}
                        onBlur={() => commitQuantity(line.id)}
                      />
                      <button
                        onClick={() => quantity(line.id, line.quantity + 1)}
                        aria-label={`${line.name} miqdorini oshirish`}
                      >
                        ＋
                      </button>
                    </div>
                    <b>{money(line.price * line.quantity)}</b>
                  </div>
                  <label className={styles.noteLabel}>
                    Mahsulot izohi
                    <input
                      value={line.note}
                      onChange={(e) =>
                        setCart((current) =>
                          current.map((item) =>
                            item.id === line.id
                              ? { ...item, note: e.target.value.slice(0, 300) }
                              : item,
                          ),
                        )
                      }
                      placeholder="Masalan, achchiqsiz"
                    />
                  </label>
                </article>
              ))
            )}
          </div>
          <div className={styles.summary}>
            <div>
              <span>Mahsulotlar ({count})</span>
              <b>{money(total)}</b>
            </div>
            <div className={styles.total}>
              <span>
                Jami <small>DEMO NARXLAR</small>
              </span>
              <b>{money(total)}</b>
            </div>
            <button
              className={styles.submit}
              disabled={!cart.length}
              onClick={submit}
            >
              Demo buyurtmani yuborish <span>→</span>
            </button>
            <p>Haqiqiy buyurtma yoki to‘lov yuborilmaydi.</p>
          </div>
          {notice && (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          )}
          {orderId && (
            <div className={styles.success} role="status">
              <span>✓</span>
              <div>
                <b>Demo buyurtma tayyor</b>
                <small>{orderId} · Yuborildi (demo)</small>
              </div>
            </div>
          )}
        </aside>
      </div>
      <button
        ref={cartTriggerRef}
        className={styles.mobileCartButton}
        onClick={() => setMobileCart(true)}
      >
        Savatni ko‘rish · {count} <b>{money(total)}</b>
      </button>
    </main>
  );
}
