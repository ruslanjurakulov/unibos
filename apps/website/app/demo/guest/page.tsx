"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type AnimationEvent,
} from "react";
import { useMotionReveals } from "../../site/motion";

type Locale = "uz" | "en" | "ru";
type Category = "All" | "Fresh" | "Mains";

const copy = {
  uz: {
    banner:
      "DEMO KO‘RINISHI · Namuna menyu · Buyurtma restoranga yuborilmaydi.",
    demo: "Mehmon demo",
    demoHub: "Barcha demolar",
    workspace: "Workspace demosi",
    restaurant: "NAMUNA RESTORAN · DEMO",
    menu: "Mavsumiy menyu",
    subtitle: "Yangi masalliqlar, ulashish uchun.",
    categories: {
      All: "Barchasi",
      Fresh: "Yengil taomlar",
      Mains: "Asosiy taomlar",
    },
    names: ["Ko‘katli salat", "Qovurilgan baqlajon", "Za’faronli guruch"],
    details: [
      "Ko‘kat · bodring · qovurilgan urug‘lar",
      "Tutunli tahini · anor",
      "Mavsumiy sabzavot · sitrus",
    ],
    add: "Demo savatga qo‘shish",
    cart: "Demo savat",
    cartTitle: "Savat tarkibi",
    cartEmpty: "Savat hozircha bo‘sh.",
    cartDemoNotice: "Demo narxlari. Buyurtma yoki to‘lov yuborilmaydi.",
    unitPrice: "Birlik narxi",
    lineTotal: "Jami",
    total: "Jami summa",
    decrease: "Miqdorni kamaytirish",
    increase: "Miqdorni oshirish",
    remove: "Savatdan olib tashlash",
    closeCart: "Savatni yopish",
    continue: "Menyuga qaytish",
    item: "taom",
    items: "taom",
    preview: "Savatni ko‘rish",
    added: "demo savatga qo‘shildi",
    noOrder: "Buyurtma yuborilmadi.",
    unavailable: "Bu ko‘rinishda buyurtma yuborilmaydi.",
    decorative: "Namuna restoran tasviri",
    scanPrompt: "QR orqali menyuni oching · demo",
  },
  en: {
    banner:
      "DEMO PREVIEW · Sample menu only · No order is sent to a restaurant.",
    demo: "Guest demo",
    demoHub: "All demos",
    workspace: "Workspace demo",
    restaurant: "SAMPLE RESTAURANT · DEMO",
    menu: "Seasonal menu",
    subtitle: "Fresh plates, made for sharing.",
    categories: { All: "All", Fresh: "Fresh", Mains: "Mains" },
    names: ["Garden greens", "Charred aubergine", "Saffron rice bowl"],
    details: [
      "Herbs · cucumber · toasted seeds",
      "Smoky tahini · pomegranate",
      "Seasonal vegetables · citrus",
    ],
    add: "Add to demo cart",
    cart: "Demo cart",
    cartTitle: "Cart contents",
    cartEmpty: "Your cart is empty.",
    cartDemoNotice: "Demo prices. No order or payment is submitted.",
    unitPrice: "Unit price",
    lineTotal: "Line total",
    total: "Total",
    decrease: "Decrease quantity",
    increase: "Increase quantity",
    remove: "Remove from cart",
    closeCart: "Close cart",
    continue: "Continue browsing",
    item: "item",
    items: "items",
    preview: "Preview cart",
    added: "added to sample cart",
    noOrder: "No order has been submitted.",
    unavailable: "This preview does not submit orders.",
    decorative: "Decorative sample restaurant image",
    scanPrompt: "Scan to open the menu · demo",
  },
  ru: {
    banner: "ДЕМО · Пример меню · Заказ не отправляется в ресторан.",
    demo: "Демо для гостей",
    demoHub: "Все демо",
    workspace: "Демо рабочего пространства",
    restaurant: "ПРИМЕР РЕСТОРАНА · ДЕМО",
    menu: "Сезонное меню",
    subtitle: "Свежие блюда, которыми приятно делиться.",
    categories: { All: "Все", Fresh: "Лёгкие блюда", Mains: "Основные блюда" },
    names: ["Садовая зелень", "Запечённый баклажан", "Рис с шафраном"],
    details: [
      "Зелень · огурец · обжаренные семена",
      "Копчёный тахини · гранат",
      "Сезонные овощи · цитрус",
    ],
    add: "Добавить в демо-корзину",
    cart: "Демо-корзина",
    cartTitle: "Состав корзины",
    cartEmpty: "Корзина пока пуста.",
    cartDemoNotice: "Демо-цены. Заказ или оплата не отправляются.",
    unitPrice: "Цена за единицу",
    lineTotal: "Сумма",
    total: "Итого",
    decrease: "Уменьшить количество",
    increase: "Увеличить количество",
    remove: "Удалить из корзины",
    closeCart: "Закрыть корзину",
    continue: "Вернуться в меню",
    item: "блюдо",
    items: "блюд",
    preview: "Посмотреть корзину",
    added: "добавлено в демо-корзину",
    noOrder: "Заказ не отправлен.",
    unavailable: "В этом демо нельзя отправить заказ.",
    decorative: "Иллюстрация ресторана для демо",
    scanPrompt: "Откройте меню по QR · демо",
  },
} satisfies Record<
  Locale,
  {
    banner: string;
    demo: string;
    demoHub: string;
    workspace: string;
    restaurant: string;
    menu: string;
    subtitle: string;
    categories: Record<Category, string>;
    names: string[];
    details: string[];
    add: string;
    cart: string;
    cartTitle: string;
    cartEmpty: string;
    cartDemoNotice: string;
    unitPrice: string;
    lineTotal: string;
    total: string;
    decrease: string;
    increase: string;
    remove: string;
    closeCart: string;
    continue: string;
    item: string;
    items: string;
    preview: string;
    added: string;
    noOrder: string;
    unavailable: string;
    decorative: string;
    scanPrompt: string;
  }
>;

const products = [
  { id: "greens", price: 8.5, category: "Fresh" },
  { id: "aubergine", price: 10, category: "Fresh" },
  { id: "rice", price: 12.5, category: "Mains" },
] as const;

export default function GuestDemoPage() {
  useMotionReveals(".guest-page");
  const [locale, setLocale] = useState<Locale>("uz");
  const [dark, setDark] = useState(false);
  const [category, setCategory] = useState<Category>("All");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [cartOpen, setCartOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [removingProducts, setRemovingProducts] = useState<
    Record<string, boolean>
  >({});
  const cartDialogRef = useRef<HTMLDialogElement>(null);
  const cartTriggerRef = useRef<HTMLButtonElement>(null);
  const removalTimeoutsRef = useRef(new Map<string, number>());
  useEffect(() => {
    try {
      const saved = localStorage.getItem("unibos-locale");
      if (saved === "uz" || saved === "en" || saved === "ru") {
        setLocale(saved);
        document.documentElement.lang = saved;
      }
      setDark(localStorage.getItem("unibos-theme") === "dark");
    } catch {
      /* keep Uzbek default */
    }
  }, []);

  useEffect(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const completePendingRemovals = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      const pending = [...removalTimeoutsRef.current.keys()];
      for (const timeout of removalTimeoutsRef.current.values()) {
        window.clearTimeout(timeout);
      }
      removalTimeoutsRef.current.clear();
      if (pending.length > 0) {
        setCart((current) => {
          const next = { ...current };
          for (const id of pending) delete next[id];
          return next;
        });
        setRemovingProducts({});
      }
    };
    motionPreference.addEventListener("change", completePendingRemovals);
    return () => {
      motionPreference.removeEventListener("change", completePendingRemovals);
      for (const timeout of removalTimeoutsRef.current.values()) {
        window.clearTimeout(timeout);
      }
      removalTimeoutsRef.current.clear();
    };
  }, []);
  const t = copy[locale];
  const shown = useMemo(
    () =>
      category === "All"
        ? products
        : products.filter((product) => product.category === category),
    [category],
  );
  const count = Object.values(cart).reduce((sum, value) => sum + value, 0);
  const cartProducts = products.filter(
    (product) => (cart[product.id] ?? 0) > 0,
  );
  const total = products.reduce(
    (sum, product) => sum + product.price * (cart[product.id] ?? 0),
    0,
  );

  useEffect(() => {
    const dialog = cartDialogRef.current;
    if (!dialog) return;
    if (cartOpen && !dialog.open) dialog.showModal();
    if (!cartOpen && dialog.open) dialog.close();
  }, [cartOpen]);

  function changeQuantity(id: string, change: number) {
    setCart((current) => {
      const nextQuantity = Math.max(0, (current[id] ?? 0) + change);
      if (nextQuantity === 0) {
        const next = { ...current };
        delete next[id];
        return next;
      }
      return { ...current, [id]: nextQuantity };
    });
  }

  function removeProduct(id: string) {
    setCart((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function completeProductRemoval(id: string) {
    const timeout = removalTimeoutsRef.current.get(id);
    if (timeout !== undefined) window.clearTimeout(timeout);
    removalTimeoutsRef.current.delete(id);
    removeProduct(id);
    setRemovingProducts((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  }

  function requestProductRemoval(id: string) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      completeProductRemoval(id);
      return;
    }
    setRemovingProducts((current) => ({ ...current, [id]: true }));
    const timeout = window.setTimeout(() => completeProductRemoval(id), 260);
    removalTimeoutsRef.current.set(id, timeout);
  }

  function finishProductRemoval(
    event: AnimationEvent<HTMLLIElement>,
    id: string,
  ) {
    if (event.animationName !== "guest-cart-line-out") return;
    completeProductRemoval(id);
  }

  return (
    <main
      className={`demo-page guest-page${dark ? " theme-dark" : ""}`}
      lang={locale}
    >
      <div className="demo-banner">{t.banner}</div>
      <header className="demo-topbar">
        <Link className="demo-topbrand" href="/demo" aria-label={t.demoHub}>
          <Image
            src="/brand/mark-dark.svg"
            alt=""
            width={25}
            height={29}
            unoptimized
          />
          UniBOS <span className="ui-badge">{t.demo}</span>
        </Link>
        <nav className="guest-top-actions">
          <Link className="demo-toplinks" href="/demo">
            {t.demoHub}
          </Link>
          <label className="sr-only" htmlFor="guest-locale">
            {locale === "uz" ? "Til" : locale === "ru" ? "Язык" : "Language"}
          </label>
          <select
            id="guest-locale"
            value={locale}
            onChange={(event) => {
              const next = event.target.value as Locale;
              setLocale(next);
              document.documentElement.lang = next;
              try {
                localStorage.setItem("unibos-locale", next);
              } catch {
                /* locale remains active for this page */
              }
            }}
            aria-label={
              locale === "uz"
                ? "Tilni tanlang"
                : locale === "ru"
                  ? "Выберите язык"
                  : "Choose language"
            }
          >
            <option value="uz">UZ</option>
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
          <button
            type="button"
            className="guest-theme-toggle"
            aria-label={dark ? "Light mode" : "Dark mode"}
            onClick={() =>
              setDark((current) => {
                const next = !current;
                try {
                  localStorage.setItem("unibos-theme", next ? "dark" : "light");
                } catch {
                  /* theme remains active for this page */
                }
                return next;
              })
            }
          >
            {dark ? "☼" : "◐"}
          </button>
          <Link className="demo-toplinks" href="/demo/workspace">
            {t.workspace} ›
          </Link>
        </nav>
      </header>
      <div className="guest-layout">
        <div className="guest-hero" data-motion-intro="art">
          <div
            className="guest-hero-scene"
            role="img"
            aria-label={t.decorative}
          ></div>
          <div className="guest-hero-details">
            <span className="guest-hero-caption">{t.scanPrompt}</span>
            <span className="guest-hero-badge">QR / NFC · DEMO</span>
          </div>
        </div>
        <div className="guest-menu" data-motion-intro="body">
          <div className="guest-info">
            <small>{t.restaurant}</small>
            <h1>{t.menu}</h1>
            <p>{t.subtitle}</p>
          </div>
          <div
            className="guest-categories"
            aria-label={
              locale === "uz"
                ? "Menyu kategoriyalari"
                : locale === "ru"
                  ? "Категории меню"
                  : "Menu categories"
            }
          >
            {(["All", "Fresh", "Mains"] as const).map((value) => (
              <button
                className={category === value ? "selected" : ""}
                onClick={() => setCategory(value)}
                key={value}
                aria-pressed={category === value}
              >
                {t.categories[value]}
              </button>
            ))}
          </div>
          {shown.map((product) => {
            const index = products.findIndex(
              (candidate) => candidate.id === product.id,
            );
            return (
              <article className="guest-item" key={product.id}>
                <div className="guest-item-image" aria-hidden="true" />
                <div className="guest-item-info">
                  <b>{t.names[index]}</b>
                  <small>{t.details[index]}</small>
                  <strong>${product.price.toFixed(2)}</strong>
                </div>
                <button
                  aria-label={`${t.add}: ${t.names[index]}`}
                  onClick={() => {
                    setCart((current) => ({
                      ...current,
                      [product.id]: (current[product.id] ?? 0) + 1,
                    }));
                    setNotice(`${t.names[index]} ${t.added}`);
                  }}
                >
                  +
                </button>
              </article>
            );
          })}
          {notice && (
            <div role="status" className="toast">
              {notice}. {t.noOrder}
            </div>
          )}
          <div className={`guest-cart${count > 0 ? " has-items" : ""}`}>
            <span
              key={`${count}-${total.toFixed(2)}`}
              className="guest-cart-count"
            >
              {t.cart} · {count} {count === 1 ? t.item : t.items} · $
              {total.toFixed(2)}
            </span>
            <button
              ref={cartTriggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={cartOpen}
              aria-controls="guest-cart-dialog"
              onClick={() => setCartOpen(true)}
            >
              {t.preview}
            </button>
          </div>
        </div>
      </div>
      <dialog
        id="guest-cart-dialog"
        ref={cartDialogRef}
        className="guest-cart-dialog"
        aria-labelledby="guest-cart-title"
        onCancel={(event) => {
          event.preventDefault();
          setCartOpen(false);
        }}
        onClose={() => setCartOpen(false)}
        onKeyDown={(event) => {
          if (event.key !== "Tab") return;
          const focusable = Array.from(
            event.currentTarget.querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
            ),
          );
          if (focusable.length === 0) return;
          const first = focusable[0];
          const last = focusable[focusable.length - 1];
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        onClick={(event) => {
          if (event.target === event.currentTarget) setCartOpen(false);
        }}
      >
        <section className="guest-cart-panel">
          <header className="guest-cart-heading">
            <div>
              <p>{t.cart}</p>
              <h2 id="guest-cart-title">{t.cartTitle}</h2>
            </div>
            <button
              type="button"
              className="guest-cart-close"
              autoFocus
              aria-label={t.closeCart}
              onClick={() => setCartOpen(false)}
            >
              ×
            </button>
          </header>
          <p className="guest-cart-notice">{t.cartDemoNotice}</p>
          {cartProducts.length === 0 ? (
            <p className="guest-cart-empty" role="status">
              {t.cartEmpty}
            </p>
          ) : (
            <ul className="guest-cart-items">
              {cartProducts.map((product) => {
                const index = products.findIndex(
                  (candidate) => candidate.id === product.id,
                );
                const quantity = cart[product.id] ?? 0;
                return (
                  <li
                    className={`guest-cart-line${removingProducts[product.id] ? " is-removing" : ""}`}
                    key={product.id}
                    onAnimationEnd={(event) =>
                      finishProductRemoval(event, product.id)
                    }
                  >
                    <div className="guest-cart-product">
                      <b>{t.names[index]}</b>
                      <span>
                        {t.unitPrice}: ${product.price.toFixed(2)}
                      </span>
                      <strong>
                        {t.lineTotal}: ${(product.price * quantity).toFixed(2)}
                      </strong>
                    </div>
                    <div className="guest-cart-controls">
                      <button
                        type="button"
                        aria-label={`${t.decrease}: ${t.names[index]}`}
                        onClick={() => changeQuantity(product.id, -1)}
                      >
                        −
                      </button>
                      <output
                        key={quantity}
                        aria-label={`${t.names[index]} quantity`}
                      >
                        {quantity}
                      </output>
                      <button
                        type="button"
                        aria-label={`${t.increase}: ${t.names[index]}`}
                        onClick={() => changeQuantity(product.id, 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        className="guest-cart-remove"
                        aria-label={`${t.remove}: ${t.names[index]}`}
                        onClick={() => requestProductRemoval(product.id)}
                      >
                        {t.remove}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <footer className="guest-cart-summary">
            <span>{t.total}</span>
            <strong>${total.toFixed(2)}</strong>
          </footer>
          <button
            type="button"
            className="guest-cart-continue"
            onClick={() => setCartOpen(false)}
          >
            {t.continue}
          </button>
        </section>
      </dialog>
    </main>
  );
}
