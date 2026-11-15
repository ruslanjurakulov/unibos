"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Locale = "uz" | "en" | "ru";
type Category = "All" | "Fresh" | "Mains";

const copy = {
  uz: {
    banner:
      "DEMO KO‘RINISHI · Namuna menyu · Buyurtma restoranga yuborilmaydi.",
    demo: "Mehmon demo",
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
    item: "taom",
    items: "taom",
    preview: "Savatni ko‘rish",
    added: "demo savatga qo‘shildi",
    noOrder: "Buyurtma yuborilmadi.",
    unavailable: "Bu ko‘rinishda buyurtma yuborilmaydi.",
    decorative: "Namuna restoran tasviri",
  },
  en: {
    banner:
      "DEMO PREVIEW · Sample menu only · No order is sent to a restaurant.",
    demo: "Guest demo",
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
    item: "item",
    items: "items",
    preview: "Preview cart",
    added: "added to sample cart",
    noOrder: "No order has been submitted.",
    unavailable: "This preview does not submit orders.",
    decorative: "Decorative sample restaurant image",
  },
  ru: {
    banner: "ДЕМО · Пример меню · Заказ не отправляется в ресторан.",
    demo: "Демо для гостей",
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
    item: "блюдо",
    items: "блюд",
    preview: "Посмотреть корзину",
    added: "добавлено в демо-корзину",
    noOrder: "Заказ не отправлен.",
    unavailable: "В этом демо нельзя отправить заказ.",
    decorative: "Иллюстрация ресторана для демо",
  },
} satisfies Record<
  Locale,
  {
    banner: string;
    demo: string;
    workspace: string;
    restaurant: string;
    menu: string;
    subtitle: string;
    categories: Record<Category, string>;
    names: string[];
    details: string[];
    add: string;
    cart: string;
    item: string;
    items: string;
    preview: string;
    added: string;
    noOrder: string;
    unavailable: string;
    decorative: string;
  }
>;

const products = [
  { id: "greens", price: 8.5, category: "Fresh" },
  { id: "aubergine", price: 10, category: "Fresh" },
  { id: "rice", price: 12.5, category: "Mains" },
] as const;

export default function GuestDemoPage() {
  const [locale, setLocale] = useState<Locale>("uz");
  const [category, setCategory] = useState<Category>("All");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState("");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("unibos-locale");
      if (saved === "uz" || saved === "en" || saved === "ru") setLocale(saved);
    } catch {
      /* keep Uzbek default */
    }
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
  const total = products.reduce(
    (sum, product) => sum + product.price * (cart[product.id] ?? 0),
    0,
  );

  return (
    <main className="demo-page" lang={locale}>
      <div className="demo-banner">{t.banner}</div>
      <header className="demo-topbar">
        <Link className="demo-topbrand" href="/">
          <Image
            src="/brand/mark-light.svg"
            alt=""
            width={25}
            height={29}
            unoptimized
          />
          UniBOS <span className="ui-badge">{t.demo}</span>
        </Link>
        <Link className="demo-toplinks" href="/demo/workspace">
          {t.workspace} ›
        </Link>
      </header>
      <div className="guest-layout">
        <div className="guest-hero" role="img" aria-label={t.decorative} />
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
        <div className="guest-cart">
          <span>
            {t.cart} · {count} {count === 1 ? t.item : t.items} · $
            {total.toFixed(2)}
          </span>
          <button onClick={() => setNotice(t.unavailable)}>{t.preview}</button>
        </div>
      </div>
    </main>
  );
}
