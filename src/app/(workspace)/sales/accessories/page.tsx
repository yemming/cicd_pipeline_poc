"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";

/* ─────────────────────────────── constants ─────────────────────────────── */
const GOLD = "#C9A84C";
const NAVY = "#1A1A2E";
const RED = "#CC0000";

/* ─────────────────────────────── data ──────────────────────────────────── */
type Category = "all" | "carbon" | "performance" | "protection" | "apparel";

const BASE = "https://ducatitaiwan.com.tw/archive/images";

interface Product {
  id: string;
  name: string;
  nameEn: string;
  category: Category;
  price: number;
  compat: string[];
  badge?: string;
  img: string;
  accentColor: string;
}

const products: Product[] = [
  // ── Carbon Fiber ──
  { id: "c1", name: "V4車系碳纖維搖背護蓋",      nameEn: "Carbon Swingarm Cover",            category: "carbon",      price: 12800,  compat: ["V4"],            badge: "原廠", img: `${BASE}/tw_accessories/PANIGALEV4V2/96989991B.png`,        accentColor: "#374151" },
  { id: "c2", name: "V2/V4車系碳纖維後牌照架",    nameEn: "Carbon Rear License Plate Holder",  category: "carbon",      price: 9800,   compat: ["V2", "V4"],                    img: `${BASE}/tw_accessories/PANIGALEV4V2/97381161CA.png`,       accentColor: "#374151" },
  { id: "c3", name: "V4車系碳纖維定風翼",          nameEn: "Carbon Winglet Set",                category: "carbon",      price: 58000,  compat: ["V4"],            badge: "限量", img: `${BASE}/tw_accessories/PANIGALEV4V2/96981311AA.png`,       accentColor: "#374151" },
  { id: "c4", name: "V4車系碳纖維車架護蓋",        nameEn: "Carbon Frame Cover",                category: "carbon",      price: 18500,  compat: ["V4"],                          img: `${BASE}/tw_accessories/PANIGALEV4V2/96981291AA.png`,       accentColor: "#374151" },
  { id: "c5", name: "V4車系碳纖維鏈條保護蓋",      nameEn: "Carbon Chain Guard",                category: "carbon",      price: 11200,  compat: ["V4"],                          img: `${BASE}/tw_accessories/PANIGALEV4V2/96981281AA.png`,       accentColor: "#374151" },
  { id: "c6", name: "V4車系碳纖維離合器蓋",        nameEn: "Carbon Clutch Cover",               category: "carbon",      price: 14800,  compat: ["V4"],            badge: "原廠", img: `${BASE}/tw_accessories/PANIGALEV4V2/96981071A.png`,        accentColor: "#374151" },
  { id: "c7", name: "V2/V4車系碳纖維前擋泥板",    nameEn: "Carbon Front Mudguard",             category: "carbon",      price: 16500,  compat: ["V2", "V4"],                    img: `${BASE}/tw_accessories/PANIGALEV4V2/96989971A.png`,        accentColor: "#374151" },

  // ── Performance Parts ──
  { id: "p1", name: "V4車系鎂合金輪框組",          nameEn: "Magnesium Alloy Wheel Set",         category: "performance", price: 128000, compat: ["V4"],            badge: "限量", img: `${BASE}/tw_accessories/PANIGALEV4V2/96380101A.png`,        accentColor: "#7C3AED" },
  { id: "p2", name: "V4車系乾式離合器套件",        nameEn: "Dry Clutch Kit",                    category: "performance", price: 45000,  compat: ["V4"],            badge: "原廠", img: `${BASE}/tw_accessories/PANIGALEV4V2/96080031AA.png`,       accentColor: "#7C3AED" },
  { id: "p3", name: "V4車系腳踏後移套件",          nameEn: "Rearset Kit +20mm",                 category: "performance", price: 15600,  compat: ["V4"],                          img: `${BASE}/tw_accessories/PANIGALEV4V2/96280481A.png`,        accentColor: "#7C3AED" },
  { id: "p4", name: "V4車系加高燻黑風鏡 +40mm",   nameEn: "Smoked Windscreen +40mm",           category: "performance", price: 8900,   compat: ["V4"],                          img: `${BASE}/tw_accessories/PANIGALEV4V2/97180831AB.png`,       accentColor: "#7C3AED" },
  { id: "p5", name: "V2/V4 鋁合金快拆油箱蓋",     nameEn: "Aluminum Quick-release Fuel Cap",   category: "performance", price: 6500,   compat: ["V2", "V4"],                    img: `${BASE}/tw_accessories/PANIGALEV4V2/97780051BA.png`,       accentColor: "#7C3AED" },
  { id: "p6", name: "V2/V4 鋁合金離合器油壺",     nameEn: "Aluminum Clutch Fluid Reservoir",   category: "performance", price: 7200,   compat: ["V2", "V4"],                    img: `${BASE}/tw_accessories/PANIGALEV4V2/96180511AA.png`,       accentColor: "#7C3AED" },
  { id: "p7", name: "V2/V4 鋁合金前剎車油壺",     nameEn: "Aluminum Brake Fluid Reservoir",    category: "performance", price: 7200,   compat: ["V2", "V4"],                    img: `${BASE}/tw_accessories/PANIGALEV4V2/96180581AA.png`,       accentColor: "#7C3AED" },
  { id: "p8", name: "V2/V4 把手平衡端子",          nameEn: "Bar-end Weights",                   category: "performance", price: 3800,   compat: ["V2", "V4"],                    img: `${BASE}/tw_accessories/PANIGALEV4V2/97380861AA.png`,       accentColor: "#7C3AED" },
  { id: "p9", name: "V4車系改裝下整流罩",          nameEn: "Lower Fairing Kit",                 category: "performance", price: 38000,  compat: ["V4"],            badge: "NEW",  img: `${BASE}/tw_accessories/PANIGALEV4V2/97180653AA.png`,       accentColor: "#7C3AED" },
  { id: "p10", name: "V2/V4 LED 方向燈組",         nameEn: "LED Turn Signal Kit",               category: "performance", price: 12000,  compat: ["V2", "V4"],      badge: "原廠", img: `${BASE}/tw_accessories/PANIGALEV4V2/96680201A.png`,        accentColor: "#7C3AED" },

  // ── Protective Gear ──
  { id: "r1", name: "Corse D-AIR K1 連身皮衣",    nameEn: "Corse D-AIR K1 Racing Suit",        category: "protection",  price: 168000, compat: ["全系列"],         badge: "D-air", img: `${BASE}/tw_apparel/racingsuits/D-AIR_K-1.png`,             accentColor: RED },
  { id: "r2", name: "Corse C5 防摔皮衣",           nameEn: "Corse C5 Leather Jacket",           category: "protection",  price: 48000,  compat: ["全系列"],         badge: "原廠", img: `${BASE}/tw_apparel/981072046.jpg`,                          accentColor: RED },
  { id: "r3", name: "Speed Evo C2 防摔外套",       nameEn: "Speed Evo C2 Jacket",               category: "protection",  price: 32000,  compat: ["全系列"],                       img: `${BASE}/tw_apparel/9810729_-_.jpg`,                         accentColor: RED },
  { id: "r4", name: "Ducati Corse C5 手套",        nameEn: "Corse C5 Racing Gloves",            category: "protection",  price: 12800,  compat: ["全系列"],         badge: "NEW",  img: `${BASE}/tw_apparel/981071172.jpg`,                          accentColor: RED },
  { id: "r5", name: "Corse V5 Air 騎士車靴",       nameEn: "Corse V5 Air Riding Boots",         category: "protection",  price: 28000,  compat: ["全系列"],         badge: "原廠", img: `${BASE}/tw_apparel/boots/981070938.png`,                    accentColor: RED },
  { id: "r6", name: "Speed Evo C1 WP 防水靴",      nameEn: "Speed Evo C1 WP Waterproof Boots",  category: "protection",  price: 22000,  compat: ["全系列"],                       img: `${BASE}/tw_apparel/boots/981044438.png`,                    accentColor: RED },
  { id: "r7", name: "Speed Evo C1 手套",           nameEn: "Speed Evo C1 Racing Gloves",        category: "protection",  price: 8800,   compat: ["全系列"],                       img: `${BASE}/tw_apparel/gloves/981042073.png`,                   accentColor: RED },

  // ── Casual Apparel ──
  { id: "a1", name: "Replica MotoGP 22 連身皮衣", nameEn: "Replica MotoGP 22 Racing Suit",     category: "apparel",     price: 78000,  compat: ["全系列"],         badge: "限量", img: `${BASE}/tw_apparel/981074846.jpg`,                          accentColor: "#0891B2" },
  { id: "a2", name: "Heritage C2 皮革夾克",        nameEn: "Heritage C2 Leather Jacket",        category: "apparel",     price: 19800,  compat: ["全系列"],                       img: `${BASE}/tw_apparel/9810466_-_.jpg`,                         accentColor: "#0891B2" },
  { id: "a3", name: "Corse D-AIR C2 連身皮衣",    nameEn: "Corse D-AIR C2 Racing Suit",        category: "apparel",     price: 138000, compat: ["全系列"],         badge: "D-air", img: `${BASE}/tw_apparel/racingsuits/D-AIR_C2.png`,              accentColor: "#0891B2" },
  { id: "a4", name: "Leather Suit Bag 皮衣收納袋", nameEn: "Leather Suit Bag",                  category: "apparel",     price: 3800,   compat: ["全系列"],         badge: "原廠", img: `${BASE}/tw_apparel/racingsuits/981552950.png`,              accentColor: "#0891B2" },
  { id: "a5", name: "Ducati Corse 城市騎士靴",     nameEn: "Ducati Corse City C2 Boots",        category: "apparel",     price: 18500,  compat: ["全系列"],                       img: `${BASE}/tw_apparel/981071937.jpg`,                          accentColor: "#0891B2" },
];

const CATEGORIES: { key: Category | "all"; label: string; icon: string }[] = [
  { key: "all",         label: "全部商品",   icon: "apps" },
  { key: "carbon",      label: "碳纖維套件", icon: "layers" },
  { key: "performance", label: "性能改裝",   icon: "settings" },
  { key: "protection",  label: "防護裝備",   icon: "security" },
  { key: "apparel",     label: "服飾配件",   icon: "checkroom" },
];

const BADGE_STYLE: Record<string, { bg: string; color: string }> = {
  "原廠":  { bg: "#1B6D301A", color: "#1B6D30" },
  "限量":  { bg: `${GOLD}1A`, color: GOLD },
  "NEW":   { bg: `${RED}1A`,  color: RED },
  "D-air": { bg: "#7C3AED1A", color: "#7C3AED" },
};

/* ─────────────────────────────── component ─────────────────────────────── */
export default function AccessoriesPage() {
  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "精品選配" },
    ],
  });

  const [activeCategory, setActiveCategory] = useState<Category | "all">("all");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [search, setSearch] = useState("");

  const filtered = products.filter((p) => {
    const matchCat = activeCategory === "all" || p.category === activeCategory;
    const matchSearch =
      search === "" ||
      p.name.includes(search) ||
      p.nameEn.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  const cartItems = Object.entries(cart)
    .map(([id, qty]) => ({ product: products.find((p) => p.id === id)!, qty }))
    .filter((x) => x.product && x.qty > 0);
  const cartTotal = cartItems.reduce((s, x) => s + x.product.price * x.qty, 0);
  const cartCount = cartItems.reduce((s, x) => s + x.qty, 0);

  const addToCart = (id: string) =>
    setCart((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }));
  const removeFromCart = (id: string) =>
    setCart((c) => {
      const next = { ...c };
      if ((next[id] ?? 0) <= 1) delete next[id];
      else next[id]--;
      return next;
    });

  return (
    <div
      className="-m-4 md:-m-8 flex flex-col min-h-[calc(100dvh-4rem)]"
      style={{ background: "#0D0D1A" }}
    >
      {/* ── Hero Banner ── */}
      <div
        className="relative flex items-center gap-8 px-10 py-6 border-b border-white/5 overflow-hidden shrink-0"
        style={{
          background: `linear-gradient(135deg, #0D0D1A 0%, ${NAVY} 60%, #0D0D1A 100%)`,
        }}
      >
        {/* Red stripe */}
        <div
          className="absolute left-0 top-0 w-1 h-full"
          style={{ backgroundColor: RED }}
        />

        <img
          src="/bikes/thumbs/panigale-v4-s.png"
          alt="Panigale V4 S"
          className="h-20 object-contain drop-shadow-2xl shrink-0"
        />
        <div>
          <p
            className="text-[10px] font-bold uppercase tracking-widest mb-1"
            style={{ color: GOLD }}
          >
            正在為客戶選配
          </p>
          <h1 className="text-xl font-bold font-display text-white">
            Panigale V4 S · Ducati 紅
          </h1>
          <p className="text-sm text-white/40 mt-0.5">
            王先生 · 車價 NT$ 1,828,000
          </p>
        </div>

        <div className="ml-auto flex items-center gap-8">
          {/* Search */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-lg">
              search
            </span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜尋精品..."
              className="w-52 pl-10 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#C9A84C]/50 transition-all"
            />
          </div>

          {/* Cart chip */}
          <div className="text-right">
            <p className="text-[10px] text-white/40 mb-0.5">已選精品 {cartCount} 件</p>
            <p className="text-2xl font-extrabold font-display" style={{ color: GOLD }}>
              NT$ {cartTotal.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left Sidebar: Category filter ── */}
        <nav className="w-48 shrink-0 flex flex-col gap-1 p-4 border-r border-white/5 overflow-y-auto">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-3 py-2">
            分類
          </p>
          {CATEGORIES.map((cat) => {
            const count =
              cat.key === "all"
                ? products.length
                : products.filter((p) => p.category === cat.key).length;
            const isActive = activeCategory === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setActiveCategory(cat.key as Category | "all")}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all text-left"
                style={
                  isActive
                    ? { backgroundColor: `${GOLD}22`, color: GOLD }
                    : { color: "rgba(255,255,255,0.5)" }
                }
              >
                <span className="material-symbols-outlined text-base">{cat.icon}</span>
                <span className="flex-1 font-medium">{cat.label}</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-md"
                  style={
                    isActive
                      ? { backgroundColor: `${GOLD}33`, color: GOLD }
                      : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.3)" }
                  }
                >
                  {count}
                </span>
              </button>
            );
          })}

          <div className="mt-4 border-t border-white/5 pt-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 px-3 py-2">
              相容車款
            </p>
            {["V4", "V2", "Monster", "Multistrada", "DesertX", "全系列"].map((m) => (
              <button
                key={m}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-white/40 hover:text-white/70 transition-colors w-full text-left"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                {m}
              </button>
            ))}
          </div>
        </nav>

        {/* ── Center: Product Grid ── */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Section label */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-base font-bold font-display text-white">
                {CATEGORIES.find((c) => c.key === activeCategory)?.label}
              </h2>
              <p className="text-xs text-white/30 mt-0.5">{filtered.length} 件商品</p>
            </div>
            <div className="flex gap-2">
              {["推薦", "價格↑", "價格↓"].map((s) => (
                <button
                  key={s}
                  className="px-3 py-1.5 rounded-lg text-xs text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 transition-all"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((product) => {
              const inCart = cart[product.id] ?? 0;
              return (
                <div
                  key={product.id}
                  className="group rounded-2xl border transition-all duration-200 overflow-hidden flex flex-col"
                  style={{
                    backgroundColor: "#161624",
                    borderColor: inCart > 0 ? `${GOLD}44` : "rgba(255,255,255,0.06)",
                    boxShadow: inCart > 0 ? `0 0 0 1px ${GOLD}33` : undefined,
                  }}
                >
                  {/* Product image area */}
                  <div
                    className="relative h-36 flex items-center justify-center overflow-hidden"
                    style={{
                      background: `linear-gradient(135deg, ${product.accentColor}18 0%, #161624 100%)`,
                    }}
                  >
                    <img
                      src={product.img}
                      alt={product.name}
                      className="h-28 w-full object-contain transition-transform duration-300 group-hover:scale-105"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.opacity = "0.15";
                      }}
                    />

                    {/* Badges */}
                    <div className="absolute top-3 left-3 flex gap-1.5">
                      {product.compat.map((c) => (
                        <span
                          key={c}
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                          style={{ backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.4)" }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>

                    {product.badge && (
                      <span
                        className="absolute top-3 right-3 text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={BADGE_STYLE[product.badge] ?? { bg: "rgba(255,255,255,0.1)", color: "white" }}
                      >
                        {product.badge}
                      </span>
                    )}

                    {/* In-cart qty badge */}
                    {inCart > 0 && (
                      <div
                        className="absolute bottom-3 right-3 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ backgroundColor: GOLD, color: NAVY }}
                      >
                        {inCart}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 flex flex-col flex-1">
                    <p className="text-[10px] text-white/30 mb-1 font-mono">{product.nameEn}</p>
                    <h3 className="text-sm font-bold text-white leading-tight mb-3 flex-1">
                      {product.name}
                    </h3>
                    <div className="flex items-center justify-between mt-auto">
                      <span
                        className="text-base font-extrabold font-display"
                        style={{ color: GOLD }}
                      >
                        NT$ {product.price.toLocaleString()}
                      </span>
                      <button
                        onClick={() => addToCart(product.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all active:scale-95"
                        style={
                          inCart > 0
                            ? { backgroundColor: `${GOLD}22`, color: GOLD }
                            : { backgroundColor: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.6)" }
                        }
                      >
                        <span className="material-symbols-outlined text-sm">
                          {inCart > 0 ? "add_circle" : "add"}
                        </span>
                        {inCart > 0 ? "再加一件" : "加入選配"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </main>

        {/* ── Right: Cart Panel ── */}
        <aside
          className="w-72 shrink-0 flex flex-col border-l border-white/5 overflow-hidden"
          style={{ backgroundColor: "#0D0D1A" }}
        >
          {/* Cart header */}
          <div className="px-5 py-4 border-b border-white/5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold font-display text-white">選配清單</h3>
              {cartCount > 0 && (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: `${GOLD}22`, color: GOLD }}
                >
                  {cartCount} 件
                </span>
              )}
            </div>
          </div>

          {/* Cart items */}
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {cartItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 text-center">
                <span className="material-symbols-outlined text-3xl text-white/10 mb-2">
                  shopping_bag
                </span>
                <p className="text-xs text-white/20">尚未選擇任何精品</p>
              </div>
            ) : (
              cartItems.map(({ product, qty }) => (
                <div
                  key={product.id}
                  className="flex items-start gap-3 p-3 rounded-xl"
                  style={{ backgroundColor: "#161624" }}
                >
                  <div
                    className="w-9 h-9 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                    style={{ backgroundColor: `${product.accentColor}22` }}
                  >
                    <img
                      src={product.img}
                      alt={product.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white leading-snug mb-1 truncate">
                      {product.name}
                    </p>
                    <p className="text-xs font-bold" style={{ color: GOLD }}>
                      NT$ {(product.price * qty).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => removeFromCart(product.id)}
                      className="w-5 h-5 rounded flex items-center justify-center text-white/30 hover:text-white/70 transition-colors"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                    >
                      <span className="material-symbols-outlined text-xs">remove</span>
                    </button>
                    <span className="w-5 text-center text-xs text-white/60">{qty}</span>
                    <button
                      onClick={() => addToCart(product.id)}
                      className="w-5 h-5 rounded flex items-center justify-center text-white/30 hover:text-white/70 transition-colors"
                      style={{ backgroundColor: "rgba(255,255,255,0.05)" }}
                    >
                      <span className="material-symbols-outlined text-xs">add</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart footer */}
          <div
            className="px-5 py-5 border-t border-white/5 space-y-4"
          >
            {/* Subtotals */}
            <div className="space-y-2 text-xs">
              <div className="flex justify-between text-white/40">
                <span>車輛售價</span>
                <span>NT$ 1,828,000</span>
              </div>
              <div className="flex justify-between text-white/40">
                <span>精品選配</span>
                <span style={{ color: cartTotal > 0 ? GOLD : undefined }}>
                  + NT$ {cartTotal.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between text-white font-bold text-sm pt-2 border-t border-white/5">
                <span>合計</span>
                <span style={{ color: GOLD }}>
                  NT$ {(1828000 + cartTotal).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Dealer margin hint */}
            {cartTotal > 0 && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[11px]"
                style={{ backgroundColor: `${GOLD}0D`, color: `${GOLD}CC` }}
              >
                <span
                  className="material-symbols-outlined text-sm"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  trending_up
                </span>
                預估精品毛利 NT$ {Math.round(cartTotal * 0.22).toLocaleString()}
              </div>
            )}

            {/* Action buttons */}
            <div className="space-y-2">
              <button
                className="w-full py-3 rounded-xl text-sm font-bold transition-all active:scale-95"
                style={{ backgroundColor: GOLD, color: NAVY }}
              >
                加入報價單
              </button>
              <button
                className="w-full py-2.5 rounded-xl text-xs font-bold text-white/40 hover:text-white/70 transition-colors border border-white/10"
              >
                列印選配清單
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
