import Link from "next/link";
import styles from "./p3-content.module.css";

export type P3Locale = "uz" | "ru" | "en";
export type ExtendedPage = "demoHub" | "security" | "investors" | "faq";

const copy = {
  uz: {
    demoHub: {
      eyebrow: "MAHSULOT DEMOLARI",
      title: "UniBOS’ni o‘zingiz ko‘ring",
      lead: "Haqiqiy hisob ochmasdan uchta demo yo‘nalishni o‘rganing. Buyurtma, to‘lov yoki mijoz ma’lumotlari yuborilmaydi.",
      cards: [
        {
          title: "Restoran boshqaruvi",
          label: "Restoran egasi",
          description:
            "Global Corporate uslubidagi panel va faqat namuna ko‘rsatkichlari.",
          note: "Ma’lumotlar uydirma, real restoran bilan bog‘lanmagan.",
          href: "/demo/dashboard",
          action: "Dashboard demosi",
        },
        {
          title: "Mehmon QR menyusi",
          label: "Mehmon",
          description:
            "Menyu kategoriyalarini ko‘ring va brauzer ichida demo savatni sinang.",
          note: "Buyurtma ham, to‘lov ham yuborilmaydi.",
          href: "/demo/guest",
          action: "QR menyuni ochish",
        },
        {
          title: "Platforma administratori",
          label: "Administrator",
          description: "Super Admin interfeysining namuna ko‘rinishi.",
          note: "Bu demo; ishlaydigan platforma-admin API’si yo‘q.",
          href: "/demo/super-admin",
          action: "Namuna interfeys",
        },
      ],
    },
    security: {
      eyebrow: "ISHONCH VA XAVFSIZLIK",
      title: "Xavfsizlik — mahsulot poydevorining bir qismi",
      lead: "Quyidagi nazoratlar P2 kod bazasi va lokal sinovlarga asoslangan. Ular ushbu Vercel preview’da ulangan production himoyasi yoki mustaqil sertifikat degani emas.",
      implemented: "Kod va lokal testlarda amalga oshirilgan",
      controls: [
        [
          "Hisob va seanslar",
          "Parolni tekshirish, seansni bekor qilish va TOTP yoki bir martalik tiklash kodi bilan MFA uchun Better Auth ishlatiladi.",
        ],
        [
          "Yaqinda tasdiqlangan MFA",
          "Sezgir hisob amallari uchun server 15 daqiqalik MFA tasdig‘ini tekshiradi. Faqat MFA yoqilganligi tasdiq o‘rnini bosmaydi.",
        ],
        [
          "Tashkilotlararo ajratish",
          "API a’zolikni serverda tekshiradi; lokal Postgres testlarida RLS va filial doirasi bo‘yicha ruxsatsiz kirish tekshiriladi.",
        ],
        [
          "So‘rov himoyasi va audit",
          "Ishonchli origin tekshiruvi, chegaralangan so‘rovlar, atomik rate limit va oddiy ilova rollari o‘zgartira olmaydigan ruxsatlar auditi.",
        ],
      ],
      notLive:
        "Preview’da mavjud bo‘lmagan yoki keyinroq talab qilinadigan nazoratlar",
      planned: [
        "Vercel preview’da autentifikatsiya backend’i ulanmagan; demo hisob ma’lumotlarini so‘ramang va kiritmang.",
        "Production uchun tasdiqlangan HTTPS API, email tasdiqlash/yetkazish, monitoring va hodisaga javob jarayoni kerak.",
        "Zaxira nusxasini tiklash sinovi, tashqi audit saqlovi, ma’lumot joylashuvi hamda qonuniy talablar launch’dan oldin tekshiriladi.",
        "UniBOS hozircha uchinchi tomon xavfsizlik sertifikati yoki compliance tasdig‘ini da’vo qilmaydi.",
      ],
      boundary:
        "Super Admin demo — faqat interfeys. U ishlab turgan platforma administratori yoki tenantlararo kirish bermaydi.",
      action: "Xavfsizlik bo‘yicha FAQ",
    },
    investors: {
      eyebrow: "INVESTORLAR VA HAMKORLAR",
      title: "Restoranlardan boshlanadigan yagona biznes platformasi",
      lead: "UniBOS’ning maqsadi — kundalik biznes jarayonlarini bitta modulli tizimda birlashtirish. Dastlabki yo‘nalish restoran va kafelar; boshqa sohalarga kengayish keyingi bosqichlar uchun ko‘zda tutilgan.",
      sections: [
        [
          "Muammo",
          "Restoran jarayonlari ko‘pincha alohida vositalarga tarqaladi. Bunday parchalanish ish oqimini kuzatish va jamoa uchun yagona ko‘rinishni saqlashni qiyinlashtirishi mumkin.",
        ],
        [
          "Yondashuv",
          "Mehmon menyusidan boshqaruv paneligacha bo‘lgan tajribani yagona platforma sifatida loyihalash. Hozir ko‘rsatilgan sahifalar — demo va interfeys namunalari.",
        ],
        [
          "Biznes modeli",
          "Filial va modul imkoniyatlariga mos obuna modeli — tekshirilayotgan gipoteza. Narxlar, billing va to‘lov integratsiyasi tasdiqlanmagan.",
        ],
        [
          "Yo‘l xaritasi",
          "MFA, seans va tenantga ajratilgan API poydevori lokal testlangan. Restoran operatsiyalari, monetizatsiya va tijoriy tayyorgarlik alohida validatsiya bosqichlarini talab qiladi.",
        ],
      ],
      tractionTitle: "O‘lchash rejalashtirilgan ko‘rsatkichlar",
      traction: [
        "Pilotga qiziqish va sinovdan boshlash ulushi",
        "Mehmon menyusi oqimidagi yakunlash vaqti",
        "Jamoaning haftalik foydalanishi va qaytishi",
        "Narx va obuna modelini tasdiqlash",
      ],
      note: "Bu sahifada daromad, mijozlar, o‘sish, bozor hajmi yoki investitsiya majburiyatlari haqida tasdiqlanmagan raqamlar yo‘q. Ko‘rsatkichlar — kelajakdagi validatsiya rejasi.",
      demoAction: "Mahsulot demolarini ko‘rish",
      contactAction: "Aloqa sahifasi",
    },
    faq: {
      eyebrow: "YORDAM VA SAVOLLAR",
      title: "UniBOS haqida ko‘p so‘raladigan savollar",
      lead: "Mahsulot holati, demo imkoniyatlari va xavfsizlik chegaralari haqida qisqa javoblar.",
      items: [
        [
          "UniBOS nima?",
          "Restoran va kafelardan boshlanayotgan modulli Business Operating System. Hozirgi sayt mahsulot yo‘nalishi va ayrim interfeys demolarini ko‘rsatadi.",
        ],
        [
          "Kimlar uchun mo‘ljallangan?",
          "Birinchi navbatda restoran egalari, operatorlar va jamoalar uchun. Boshqa vertikallar hozircha reja darajasida.",
        ],
        [
          "QR menyu buyurtmani restoranga yuboradimi?",
          "Yo‘q. Mehmon demo kategoriyalar va brauzer ichidagi savatni ko‘rsatadi. Buyurtma yoki to‘lov yuborilmaydi.",
        ],
        [
          "Demo va production o‘rtasidagi farq nima?",
          "Dashboard va Super Admin’dagi ko‘rsatkichlar namuna; QR savat lokal UI holati. Vercel preview’ga autentifikatsiya backend’i ulanmagan.",
        ],
        [
          "Narxlar tasdiqlanganmi?",
          "Yo‘q. Ko‘rsatilgan raqamlar JPG maketidan olingan vizual namuna va haqiqiy taklif emas. Yillik narx tasdiqlanmagan.",
        ],
        [
          "Qanday qurilmalar kerak?",
          "Demo zamonaviy telefon, planshet va desktop brauzerlarida ko‘rish uchun moslangan. NFC apparat yoki haqiqiy stol tokeni ulangan deb da’vo qilinmaydi.",
        ],
        [
          "Ma’lumotlar xavfsizligi qanday?",
          "Lokal kod va testlarda seans, MFA, origin tekshiruvi va tenant ajratish nazoratlari bor. Bular production deploy, tashqi audit yoki sertifikatni anglatmaydi.",
        ],
        [
          "Onboarding qachon ishlaydi?",
          "Hozir to‘liq self-service onboarding yoki production hisob yaratish ochilmagan. Ishga tushirish shartlari tasdiqlangach ma’lumot yangilanadi.",
        ],
        [
          "Aloqa formasi xabar yuboradimi?",
          "Yo‘q. Aloqa sahifasi faqat xavfsiz demo ko‘rinishi; maydonlar ma’lumot yig‘maydi va xabar jo‘natilmaydi.",
        ],
      ],
      action: "Mahsulot demolarini ochish",
    },
    home: {
      eyebrow: "BIRINCHI QADAMLAR",
      title: "Bir ish oqimi. Besh tushunarli qadam.",
      steps: [
        [
          "Ish maydoni",
          "Biznes ish maydoni va hisob yaratish — rejalashtirilgan bosqich.",
        ],
        [
          "Restoran va filial",
          "Tashkilot/filial API poydevori mavjud; bu preview unga ulanmagan.",
        ],
        [
          "Menyu va stollar",
          "Menyu tarkibini sozlash va stolga ulash — mahsulot yo‘l xaritasida.",
        ],
        [
          "QR/NFC kirish",
          "Berilgan QR sahnasi vizual demo; haqiqiy stol tokeni yoki NFC amali yo‘q.",
        ],
        [
          "Tajribani ko‘rish",
          "Hozir ishlaydigan demo: menyu kategoriyalari va lokal savat. Buyurtma yuborilmaydi.",
        ],
      ],
      trustTitle: "Ishonch va xavfsizlikni boshidan loyihalaymiz",
      trustBody:
        "Lokal kod/testlarda MFA, rollar va tenant ajratish poydevori bor. Preview production backend yoki sertifikatlangan tizim emas.",
      securityAction: "Xavfsizlik yondashuvi",
      audiences: [
        [
          "Restoran egasi",
          "Menyu va boshqaruv demolarini o‘rganing.",
          "Demo hub",
          "/demo",
        ],
        [
          "Investor",
          "Mahsulot yo‘nalishi, model gipotezasi va validatsiya rejasini ko‘ring.",
          "Investorlar sahifasi",
          "/investors",
        ],
        [
          "Hamkor",
          "Platforma modullari va mavjudlik holatini ko‘rib chiqing.",
          "Yechimlar",
          "/solutions",
        ],
      ],
    },
    modules: [
      [
        "Raqamli menyu",
        "Mehmon interfeysini ko‘rish va kategoriyalarni sinash.",
        "Interaktiv demo",
        "/demo/guest",
      ],
      [
        "QR / NFC kirish",
        "Maketda QR/NFC stendi bor; haqiqiy stol tokeni preview’da yo‘q.",
        "Vizual demo",
        "/demo/guest",
      ],
      [
        "Buyurtmalar",
        "Savat brauzerda ishlaydi, restoranga buyurtma yubormaydi.",
        "Savat demo",
        "/demo/guest",
      ],
      [
        "Oshxona oqimi",
        "Buyurtmani oshxonada boshqarish hali ishlaydigan modul emas.",
        "Rejada",
        "/faq#availability",
      ],
      [
        "Kassir",
        "Naqd pul va smena operatsiyalari yoqilmagan.",
        "Rejada",
        "/faq#availability",
      ],
      [
        "Tashkilot va filiallar",
        "API poydevori lokal testlangan, preview backend’iga ulanmagan.",
        "API poydevori",
        "/demo/workspace",
      ],
      [
        "Xodimlar va smenalar",
        "Jamoa va smena boshqaruvi hali chiqarilmagan.",
        "Rejada",
        "/faq#availability",
      ],
      [
        "Analitika",
        "Paneldagi ko‘rsatkichlar uydirma namuna ma’lumotlari.",
        "Dashboard demo",
        "/demo/dashboard",
      ],
      [
        "Ombor va ta’minot",
        "Ombor qoldig‘i va xaridlar boshqaruvi hali chiqarilmagan.",
        "Rejada",
        "/faq#availability",
      ],
      [
        "Moliya",
        "Moliyaviy hisobotlar yoki ledger amallari bu P3 preview’da yo‘q.",
        "Rejada",
        "/faq#availability",
      ],
      [
        "Obunalar",
        "Tariflar faqat tasviriy; haqiqiy billing mavjud emas.",
        "Tarif demo",
        "/pricing",
      ],
    ],
    solutionsWorkflow: [
      ["Mehmon tajribasi", "Interaktiv QR menyu demo", "/demo/guest"],
      ["Buyurtma", "Faqat lokal demo savat", "/demo/guest"],
      ["Oshxona", "Rejalashtirilgan modul", "/faq#availability"],
      ["Kassir", "Rejalashtirilgan modul", "/faq#availability"],
      ["Boshqaruv", "Uydirma ma’lumotli demo panel", "/demo/dashboard"],
      ["Analitika", "Namuna ko‘rsatkichlar", "/demo/dashboard"],
    ],
  },
  en: {
    demoHub: {
      eyebrow: "PRODUCT DEMOS",
      title: "Explore UniBOS for yourself",
      lead: "Explore three demo paths without creating a real account. No order, payment or customer record is sent.",
      cards: [
        {
          title: "Restaurant operations",
          label: "Restaurant owner",
          description:
            "A Global Corporate dashboard with illustrative sample metrics.",
          note: "Data is fictional and is not connected to a restaurant.",
          href: "/demo/dashboard",
          action: "Dashboard demo",
        },
        {
          title: "Guest QR menu",
          label: "Guest",
          description:
            "Browse menu categories and try a browser-local demo cart.",
          note: "No order or payment is submitted.",
          href: "/demo/guest",
          action: "Open QR menu",
        },
        {
          title: "Platform administration",
          label: "Administrator",
          description: "A sample view of the Super Admin interface.",
          note: "This is a UI demo; there is no live platform-admin API.",
          href: "/demo/super-admin",
          action: "Sample interface",
        },
      ],
    },
    security: {
      eyebrow: "TRUST AND SECURITY",
      title: "Security is part of the product foundation",
      lead: "The controls below are based on the P2 codebase and local tests. They do not mean production protections are connected to this Vercel preview or imply an independent certification.",
      implemented: "Implemented in code and local tests",
      controls: [
        [
          "Accounts and sessions",
          "Self-hosted Better Auth handles password verification, session revocation, and MFA with TOTP or one-time recovery codes.",
        ],
        [
          "Recent MFA assurance",
          "The server checks a 15-minute MFA assurance window for sensitive account actions. Merely enabling MFA does not count as verification.",
        ],
        [
          "Tenant separation",
          "The API verifies membership server-side; local Postgres tests exercise RLS and branch-scoped denial cases.",
        ],
        [
          "Request safeguards and audit",
          "Exact trusted-origin checks, bounded requests, atomic rate limits and permission audit records ordinary app roles cannot change.",
        ],
      ],
      notLive:
        "Controls not present in this preview or still required before launch",
      planned: [
        "The Vercel preview has no authentication backend connected; do not request or enter demo credentials.",
        "Production needs an approved HTTPS API, verified email delivery, monitoring and an incident response process.",
        "Backup-restore drills, external audit retention, data residency and legal requirements need review before launch.",
        "UniBOS does not claim a third-party security certification or compliance approval.",
      ],
      boundary:
        "The Super Admin demo is an interface sample. It provides no live platform administration or cross-tenant access.",
      action: "Security FAQ",
    },
    investors: {
      eyebrow: "INVESTORS AND PARTNERS",
      title: "One business platform, starting with restaurants",
      lead: "UniBOS aims to connect everyday business workflows in one modular system. Restaurants and cafés are the initial focus; expansion to other industries is a future direction.",
      sections: [
        [
          "The problem",
          "Restaurant workflows are often spread across separate tools. That fragmentation can make it harder to follow work and maintain a shared view for the team.",
        ],
        [
          "The approach",
          "Design the guest menu through management experience as one platform. Pages shown today are demos and interface samples.",
        ],
        [
          "Business model",
          "A subscription model organized around locations and modules is a hypothesis under validation. Pricing, billing and payment integrations are not approved.",
        ],
        [
          "Roadmap",
          "The MFA, session and tenant-scoped API foundation has local test coverage. Restaurant operations, monetization and commercial readiness need separate validation gates.",
        ],
      ],
      tractionTitle: "Measures planned for validation",
      traction: [
        "Pilot interest and trial-start rate",
        "Guest menu flow completion time",
        "Weekly team usage and return visits",
        "Pricing and subscription model validation",
      ],
      note: "This page contains no unverified revenue, customer, growth, market-size or investment figures. The measures listed are a future validation plan.",
      demoAction: "Explore product demos",
      contactAction: "Contact page",
    },
    faq: {
      eyebrow: "HELP AND FAQ",
      title: "Common questions about UniBOS",
      lead: "Short answers about product status, demo behavior and security boundaries.",
      items: [
        [
          "What is UniBOS?",
          "A modular Business Operating System starting with restaurants and cafés. The current site shows the product direction and selected interface demos.",
        ],
        [
          "Who is it for?",
          "Initially restaurant owners, operators and teams. Other verticals are currently a future direction.",
        ],
        [
          "Does the QR menu send an order to a restaurant?",
          "No. The guest demo shows categories and a browser-local cart. No order or payment is submitted.",
        ],
        [
          "What is the difference between a demo and production?",
          "Dashboard and Super Admin metrics are samples; the QR cart is local UI state. The Vercel preview has no authentication backend connected.",
        ],
        [
          "Are the prices approved?",
          "No. The displayed values are visual samples from the JPG references, not a commercial offer. Annual pricing is unconfirmed.",
        ],
        [
          "Which devices are supported?",
          "The demo is responsive in modern phone, tablet and desktop browsers. No NFC hardware or live table token is connected.",
        ],
        [
          "How is data protected?",
          "The local code and tests include session, MFA, origin and tenant-separation controls. This does not imply production deployment, external audit or certification.",
        ],
        [
          "When can I onboard?",
          "Self-service onboarding and production account creation are not open yet. Availability will be updated after launch requirements are approved.",
        ],
        [
          "Does the contact form send a message?",
          "No. The contact page is a safe interface preview; fields do not collect data and no message is sent.",
        ],
      ],
      action: "Open product demos",
    },
    home: {
      eyebrow: "HOW IT STARTS",
      title: "One workflow. Five clear steps.",
      steps: [
        [
          "Workspace",
          "Creating a business workspace and account is a planned step.",
        ],
        [
          "Restaurant and branches",
          "An organization/branch API foundation exists; this preview is not connected to it.",
        ],
        [
          "Menu and tables",
          "Configuring the menu and linking tables is on the product roadmap.",
        ],
        [
          "QR/NFC access",
          "The QR scene is a visual demo; no live table token or NFC action is connected.",
        ],
        [
          "Explore the experience",
          "The working demo supports menu categories and a local cart. No order is submitted.",
        ],
      ],
      trustTitle: "Trust and security are designed in from the start",
      trustBody:
        "The local code/tests include MFA, roles and tenant-separation foundations. The preview is not a production backend or certified system.",
      securityAction: "Security approach",
      audiences: [
        [
          "Restaurant owner",
          "Explore the menu and management demos.",
          "Demo hub",
          "/demo",
        ],
        [
          "Investor",
          "Review the product direction, model hypothesis and validation plan.",
          "Investor overview",
          "/investors",
        ],
        [
          "Partner",
          "See the product modules and their current availability.",
          "Solutions",
          "/solutions",
        ],
      ],
    },
    modules: [
      [
        "Digital menu",
        "Explore the guest interface and try menu categories.",
        "Interactive demo",
        "/demo/guest",
      ],
      [
        "QR / NFC access",
        "The reference scene shows a stand; live table tokens are not in this preview.",
        "Visual demo",
        "/demo/guest",
      ],
      [
        "Orders",
        "The cart runs in the browser and does not submit restaurant orders.",
        "Cart demo",
        "/demo/guest",
      ],
      [
        "Kitchen workflow",
        "Kitchen order operations are not a live module yet.",
        "Planned",
        "/faq#availability",
      ],
      [
        "Cashier",
        "Cash and shift operations are not enabled.",
        "Planned",
        "/faq#availability",
      ],
      [
        "Organization and branches",
        "API foundation has local tests; it is not connected to the preview backend.",
        "API foundation",
        "/demo/workspace",
      ],
      [
        "Staff and shifts",
        "Team and shift management has not shipped.",
        "Planned",
        "/faq#availability",
      ],
      [
        "Analytics",
        "Dashboard metrics are fictional sample data.",
        "Dashboard demo",
        "/demo/dashboard",
      ],
      [
        "Inventory and supply",
        "Stock and purchasing operations have not shipped.",
        "Planned",
        "/faq#availability",
      ],
      [
        "Finance",
        "Financial reports and ledger workflows are not in this P3 preview.",
        "Planned",
        "/faq#availability",
      ],
      [
        "Subscriptions",
        "Plan cards are illustrative; live billing is not available.",
        "Pricing demo",
        "/pricing",
      ],
    ],
    solutionsWorkflow: [
      ["Guest experience", "Interactive QR menu demo", "/demo/guest"],
      ["Orders", "Browser-local demo cart only", "/demo/guest"],
      ["Kitchen", "Planned module", "/faq#availability"],
      ["Cashier", "Planned module", "/faq#availability"],
      ["Management", "Dashboard demo with fictional data", "/demo/dashboard"],
      ["Analytics", "Illustrative sample metrics", "/demo/dashboard"],
    ],
  },
  ru: {
    demoHub: {
      eyebrow: "ДЕМОНСТРАЦИИ ПРОДУКТА",
      title: "Изучите UniBOS самостоятельно",
      lead: "Откройте три демонстрационных сценария без создания настоящего аккаунта. Заказы, платежи и данные клиентов не отправляются.",
      cards: [
        {
          title: "Работа ресторана",
          label: "Владелец ресторана",
          description:
            "Панель Global Corporate с иллюстративными показателями.",
          note: "Данные вымышлены и не связаны с рестораном.",
          href: "/demo/dashboard",
          action: "Демо панели",
        },
        {
          title: "QR-меню гостя",
          label: "Гость",
          description:
            "Просматривайте категории меню и пробуйте демо-корзину в браузере.",
          note: "Заказ и оплата не отправляются.",
          href: "/demo/guest",
          action: "Открыть QR-меню",
        },
        {
          title: "Администрирование платформы",
          label: "Администратор",
          description: "Пример интерфейса Super Admin.",
          note: "Это демо интерфейса; действующего API администратора нет.",
          href: "/demo/super-admin",
          action: "Пример интерфейса",
        },
      ],
    },
    security: {
      eyebrow: "ДОВЕРИЕ И БЕЗОПАСНОСТЬ",
      title: "Безопасность — часть основы продукта",
      lead: "Ниже описаны меры в кодовой базе P2 и локальных тестах. Это не означает, что production-защита подключена к этому preview в Vercel или что есть независимая сертификация.",
      implemented: "Реализовано в коде и локальных тестах",
      controls: [
        [
          "Аккаунты и сеансы",
          "Self-hosted Better Auth отвечает за проверку пароля, отзыв сессии и MFA через TOTP или одноразовые коды восстановления.",
        ],
        [
          "Недавнее подтверждение MFA",
          "Сервер проверяет 15-минутное окно подтверждения MFA для чувствительных операций. Одного включения MFA недостаточно.",
        ],
        [
          "Разделение арендаторов",
          "API проверяет членство на сервере; локальные тесты Postgres проверяют RLS и ограничения доступа по филиалам.",
        ],
        [
          "Защита запросов и аудит",
          "Точная проверка trusted origin, ограничения запросов, атомарный rate limit и аудит прав, недоступный для изменения обычным ролям приложения.",
        ],
      ],
      notLive: "Меры, которых нет в preview или которые нужны до запуска",
      planned: [
        "К preview в Vercel не подключен backend аутентификации; не запрашивайте и не вводите демо-учётные данные.",
        "Для production нужны утверждённый HTTPS API, проверенная доставка email, мониторинг и процесс реагирования на инциденты.",
        "До запуска нужно проверить восстановление из резервной копии, внешнее хранение аудита, размещение данных и правовые требования.",
        "UniBOS не заявляет о сторонней сертификации безопасности или подтверждении соответствия.",
      ],
      boundary:
        "Демо Super Admin — только пример интерфейса. Оно не даёт доступ к администрированию платформы или данным разных арендаторов.",
      action: "FAQ по безопасности",
    },
    investors: {
      eyebrow: "ИНВЕСТОРЫ И ПАРТНЁРЫ",
      title: "Единая платформа бизнеса, начиная с ресторанов",
      lead: "UniBOS стремится объединить ежедневные бизнес-процессы в одной модульной системе. Начальное направление — рестораны и кафе; другие отрасли рассматриваются как будущее расширение.",
      sections: [
        [
          "Проблема",
          "Ресторанные процессы часто распределены по разным инструментам. Такая фрагментация может затруднить контроль работы и сохранение общей картины для команды.",
        ],
        [
          "Подход",
          "Проектировать путь от меню гостя до панели управления как единую платформу. Показанные сегодня страницы — демонстрации и примеры интерфейса.",
        ],
        [
          "Бизнес-модель",
          "Подписка с учётом филиалов и модулей — гипотеза на проверке. Цены, биллинг и платёжные интеграции не утверждены.",
        ],
        [
          "Дорожная карта",
          "Основы MFA, сессий и API с разделением арендаторов проверяются локально. Операции ресторана, монетизация и коммерческая готовность требуют отдельных этапов проверки.",
        ],
      ],
      tractionTitle: "Показатели для будущей проверки",
      traction: [
        "Интерес к пилоту и начало пробного использования",
        "Время прохождения гостевого меню",
        "Еженедельное использование и возвраты команды",
        "Проверка цен и модели подписки",
      ],
      note: "На странице нет неподтверждённых показателей выручки, клиентов, роста, объёма рынка или инвестиционных обязательств. Перечислен план будущей проверки.",
      demoAction: "Открыть демо продукта",
      contactAction: "Страница контактов",
    },
    faq: {
      eyebrow: "ПОМОЩЬ И FAQ",
      title: "Частые вопросы о UniBOS",
      lead: "Короткие ответы о статусе продукта, демонстрациях и границах безопасности.",
      items: [
        [
          "Что такое UniBOS?",
          "Модульная Business Operating System, которая начинается с ресторанов и кафе. Текущий сайт показывает направление продукта и отдельные демо интерфейса.",
        ],
        [
          "Для кого он предназначен?",
          "В первую очередь для владельцев ресторанов, операторов и команд. Другие отрасли пока остаются будущим направлением.",
        ],
        [
          "QR-меню отправляет заказ в ресторан?",
          "Нет. Демо гостя показывает категории и локальную корзину в браузере. Заказ или оплата не отправляются.",
        ],
        [
          "Чем демо отличается от production?",
          "Показатели панели и Super Admin — примеры; QR-корзина хранит только состояние интерфейса. К preview в Vercel не подключён backend аутентификации.",
        ],
        [
          "Цены утверждены?",
          "Нет. Показанные суммы — визуальный пример из JPG-макетов, а не коммерческое предложение. Годовые цены не подтверждены.",
        ],
        [
          "Какие устройства поддерживаются?",
          "Демо адаптировано для современных браузеров телефонов, планшетов и компьютеров. NFC-оборудование и реальные коды столов не подключены.",
        ],
        [
          "Как защищаются данные?",
          "В локальном коде и тестах есть контроль сессий, MFA, origin и разделения арендаторов. Это не означает production-развёртывание, внешний аудит или сертификацию.",
        ],
        [
          "Когда станет доступно подключение?",
          "Self-service подключение и создание production-аккаунта пока закрыты. Информация обновится после утверждения условий запуска.",
        ],
        [
          "Контактная форма отправляет сообщение?",
          "Нет. Страница контактов — безопасный пример интерфейса; поля не собирают данные, сообщения не отправляются.",
        ],
      ],
      action: "Открыть демо продукта",
    },
    home: {
      eyebrow: "КАК ЭТО НАЧИНАЕТСЯ",
      title: "Единый процесс. Пять понятных шагов.",
      steps: [
        [
          "Рабочее пространство",
          "Создание пространства бизнеса и аккаунта — планируемый шаг.",
        ],
        [
          "Ресторан и филиалы",
          "Основа API организаций и филиалов есть; этот preview к ней не подключён.",
        ],
        [
          "Меню и столы",
          "Настройка меню и привязка столов включены в дорожную карту.",
        ],
        [
          "QR/NFC-доступ",
          "Сцена с QR — визуальное демо; реальные коды столов и NFC-действия не подключены.",
        ],
        [
          "Знакомство с продуктом",
          "Демо поддерживает категории меню и локальную корзину. Заказ не отправляется.",
        ],
      ],
      trustTitle: "Доверие и безопасность заложены в основу",
      trustBody:
        "В локальном коде и тестах есть основы MFA, ролей и разделения арендаторов. Preview не является production backend или сертифицированной системой.",
      securityAction: "Подход к безопасности",
      audiences: [
        [
          "Владелец ресторана",
          "Изучите меню и панель управления в демо.",
          "Демо-хаб",
          "/demo",
        ],
        [
          "Инвестор",
          "Ознакомьтесь с направлением продукта, гипотезой модели и планом проверки.",
          "Обзор для инвесторов",
          "/investors",
        ],
        [
          "Партнёр",
          "Посмотрите модули и их текущую доступность.",
          "Решения",
          "/solutions",
        ],
      ],
    },
    modules: [
      [
        "Цифровое меню",
        "Изучите интерфейс гостей и категории меню.",
        "Интерактивное демо",
        "/demo/guest",
      ],
      [
        "QR / NFC-доступ",
        "На макете есть стойка; реальные коды столов в preview не работают.",
        "Визуальное демо",
        "/demo/guest",
      ],
      [
        "Заказы",
        "Корзина работает в браузере и не отправляет заказ в ресторан.",
        "Демо корзины",
        "/demo/guest",
      ],
      [
        "Кухонный процесс",
        "Рабочий модуль управления заказами на кухне пока не выпущен.",
        "В планах",
        "/faq#availability",
      ],
      [
        "Кассир",
        "Операции наличных и смен пока не включены.",
        "В планах",
        "/faq#availability",
      ],
      [
        "Организация и филиалы",
        "Основа API проверена локально; к backend preview она не подключена.",
        "Основа API",
        "/demo/workspace",
      ],
      [
        "Сотрудники и смены",
        "Управление командой и сменами ещё не выпущено.",
        "В планах",
        "/faq#availability",
      ],
      [
        "Аналитика",
        "Показатели панели — вымышленные примеры.",
        "Демо панели",
        "/demo/dashboard",
      ],
      [
        "Запасы и поставки",
        "Операции учёта запасов и закупок ещё не выпущены.",
        "В планах",
        "/faq#availability",
      ],
      [
        "Финансы",
        "Финансовые отчёты и ledger-процессы отсутствуют в P3 preview.",
        "В планах",
        "/faq#availability",
      ],
      [
        "Подписки",
        "Тарифные карточки иллюстративны; биллинг не работает.",
        "Демо тарифов",
        "/pricing",
      ],
    ],
    solutionsWorkflow: [
      ["Опыт гостя", "Интерактивное демо QR-меню", "/demo/guest"],
      ["Заказы", "Только локальная демо-корзина", "/demo/guest"],
      ["Кухня", "Модуль в плане", "/faq#availability"],
      ["Кассир", "Модуль в плане", "/faq#availability"],
      ["Управление", "Демо панели с вымышленными данными", "/demo/dashboard"],
      ["Аналитика", "Иллюстративные показатели", "/demo/dashboard"],
    ],
  },
} as const;

export function P3HomeAdditions({ locale }: { locale: P3Locale }) {
  const t = copy[locale].home;
  return (
    <>
      <section className={styles.workflow} aria-labelledby="workflow-title">
        <div className="p3-wrap">
          <p className={styles.eyebrow}>{t.eyebrow}</p>
          <h2 id="workflow-title">{t.title}</h2>
          <ol className={styles.steps}>
            {t.steps.map(([title, detail], index) => (
              <li key={title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <b>{title}</b>
                  <p>{detail}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>
      <section className={styles.trust}>
        <div className="p3-wrap">
          <div>
            <p className={styles.eyebrow}>
              {locale === "uz"
                ? "XAVFSIZLIK"
                : locale === "ru"
                  ? "БЕЗОПАСНОСТЬ"
                  : "SECURITY"}
            </p>
            <h2>{t.trustTitle}</h2>
            <p>{t.trustBody}</p>
          </div>
          <Link href="/security">
            {t.securityAction}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
      </section>
      <section
        className={styles.audiences}
        aria-label={
          locale === "uz"
            ? "Keyingi qadamlar"
            : locale === "ru"
              ? "Следующие шаги"
              : "Next steps"
        }
      >
        <div className="p3-wrap">
          {t.audiences.map(([title, detail, action, href]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{detail}</p>
              <Link href={href}>
                {action}
                <span aria-hidden="true"> →</span>
              </Link>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

export function P3ProductModules({ locale }: { locale: P3Locale }) {
  const modules = copy[locale].modules;
  const title =
    locale === "uz"
      ? "Mahsulot modullari va hozirgi holati"
      : locale === "ru"
        ? "Модули продукта и их статус"
        : "Product modules and current status";
  return (
    <section className={styles.moduleSection} aria-label={title}>
      <p className={styles.moduleDisclosure}>
        {locale === "uz"
          ? "DEMO · REJADAGI MODULLAR ISHLAYDI DEB KO‘RSATILMAYDI"
          : locale === "ru"
            ? "ДЕМО · ПЛАНИРУЕМЫЕ МОДУЛИ НЕ ПРЕДСТАВЛЕНЫ КАК РАБОТАЮЩИЕ"
            : "DEMO · PLANNED MODULES ARE NOT PRESENTED AS LIVE"}
      </p>
      <div className={styles.modules}>
        {modules.map(([name, description, status, href], index) => (
          <Link className={styles.module} href={href} key={name}>
            <span className={styles.moduleNumber}>
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className={styles.moduleStatus}>{status}</span>
            <b>{name}</b>
            <p>{description}</p>
            <span className={styles.moduleArrow} aria-hidden="true">
              ↗
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function P3SolutionsWorkflow({ locale }: { locale: P3Locale }) {
  const steps = copy[locale].solutionsWorkflow;
  const label =
    locale === "uz"
      ? "Restoran ish oqimi"
      : locale === "ru"
        ? "Рабочий процесс ресторана"
        : "Restaurant workflow";
  return (
    <section className={styles.workflowOverview} aria-label={label}>
      <div className={styles.workflowSteps}>
        {steps.map(([name, status, href], index) => (
          <Link href={href} key={name}>
            <span>{String(index + 1).padStart(2, "0")}</span>
            <b>{name}</b>
            <small>{status}</small>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function P3ExtendedPage({
  page,
  locale,
}: {
  page: ExtendedPage;
  locale: P3Locale;
}) {
  if (page === "demoHub") {
    const t = copy[locale].demoHub;
    return (
      <section className={styles.page}>
        <div className="p3-wrap">
          <Header eyebrow={t.eyebrow} title={t.title} lead={t.lead} />
          <div className={styles.demoGrid}>
            {t.cards.map((card, index) => (
              <article className={styles.demoCard} key={card.href}>
                <span className={styles.moduleNumber}>0{index + 1}</span>
                <small>{card.label}</small>
                <h2>{card.title}</h2>
                <p>{card.description}</p>
                <p className={styles.note}>{card.note}</p>
                <Link href={card.href}>
                  {card.action}
                  <span aria-hidden="true"> →</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>
    );
  }
  if (page === "security") {
    const t = copy[locale].security;
    return (
      <section className={styles.page}>
        <div className="p3-wrap">
          <Header eyebrow={t.eyebrow} title={t.title} lead={t.lead} />
          <h2 className={styles.sectionTitle}>{t.implemented}</h2>
          <div className={styles.controlGrid}>
            {t.controls.map(([title, body], index) => (
              <article key={title}>
                <span className={styles.moduleNumber}>0{index + 1}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <h2 className={styles.sectionTitle}>{t.notLive}</h2>
          <ul className={styles.boundaries}>
            {t.planned.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className={styles.notice}>{t.boundary}</p>
          <Link className={styles.primaryLink} href="/faq#security">
            {t.action}
            <span aria-hidden="true"> →</span>
          </Link>
        </div>
      </section>
    );
  }
  if (page === "investors") {
    const t = copy[locale].investors;
    return (
      <section className={styles.page}>
        <div className="p3-wrap">
          <Header eyebrow={t.eyebrow} title={t.title} lead={t.lead} />
          <div className={styles.investorGrid}>
            {t.sections.map(([title, body], index) => (
              <article key={title}>
                <span className={styles.moduleNumber}>0{index + 1}</span>
                <h2>{title}</h2>
                <p>{body}</p>
              </article>
            ))}
          </div>
          <section className={styles.traction}>
            <h2>{t.tractionTitle}</h2>
            <ul>
              {t.traction.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p>{t.note}</p>
          </section>
          <div className={styles.actions}>
            <Link className={styles.primaryLink} href="/demo">
              {t.demoAction}
              <span aria-hidden="true"> →</span>
            </Link>
            <Link className={styles.secondaryLink} href="/contact">
              {t.contactAction}
              <span aria-hidden="true"> →</span>
            </Link>
          </div>
        </div>
      </section>
    );
  }
  const t = copy[locale].faq;
  return (
    <section className={styles.page} id="availability">
      <div className="p3-wrap">
        <Header eyebrow={t.eyebrow} title={t.title} lead={t.lead} />
        <div className={styles.faqList}>
          {t.items.map(([question, answer], index) => (
            <details id={index === 6 ? "security" : undefined} key={question}>
              <summary>
                <span>{question}</span>
                <b aria-hidden="true">+</b>
              </summary>
              <p>{answer}</p>
            </details>
          ))}
        </div>
        <Link className={styles.primaryLink} href="/demo">
          {t.action}
          <span aria-hidden="true"> →</span>
        </Link>
      </div>
    </section>
  );
}

function Header({
  eyebrow,
  title,
  lead,
}: {
  eyebrow: string;
  title: string;
  lead: string;
}) {
  return (
    <header className={styles.pageHeader}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h1>{title}</h1>
      <p>{lead}</p>
    </header>
  );
}
