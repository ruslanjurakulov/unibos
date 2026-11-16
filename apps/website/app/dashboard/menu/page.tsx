"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import WorkspaceNavigation from "../workspace-navigation";
import styles from "./menu.module.css";

type Capability = { id: string; name: string; capabilities: string[] };
type Branch = {
  id: string;
  name: string;
  capabilities: string[];
  navigation: Array<{ id: string; href: string }>;
};
type Organization = Capability & { branches: Branch[] };
type Category = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  active: boolean;
};
type Product = {
  id: string;
  category_id: string;
  category_name: string;
  name: string;
  description: string | null;
  image_key: string | null;
  active: boolean;
  available: boolean;
  price_version: string | null;
  price_minor: string | null;
  currency_code: string | null;
};
type PriceVersion = {
  id: string;
  price_minor: string;
  currency_code: string;
  effective_at: string;
};
type ApiResult = { response: Response; data: Record<string, unknown> };
type Language = "uz" | "ru" | "en";

const API_CONFIGURED = process.env.NEXT_PUBLIC_AUTH_CONFIGURED === "true";
const apiPath = (organizationId: string, suffix: string) =>
  `/api/organizations/${encodeURIComponent(organizationId)}/${suffix}`;
const branchPath = (organizationId: string, branchId: string, suffix: string) =>
  apiPath(organizationId, `branches/${encodeURIComponent(branchId)}/${suffix}`);

const copy = {
  uz: {
    title: "Katalog boshqaruvi",
    intro: "Mahsulotlar, kategoriyalar va filial narxlarini boshqaring.",
    loading: "Vakolatlar tekshirilmoqda…",
    unavailable:
      "Himoyalangan API ulanmagan. Katalog ma’lumoti ko‘rsatilmaydi.",
    noAccess: "Bu sahifaga kirish uchun katalog vakolati kerak.",
    noBranch: "Bu hisob uchun vakolatli filial topilmadi.",
    categories: "Kategoriyalar",
    products: "Mahsulotlar",
    categoryName: "Kategoriya nomi",
    addCategory: "Kategoriya qo‘shish",
    save: "Saqlash",
    archive: "Arxivlash",
    restore: "Faollashtirish",
    name: "Nomi",
    description: "Tavsif",
    category: "Kategoriya",
    chooseCategory: "Kategoriyani tanlang",
    imageKey: "Mahsulot rasmi kaliti",
    imageLimit:
      "Fayl yuklash ulangan emas; bu maydon faqat mavjud rasm kalitini saqlaydi.",
    price: "Narx (UZS)",
    priceHint: "Narx o‘zgarishi tarixga yangi versiya sifatida qo‘shiladi.",
    archivedPriceHint:
      "Mahsulot arxivlangan. Narxni o‘zgartirish uchun avval uni faollashtiring.",
    addProduct: "Mahsulot qo‘shish",
    search: "Mahsulot yoki kategoriyani qidirish",
    allCategories: "Barcha kategoriyalar",
    availability: "Filialda mavjud",
    unavailableProduct: "Filialda yo‘q",
    available: "Mavjud",
    notAvailable: "Mavjud emas",
    updateAvailability: "Mavjudlikni almashtirish",
    priceHistory: "Narxlar tarixi",
    hideHistory: "Tarixni yopish",
    currentPrice: "Joriy narx",
    noPrice: "Narx kiritilmagan",
    active: "Faol",
    inactive: "Arxivlangan",
    noCategories: "Hozircha kategoriya yo‘q.",
    noProducts: "Tanlangan filtrga mos mahsulot topilmadi.",
    refreshing: "Katalog yuklanmoqda…",
    refresh: "Yangilash",
    error: "So‘rov bajarilmadi. Ma’lumotlarni yangilab qayta urinib ko‘ring.",
    stale:
      "Mahsulot ma’lumotlari saqlandi, lekin narx versiyasi yangilandi. Joriy narxni tekshirib, qayta saqlang.",
    categoryAdded: "Kategoriya qo‘shildi.",
    categorySaved: "Kategoriya yangilandi.",
    productAdded: "Mahsulot qo‘shildi.",
    productAddedPriceFailed:
      "Mahsulot yaratildi, lekin narx tasdiqlanmadi. Yangilab, mahsulot narxini tekshiring.",
    productSaved: "Mahsulot yangilandi.",
    priceSaved: "Yangi narx versiyasi qo‘shildi.",
    availabilitySaved: "Filialdagi mavjudlik yangilandi.",
    archiveSaved: "Holat yangilandi.",
    tablesNote:
      "Stollar va QR tokenlar uchun P4 API mavjud; ushbu sahifada alohida boshqaruv oynasi hali yo‘q.",
    mfaRequired:
      "O‘zgartirishlar uchun yaqinda tasdiqlangan MFA seansi talab qilinadi.",
    unauthorized: "Seans yoki vakolat muddati tugagan. Qayta kiring.",
  },
  ru: {
    title: "Управление каталогом",
    intro: "Управляйте товарами, категориями и ценами филиала.",
    loading: "Проверка прав доступа…",
    unavailable:
      "Защищённый API не подключён. Данные каталога не отображаются.",
    noAccess: "Для этой страницы нужны права на каталог.",
    noBranch: "Для этой учётной записи нет доступного филиала.",
    categories: "Категории",
    products: "Товары",
    categoryName: "Название категории",
    addCategory: "Добавить категорию",
    save: "Сохранить",
    archive: "Архивировать",
    restore: "Активировать",
    name: "Название",
    description: "Описание",
    category: "Категория",
    chooseCategory: "Выберите категорию",
    imageKey: "Ключ изображения товара",
    imageLimit:
      "Загрузка файлов не подключена; поле хранит только ключ существующего изображения.",
    price: "Цена (UZS)",
    priceHint: "Изменение добавляется в историю новой версией.",
    archivedPriceHint:
      "Товар в архиве. Сначала активируйте его, чтобы изменить цену.",
    addProduct: "Добавить товар",
    search: "Поиск товара или категории",
    allCategories: "Все категории",
    availability: "Доступен в филиале",
    unavailableProduct: "Недоступен в филиале",
    available: "Доступен",
    notAvailable: "Недоступен",
    updateAvailability: "Изменить доступность",
    priceHistory: "История цен",
    hideHistory: "Скрыть историю",
    currentPrice: "Текущая цена",
    noPrice: "Цена не указана",
    active: "Активен",
    inactive: "В архиве",
    noCategories: "Категорий пока нет.",
    noProducts: "Товары по выбранному фильтру не найдены.",
    refreshing: "Загрузка каталога…",
    refresh: "Обновить",
    error: "Запрос не выполнен. Обновите данные и попробуйте снова.",
    stale:
      "Данные товара сохранены, но версия цены изменилась. Проверьте текущую цену и сохраните снова.",
    categoryAdded: "Категория добавлена.",
    categorySaved: "Категория обновлена.",
    productAdded: "Товар добавлен.",
    productAddedPriceFailed:
      "Товар создан, но цена не подтверждена. Обновите данные и проверьте цену.",
    productSaved: "Товар обновлён.",
    priceSaved: "Добавлена новая версия цены.",
    availabilitySaved: "Доступность в филиале обновлена.",
    archiveSaved: "Статус обновлён.",
    tablesNote:
      "API P4 для столов и QR токенов есть; отдельного интерфейса управления на этой странице пока нет.",
    mfaRequired: "Для изменений требуется недавно подтверждённая MFA сессия.",
    unauthorized: "Сеанс или права доступа истекли. Войдите снова.",
  },
  en: {
    title: "Catalog management",
    intro: "Manage products, categories and branch prices.",
    loading: "Verifying access…",
    unavailable:
      "The authenticated API is not connected. Catalog data is hidden.",
    noAccess: "Catalog permissions are required to access this page.",
    noBranch: "No authorized branch is available for this account.",
    categories: "Categories",
    products: "Products",
    categoryName: "Category name",
    addCategory: "Add category",
    save: "Save",
    archive: "Archive",
    restore: "Activate",
    name: "Name",
    description: "Description",
    category: "Category",
    chooseCategory: "Choose a category",
    imageKey: "Product image key",
    imageLimit:
      "File upload is not connected; this field stores only an existing image key.",
    price: "Price (UZS)",
    priceHint: "A price change is appended as a new version in history.",
    archivedPriceHint:
      "This product is archived. Activate it before changing its price.",
    addProduct: "Add product",
    search: "Search products or categories",
    allCategories: "All categories",
    availability: "Available at branch",
    unavailableProduct: "Unavailable at branch",
    available: "Available",
    notAvailable: "Unavailable",
    updateAvailability: "Toggle availability",
    priceHistory: "Price history",
    hideHistory: "Hide history",
    currentPrice: "Current price",
    noPrice: "No price set",
    active: "Active",
    inactive: "Archived",
    noCategories: "No categories yet.",
    noProducts: "No products match the selected filter.",
    refreshing: "Loading catalog…",
    refresh: "Refresh",
    error: "The request failed. Refresh the data and try again.",
    stale:
      "Product details were saved, but the price version changed. Review the current price and save again.",
    categoryAdded: "Category added.",
    categorySaved: "Category updated.",
    productAdded: "Product added.",
    productAddedPriceFailed:
      "Product was created, but its price was not confirmed. Refresh and review the price.",
    productSaved: "Product updated.",
    priceSaved: "A new price version was added.",
    availabilitySaved: "Branch availability updated.",
    archiveSaved: "Status updated.",
    tablesNote:
      "P4 table and QR-token APIs exist; this page does not yet provide a dedicated management screen.",
    mfaRequired: "Changes require a recently verified MFA session.",
    unauthorized: "The session or permission has expired. Sign in again.",
  },
} satisfies Record<Language, Record<string, string>>;

function parseMinor(value: string): string | null {
  const match = /^(0|[1-9]\d{0,10})(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const minor =
    BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? minor.toString() : null;
}

function formatMinor(value: string | null, currency = "UZS") {
  if (value === null) return "—";
  const amount = BigInt(value);
  const major = (amount / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fraction = (amount % 100n).toString().padStart(2, "0");
  return `${major},${fraction} ${currency}`;
}

function rows<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export default function MenuCatalogPage() {
  const router = useRouter();
  const generation = useRef(0);
  const [language, setLanguage] = useState<Language>("uz");
  const [dark, setDark] = useState(false);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [organizationId, setOrganizationId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [newProduct, setNewProduct] = useState({
    name: "",
    description: "",
    categoryId: "",
    imageKey: "",
    price: "",
  });
  const [loading, setLoading] = useState(API_CONFIGURED);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(!API_CONFIGURED);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [priceHistories, setPriceHistories] = useState<
    Record<string, PriceVersion[]>
  >({});
  const [historyOpen, setHistoryOpen] = useState<Record<string, boolean>>({});
  const t = copy[language] as Record<keyof typeof copy.uz, string>;
  const textRef = useRef(t);
  textRef.current = t;

  const organization = organizations.find((item) => item.id === organizationId);
  const branch = organization?.branches.find((item) => item.id === branchId);
  const canRead = Boolean(
    organization &&
    branch &&
    (organization.capabilities.includes("catalog.read") ||
      branch.capabilities.includes("catalog.read")),
  );
  const canManageCatalog = Boolean(
    organization?.capabilities.includes("catalog.manage"),
  );
  const canManageAvailability = Boolean(
    canManageCatalog || branch?.capabilities.includes("catalog.branch.manage"),
  );

  const request = useCallback(
    async (
      path: string,
      method = "GET",
      body?: Record<string, string | number | boolean | null>,
    ): Promise<ApiResult> => {
      const response = await fetch(path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      let data: Record<string, unknown> = {};
      try {
        data = (await response.json()) as Record<string, unknown>;
      } catch {
        // Use the localized fallback for non-JSON responses.
      }
      return { response, data };
    },
    [],
  );

  const setScope = useCallback(
    (nextOrganizationId: string, nextBranchId: string) => {
      generation.current += 1;
      setOrganizationId(nextOrganizationId);
      setBranchId(nextBranchId);
      setCategories([]);
      setProducts([]);
      setPriceHistories({});
      setHistoryOpen({});
      setError("");
      setNotice("");
    },
    [],
  );

  useEffect(() => {
    try {
      const savedLanguage = localStorage.getItem("unibos.workspace.language");
      if (
        savedLanguage === "uz" ||
        savedLanguage === "ru" ||
        savedLanguage === "en"
      )
        setLanguage(savedLanguage);
    } catch {
      // Default to Uzbek when browser storage is unavailable.
    }
    if (!API_CONFIGURED) return;
    let ignore = false;
    async function loadCapabilities() {
      setLoading(true);
      setError("");
      try {
        const result = await request("/api/v1/me/workspace-capabilities");
        if (ignore) return;
        if (result.response.status === 401) {
          router.replace("/sign-in");
          return;
        }
        if (result.response.status === 503) {
          setUnavailable(true);
          return;
        }
        if (!result.response.ok) throw new Error(textRef.current.error);
        const authorizedOrganizations = rows<Organization>(
          result.data.organizations,
        );
        setOrganizations(authorizedOrganizations);
        const params = new URLSearchParams(window.location.search);
        const requestedOrg = authorizedOrganizations.find(
          (item) => item.id === params.get("organizationId"),
        );
        const selectedOrg = requestedOrg ?? authorizedOrganizations[0];
        const requestedBranch = selectedOrg?.branches.find(
          (item) => item.id === params.get("branchId"),
        );
        const selectedBranch = requestedBranch ?? selectedOrg?.branches[0];
        if (selectedOrg && selectedBranch) {
          setScope(selectedOrg.id, selectedBranch.id);
          if (!requestedOrg || !requestedBranch) {
            router.replace(
              `/dashboard/menu?organizationId=${encodeURIComponent(selectedOrg.id)}&branchId=${encodeURIComponent(selectedBranch.id)}`,
            );
          }
        }
      } catch {
        if (!ignore) setError(textRef.current.error);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadCapabilities();
    return () => {
      ignore = true;
    };
  }, [request, router, setScope]);

  useEffect(() => {
    const onScope = (event: Event) => {
      const detail = (
        event as CustomEvent<{ organizationId?: string; branchId?: string }>
      ).detail;
      if (detail?.organizationId && detail.branchId)
        setScope(detail.organizationId, detail.branchId);
    };
    const onLanguage = (event: Event) => {
      const value = (event as CustomEvent<string>).detail;
      if (value === "uz" || value === "ru" || value === "en")
        setLanguage(value);
    };
    const onHistory = () => {
      const params = new URLSearchParams(window.location.search);
      const orgId = params.get("organizationId");
      const nextOrg = organizations.find((item) => item.id === orgId);
      const nextBranch = nextOrg?.branches.find(
        (item) => item.id === params.get("branchId"),
      );
      if (nextOrg && nextBranch) setScope(nextOrg.id, nextBranch.id);
    };
    window.addEventListener("unibos:workspace-scope", onScope);
    window.addEventListener("unibos:workspace-language", onLanguage);
    window.addEventListener("popstate", onHistory);
    return () => {
      window.removeEventListener("unibos:workspace-scope", onScope);
      window.removeEventListener("unibos:workspace-language", onLanguage);
      window.removeEventListener("popstate", onHistory);
    };
  }, [organizations, setScope]);

  useEffect(() => {
    document.body.dataset.unibosWorkspaceLocked = saving ? "true" : "false";
    return () => {
      delete document.body.dataset.unibosWorkspaceLocked;
    };
  }, [saving]);

  const refresh = useCallback(async () => {
    if (!API_CONFIGURED || !organizationId || !branchId || !canRead) return;
    const currentGeneration = generation.current;
    setLoading(true);
    setError("");
    try {
      const [categoryResult, productResult, branchCatalogResult] =
        await Promise.all([
          request(apiPath(organizationId, "catalog/categories")),
          request(apiPath(organizationId, "catalog/products")),
          request(branchPath(organizationId, branchId, "catalog")),
        ]);
      if (currentGeneration !== generation.current) return;
      const result = [categoryResult, productResult, branchCatalogResult].find(
        (item) => item.response.status === 401,
      );
      if (result) {
        router.replace("/sign-in");
        return;
      }
      if (
        [categoryResult, productResult, branchCatalogResult].some(
          (item) => item.response.status === 503,
        )
      ) {
        setUnavailable(true);
        throw new Error(textRef.current.unavailable);
      }
      for (const item of [categoryResult, productResult, branchCatalogResult]) {
        if (!item.response.ok) throw new Error(textRef.current.error);
      }
      const loadedCategories = rows<Category>(categoryResult.data.categories);
      const identities = rows<
        Omit<
          Product,
          "available" | "price_version" | "price_minor" | "currency_code"
        >
      >(productResult.data.products);
      const branchProducts = new Map(
        rows<Product>(branchCatalogResult.data.products).map((product) => [
          product.id,
          product,
        ]),
      );
      const loadedProducts: Product[] = identities.map((product) => {
        const branchProduct = branchProducts.get(product.id);
        return {
          ...product,
          available: branchProduct?.available ?? false,
          price_version: branchProduct?.price_version ?? null,
          price_minor: branchProduct?.price_minor ?? null,
          currency_code: branchProduct?.currency_code ?? null,
        };
      });
      if (currentGeneration !== generation.current) return;
      setCategories(loadedCategories);
      setProducts(loadedProducts);
    } catch (reason) {
      if (currentGeneration === generation.current) {
        setCategories([]);
        setProducts([]);
        setError(
          reason instanceof Error ? reason.message : textRef.current.error,
        );
      }
    } finally {
      if (currentGeneration === generation.current) setLoading(false);
    }
  }, [branchId, canRead, organizationId, request, router]);

  useEffect(() => {
    if (canRead) void refresh();
    else {
      setCategories([]);
      setProducts([]);
    }
  }, [canRead, refresh]);

  const mutate = useCallback(
    async (
      path: string,
      method: "POST" | "PATCH",
      body: Record<string, string | number | boolean | null>,
      successMessage: string,
      conflictMessage?: string,
    ) => {
      if (saving) return false;
      const currentGeneration = generation.current;
      setSaving(true);
      setError("");
      setNotice("");
      try {
        const result = await request(path, method, body);
        if (currentGeneration !== generation.current) return false;
        if (result.response.status === 401) {
          router.replace("/sign-in");
          return false;
        }
        if (result.response.status === 409 && conflictMessage)
          throw new Error(conflictMessage);
        if (!result.response.ok) throw new Error(textRef.current.error);
        setNotice(successMessage);
        await refresh();
        return true;
      } catch (reason) {
        if (currentGeneration === generation.current)
          setError(
            reason instanceof Error ? reason.message : textRef.current.error,
          );
        return false;
      } finally {
        if (currentGeneration === generation.current) setSaving(false);
      }
    },
    [refresh, request, router, saving],
  );

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await mutate(
      apiPath(organizationId, "catalog/categories"),
      "POST",
      { name: categoryName.trim(), sortOrder: categories.length },
      t.categoryAdded,
    );
    if (ok) setCategoryName("");
  }

  async function addProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const priceMinor = parseMinor(newProduct.price);
    if (!priceMinor || !newProduct.categoryId) {
      setError(t.error);
      return;
    }
    if (saving) return;
    const currentGeneration = generation.current;
    setSaving(true);
    setError("");
    setNotice("");
    let productCreated = false;
    try {
      const created = await request(
        apiPath(organizationId, "catalog/products"),
        "POST",
        {
          categoryId: newProduct.categoryId,
          name: newProduct.name.trim(),
          description: newProduct.description.trim() || null,
          imageKey: newProduct.imageKey.trim() || null,
        },
      );
      if (currentGeneration !== generation.current) return;
      if (created.response.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (
        !created.response.ok ||
        typeof created.data.product !== "object" ||
        created.data.product === null
      )
        throw new Error(t.error);
      const productId = (created.data.product as { id?: unknown }).id;
      if (typeof productId !== "string") throw new Error(t.error);
      productCreated = true;
      const priced = await request(
        branchPath(
          organizationId,
          branchId,
          `catalog/${encodeURIComponent(productId)}/price`,
        ),
        "POST",
        {
          priceMinor: Number(priceMinor),
          currencyCode: "UZS",
          expectedPriceVersionId: null,
        },
      );
      if (currentGeneration !== generation.current) return;
      const priceSaveFailed = !priced.response.ok;
      await refresh();
      if (priceSaveFailed) {
        setNotice(t.productAddedPriceFailed);
        setError(priced.response.status === 409 ? t.stale : t.error);
      } else {
        setNotice(t.productAdded);
        setNewProduct({
          name: "",
          description: "",
          categoryId: "",
          imageKey: "",
          price: "",
        });
      }
    } catch (reason) {
      await refresh();
      if (currentGeneration === generation.current) {
        if (productCreated) setNotice(t.productAddedPriceFailed);
        setError(reason instanceof Error ? reason.message : t.error);
      }
    } finally {
      if (currentGeneration === generation.current) setSaving(false);
    }
  }

  async function saveProduct(product: Product, form: HTMLFormElement) {
    if (saving) return;
    const values = new FormData(form);
    const priceMinor = parseMinor(String(values.get("price") ?? ""));
    const categoryId = String(values.get("categoryId") ?? "");
    const name = String(values.get("name") ?? "").trim();
    const description = String(values.get("description") ?? "").trim();
    const imageKey = String(values.get("imageKey") ?? "").trim();
    if (!categoryId || !name || (product.active && !priceMinor)) {
      setError(t.error);
      return;
    }
    const currentGeneration = generation.current;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await request(
        apiPath(
          organizationId,
          `catalog/products/${encodeURIComponent(product.id)}`,
        ),
        "PATCH",
        {
          name,
          description: description || null,
          categoryId,
          imageKey: imageKey || null,
        },
      );
      if (currentGeneration !== generation.current) return;
      if (updated.response.status === 401) {
        router.replace("/sign-in");
        return;
      }
      if (!updated.response.ok) throw new Error(t.error);
      const currentMajor =
        product.price_minor === null
          ? null
          : BigInt(product.price_minor).toString();
      if (
        product.active &&
        priceMinor !== null &&
        priceMinor !== currentMajor
      ) {
        const priced = await request(
          branchPath(
            organizationId,
            branchId,
            `catalog/${encodeURIComponent(product.id)}/price`,
          ),
          "POST",
          {
            priceMinor: Number(priceMinor),
            currencyCode: product.currency_code ?? "UZS",
            expectedPriceVersionId: product.price_version,
          },
        );
        if (currentGeneration !== generation.current) return;
        if (priced.response.status === 409) throw new Error(t.stale);
        if (!priced.response.ok) throw new Error(t.error);
      }
      setNotice(t.productSaved);
      await refresh();
    } catch (reason) {
      await refresh();
      if (currentGeneration === generation.current)
        setError(reason instanceof Error ? reason.message : t.error);
    } finally {
      if (currentGeneration === generation.current) setSaving(false);
    }
  }

  async function toggleActive(product: Product) {
    await mutate(
      apiPath(
        organizationId,
        `catalog/products/${encodeURIComponent(product.id)}`,
      ),
      "PATCH",
      { active: !product.active },
      t.archiveSaved,
    );
  }

  async function toggleCategory(category: Category) {
    await mutate(
      apiPath(
        organizationId,
        `catalog/categories/${encodeURIComponent(category.id)}`,
      ),
      "PATCH",
      { active: !category.active },
      t.archiveSaved,
    );
  }

  async function toggleAvailability(product: Product) {
    await mutate(
      branchPath(
        organizationId,
        branchId,
        `catalog/${encodeURIComponent(product.id)}/availability`,
      ),
      "PATCH",
      { available: !product.available },
      t.availabilitySaved,
    );
  }

  async function toggleHistory(product: Product) {
    const opening = !historyOpen[product.id];
    setHistoryOpen((current) => ({ ...current, [product.id]: opening }));
    if (!opening || priceHistories[product.id]) return;
    const result = await request(
      branchPath(
        organizationId,
        branchId,
        `catalog/${encodeURIComponent(product.id)}/price`,
      ),
    );
    if (result.response.status === 401) {
      router.replace("/sign-in");
      return;
    }
    if (!result.response.ok) {
      setError(result.response.status === 503 ? t.unavailable : t.error);
      return;
    }
    setPriceHistories((current) => ({
      ...current,
      [product.id]: rows<PriceVersion>(result.data.priceHistory),
    }));
  }

  const filteredProducts = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesCategory =
        !categoryFilter || product.category_id === categoryFilter;
      const matchesQuery =
        !needle ||
        product.name.toLocaleLowerCase().includes(needle) ||
        product.category_name.toLocaleLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [categoryFilter, products, query]);

  return (
    <main className={styles.page} data-theme={dark ? "dark" : "light"}>
      <WorkspaceNavigation dark={dark} />
      <div className={styles.content}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>UNIBOS · GLOBAL CORPORATE</p>
            <h1>{t.title}</h1>
            <p>{t.intro}</p>
          </div>
          <button
            className={styles.secondary}
            type="button"
            onClick={() => setDark((value) => !value)}
            aria-pressed={dark}
          >
            {dark ? "Light" : "Dark"}
          </button>
        </header>
        {!API_CONFIGURED ? (
          <section className={styles.state} role="status">
            {t.unavailable}
          </section>
        ) : loading && !organizations.length ? (
          <section className={styles.state} role="status">
            {t.loading}
          </section>
        ) : unavailable ? (
          <section className={styles.state} role="alert">
            {t.unavailable}
          </section>
        ) : !canRead ? (
          <section className={styles.state} role="alert">
            {organizations.length ? t.noAccess : t.noBranch}
          </section>
        ) : (
          <>
            <div className={styles.toolbar}>
              <span>
                {organization?.name} · {branch?.name}
              </span>
              <button
                className={styles.secondary}
                type="button"
                onClick={() => void refresh()}
                disabled={loading || saving}
              >
                {t.refresh}
              </button>
            </div>
            {error && (
              <p className={styles.error} role="alert">
                {error === "unauthorized" ? t.unauthorized : error}
              </p>
            )}
            {notice && (
              <p className={styles.notice} role="status">
                {notice}
              </p>
            )}
            {loading && (
              <p className={styles.state} role="status">
                {t.refreshing}
              </p>
            )}
            {(canManageCatalog || canManageAvailability) && (
              <p className={styles.securityHint}>{t.mfaRequired}</p>
            )}
            <div className={styles.layout}>
              {canManageCatalog && (
                <section
                  className={styles.panel}
                  aria-labelledby="categories-heading"
                >
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 id="categories-heading">{t.categories}</h2>
                      <p>{categories.length}</p>
                    </div>
                  </div>
                  <form
                    className={styles.form}
                    onSubmit={(event) => void addCategory(event)}
                  >
                    <label htmlFor="new-category">{t.categoryName}</label>
                    <div className={styles.inline}>
                      <input
                        id="new-category"
                        value={categoryName}
                        onChange={(event) =>
                          setCategoryName(event.target.value)
                        }
                        maxLength={80}
                        required
                      />
                      <button type="submit" disabled={saving}>
                        {t.addCategory}
                      </button>
                    </div>
                  </form>
                  {!categories.length ? (
                    <p className={styles.empty}>{t.noCategories}</p>
                  ) : (
                    <ul className={styles.categoryList}>
                      {categories.map((category) => (
                        <li key={category.id}>
                          <form
                            className={styles.categoryRow}
                            onSubmit={(event) => {
                              event.preventDefault();
                              const form = new FormData(event.currentTarget);
                              void mutate(
                                apiPath(
                                  organizationId,
                                  `catalog/categories/${encodeURIComponent(category.id)}`,
                                ),
                                "PATCH",
                                {
                                  name: String(form.get("name") ?? "").trim(),
                                  sortOrder: Number(
                                    form.get("sortOrder") ??
                                      category.sort_order,
                                  ),
                                },
                                t.categorySaved,
                              );
                            }}
                          >
                            <input
                              aria-label={t.name}
                              name="name"
                              defaultValue={category.name}
                              maxLength={80}
                              required
                            />
                            <input
                              aria-label={`${t.categories} sort order`}
                              name="sortOrder"
                              type="number"
                              min="0"
                              max="9999"
                              defaultValue={category.sort_order}
                            />
                            <span>
                              {category.active ? t.active : t.inactive}
                            </span>
                            <button type="submit" disabled={saving}>
                              {t.save}
                            </button>
                            <button
                              className={styles.secondary}
                              type="button"
                              disabled={saving}
                              onClick={() => void toggleCategory(category)}
                            >
                              {category.active ? t.archive : t.restore}
                            </button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}

              {canManageCatalog && (
                <section
                  className={styles.panel}
                  aria-labelledby="add-product-heading"
                >
                  <div className={styles.sectionHeader}>
                    <div>
                      <h2 id="add-product-heading">{t.addProduct}</h2>
                    </div>
                  </div>
                  <form
                    className={styles.form}
                    onSubmit={(event) => void addProduct(event)}
                  >
                    <label htmlFor="product-name">{t.name}</label>
                    <input
                      id="product-name"
                      value={newProduct.name}
                      onChange={(event) =>
                        setNewProduct((value) => ({
                          ...value,
                          name: event.target.value,
                        }))
                      }
                      maxLength={120}
                      required
                    />
                    <label htmlFor="product-description">{t.description}</label>
                    <textarea
                      id="product-description"
                      value={newProduct.description}
                      onChange={(event) =>
                        setNewProduct((value) => ({
                          ...value,
                          description: event.target.value,
                        }))
                      }
                      maxLength={1200}
                      rows={2}
                    />
                    <label htmlFor="product-category">{t.category}</label>
                    <select
                      id="product-category"
                      value={newProduct.categoryId}
                      onChange={(event) =>
                        setNewProduct((value) => ({
                          ...value,
                          categoryId: event.target.value,
                        }))
                      }
                      required
                    >
                      <option value="">{t.chooseCategory}</option>
                      {categories
                        .filter((item) => item.active)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    <label htmlFor="product-image">{t.imageKey}</label>
                    <input
                      id="product-image"
                      value={newProduct.imageKey}
                      onChange={(event) =>
                        setNewProduct((value) => ({
                          ...value,
                          imageKey: event.target.value,
                        }))
                      }
                      maxLength={240}
                      placeholder="/images/products/example.webp"
                    />
                    <small>{t.imageLimit}</small>
                    <label htmlFor="product-price">{t.price}</label>
                    <input
                      id="product-price"
                      value={newProduct.price}
                      onChange={(event) =>
                        setNewProduct((value) => ({
                          ...value,
                          price: event.target.value,
                        }))
                      }
                      inputMode="decimal"
                      placeholder="0.00"
                      required
                    />
                    <small>{t.priceHint}</small>
                    <button type="submit" disabled={saving || loading}>
                      {t.addProduct}
                    </button>
                  </form>
                </section>
              )}

              <section
                className={`${styles.panel} ${styles.products}`}
                aria-labelledby="products-heading"
              >
                <div className={styles.sectionHeader}>
                  <div>
                    <h2 id="products-heading">{t.products}</h2>
                    <p>
                      {filteredProducts.length} / {products.length}
                    </p>
                  </div>
                </div>
                <div className={styles.filters}>
                  <label>
                    <span className={styles.srOnly}>{t.search}</span>
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder={t.search}
                    />
                  </label>
                  <label>
                    <span className={styles.srOnly}>{t.category}</span>
                    <select
                      value={categoryFilter}
                      onChange={(event) =>
                        setCategoryFilter(event.target.value)
                      }
                    >
                      <option value="">{t.allCategories}</option>
                      {categories.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {!filteredProducts.length ? (
                  <p className={styles.empty}>{t.noProducts}</p>
                ) : (
                  <div className={styles.productList}>
                    {filteredProducts.map((product) => (
                      <details className={styles.productCard} key={product.id}>
                        <summary>
                          <span>
                            <b>{product.name}</b>
                            <small>
                              {product.category_name} ·{" "}
                              {formatMinor(
                                product.price_minor,
                                product.currency_code ?? "UZS",
                              )}
                            </small>
                          </span>
                          <span
                            className={
                              product.available && product.active
                                ? styles.statusOk
                                : styles.statusOff
                            }
                          >
                            {product.active
                              ? product.available
                                ? t.available
                                : t.notAvailable
                              : t.inactive}
                          </span>
                        </summary>
                        {canManageCatalog ? (
                          <form
                            className={styles.form}
                            onSubmit={(event) => {
                              event.preventDefault();
                              void saveProduct(product, event.currentTarget);
                            }}
                          >
                            <label>
                              {t.name}
                              <input
                                name="name"
                                defaultValue={product.name}
                                maxLength={120}
                                required
                              />
                            </label>
                            <label>
                              {t.description}
                              <textarea
                                name="description"
                                defaultValue={product.description ?? ""}
                                maxLength={1200}
                                rows={2}
                              />
                            </label>
                            <label>
                              {t.category}
                              <select
                                name="categoryId"
                                defaultValue={product.category_id}
                                required
                              >
                                {categories
                                  .filter(
                                    (item) =>
                                      item.active ||
                                      item.id === product.category_id,
                                  )
                                  .map((item) => (
                                    <option key={item.id} value={item.id}>
                                      {item.name}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            <label>
                              {t.imageKey}
                              <input
                                name="imageKey"
                                defaultValue={product.image_key ?? ""}
                                maxLength={240}
                              />
                            </label>
                            <label>
                              {t.price}
                              <input
                                name="price"
                                defaultValue={
                                  !product.active ||
                                  product.price_minor === null
                                    ? ""
                                    : `${BigInt(product.price_minor) / 100n}.${(BigInt(product.price_minor) % 100n).toString().padStart(2, "0")}`
                                }
                                inputMode="decimal"
                                required={product.active}
                                disabled={!product.active}
                              />
                            </label>
                            {!product.active && (
                              <small>{t.archivedPriceHint}</small>
                            )}
                            <small>{t.imageLimit}</small>
                            <div className={styles.actions}>
                              <button type="submit" disabled={saving}>
                                {t.save}
                              </button>
                              <button
                                className={styles.secondary}
                                type="button"
                                onClick={() => void toggleActive(product)}
                                disabled={saving}
                              >
                                {product.active ? t.archive : t.restore}
                              </button>
                            </div>
                          </form>
                        ) : (
                          <div className={styles.readOnly}>
                            {product.description && (
                              <p>{product.description}</p>
                            )}
                            {product.image_key && (
                              <p>
                                {t.imageKey}: <code>{product.image_key}</code>
                              </p>
                            )}
                          </div>
                        )}
                        {canManageAvailability && product.active && (
                          <button
                            className={styles.secondary}
                            type="button"
                            onClick={() => void toggleAvailability(product)}
                            disabled={saving}
                          >
                            {t.availability}:{" "}
                            {product.available ? t.available : t.notAvailable} ·{" "}
                            {t.updateAvailability}
                          </button>
                        )}
                        <button
                          className={styles.historyButton}
                          type="button"
                          onClick={() => void toggleHistory(product)}
                        >
                          {historyOpen[product.id]
                            ? t.hideHistory
                            : t.priceHistory}
                        </button>
                        {historyOpen[product.id] && (
                          <ol className={styles.historyList}>
                            {(priceHistories[product.id] ?? []).map(
                              (version) => (
                                <li key={version.id}>
                                  <b>
                                    {formatMinor(
                                      version.price_minor,
                                      version.currency_code,
                                    )}
                                  </b>
                                  <time dateTime={version.effective_at}>
                                    {new Date(
                                      version.effective_at,
                                    ).toLocaleString(language)}
                                  </time>
                                </li>
                              ),
                            )}
                            {priceHistories[product.id]?.length === 0 && (
                              <li>{t.noPrice}</li>
                            )}
                          </ol>
                        )}
                      </details>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <p className={styles.limit}>{t.tablesNote}</p>
          </>
        )}
      </div>
    </main>
  );
}
