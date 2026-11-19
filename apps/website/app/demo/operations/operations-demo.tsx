"use client";

import { useMemo, useState } from "react";
import styles from "./operations-demo.module.css";

type Product = {
  id: number;
  name: string;
  category: string;
  description: string;
  price: number;
  available: boolean;
  active: boolean;
  image: string | null;
};
type TableItem = {
  id: number;
  code: string;
  seats: number;
  active: boolean;
  token: "none" | "active" | "revoked";
};

const seedProducts: Product[] = [
  {
    id: 1,
    name: "Tandir non",
    category: "Nonushta",
    description: "Yangi tandir noni",
    price: 18000,
    available: true,
    active: true,
    image: null,
  },
  {
    id: 2,
    name: "Qovoqli manti",
    category: "Asosiy taomlar",
    description: "Uy usulida tayyorlangan",
    price: 42000,
    available: true,
    active: true,
    image: null,
  },
  {
    id: 3,
    name: "Ko‘k choy",
    category: "Ichimliklar",
    description: "Choynakda damlangan",
    price: 16000,
    available: false,
    active: true,
    image: null,
  },
];

function formatDemoPrice(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

export default function OperationsDemo() {
  const [dark, setDark] = useState(false);
  const [branch, setBranch] = useState("Toshkent · Markaziy");
  const [tab, setTab] = useState<"products" | "tables">("products");
  const [products, setProducts] = useState(seedProducts);
  const [tables, setTables] = useState<TableItem[]>([
    { id: 1, code: "T01", seats: 4, active: true, token: "active" },
    { id: 2, code: "T02", seats: 2, active: true, token: "none" },
    { id: 3, code: "VIP-1", seats: 6, active: false, token: "revoked" },
  ]);
  const [category, setCategory] = useState("Barchasi");
  const [categoryOptions, setCategoryOptions] = useState<string[]>([
    "Asosiy taomlar",
    "Ichimliklar",
    "Nonushta",
  ]);
  const [newCategory, setNewCategory] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState(
    "Demo ma’lumotlari brauzer xotirasida vaqtincha saqlanadi.",
  );
  const [editing, setEditing] = useState<Product | null>(null);
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("Asosiy taomlar");
  const [productPrice, setProductPrice] = useState("25000");
  const [productImage, setProductImage] = useState<string | null>(null);
  const [tableName, setTableName] = useState("");
  const [tableSeats, setTableSeats] = useState("4");
  const [editingTable, setEditingTable] = useState<number | null>(null);
  const categories = useMemo(
    () => [
      "Barchasi",
      ...new Set([
        ...categoryOptions,
        ...products.map((item) => item.category),
      ]),
    ],
    [categoryOptions, products],
  );
  const filtered = products.filter(
    (item) =>
      item.active &&
      (category === "Barchasi" || item.category === category) &&
      item.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );

  function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Number(productPrice);
    if (!productName.trim() || !Number.isSafeInteger(price) || price < 0)
      return setNotice("Mahsulot nomi va butun so‘mdagi narxni tekshiring.");
    if (editing) {
      setProducts((current) =>
        current.map((item) =>
          item.id === editing.id
            ? {
                ...item,
                name: productName.trim(),
                category: productCategory,
                price,
                image: productImage ?? item.image,
              }
            : item,
        ),
      );
      setNotice("Demo mahsulot yangilandi.");
    } else {
      setProducts((current) => [
        ...current,
        {
          id: Date.now(),
          name: productName.trim(),
          category: productCategory,
          description: "Demo mahsulot",
          price,
          available: true,
          active: true,
          image: productImage,
        },
      ]);
      setNotice("Demo mahsulot qo‘shildi.");
    }
    setEditing(null);
    setProductName("");
    setProductPrice("25000");
    setProductImage(null);
  }

  function issueToken(id: number) {
    const token = `DEMO-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    setTables((current) =>
      current.map((table) =>
        table.id === id ? { ...table, token: "active" } : table,
      ),
    );
    setNotice(
      `Demo QR token yaratildi: ${token}. Haqiqiy QR manzil yoki API chaqiruvi yaratilmagan.`,
    );
  }

  return (
    <main className={`${styles.page} ${dark ? styles.dark : ""}`}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/demo">
          UniBOS <span>OPERATIONS</span>
        </a>
        <div className={styles.actions}>
          <a
            className={styles.iconButton}
            href="/demo/pos"
            aria-label="Kassir POS demo"
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: "auto",
              padding: "0 12px",
              fontSize: 11,
              textDecoration: "none",
            }}
          >
            Kassir POS demo
          </a>
          <label className={styles.branch}>
            Faol filial
            <select
              aria-label="Faol filial"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              <option>Toshkent · Markaziy</option>
              <option>Samarqand · Registon</option>
            </select>
          </label>
          <button
            className={styles.iconButton}
            onClick={() => setDark(!dark)}
            aria-label={dark ? "Yorug‘ mavzu" : "Qorong‘i mavzu"}
          >
            {dark ? "☼" : "◐"}
          </button>
        </div>
      </header>
      <div className={styles.wrap}>
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>EGASI UCHUN · OPERATSION DEMO</p>
            <h1>Katalog va stollar</h1>
            <p className={styles.subtitle}>
              Mahsulotlar, filial narxlari va QR stol holatini boshqaring.
            </p>
          </div>
          <span className={styles.demoBadge}>SYNTHETIC DEMO</span>
        </div>
        <div className={styles.alert} role="status">
          <b>Demo rejimi</b> · O‘zgarishlar faqat shu sahifa xotirasida. Backend
          yoki haqiqiy bazaga yozilmaydi.
        </div>
        <nav className={styles.tabs} aria-label="Operatsion bo‘limlar">
          <button
            className={tab === "products" ? styles.selected : ""}
            onClick={() => setTab("products")}
          >
            Mahsulotlar <span>{products.filter((p) => p.active).length}</span>
          </button>
          <button
            className={tab === "tables" ? styles.selected : ""}
            onClick={() => setTab("tables")}
          >
            Stollar <span>{tables.length}</span>
          </button>
        </nav>
        {notice && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}
        {tab === "products" ? (
          <section className={styles.layout} aria-label="Mahsulot katalogi">
            <div className={styles.catalog}>
              <div className={styles.toolbar}>
                <label className={styles.search}>
                  Qidirish
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Mahsulot nomi"
                  />
                </label>
                <label className={styles.filter}>
                  Kategoriya
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  >
                    {categories.map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
              </div>
              <div className={styles.products}>
                {filtered.map((product) => (
                  <article className={styles.product} key={product.id}>
                    <div className={styles.photo}>
                      {product.image ? (
                        <img src={product.image} alt={product.name} />
                      ) : (
                        <span aria-hidden="true">🍽</span>
                      )}
                      <i className={product.available ? styles.on : styles.off}>
                        {product.available ? "Mavjud" : "Tugagan"}
                      </i>
                    </div>
                    <div className={styles.productInfo}>
                      <small>{product.category}</small>
                      <h2>{product.name}</h2>
                      <p>{product.description}</p>
                      <strong>{formatDemoPrice(product.price)} so‘m</strong>
                      <div className={styles.productActions}>
                        <button
                          onClick={() => {
                            setEditing(product);
                            setProductName(product.name);
                            setProductCategory(product.category);
                            setProductPrice(String(product.price));
                            setProductImage(product.image);
                          }}
                        >
                          Tahrirlash
                        </button>
                        <button
                          onClick={() => {
                            setProducts((current) =>
                              current.map((item) =>
                                item.id === product.id
                                  ? { ...item, available: !item.available }
                                  : item,
                              ),
                            );
                            setNotice(
                              "Filial mavjudligi demo rejimida o‘zgartirildi.",
                            );
                          }}
                        >
                          {product.available ? "Tugadi" : "Mavjud"}
                        </button>
                        <button
                          className={styles.archive}
                          onClick={() => {
                            setProducts((current) =>
                              current.map((item) =>
                                item.id === product.id
                                  ? { ...item, active: false }
                                  : item,
                              ),
                            );
                            setNotice("Mahsulot demo rejimida arxivlandi.");
                          }}
                        >
                          Arxivlash
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {filtered.length === 0 && (
                <div className={styles.empty}>
                  Bu filtrda mahsulot topilmadi.
                </div>
              )}
            </div>
            <aside className={styles.formCard}>
              <div className={styles.cardTitle}>
                <div>
                  <small>KATALOG</small>
                  <h2>
                    {editing ? "Mahsulotni tahrirlash" : "Mahsulot qo‘shish"}
                  </h2>
                </div>
                <span>＋</span>
              </div>
              <form onSubmit={saveProduct}>
                <label>
                  Mahsulot nomi
                  <input
                    required
                    maxLength={120}
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="Masalan, Osh"
                  />
                </label>
                <label>
                  Kategoriya
                  <select
                    value={productCategory}
                    onChange={(e) => setProductCategory(e.target.value)}
                  >
                    {categories
                      .filter((item) => item !== "Barchasi")
                      .map((item) => (
                        <option key={item}>{item}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Joriy filial narxi · so‘m
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={productPrice}
                    onChange={(e) => setProductPrice(e.target.value)}
                  />
                </label>
                <label>
                  Mahsulot rasmi
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = () =>
                          setProductImage(String(reader.result));
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
                <p className={styles.formHint}>
                  Rasm faqat lokal demo ko‘rinishida. Fayl serverga yuklanmaydi.
                </p>
                <button className={styles.primary}>
                  {editing ? "Saqlash" : "Mahsulot qo‘shish"}
                </button>
                {editing && (
                  <button
                    type="button"
                    className={styles.cancel}
                    onClick={() => {
                      setEditing(null);
                      setProductName("");
                    }}
                  >
                    Bekor qilish
                  </button>
                )}
              </form>
              <form
                className={styles.categoryCreate}
                onSubmit={(event) => {
                  event.preventDefault();
                  const value = newCategory.trim();
                  if (!value) return;
                  setCategoryOptions((current) =>
                    current.includes(value) ? current : [...current, value],
                  );
                  setProductCategory(value);
                  setNewCategory("");
                  setNotice("Demo kategoriya qo‘shildi.");
                }}
              >
                <label>
                  Yangi kategoriya
                  <input
                    maxLength={80}
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                    placeholder="Masalan, Shirinliklar"
                  />
                </label>
                <button type="submit">Kategoriya qo‘shish</button>
              </form>
              <div className={styles.priceHistory}>
                <b>Narx tarixi</b>
                <span>
                  {editing
                    ? "Narx API’da yangi append-only versiya bo‘ladi."
                    : "Narx o‘zgarganda yangi tarix yozuvi qo‘shiladi."}
                </span>
              </div>
            </aside>
          </section>
        ) : (
          <section className={styles.tableLayout}>
            <div className={styles.formCard}>
              <div className={styles.cardTitle}>
                <div>
                  <small>FILIAL STOLLARI</small>
                  <h2>
                    {editingTable === null
                      ? "Stol qo‘shish"
                      : "Stolni tahrirlash"}
                  </h2>
                </div>
                <span>▦</span>
              </div>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const seats = Number(tableSeats);
                  if (
                    !tableName.trim() ||
                    !Number.isInteger(seats) ||
                    seats < 1 ||
                    seats > 24
                  )
                    return;
                  if (editingTable !== null) {
                    setTables((current) =>
                      current.map((t) =>
                        t.id === editingTable
                          ? { ...t, code: tableName, seats }
                          : t,
                      ),
                    );
                    setNotice("Demo stol yangilandi.");
                  } else {
                    setTables((current) => [
                      ...current,
                      {
                        id: Date.now(),
                        code: tableName,
                        seats,
                        active: true,
                        token: "none",
                      },
                    ]);
                    setNotice("Demo stol qo‘shildi.");
                  }
                  setEditingTable(null);
                  setTableName("");
                  setTableSeats("4");
                }}
              >
                <label>
                  Stol raqami yoki nomi
                  <input
                    required
                    maxLength={20}
                    value={tableName}
                    onChange={(e) => setTableName(e.target.value)}
                    placeholder="Masalan, T04"
                  />
                </label>
                <label>
                  O‘rindiqlar
                  <input
                    type="number"
                    min="1"
                    max="24"
                    step="1"
                    value={tableSeats}
                    onChange={(e) => setTableSeats(e.target.value)}
                  />
                </label>
                <button className={styles.primary}>
                  {editingTable === null ? "Stol qo‘shish" : "Saqlash"}
                </button>
              </form>
            </div>
            <div className={styles.tableList}>
              <div className={styles.tableHead}>
                <div>
                  <small>STOL BOSHQA RUV</small>
                  <h2>{branch}</h2>
                </div>
                <span>{tables.length} stol</span>
              </div>
              {tables.map((table) => (
                <article className={styles.tableRow} key={table.id}>
                  <span className={styles.tableIcon}>▦</span>
                  <div className={styles.tableName}>
                    <b>{table.code}</b>
                    <small>
                      {table.seats} o‘rin · {table.active ? "Faol" : "Nofaol"}
                    </small>
                  </div>
                  <span
                    className={`${styles.token} ${table.token === "active" ? styles.tokenActive : ""}`}
                  >
                    {table.token === "active"
                      ? "QR faol"
                      : table.token === "revoked"
                        ? "Bekor qilingan"
                        : "QR yo‘q"}
                  </span>
                  <button
                    onClick={() => {
                      setEditingTable(table.id);
                      setTableName(table.code);
                      setTableSeats(String(table.seats));
                    }}
                  >
                    Tahrirlash
                  </button>
                  <button
                    onClick={() => {
                      setTables((current) =>
                        current.map((item) =>
                          item.id === table.id
                            ? { ...item, active: !item.active }
                            : item,
                        ),
                      );
                      setNotice("Stolning demo faolligi o‘zgartirildi.");
                    }}
                  >
                    {table.active ? "O‘chirish" : "Faollashtirish"}
                  </button>
                  {table.token === "active" ? (
                    <button
                      className={styles.archive}
                      onClick={() => {
                        setTables((current) =>
                          current.map((t) =>
                            t.id === table.id ? { ...t, token: "revoked" } : t,
                          ),
                        );
                        setNotice("Demo QR token bekor qilindi.");
                      }}
                    >
                      Bekor qilish
                    </button>
                  ) : (
                    <button onClick={() => issueToken(table.id)}>
                      QR yaratish
                    </button>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}
        <footer className={styles.footer}>
          UniBOS · Owner workspace prototype{" "}
          <span>API va PostgreSQL Preview muhitiga ulanmagan</span>
        </footer>
      </div>
    </main>
  );
}
