"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  P3ExtendedPage,
  P3HomeAdditions,
  P3ProductModules,
  P3SolutionsShowcase,
  P3SolutionsWorkflow,
  type ExtendedPage,
} from "./p3-content";
import { useMotionReveals } from "./motion";

type Locale = "uz" | "ru" | "en";
type Page =
  | "home"
  | "solutions"
  | "pricing"
  | "about"
  | "contact"
  | ExtendedPage
  | "dashboard"
  | "admin";

const pricingPlanOrder = ["Basic", "Business", "Pro"];

const labels = {
  uz: {
    nav: ["Asosiy", "Yechimlar", "Narxlar", "Demo", "Biz haqimizda"],
    platform: "Platforma",
    security: "Xavfsizlik",
    contactNav: "Aloqa",
    investorsNav: "Investorlar",
    faqNav: "FAQ",
    login: "Kirish",
    cta: "Demo ko‘rish",
    homeEyebrow: "RESTORANLAR UCHUN YAGONA RAQAMLI PLATFORMА",
    homeTitle: "Restoran biznesi uchun yagona raqamli platforma",
    homeLead:
      "Restoran va kafelar uchun ishlab chiqilayotgan biznes operatsion tizimi. Birinchi yo‘nalish — restoranlar; bu saytdagi imkoniyatlar demo yoki reja sifatida belgilanadi.",
    homePoints: [
      "Restoranlar — birinchi yo‘nalish",
      "Modulli mahsulot",
      "Demo va reja ochiq ko‘rsatiladi",
    ],
    solutions: "Imkoniyatlar",
    solutionsEyebrow: "YECHIMLAR",
    solutionsTitle: "Restoraningiz uchun to‘liq ekotizim",
    solutionsLead:
      "Barcha jarayonlar — bir platformada. Modullarni ehtiyojingizga moslab tanlang va biznesingizni kengaytiring.",
    explore: "Imkoniyatlarni ko‘rish",
    demo: "Interaktiv demo",
    demoOnly: "Namuna interfeysi · Ko‘rsatkichlar demo ma’lumotidir",
    modules: "Restoran boshqaruvining barcha jarayonlari",
    modulesLead:
      "Kundalik operatsiyalardan mehmon tajribasigacha — modullar bitta aniq ish oqimida.",
    moduleNames: [
      "Buyurtma boshqaruvi",
      "Stol va zal boshqaruvi",
      "Menyu (QR/NFC)",
      "Ombor va ta’minot",
      "Xodimlar va ish vaqti",
      "Hisobot va moliya",
    ],
    moduleText: [
      "Buyurtmalarni qabul qiling va jarayonni kuzating.",
      "Zal holati va stollarni qulay boshqaring.",
      "Mehmonlarga menyuni telefonida oching.",
      "Mahsulotlar va ta’minotni tartibda saqlang.",
      "Jamoa, vazifa va smenalarni boshqaring.",
      "Biznes holatini aniq ko‘rinishda kuzating.",
    ],
    try: "Mahsulotni sinab ko‘ring",
    guest: "QR menyu demo",
    dashboard: "Restoran dashboard demo",
    admin: "Super Admin demo",
    pricingTitle: "Biznesingizga mos obuna rejasi",
    pricingLead:
      "Obuna paketlari va narxlar tasdiqlanishi bilan e’lon qilinadi.",
    pricingSoon: "Tez kunda",
    pricingDemoNote:
      "TARIF GIPOTEZALARI · Tasdiqlanmagan, sotuv yoki billing yo‘q.",
    billingMonthly: "Oyma-oy",
    billingYearly: "Yillik",
    yearlyPending: "Yillik narx tasdiqlanmagan",
    pricingCta: "Tarif holatini ko‘rish",
    pricingPlans: [
      {
        name: "Basic",
        monthly: "Narx ko‘rsatilmagan",
        monthlyNote:
          "BUSINESS_MODEL.md hujjatida Basic tarifi yoki uning narxi yo‘q.",
        status: "TARKIBI TASDIQLANMAGAN",
        features: [
          "Basic va Starter o‘rtasidagi moslik egasi tomonidan aniqlanishi kerak.",
          "Tarkib, huquqlar va billing tasdiqlanmagan.",
        ],
      },
      {
        name: "Pro",
        monthly: "499 000 UZS",
        monthlyNote: "Oyiga · BUSINESS_MODEL.md’dagi tasdiqlanmagan gipoteza.",
        status: "TAKLIF · KELAJAK GIPOTEZASI",
        features: [
          "Ombor, moliya va xodimlar — hujjatdagi kelajak gipotezalari.",
          "Bu modullar hozir ishlamaydi; obuna huquqlari va billing yo‘q.",
        ],
      },
      {
        name: "Business",
        monthly: "249 000 UZS",
        monthlyNote: "Oyiga · BUSINESS_MODEL.md’dagi tasdiqlanmagan gipoteza.",
        status: "TAKLIF · TASDIQLANMAGAN",
        features: [
          "Buyurtma, kassir, oshxona va analitika — tarif gipotezasi.",
          "Modullar hozir ishlamaydi; to‘lov/fiscal faqat tayyor bo‘lganda.",
        ],
      },
    ],
    aboutTitle: "Restoranlar uchun texnologik hamkor",
    aboutLead:
      "UniBOS — restoran va kafelar biznesini raqamlashtirish, samaradorligini oshirish va barqaror rivojlantirish uchun yaratilgan zamonaviy platforma.",
    mission: "Bizning missiyamiz",
    missionText: "Restoran biznesini sodda, zamonaviy va foydali qilish.",
    values: "Bizning qadriyatlarimiz",
    valuesText: ["Soddalik", "Ishonch", "O‘sish"],
    contactTitle: "Biz bilan bog‘laning",
    contactLead:
      "Savollaringiz bormi? Aloqa kanallari tasdiqlangach, shu sahifada e’lon qilamiz.",
    contactSoon: "Aloqa ma’lumotlari tayyorlanmoqda",
    noForm: "Hozircha xabar yuborish yoqilmagan. Shaxsiy ma’lumot kiritmang.",
    contactDemoNote:
      "DEMO FORMA · Ma’lumot yuborilmaydi yoki saqlanmaydi. Haqiqiy shaxsiy ma’lumot kiritmang.",
    contactName: "Ism",
    contactPhone: "Telefon",
    contactMessage: "Xabar",
    contactSend: "Demo holatini ko‘rish",
    contactNoSendStatus: "Demo holati ko‘rsatildi. Ma’lumot yuborilmadi.",
    footer: "O‘zbekistonda yaratilgan. Dunyo uchun qurilgan.",
    dashboardTitle: "Dashboard",
    superAdmin: "Super Admin",
    sample: "DEMO MA’LUMOTLARI · HAQIQIY BIZNES MA’LUMOTI EMAS",
    today: "Bugun",
    sales: "Sof savdo",
    orders: "Buyurtmalar",
    check: "O‘rtacha chek",
    tables: "Faol stollar",
    chart: "Savdo dinamikasi",
    orderTypes: "Buyurtma turlari",
    organization: "Restoranlar",
    status: "Holati",
    plan: "Obuna",
    date: "Qo‘shilgan sana",
    all: "Hammasi",
  },
  en: {
    nav: ["Home", "Solutions", "Pricing", "Demo", "About"],
    platform: "Platform",
    security: "Security",
    contactNav: "Contact",
    investorsNav: "Investors",
    faqNav: "FAQ",
    login: "Sign in",
    cta: "View demo",
    homeEyebrow: "ONE DIGITAL PLATFORM FOR RESTAURANTS",
    homeTitle: "One digital platform for restaurant businesses.",
    homeLead:
      "A business operating system in development for restaurants and cafés. Restaurants come first; capabilities on this site are marked as demos or plans.",
    homePoints: [
      "Restaurants first",
      "Modular platform",
      "Demo and planned status shown",
    ],
    solutions: "Solutions",
    solutionsEyebrow: "SOLUTIONS",
    solutionsTitle: "A complete ecosystem for your restaurant",
    solutionsLead:
      "Every process in one platform. Choose the modules you need as your business grows.",
    explore: "Explore the platform",
    demo: "Interactive demo",
    demoOnly: "Sample interface · Illustrative demo data",
    modules: "Everything that runs a restaurant",
    modulesLead:
      "From daily operations to the guest experience, connected in one clear workflow.",
    moduleNames: [
      "Order management",
      "Table and floor",
      "QR/NFC menu",
      "Inventory and supply",
      "Team and shifts",
      "Reports and finance",
    ],
    moduleText: [
      "Receive orders and follow each step.",
      "Keep tables and floor activity organized.",
      "Let guests open the menu on their phones.",
      "Keep ingredients and supplies in order.",
      "Coordinate your team, tasks and shifts.",
      "See business activity with clarity.",
    ],
    try: "Explore the product",
    guest: "QR menu demo",
    dashboard: "Restaurant dashboard demo",
    admin: "Super Admin demo",
    pricingTitle: "A plan for your business",
    pricingLead: "Plans and pricing will be published once they are confirmed.",
    pricingSoon: "Coming soon",
    pricingDemoNote:
      "PRICING HYPOTHESES · Unapproved; no sales or billing is available.",
    billingMonthly: "Monthly",
    billingYearly: "Annual",
    yearlyPending: "Annual price is not approved",
    pricingCta: "Review pricing status",
    pricingPlans: [
      {
        name: "Basic",
        monthly: "No price listed",
        monthlyNote:
          "BUSINESS_MODEL.md does not define a Basic plan or its price.",
        status: "CONTENTS NOT APPROVED",
        features: [
          "The owner must decide whether Basic maps to Starter.",
          "Contents, entitlements and billing are unapproved.",
        ],
      },
      {
        name: "Pro",
        monthly: "UZS 499,000",
        monthlyNote:
          "Per month · unapproved hypothesis from BUSINESS_MODEL.md.",
        status: "PROPOSED · FUTURE HYPOTHESIS",
        features: [
          "Inventory, finance and staff are future hypotheses in the document.",
          "These modules are not live; there are no plan entitlements or billing.",
        ],
      },
      {
        name: "Business",
        monthly: "UZS 249,000",
        monthlyNote:
          "Per month · unapproved hypothesis from BUSINESS_MODEL.md.",
        status: "PROPOSED · NOT APPROVED",
        features: [
          "Orders, cashier, kitchen and analytics are plan hypotheses.",
          "Modules are not live; payment/fiscal is only for when ready.",
        ],
      },
    ],
    aboutTitle: "A technology partner for restaurants",
    aboutLead:
      "UniBOS is a modern platform built to digitize restaurant and café operations, improve efficiency and support sustainable growth.",
    mission: "Our mission",
    missionText:
      "Make restaurant operations simpler, more modern and more rewarding.",
    values: "Our values",
    valuesText: ["Simplicity", "Trust", "Growth"],
    contactTitle: "Get in touch",
    contactLead:
      "Have a question? We will publish confirmed contact channels here.",
    contactSoon: "Contact details are being prepared",
    noForm:
      "Messaging is not enabled yet. Please do not enter personal information.",
    contactDemoNote:
      "DEMO FORM · Nothing is sent or saved. Do not enter real personal information.",
    contactName: "Name",
    contactPhone: "Phone",
    contactMessage: "Message",
    contactSend: "Preview demo state",
    contactNoSendStatus: "Demo state shown. Nothing was sent.",
    footer: "Made in Uzbekistan. Built for the world.",
    dashboardTitle: "Dashboard",
    superAdmin: "Super Admin",
    sample: "DEMO DATA · NOT LIVE BUSINESS INFORMATION",
    today: "Today",
    sales: "Net sales",
    orders: "Orders",
    check: "Average check",
    tables: "Active tables",
    chart: "Sales dynamics",
    orderTypes: "Order types",
    organization: "Restaurants",
    status: "Status",
    plan: "Plan",
    date: "Added",
    all: "All",
  },
  ru: {
    nav: ["Главная", "Решения", "Тарифы", "Демо", "О нас"],
    platform: "Платформа",
    security: "Безопасность",
    contactNav: "Контакты",
    investorsNav: "Инвесторам",
    faqNav: "FAQ",
    login: "Войти",
    cta: "Смотреть демо",
    homeEyebrow: "ЕДИНАЯ ЦИФРОВАЯ ПЛАТФОРМА ДЛЯ РЕСТОРАНОВ",
    homeTitle: "Единая цифровая платформа для ресторанного бизнеса.",
    homeLead:
      "Бизнес-операционная система для ресторанов и кафе в разработке. Сначала рестораны; возможности на сайте отмечены как демо или планируемые.",
    homePoints: [
      "Сначала рестораны",
      "Модульная платформа",
      "Демо и планы обозначены",
    ],
    solutions: "Решения",
    solutionsEyebrow: "РЕШЕНИЯ",
    solutionsTitle: "Полная экосистема для вашего ресторана",
    solutionsLead:
      "Все процессы — на одной платформе. Выбирайте нужные модули и развивайте бизнес.",
    explore: "Возможности платформы",
    demo: "Интерактивное демо",
    demoOnly: "Пример интерфейса · демонстрационные данные",
    modules: "Все процессы управления рестораном",
    modulesLead:
      "От ежедневных операций до впечатлений гостей — в едином понятном рабочем процессе.",
    moduleNames: [
      "Управление заказами",
      "Зал и столы",
      "Меню QR/NFC",
      "Склад и поставки",
      "Команда и смены",
      "Отчёты и финансы",
    ],
    moduleText: [
      "Принимайте заказы и следите за их выполнением.",
      "Контролируйте состояние зала и столов.",
      "Открывайте меню на телефоне гостя.",
      "Следите за продуктами и поставками.",
      "Управляйте командой, задачами и сменами.",
      "Наблюдайте за работой бизнеса.",
    ],
    try: "Попробуйте продукт",
    guest: "Демо QR-меню",
    dashboard: "Демо панели ресторана",
    admin: "Демо Super Admin",
    pricingTitle: "Тариф для вашего бизнеса",
    pricingLead: "Опубликуем тарифы после утверждения условий и стоимости.",
    pricingSoon: "Скоро",
    pricingDemoNote:
      "ГИПОТЕЗЫ ТАРИФОВ · Не утверждены; продажа и биллинг недоступны.",
    billingMonthly: "Помесячно",
    billingYearly: "За год",
    yearlyPending: "Годовая цена не утверждена",
    pricingCta: "Проверить статус тарифов",
    pricingPlans: [
      {
        name: "Basic",
        monthly: "Цена не указана",
        monthlyNote: "В BUSINESS_MODEL.md нет тарифа Basic и его цены.",
        status: "СОСТАВ НЕ УТВЕРЖДЁН",
        features: [
          "Владелец должен решить, соответствует ли Basic тарифу Starter.",
          "Состав, права и биллинг не утверждены.",
        ],
      },
      {
        name: "Pro",
        monthly: "499 000 UZS",
        monthlyNote: "В месяц · неутверждённая гипотеза из BUSINESS_MODEL.md.",
        status: "ПРЕДЛОЖЕНИЕ · БУДУЩАЯ ГИПОТЕЗА",
        features: [
          "Склад, финансы и сотрудники — будущие гипотезы документа.",
          "Эти модули не работают; прав и биллинга подписки нет.",
        ],
      },
      {
        name: "Business",
        monthly: "249 000 UZS",
        monthlyNote: "В месяц · неутверждённая гипотеза из BUSINESS_MODEL.md.",
        status: "ПРЕДЛОЖЕНИЕ · НЕ УТВЕРЖДЕНО",
        features: [
          "Заказы, касса, кухня и аналитика — гипотеза для тарифа.",
          "Модули не работают; оплата и фискализация — только после готовности.",
        ],
      },
    ],
    aboutTitle: "Технологический партнёр ресторанов",
    aboutLead:
      "UniBOS — современная платформа для цифровизации ресторанов и кафе, повышения эффективности и устойчивого развития.",
    mission: "Наша миссия",
    missionText: "Сделать ресторанный бизнес проще, современнее и эффективнее.",
    values: "Наши ценности",
    valuesText: ["Простота", "Доверие", "Рост"],
    contactTitle: "Свяжитесь с нами",
    contactLead:
      "Есть вопросы? Опубликуем здесь подтверждённые контактные данные.",
    contactSoon: "Контактные данные готовятся",
    noForm: "Отправка сообщений пока отключена. Не вводите личные данные.",
    contactDemoNote:
      "ДЕМО-ФОРМА · Данные не отправляются и не сохраняются. Не вводите настоящие личные данные.",
    contactName: "Имя",
    contactPhone: "Телефон",
    contactMessage: "Сообщение",
    contactSend: "Показать состояние демо",
    contactNoSendStatus: "Показан демо-статус. Данные не отправлены.",
    footer: "Создано в Узбекистане. Для всего мира.",
    dashboardTitle: "Панель управления",
    superAdmin: "Super Admin",
    sample: "ДЕМО-ДАННЫЕ · НЕ ДАННЫЕ ДЕЙСТВУЮЩЕГО БИЗНЕСА",
    today: "Сегодня",
    sales: "Чистые продажи",
    orders: "Заказы",
    check: "Средний чек",
    tables: "Активные столы",
    chart: "Динамика продаж",
    orderTypes: "Типы заказов",
    organization: "Рестораны",
    status: "Статус",
    plan: "Тариф",
    date: "Добавлено",
    all: "Все",
  },
} as const;

const adminRows = [
  ["Almaz Restaurant", "Faol", "Pro", "2026-11-12"],
  ["Samarkand Plov", "Faol", "Basic", "2026-11-09"],
  ["Tashkent Lounge", "Demo", "Business", "2026-11-05"],
  ["Oasis Cafe", "Demo", "Basic", "2026-11-01"],
] as const;

export function DesignPage({ page }: { page: Page }) {
  useMotionReveals();
  const [locale, setLocale] = useState<Locale>("uz");
  const [dark, setDark] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const t = labels[locale];

  useEffect(() => {
    try {
      const savedLocale = localStorage.getItem("unibos-locale");
      if (
        savedLocale === "uz" ||
        savedLocale === "ru" ||
        savedLocale === "en"
      ) {
        setLocale(savedLocale);
        document.documentElement.lang = savedLocale;
      }
      setDark(localStorage.getItem("unibos-theme") === "dark");
    } catch {
      /* defaults are usable when storage is unavailable */
    }
  }, []);

  function updateLocale(value: Locale) {
    setLocale(value);
    document.documentElement.lang = value;
    try {
      localStorage.setItem("unibos-locale", value);
    } catch {
      /* page locale still updates */
    }
  }
  function updateTheme() {
    setDark((value) => {
      const next = !value;
      try {
        localStorage.setItem("unibos-theme", next ? "dark" : "light");
      } catch {
        /* page theme still updates */
      }
      return next;
    });
  }

  return (
    <main
      className={`p3-site${dark ? " p3-dark" : ""}`}
      data-page={page}
      lang={locale}
    >
      {page !== "dashboard" && page !== "admin" && (
        <header
          className={`p3-header${menuOpen ? " p3-menu-open" : ""}`}
          data-motion-intro={page === "home" ? "nav" : undefined}
        >
          <Link href="/" className="p3-brand" aria-label="UniBOS — bosh sahifa">
            <Image
              src="/brand/wordmark-dark.svg"
              alt="UniBOS"
              width={160}
              height={56}
              priority
              unoptimized
            />
          </Link>
          <nav
            className="p3-nav"
            aria-label={
              locale === "uz"
                ? "Asosiy navigatsiya"
                : locale === "ru"
                  ? "Главная навигация"
                  : "Main navigation"
            }
          >
            <Link href="/#platform">{t.platform}</Link>
            <Link href="/solutions">{t.nav[1]}</Link>
            <Link href="/pricing">{t.nav[2]}</Link>
            <Link href="/demo">{t.nav[3]}</Link>
            <Link href="/about">{t.nav[4]}</Link>
            <Link href="/security">{t.security}</Link>
            <Link href="/contact">{t.contactNav}</Link>
          </nav>
          <div className="p3-tools">
            <label className="sr-only" htmlFor="p3-locale">
              {locale === "uz" ? "Til" : locale === "ru" ? "Язык" : "Language"}
            </label>
            <select
              id="p3-locale"
              value={locale}
              onChange={(event) => updateLocale(event.target.value as Locale)}
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
              className="p3-theme-toggle"
              type="button"
              onClick={updateTheme}
              aria-label={dark ? "Light mode" : "Dark mode"}
              title={dark ? "Light mode" : "Dark mode"}
            >
              {dark ? "☼" : "◐"}
            </button>
            <Link href="/sign-in" className="p3-login">
              {t.login}
            </Link>
            <Link href="/demo" className="p3-header-cta">
              {t.cta}
            </Link>
            <button
              className="p3-menu-toggle"
              type="button"
              aria-expanded={menuOpen}
              aria-controls="p3-main-nav"
              aria-label={menuOpen ? "Close navigation" : "Open navigation"}
              onClick={() => setMenuOpen((value) => !value)}
            >
              {menuOpen ? "×" : "☰"}
            </button>
          </div>
        </header>
      )}
      {page !== "dashboard" && page !== "admin" && (
        <nav
          id="p3-main-nav"
          className={`p3-mobile-nav${menuOpen ? " is-open" : ""}`}
          aria-label={
            locale === "uz"
              ? "Mobil navigatsiya"
              : locale === "ru"
                ? "Мобильная навигация"
                : "Mobile navigation"
          }
        >
          <Link href="/#platform" onClick={() => setMenuOpen(false)}>
            {t.platform}
          </Link>
          <Link href="/solutions" onClick={() => setMenuOpen(false)}>
            {t.nav[1]}
          </Link>
          <Link href="/pricing" onClick={() => setMenuOpen(false)}>
            {t.nav[2]}
          </Link>
          <Link href="/demo" onClick={() => setMenuOpen(false)}>
            {t.nav[3]}
          </Link>
          <Link href="/about" onClick={() => setMenuOpen(false)}>
            {t.nav[4]}
          </Link>
          <Link href="/contact" onClick={() => setMenuOpen(false)}>
            {t.contactNav}
          </Link>
          <Link href="/security" onClick={() => setMenuOpen(false)}>
            {t.security}
          </Link>
          <Link href="/investors" onClick={() => setMenuOpen(false)}>
            {t.investorsNav}
          </Link>
          <Link href="/faq" onClick={() => setMenuOpen(false)}>
            {t.faqNav}
          </Link>
        </nav>
      )}

      {page === "home" && <Home t={t} locale={locale} />}
      {page === "solutions" && <Solutions t={t} locale={locale} />}
      {page === "pricing" && <Pricing t={t} />}
      {page === "about" && <About t={t} />}
      {page === "contact" && <Contact t={t} />}
      {(page === "demoHub" ||
        page === "security" ||
        page === "investors" ||
        page === "faq") && <P3ExtendedPage page={page} locale={locale} />}
      {page === "dashboard" && (
        <Dashboard
          t={t}
          locale={locale}
          dark={dark}
          onLocaleChange={updateLocale}
          onTheme={updateTheme}
        />
      )}
      {page === "admin" && (
        <Admin
          t={t}
          locale={locale}
          dark={dark}
          onLocaleChange={updateLocale}
          onTheme={updateTheme}
        />
      )}

      {page !== "dashboard" && page !== "admin" && (
        <footer className="p3-footer">
          <div className="p3-footer-inner">
            <div>
              <Image
                src="/brand/wordmark-dark.svg"
                alt="UniBOS"
                width={137}
                height={48}
                unoptimized
              />
              <p>{t.footer}</p>
            </div>
            <nav
              aria-label={
                locale === "uz"
                  ? "Pastki navigatsiya"
                  : locale === "ru"
                    ? "Нижняя навигация"
                    : "Footer navigation"
              }
            >
              <Link href="/solutions">{t.solutions}</Link>
              <Link href="/demo">{t.nav[3]}</Link>
              <Link href="/pricing">{t.nav[2]}</Link>
              <Link href="/about">{t.nav[4]}</Link>
              <Link href="/security">{t.security}</Link>
              <Link href="/investors">{t.investorsNav}</Link>
              <Link href="/faq">{t.faqNav}</Link>
              <Link href="/contact">{t.contactNav}</Link>
            </nav>
            <small>
              © UniBOS ·{" "}
              {locale === "uz"
                ? "Ko‘rib chiqish versiyasi"
                : locale === "ru"
                  ? "Версия для просмотра"
                  : "Preview version"}
            </small>
          </div>
        </footer>
      )}
    </main>
  );
}

function Eyebrow({
  children,
  motion,
}: {
  children: ReactNode;
  motion?: string;
}) {
  return (
    <p className="p3-eyebrow" data-motion-intro={motion}>
      <span />
      {children}
    </p>
  );
}

function Home({ t, locale }: { t: (typeof labels)[Locale]; locale: Locale }) {
  return (
    <>
      <section className="p3-home-hero" id="platform">
        <div className="p3-hero-copy">
          <Eyebrow motion="eyebrow">{t.homeEyebrow}</Eyebrow>
          <h1 data-motion-intro="headline">{t.homeTitle}</h1>
          <p data-motion-intro="body">{t.homeLead}</p>
          <div className="p3-hero-actions" data-motion-intro="actions">
            <Link className="p3-button p3-button-gold" href="/demo">
              {t.cta}
              <span>→</span>
            </Link>
            <Link className="p3-button p3-button-outline" href="/solutions">
              {t.explore}
              <span>→</span>
            </Link>
          </div>
          <div className="p3-hero-points" data-motion-intro="points">
            {t.homePoints.map((point, index) => (
              <span key={point} data-motion-index={index}>
                ◈ {point}
              </span>
            ))}
          </div>
        </div>
        <div className="p3-hero-art" data-motion-intro="art">
          <Image
            src="/images/p3/hero-scene.jpg"
            alt={
              locale === "uz"
                ? "Restoran sahnasidagi UniBOS demo laptop dashboardi, QR menyuli telefon va NFC stendi"
                : locale === "ru"
                  ? "Демо-сцена UniBOS в ресторане: панель на ноутбуке, QR-меню на телефоне и NFC-стойка"
                  : "UniBOS restaurant demo scene with laptop dashboard, QR menu phone and NFC stand"
            }
            fill
            priority
            sizes="(max-width: 900px) 100vw, 58vw"
          />
          <span className="p3-visual-label">{t.demoOnly}</span>
          <div className="p3-hero-art-glow" />
        </div>
        <div className="p3-hero-footer">
          <span>
            {locale === "uz"
              ? "Bitta platforma. Har bir filial."
              : locale === "ru"
                ? "Одна платформа. Каждый филиал."
                : "One platform. Every location."}
          </span>
          <span>01 / 08</span>
        </div>
      </section>
      <section className="p3-home-modules p3-wrap">
        <div className="p3-section-heading" data-motion-reveal="left">
          <div data-motion-reveal="left">
            <Eyebrow>{t.solutions}</Eyebrow>
            <h2>{t.modules}</h2>
          </div>
          <p>{t.modulesLead}</p>
        </div>
        <P3ProductModules locale={locale} />
      </section>
      <section className="p3-home-demo">
        <div className="p3-wrap p3-demo-inner">
          <div>
            <Eyebrow>{t.demo}</Eyebrow>
            <h2>{t.try}</h2>
            <p>{t.demoOnly}</p>
          </div>
          <div className="p3-demo-links">
            <Link href="/demo/guest" data-motion-reveal>
              <span>01</span>
              <b>{t.guest}</b>
              <i>→</i>
            </Link>
            <Link
              href="/demo/dashboard"
              data-motion-reveal
              data-motion-index="1"
            >
              <span>02</span>
              <b>{t.dashboard}</b>
              <i>→</i>
            </Link>
            <Link
              href="/demo/super-admin"
              data-motion-reveal
              data-motion-index="2"
            >
              <span>03</span>
              <b>{t.admin}</b>
              <i>→</i>
            </Link>
          </div>
        </div>
      </section>
      <section className="p3-home-end p3-wrap">
        <div data-motion-reveal="left">
          <Eyebrow>
            {locale === "uz"
              ? "BIZ HAQIMIZDA"
              : locale === "ru"
                ? "О НАС"
                : "ABOUT UNIBOS"}
          </Eyebrow>
          <h2>{t.aboutTitle}</h2>
          <p>{t.aboutLead}</p>
          <Link className="p3-text-link" href="/about">
            {t.nav[4]} <span>→</span>
          </Link>
        </div>
        <Image
          src="/images/p3/about-scene-v2.jpg"
          alt="Restoran interyeri"
          width={400}
          height={300}
          data-motion-reveal="scale"
        />
      </section>
      <P3HomeAdditions locale={locale} />
    </>
  );
}

function Solutions({
  t,
  locale,
}: {
  t: (typeof labels)[Locale];
  locale: Locale;
}) {
  return (
    <>
      <section className="p3-subhero p3-solutions-hero">
        <div className="p3-wrap p3-solutions-heading">
          <div className="p3-solutions-intro" data-motion-reveal="left">
            <Eyebrow>{t.solutionsEyebrow}</Eyebrow>
            <h1>{t.solutionsTitle}</h1>
            <p>{t.solutionsLead}</p>
          </div>
          <P3SolutionsShowcase locale={locale} />
        </div>
      </section>
      <section className="p3-solutions-more">
        <div className="p3-wrap p3-solutions-content">
          <div
            className="p3-solutions-details-heading"
            data-motion-reveal="left"
          >
            <Eyebrow>{t.solutions}</Eyebrow>
            <h2>{t.modules}</h2>
            <p>{t.modulesLead}</p>
          </div>
          <P3SolutionsWorkflow locale={locale} />
          <P3ProductModules locale={locale} />
          <div className="p3-integrity-note">
            <span>✦</span>
            <p>{t.demoOnly}</p>
          </div>
        </div>
      </section>
    </>
  );
}

function Pricing({ t }: { t: (typeof labels)[Locale] }) {
  const [billing, setBilling] = useState<"monthly" | "yearly">("monthly");

  return (
    <section className="p3-pricing-page">
      <div className="p3-wrap p3-pricing-grid">
        <div className="p3-pricing-intro" data-motion-reveal="left">
          <Eyebrow>{t.nav[2]}</Eyebrow>
          <h1>{t.pricingTitle}</h1>
          <p>{t.pricingLead}</p>
          <span className="p3-pricing-stamp">{t.pricingDemoNote}</span>
          <div
            className="p3-billing-toggle"
            role="group"
            aria-label={t.pricingTitle}
          >
            <button
              type="button"
              aria-pressed={billing === "monthly"}
              onClick={() => setBilling("monthly")}
            >
              {t.billingMonthly}
            </button>
            <button
              type="button"
              aria-pressed={billing === "yearly"}
              onClick={() => setBilling("yearly")}
            >
              {t.billingYearly}
            </button>
          </div>
        </div>
        {[...t.pricingPlans]
          .sort(
            (left, right) =>
              pricingPlanOrder.indexOf(left.name) -
              pricingPlanOrder.indexOf(right.name),
          )
          .map((plan) => (
            <article
              className={`p3-price-card${plan.name === "Business" ? " featured" : ""}`}
              data-motion-reveal="up"
              data-motion-index={
                plan.name === "Pro" ? 2 : plan.name === "Business" ? 1 : 0
              }
              key={plan.name}
            >
              <h2 className="p3-plan-name">{plan.name}</h2>
              <span className="p3-plan-status">{plan.status}</span>
              <b className="p3-price-pending">
                {billing === "monthly" ? plan.monthly : t.yearlyPending}
              </b>
              <small>
                {billing === "monthly" ? plan.monthlyNote : t.yearlyPending}
              </small>
              <ul>
                {plan.features.map((feature) => (
                  <li key={feature}>
                    <span aria-hidden="true">—</span>
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/faq#pricing"
                className={
                  plan.name === "Business"
                    ? "p3-button p3-button-gold"
                    : "p3-button p3-button-outline"
                }
              >
                {t.pricingCta}
                <span>→</span>
              </Link>
            </article>
          ))}
      </div>
    </section>
  );
}

function About({ t }: { t: (typeof labels)[Locale] }) {
  return (
    <>
      <section className="p3-about-hero p3-wrap">
        <div data-motion-reveal="left">
          <Eyebrow>{t.nav[4]}</Eyebrow>
          <h1>{t.aboutTitle}</h1>
          <p>{t.aboutLead}</p>
        </div>
        <Image
          src="/images/p3/about-scene-v2.jpg"
          alt="Yorug‘ va zamonaviy restoran interyeri"
          width={520}
          height={340}
          data-motion-reveal="scale"
        />
      </section>
      <section className="p3-about-values">
        <div className="p3-wrap p3-values-grid">
          <div data-motion-reveal="left">
            <Eyebrow>{t.mission}</Eyebrow>
            <h2>{t.missionText}</h2>
          </div>
          <div className="p3-value-cards">
            {t.valuesText.map((value, index) => (
              <article key={value} data-motion-reveal data-motion-index={index}>
                <span>0{index + 1}</span>
                <b>{value}</b>
                <p>{t.modulesLead}</p>
              </article>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

function Contact({ t }: { t: (typeof labels)[Locale] }) {
  const [sent, setSent] = useState(false);

  return (
    <section className="p3-contact-page p3-wrap">
      <div className="p3-contact-copy" data-motion-reveal="left">
        <Eyebrow>{t.contactNav}</Eyebrow>
        <h1>{t.contactTitle}</h1>
        <p>{t.contactLead}</p>
        <div className="p3-contact-status">
          <span>✦</span>
          <div>
            <b>{t.contactSoon}</b>
            <small>{t.noForm}</small>
          </div>
        </div>
      </div>
      <div className="p3-contact-card" data-motion-reveal="scale">
        <div
          className="p3-contact-form"
          role="group"
          aria-label={t.contactDemoNote}
        >
          <p className="p3-contact-demo-note">{t.contactDemoNote}</p>
          <div className="p3-contact-preview-fields">
            {[t.contactName, t.contactPhone, t.contactMessage].map((label) => (
              <div className="p3-contact-preview-row" key={label}>
                <span>{label}</span>
                <span aria-hidden="true" />
              </div>
            ))}
          </div>
          <button
            className="p3-button p3-button-dark"
            type="button"
            onClick={() => setSent(true)}
          >
            {t.contactSend}
            <span>→</span>
          </button>
          {sent && (
            <p className="p3-contact-result" role="status">
              {t.contactNoSendStatus}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function CorporateShell({
  t,
  page,
  locale,
  dark,
  onLocaleChange,
  onTheme,
  children,
}: {
  t: (typeof labels)[Locale];
  page: string;
  locale: Locale;
  dark: boolean;
  onLocaleChange: (locale: Locale) => void;
  onTheme: () => void;
  children: ReactNode;
}) {
  return (
    <section className={`p3-corp-page${dark ? " p3-corp-dark" : ""}`}>
      <aside className="p3-corp-rail">
        <Link href="/" className="p3-corp-logo">
          <Image
            src="/brand/mark-dark.svg"
            alt=""
            width={28}
            height={32}
            unoptimized
          />
          <b>UniBOS</b>
        </Link>
        <small>{page}</small>
        <nav>
          <Link href="/demo/dashboard">
            ▦ <span>{t.dashboardTitle}</span>
          </Link>
          <Link href="/demo/guest">
            ▤ <span>{t.guest}</span>
          </Link>
          <Link href="/demo/super-admin">
            ♧ <span>{t.superAdmin}</span>
          </Link>
          <Link href="/">
            ⌂ <span>{t.nav[0]}</span>
          </Link>
        </nav>
        <span className="p3-corp-rail-bottom">DEMO</span>
      </aside>
      <div className="p3-corp-main">
        <header>
          <span>{t.all}⌄</span>
          <Link href="/demo/guest">{t.guest} →</Link>
          <label className="sr-only" htmlFor="corp-locale">
            Language
          </label>
          <select
            id="corp-locale"
            value={locale}
            onChange={(event) => onLocaleChange(event.target.value as Locale)}
            aria-label="Choose language"
          >
            <option value="uz">UZ</option>
            <option value="ru">RU</option>
            <option value="en">EN</option>
          </select>
          <button
            type="button"
            className="p3-corp-theme"
            onClick={onTheme}
            aria-label={dark ? "Light mode" : "Dark mode"}
          >
            {dark ? "☼" : "◐"}
          </button>
          <span className="p3-corp-avatar">U</span>
        </header>
        <div className="p3-corp-content">{children}</div>
      </div>
    </section>
  );
}

function Dashboard({
  t,
  locale,
  dark,
  onLocaleChange,
  onTheme,
}: {
  t: (typeof labels)[Locale];
  locale: Locale;
  dark: boolean;
  onLocaleChange: (locale: Locale) => void;
  onTheme: () => void;
}) {
  return (
    <CorporateShell
      t={t}
      page={t.dashboardTitle}
      locale={locale}
      dark={dark}
      onLocaleChange={onLocaleChange}
      onTheme={onTheme}
    >
      <div className="p3-corp-title">
        <div>
          <Eyebrow>{t.dashboardTitle}</Eyebrow>
          <h1>{t.dashboardTitle}</h1>
          <p>{t.today} · Green Table Restaurant</p>
        </div>
        <span className="p3-demo-stamp">{t.sample}</span>
      </div>
      <div className="p3-dashboard-metrics">
        {[
          [t.sales, "12 460 000 so‘m", "+12%"],
          [t.orders, "148", "+8%"],
          [t.check, "84 200 so‘m", "+4%"],
          [t.tables, "18 / 24", "75%"],
        ].map(([title, value, trend]) => (
          <article key={title}>
            <small>{title}</small>
            <b>{value}</b>
            <span>{trend}</span>
          </article>
        ))}
      </div>
      <div className="p3-dashboard-panels">
        <section className="p3-corp-panel p3-sales-panel">
          <div className="p3-panel-title">
            <b>{t.chart}</b>
            <span>{t.today}⌄</span>
          </div>
          <div className="p3-sales-chart" aria-label={t.sample}>
            {[32, 50, 42, 65, 51, 75, 68, 55, 83, 69, 92, 78].map(
              (height, index) => (
                <i key={index} style={{ height: `${height}%` }} />
              ),
            )}
          </div>
          <div className="p3-chart-labels">
            <span>09:00</span>
            <span>12:00</span>
            <span>15:00</span>
            <span>18:00</span>
            <span>21:00</span>
          </div>
        </section>
        <section className="p3-corp-panel p3-order-panel">
          <div className="p3-panel-title">
            <b>{t.orderTypes}</b>
            <span>DEMO</span>
          </div>
          <div className="p3-donut" />
          <ul>
            <li>
              <span>● {t.moduleNames[0]}</span>
              <b>62%</b>
            </li>
            <li>
              <span>● QR {t.guest}</span>
              <b>24%</b>
            </li>
            <li>
              <span>● {t.moduleNames[1]}</span>
              <b>14%</b>
            </li>
          </ul>
        </section>
      </div>
      <p className="p3-corp-footnote">{t.sample}</p>
    </CorporateShell>
  );
}

function Admin({
  t,
  locale,
  dark,
  onLocaleChange,
  onTheme,
}: {
  t: (typeof labels)[Locale];
  locale: Locale;
  dark: boolean;
  onLocaleChange: (locale: Locale) => void;
  onTheme: () => void;
}) {
  const [query, setQuery] = useState("");
  const visibleRows = adminRows.filter((row) =>
    row[0].toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  const statusLabel = (status: string) =>
    status === "Faol"
      ? locale === "uz"
        ? "Faol"
        : locale === "ru"
          ? "Активен"
          : "Active"
      : locale === "uz"
        ? "Namuna"
        : locale === "ru"
          ? "Пример"
          : "Sample";
  return (
    <CorporateShell
      t={t}
      page={t.superAdmin}
      locale={locale}
      dark={dark}
      onLocaleChange={onLocaleChange}
      onTheme={onTheme}
    >
      <div className="p3-corp-title">
        <div>
          <Eyebrow>{t.superAdmin}</Eyebrow>
          <h1>{t.organization}</h1>
          <p>{t.sample}</p>
        </div>
        <span className="p3-demo-stamp">DEMO · SAMPLE WORKSPACE</span>
      </div>
      <section className="p3-corp-panel p3-admin-table-wrap">
        <div className="p3-admin-toolbar">
          <input
            aria-label={t.organization}
            placeholder={t.organization + "…"}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="p3-table-scroll">
          <table className="p3-admin-table">
            <thead>
              <tr>
                <th>{t.organization}</th>
                <th>{t.status}</th>
                <th>{t.plan}</th>
                <th>{t.date}</th>
                <th>⋯</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, index) => (
                <tr key={row[0]}>
                  <td>
                    <span className="p3-restaurant-icon">{index + 1}</span>
                    <b>{row[0]}</b>
                  </td>
                  <td>
                    <span className="p3-sample-status">
                      {statusLabel(row[1])}
                    </span>
                  </td>
                  <td>{row[2]}</td>
                  <td>{row[3]}</td>
                  <td>···</td>
                </tr>
              ))}
            </tbody>
          </table>
          {visibleRows.length === 0 && (
            <p className="p3-admin-empty">
              {locale === "uz"
                ? "Mos restoran topilmadi."
                : locale === "ru"
                  ? "Рестораны не найдены."
                  : "No matching restaurants."}
            </p>
          )}
        </div>
        <p className="p3-corp-footnote">{t.sample}</p>
      </section>
    </CorporateShell>
  );
}
