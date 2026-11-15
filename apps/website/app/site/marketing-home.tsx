"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";

type Locale = "uz" | "en" | "ru";
type MarketingCopy = {
  nav: string[];
  sign: string;
  eyebrow: string;
  title: ReactNode;
  lead: string;
  primary: string;
  secondary: string;
  proof: string;
  section: string;
  sectionLead: string;
  cards: string[][];
  demo: string;
  demoLead: string;
  work: string;
  guest: string;
  about: string;
  aboutLead: string;
  secure: string;
  secureLead: string;
  pricing: string;
  pricingLead: string;
  footer: string;
  ecosystem: string;
  greeting: string;
  overview: string;
  allLocations: string;
  salesLabel: string;
  ordersLabel: string;
  locationsLabel: string;
  active: string;
  salesOverview: string;
  thisWeek: string;
  topLocation: string;
  viewReport: string;
  dashboardPreview: string;
  sampleCaption: string;
  stamp: ReactNode;
  demoTitle: ReactNode;
  businessTag: string;
  businessDescription: string;
  guestTag: string;
  guestDescription: string;
  aboutLink: string;
  securityArt: string;
  identity: string;
  access: string;
  privacy: string;
  footerPlatform: string;
  footerSecurity: string;
  footerDemo: string;
  contact: string;
  signUp: string;
};
const copy = {
  uz: {
    nav: ["Platforma", "Yechimlar", "Xavfsizlik", "Haqida"],
    sign: "Kirish",
    eyebrow: "Biznes operatsiyalari yagona tizimda",
    title: (
      <>
        Bitta platforma.
        <br />
        Butun biznesingiz.
      </>
    ),
    lead: "Jamoa, filial va kundalik ishlarni yagona aniq manzarada boshqaring. UniBOS biznesingiz bilan birga o‘sishga mo‘ljallangan.",
    primary: "Interaktiv demo",
    secondary: "Platformani ko‘rish",
    proof: "Restoranlardan boshlanadi. Turli bizneslarga moslashadi.",
    section: "Ishingizni bir joyga jamlang",
    sectionLead:
      "Har bir ish maydoni o‘z vazifasiga mos. Ma’lumotlar esa biznesingiz doirasida qoladi.",
    cards: [
      [
        "Boshqaruv",
        "Filiallar, jamoa va biznes ko‘rsatkichlarini tartibli boshqaring.",
      ],
      [
        "Operatsiyalar",
        "Menyu, buyurtma va kundalik jarayonlar bitta tizimda.",
      ],
      [
        "Mehmon tajribasi",
        "QR orqali ochiladigan sodda menyu va buyurtma oqimi.",
      ],
      [
        "Xavfsiz asos",
        "Kirish, MFA va filial doirasidagi ruxsatlar boshidan hisobga olingan.",
      ],
    ],
    demo: "Mahsulotni sinab ko‘ring",
    demoLead:
      "Quyidagi maketlar demo ma’lumotlardan foydalanadi. Ular haqiqiy savdo yoki buyurtma yubormaydi.",
    work: "Workspace demosi",
    guest: "Mehmon menyusi demosi",
    about: "Yangi avlod biznes platformasi",
    aboutLead:
      "Avval restoran va kafelar uchun. Arxitektura esa keyinchalik boshqa sohalarga ham moslashishi uchun modulli qurilmoqda.",
    secure: "Maxfiylik va xavfsizlik dizaynning bir qismi",
    secureLead:
      "Tashkilot va filiallar bo‘yicha kirish nazorati, MFA va ma’lumotlar chegarasi platforma asosiga kiritilgan.",
    pricing: "Rejalar tayyorlanmoqda",
    pricingLead:
      "Narxlar va obuna shartlari tasdiqlanmaguncha bu sahifada taxminiy tariflar ko‘rsatilmaydi.",
    footer: "O‘zbekistonda yaratilgan. Dunyo uchun qurilgan.",
    ecosystem: "UNIBOS EKOTIZIMI",
    greeting: "Xayrli tong, Umida",
    overview: "BIZNES KO‘RINISHI",
    allLocations: "Barcha filiallar",
    salesLabel: "SOF SAVDO",
    ordersLabel: "BUYURTMALAR",
    locationsLabel: "FILIALLAR",
    active: "Faol",
    salesOverview: "Savdo ko‘rsatkichi",
    thisWeek: "Shu hafta",
    topLocation: "YETAKCHI FILIAL",
    viewReport: "Hisobotni ko‘rish",
    dashboardPreview: "Dashboard ko‘rinishi",
    sampleCaption: "Namuna ma’lumotlar",
    stamp: (
      <>
        Har bir filial
        <br />
        uchun yagona ko‘rinish
      </>
    ),
    demoTitle: (
      <>
        Mahsulot bilan
        <br />
        tanishib ko‘ring.
      </>
    ),
    businessTag: "BIZNES WORKSPACE · DEMO",
    businessDescription: "Filiallar, kundalik faoliyat va jamoa ko‘rinishi.",
    guestTag: "MEHMON TAJRIBASI · DEMO",
    guestDescription: "Savatli, mobil qurilmaga mos menyu namunasi.",
    aboutLink: "Tamoyillarimizni ko‘ring",
    securityArt: "XAVFSIZLIK ASOSI",
    identity: "Shaxs",
    access: "Kirish",
    privacy: "Maxfiylik",
    footerPlatform: "Platforma",
    footerSecurity: "Xavfsizlik",
    footerDemo: "Demo",
    contact: "Bog‘lanish",
    signUp: "UniBOS’ga qo‘shiling",
  },
  en: {
    nav: ["Platform", "Solutions", "Security", "About"],
    sign: "Sign in",
    eyebrow: "Business operations, in one system",
    title: (
      <>
        One platform.
        <br />
        Your entire business.
      </>
    ),
    lead: "Bring teams, locations and everyday work into one clear view. UniBOS is designed to grow with your business.",
    primary: "Explore the demo",
    secondary: "Discover the platform",
    proof: "Starting with restaurants. Designed to adapt across industries.",
    section: "Bring your work together",
    sectionLead:
      "Each workspace fits its job. Your business data stays within your organization.",
    cards: [
      [
        "Business workspace",
        "Manage locations, teams and business activity with clarity.",
      ],
      ["Operations", "Menus, orders and daily workflows in one system."],
      ["Guest experience", "A simple menu and ordering flow, opened by QR."],
      [
        "Secure foundation",
        "Identity, MFA and location-aware access are built into the foundation.",
      ],
    ],
    demo: "Take a closer look",
    demoLead:
      "These previews use sample data. They do not submit real orders or sales.",
    work: "Workspace demo",
    guest: "Guest menu demo",
    about: "A new kind of business platform",
    aboutLead:
      "Starting with restaurants and cafés, with a modular foundation that can support other industries over time.",
    secure: "Privacy and security are part of the design",
    secureLead:
      "Organization and branch access, MFA and data boundaries are built into the platform foundation.",
    pricing: "Plans are in preparation",
    pricingLead:
      "We will publish pricing after plans and subscription terms are confirmed.",
    footer: "Made in Uzbekistan. Built for the world.",
    ecosystem: "THE UNIBOS ECOSYSTEM",
    greeting: "Good morning, Umida",
    overview: "BUSINESS OVERVIEW",
    allLocations: "All locations",
    salesLabel: "NET SALES",
    ordersLabel: "ORDERS",
    locationsLabel: "LOCATIONS",
    active: "Active",
    salesOverview: "Sales overview",
    thisWeek: "This week",
    topLocation: "TOP LOCATION",
    viewReport: "View report",
    dashboardPreview: "Dashboard preview",
    sampleCaption: "Illustrative demo data",
    stamp: (
      <>
        One clear view
        <br />
        for every location
      </>
    ),
    demoTitle: (
      <>
        See the experience
        <br />
        for yourself.
      </>
    ),
    businessTag: "BUSINESS WORKSPACE · DEMO",
    businessDescription: "Locations, daily activity and team overview.",
    guestTag: "GUEST EXPERIENCE · DEMO",
    guestDescription: "A mobile-first menu preview with a local cart.",
    aboutLink: "Explore our principles",
    securityArt: "SECURITY FOUNDATION",
    identity: "Identity",
    access: "Access",
    privacy: "Privacy",
    footerPlatform: "Platform",
    footerSecurity: "Security",
    footerDemo: "Demo",
    contact: "Contact",
    signUp: "Join UniBOS",
  },
  ru: {
    nav: ["Платформа", "Решения", "Безопасность", "О нас"],
    sign: "Войти",
    eyebrow: "Управление бизнесом в одной системе",
    title: (
      <>
        Одна платформа.
        <br />
        Весь ваш бизнес.
      </>
    ),
    lead: "Объедините команды, филиалы и повседневные процессы в одном понятном пространстве. UniBOS создана для роста вместе с вашим бизнесом.",
    primary: "Интерактивное демо",
    secondary: "О платформе",
    proof: "Начинаем с ресторанов. Архитектура подходит разным отраслям.",
    section: "Соберите процессы в одном месте",
    sectionLead:
      "Каждое рабочее пространство решает свою задачу. Данные остаются в пределах бизнеса.",
    cards: [
      ["Управление", "Филиалы, команда и показатели бизнеса — в одном месте."],
      ["Операции", "Меню, заказы и ежедневные процессы в одной системе."],
      ["Для гостей", "Удобное меню и заказ, доступные по QR-коду."],
      [
        "Безопасная основа",
        "Вход, MFA и права доступа к филиалам заложены в основу.",
      ],
    ],
    demo: "Посмотрите ближе",
    demoLead:
      "В макетах используются демонстрационные данные. Заказы и продажи не отправляются.",
    work: "Демо рабочего пространства",
    guest: "Демо меню для гостей",
    about: "Новая платформа для бизнеса",
    aboutLead:
      "Начинаем с ресторанов и кафе. Модульная архитектура позволит со временем поддержать другие отрасли.",
    secure: "Приватность и безопасность — часть дизайна",
    secureLead:
      "Контроль доступа к организациям и филиалам, MFA и границы данных заложены в платформу.",
    pricing: "Тарифы готовятся",
    pricingLead:
      "Стоимость появится после утверждения тарифов и условий подписки.",
    footer: "Создано в Узбекистане. Для всего мира.",
    ecosystem: "ЭКОСИСТЕМА UNIBOS",
    greeting: "Доброе утро, Умида",
    overview: "ОБЗОР БИЗНЕСА",
    allLocations: "Все филиалы",
    salesLabel: "ЧИСТЫЕ ПРОДАЖИ",
    ordersLabel: "ЗАКАЗЫ",
    locationsLabel: "ФИЛИАЛЫ",
    active: "Активен",
    salesOverview: "Обзор продаж",
    thisWeek: "Эта неделя",
    topLocation: "ЛУЧШИЙ ФИЛИАЛ",
    viewReport: "Смотреть отчёт",
    dashboardPreview: "Пример панели управления",
    sampleCaption: "Демонстрационные данные",
    stamp: (
      <>
        Всё по каждому
        <br />
        филиалу в одном месте
      </>
    ),
    demoTitle: (
      <>
        Посмотрите,
        <br />
        как это работает.
      </>
    ),
    businessTag: "РАБОЧЕЕ ПРОСТРАНСТВО · ДЕМО",
    businessDescription: "Филиалы, текущая работа и обзор команды.",
    guestTag: "ДЛЯ ГОСТЕЙ · ДЕМО",
    guestDescription: "Пример меню для телефона с локальной корзиной.",
    aboutLink: "Наши принципы",
    securityArt: "ОСНОВА БЕЗОПАСНОСТИ",
    identity: "Личность",
    access: "Доступ",
    privacy: "Приватность",
    footerPlatform: "Платформа",
    footerSecurity: "Безопасность",
    footerDemo: "Демо",
    contact: "Контакты",
    signUp: "Присоединиться к UniBOS",
  },
} satisfies Record<Locale, MarketingCopy>;

const icons = ["◫", "⌘", "◉", "◇"];

export function MarketingHome() {
  const [locale, setLocale] = useState<Locale>("uz");
  const [menuOpen, setMenuOpen] = useState(false);
  const t = copy[locale];
  const ids = ["platform", "solutions", "security", "about"];
  useEffect(() => {
    try {
      const saved = localStorage.getItem("unibos-locale");
      if (saved === "uz" || saved === "en" || saved === "ru") setLocale(saved);
    } catch {
      /* locale remains at the Uzbek default when storage is unavailable */
    }
  }, []);
  function changeLocale(value: Locale) {
    setLocale(value);
    document.documentElement.lang = value;
    try {
      localStorage.setItem("unibos-locale", value);
    } catch {
      /* locale still applies for this page view */
    }
  }
  return (
    <main className="marketing" lang={locale}>
      <header className={`site-header wrap${menuOpen ? " menu-open" : ""}`}>
        <Link href="/" aria-label={t.footerPlatform} className="brand-link">
          <Image
            src="/brand/wordmark-light.svg"
            alt="UniBOS"
            width={210}
            height={75}
            priority
            unoptimized
          />
        </Link>
        <nav
          className={`main-nav${menuOpen ? " nav-open" : ""}`}
          id="primary-navigation"
          aria-label={t.footerPlatform}
        >
          {t.nav.map((label: string, i: number) => (
            <a
              key={ids[i]}
              href={`#${ids[i]}`}
              onClick={() => setMenuOpen(false)}
            >
              {label}
            </a>
          ))}
          <Link
            className="mobile-sign-up"
            href="/sign-up"
            onClick={() => setMenuOpen(false)}
          >
            {t.signUp}
          </Link>
        </nav>
        <div className="header-actions">
          <label className="sr-only" htmlFor="locale">
            {locale === "uz" ? "Til" : locale === "ru" ? "Язык" : "Language"}
          </label>
          <select
            id="locale"
            value={locale}
            onChange={(e) => changeLocale(e.target.value as Locale)}
            aria-label={
              locale === "uz"
                ? "Tilni tanlang"
                : locale === "ru"
                  ? "Выберите язык"
                  : "Choose language"
            }
          >
            <option value="uz">UZ</option>
            <option value="en">EN</option>
            <option value="ru">RU</option>
          </select>
          <Link className="sign-in" href="/sign-in">
            {t.sign}
            <span aria-hidden="true"> ›</span>
          </Link>
          <Link className="header-sign-up" href="/sign-up">
            {t.signUp}
          </Link>
          <button
            className="menu-button"
            aria-label={
              menuOpen
                ? locale === "uz"
                  ? "Menyuni yopish"
                  : locale === "ru"
                    ? "Закрыть меню"
                    : "Close navigation"
                : locale === "uz"
                  ? "Menyuni ochish"
                  : locale === "ru"
                    ? "Открыть меню"
                    : "Open navigation"
            }
            aria-controls="primary-navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? "×" : "☰"}
          </button>
        </div>
      </header>
      <section className="hero wrap" id="platform">
        <div className="hero-copy">
          <p className="eyebrow">
            <span />
            {t.eyebrow}
          </p>
          <h1>{t.title}</h1>
          <p className="hero-lead">{t.lead}</p>
          <div className="hero-actions">
            <a className="button button-dark" href="#demo">
              {t.primary}
              <span>›</span>
            </a>
            <a className="text-link" href="#solutions">
              {t.secondary}
              <span> ↓</span>
            </a>
          </div>
          <p className="hero-proof">
            <span className="proof-mark">✳</span>
            {t.proof}
          </p>
        </div>
        <div className="hero-visual" aria-label={t.dashboardPreview}>
          <div className="visual-glow" />
          <div className="mock-window">
            <div className="mock-top">
              <span className="mini-brand">
                <Image
                  src="/brand/mark-light.svg"
                  alt=""
                  width={22}
                  height={25}
                  unoptimized
                />{" "}
                UniBOS
              </span>
              <span className="demo-pill">DEMO</span>
              <span className="avatar">U</span>
            </div>
            <div className="mock-body">
              <aside>
                <i className="active" />
                <i />
                <i />
                <i />
                <i />
              </aside>
              <div className="mock-content">
                <div className="mock-welcome">
                  <div>
                    <small>{t.overview}</small>
                    <b>{t.greeting}</b>
                  </div>
                  <span>{t.allLocations}⌄</span>
                </div>
                <div className="metric-row">
                  <div>
                    <small>{t.salesLabel}</small>
                    <b>$12,840</b>
                    <em>↑ 8.2%</em>
                  </div>
                  <div>
                    <small>{t.ordersLabel}</small>
                    <b>284</b>
                    <em>↑ 4.6%</em>
                  </div>
                  <div>
                    <small>{t.locationsLabel}</small>
                    <b>03</b>
                    <em className="neutral">{t.active}</em>
                  </div>
                </div>
                <div className="chart-card">
                  <div className="chart-title">
                    <b>{t.salesOverview}</b>
                    <small>{t.thisWeek}⌄</small>
                  </div>
                  <div className="chart">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="chart-days">
                    <i>MON</i>
                    <i>TUE</i>
                    <i>WED</i>
                    <i>THU</i>
                    <i>FRI</i>
                    <i>SAT</i>
                    <i>SUN</i>
                  </div>
                </div>
                <div className="mock-bottom">
                  <div>
                    <small>{t.topLocation}</small>
                    <b>Green Table · Downtown</b>
                  </div>
                  <strong>{t.viewReport} ›</strong>
                </div>
              </div>
            </div>
            <div className="visual-caption">
              <span className="caption-dot" />
              {t.dashboardPreview}
              <span>{t.sampleCaption}</span>
            </div>
          </div>
          <div className="hero-stamp">
            <span>U</span>
            <small>{t.stamp}</small>
          </div>
        </div>
      </section>
      <section className="ecosystem section-pad" id="solutions">
        <div className="wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                <span />
                {t.ecosystem}
              </p>
              <h2>{t.section}</h2>
            </div>
            <p>{t.sectionLead}</p>
          </div>
          <div className="feature-grid">
            {t.cards.map((card: string[], i: number) => (
              <article className="feature-card" key={card[0]}>
                <span className="feature-icon" aria-hidden="true">
                  {icons[i]}
                </span>
                <span className="feature-index">0{i + 1}</span>
                <h3>{card[0]}</h3>
                <p>{card[1]}</p>
                <a
                  href={
                    i === 2
                      ? "/demo/guest"
                      : i === 0
                        ? "/demo/workspace"
                        : "#demo"
                  }
                  aria-label={`${card[0]} — ${t.secondary}`}
                >
                  ›
                </a>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="demo-section section-pad" id="demo">
        <div className="wrap demo-wrap">
          <div className="section-heading">
            <div>
              <p className="eyebrow">
                <span />
                {t.demo}
              </p>
              <h2>{t.demoTitle}</h2>
            </div>
            <p>{t.demoLead}</p>
          </div>
          <div className="demo-tiles">
            <Link className="demo-tile workspace-tile" href="/demo/workspace">
              <span className="tile-tag">{t.businessTag}</span>
              <span className="tile-title">{t.work}</span>
              <span className="tile-description">{t.businessDescription}</span>
              <span className="tile-arrow">›</span>
              <div className="tile-window">
                <div className="tile-sidebar">
                  <b>U</b>
                  <i />
                  <i />
                  <i />
                </div>
                <div className="tile-content">
                  <div className="tile-bar" />
                  <div className="tile-numbers">
                    <i />
                    <i />
                    <i />
                  </div>
                  <div className="tile-graph">
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                </div>
              </div>
            </Link>
            <Link className="demo-tile guest-tile" href="/demo/guest">
              <span className="tile-tag">{t.guestTag}</span>
              <span className="tile-title">{t.guest}</span>
              <span className="tile-description">{t.guestDescription}</span>
              <span className="tile-arrow">›</span>
              <div className="phone-preview">
                <div className="phone-notch" />
                <div className="phone-image" />
                <small>GREEN TABLE · SAMPLE</small>
                <b>Seasonal menu</b>
                <i>Fresh from our kitchen</i>
                <span />
              </div>
            </Link>
          </div>
        </div>
      </section>
      <section className="about-section section-pad" id="about">
        <div className="wrap about-grid">
          <div className="about-emblem">
            <div className="emblem-circle">
              <Image
                src="/brand/mark-dark.svg"
                alt=""
                width={90}
                height={105}
                unoptimized
              />
            </div>
            <span>{t.aboutLink}</span>
          </div>
          <div>
            <p className="eyebrow">
              <span />
              {t.aboutLink}
            </p>
            <h2>{t.about}</h2>
            <p>{t.aboutLead}</p>
            <a className="text-link" href="#security">
              {t.aboutLink} <span>›</span>
            </a>
          </div>
        </div>
      </section>
      <section className="security-section section-pad" id="security">
        <div className="wrap security-card">
          <div>
            <p className="eyebrow">
              <span />
              {t.securityArt}
            </p>
            <h2>{t.secure}</h2>
            <p>{t.secureLead}</p>
            <Link className="button button-outline" href="/sign-in">
              {t.sign}
              <span>›</span>
            </Link>
          </div>
          <div className="security-visual">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="security-core">
              <Image
                src="/brand/mark-dark.svg"
                alt=""
                width={52}
                height={60}
                unoptimized
              />
            </div>
            <span className="orbit-node node-one">
              01 <small>{t.identity}</small>
            </span>
            <span className="orbit-node node-two">
              02 <small>{t.access}</small>
            </span>
            <span className="orbit-node node-three">
              03 <small>{t.privacy}</small>
            </span>
          </div>
        </div>
      </section>
      <section className="pricing-strip wrap" id="contact">
        <div>
          <p className="eyebrow">
            <span />
            {t.pricing}
          </p>
          <p>{t.pricingLead}</p>
        </div>
        <a href="#contact" className="text-link">
          {t.contact} <span>›</span>
        </a>
      </section>
      <footer className="site-footer">
        <div className="wrap footer-inner">
          <div>
            <Image
              src="/brand/wordmark-dark.svg"
              alt="UniBOS"
              width={160}
              height={57}
              unoptimized
            />
            <p>{t.footer}</p>
          </div>
          <div className="footer-links">
            <a href="#platform">{t.footerPlatform}</a>
            <a href="#security">{t.footerSecurity}</a>
            <Link href="/demo/workspace">{t.footerDemo}</Link>
            <a href="#contact">{t.contact}</a>
          </div>
          <small>© UniBOS · Preview build</small>
        </div>
      </footer>
    </main>
  );
}
