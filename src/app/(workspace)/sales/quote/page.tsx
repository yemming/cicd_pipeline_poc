"use client";

/**
 * 賞車報價單 v1 — RS04 Tab 0
 *
 * 規格：docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS04_賞車報價與成交訂單_v1.html
 *
 * 範圍（A13 工序，本頁負責 Tab 0 賞車報價單）：
 *   - ClientBar（客戶 / 報價單號 / 負責 RS / 有效期）
 *   - VehicleSwitch（新車 / 中古車；中古車顯示 VIN / 里程 / 出廠年份 / 認證等級）
 *   - CarSelector（6 款 Ducati 車款卡片）
 *   - QuoteTable（車輛本體 / 贈品 / 配件 / 保險 / 辦牌 / 優惠 — 報價 input 可編輯）
 *   - 新增項目 modal
 *   - TotalBar（車輛定價 / 附加費用 / 優惠折讓 / 客戶實付總額）
 *   - 「成交 → 建立合約書」push 到 /sales/orders?type=new|used + 寫 localStorage snapshot
 *
 * 跨頁 state：
 *   - localStorage key `sales-quote-snapshot:v1` — orders 頁讀
 *   - URL `?type=new|used` — orders 頁預設展示哪份合約
 *
 * 後端：mock-only，無 DB / Supabase 直連
 */

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";

// ============================================================
// 常數 / Mock data
// ============================================================

type VehicleKind = "new" | "used";

type Car = { id: string; model: string; cc: string; price: number };

const CARS: Car[] = [
  { id: "panigale-v4", model: "Panigale V4", cc: "1103cc · 義大利", price: 898000 },
  { id: "streetfighter-v4", model: "Streetfighter V4", cc: "1103cc · 義大利", price: 858000 },
  { id: "monster-sp", model: "Monster SP", cc: "937cc · 義大利", price: 498000 },
  { id: "multistrada-v4", model: "Multistrada V4", cc: "1158cc · 義大利", price: 998000 },
  { id: "diavel-v4", model: "Diavel V4", cc: "1158cc · 義大利", price: 938000 },
  { id: "hypermotard-698", model: "Hypermotard 698", cc: "659cc · 義大利", price: 428000 },
];

const USED_CERT_LEVELS = [
  "CPO 原廠認證中古",
  "DPO 經銷商認證中古",
  "PO 一般中古",
];

type LineCategory = "vehicle" | "gift" | "addon" | "insurance" | "license" | "discount";

const CATEGORY_LABEL: Record<LineCategory, string> = {
  vehicle: "🏍️ 車輛本體",
  gift: "🎁 贈品",
  addon: "⚙️ 選配配件",
  insurance: "🛡️ 保險",
  license: "📋 辦牌費用",
  discount: "💸 優惠折讓",
};

type QuoteLine = {
  id: string;
  category: LineCategory;
  name: string;
  note?: string;
  noteBadge?: "blue" | "amber" | "teal";
  listPrice: number | null; // null = "—"
  quotePrice: number; // 報價（可編輯）；discount 用負數；贈品設 0
  isGift?: boolean;
  removable?: boolean;
};

function makeInitialLines(model: string, listPrice: number): QuoteLine[] {
  return [
    {
      id: "v0",
      category: "vehicle",
      name: `${model}（2026年款）`,
      note: "顏色：Ducati Red",
      noteBadge: "blue",
      listPrice,
      quotePrice: listPrice,
    },
    {
      id: "g0",
      category: "gift",
      name: "原廠安全帽 AGV K6",
      listPrice: 12000,
      quotePrice: 0,
      isGift: true,
      removable: true,
    },
    {
      id: "a0",
      category: "addon",
      name: "Ducati Performance 排氣管升級",
      note: "需預訂 7 天",
      noteBadge: "amber",
      listPrice: 48000,
      quotePrice: 45000,
      removable: true,
    },
    {
      id: "i0",
      category: "insurance",
      name: "強制責任險（1年）",
      listPrice: 1490,
      quotePrice: 1490,
    },
    {
      id: "i1",
      category: "insurance",
      name: "商業險（竊盜+車體損失）",
      listPrice: 28000,
      quotePrice: 26000,
    },
    {
      id: "l0",
      category: "license",
      name: "牌照稅（年繳）+ 辦牌手續費",
      listPrice: 7800,
      quotePrice: 7800,
    },
    {
      id: "d0",
      category: "discount",
      name: "春季促銷折扣",
      note: "活動優惠",
      noteBadge: "teal",
      listPrice: null,
      quotePrice: -20000,
      removable: true,
    },
  ];
}

const CATEGORY_ORDER: LineCategory[] = [
  "vehicle",
  "gift",
  "addon",
  "insurance",
  "license",
  "discount",
];

const SNAPSHOT_KEY = "sales-quote-snapshot:v1";

// ============================================================
// 主元件
// ============================================================

export default function QuotePage() {
  const router = useRouter();

  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "報價簽訂" },
    ],
  });

  // ── 報價單號 / 有效期（demo 用，依日期生成一次）
  const quoteNo = useMemo(() => {
    const d = new Date();
    const yyyymmdd = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    return `Q-${yyyymmdd}-008`;
  }, []);
  const expiresAt = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return `${d.getFullYear()}/${pad2(d.getMonth() + 1)}/${pad2(d.getDate())}`;
  }, []);

  // ── 客戶資料（mock）
  const customerName = "陳志宏";
  const rsName = "林育誠";

  // ── 車輛模式
  const [vehicleKind, setVehicleKind] = useState<VehicleKind>("new");
  const [usedVin, setUsedVin] = useState("");
  const [usedMileage, setUsedMileage] = useState("");
  const [usedYear, setUsedYear] = useState("");
  const [usedCertLevel, setUsedCertLevel] = useState(USED_CERT_LEVELS[0]);

  // ── 選車
  const [selectedCarId, setSelectedCarId] = useState<string>(CARS[0].id);
  const selectedCar = useMemo(
    () => CARS.find((c) => c.id === selectedCarId) ?? CARS[0],
    [selectedCarId],
  );

  // ── 報價明細
  const [lines, setLines] = useState<QuoteLine[]>(() =>
    makeInitialLines(CARS[0].model, CARS[0].price),
  );

  // 切車款 = 同步 lines.v0（在 click handler 動，不放 useEffect — 避免 set-state-in-effect）
  const handleSelectCar = (carId: string) => {
    const car = CARS.find((c) => c.id === carId) ?? CARS[0];
    setSelectedCarId(carId);
    setLines((prev) =>
      prev.map((l) =>
        l.id === "v0"
          ? {
              ...l,
              name: `${car.model}（2026年款）`,
              listPrice: car.price,
              quotePrice: car.price,
            }
          : l,
      ),
    );
  };

  // ── 新增項目 modal
  const [modalOpen, setModalOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addList, setAddList] = useState("");
  const [addPrice, setAddPrice] = useState("");

  // ── toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  // ── 動作
  const updateQuotePrice = (id: string, value: string) => {
    const n = parseLooseInt(value);
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, quotePrice: n } : l)),
    );
  };

  const removeLine = (id: string) => {
    setLines((prev) => prev.filter((l) => l.id !== id));
  };

  const addLine = () => {
    const name = addName.trim();
    if (!name) {
      showToast("請填寫項目名稱");
      return;
    }
    const newLine: QuoteLine = {
      id: `c-${Date.now()}`,
      category: "addon",
      name,
      listPrice: parseLooseInt(addList) || null,
      quotePrice: parseLooseInt(addPrice),
      removable: true,
    };
    setLines((prev) => [...prev, newLine]);
    setAddName("");
    setAddList("");
    setAddPrice("");
    setModalOpen(false);
    showToast(`✅ 已新增：${name}`);
  };

  // ── 總計（依規格分組）
  const totals = useMemo(() => {
    let vehicleAmount = 0;
    let addonAmount = 0;
    let discountAmount = 0;
    for (const l of lines) {
      if (l.category === "vehicle") vehicleAmount += l.quotePrice;
      else if (l.category === "discount") discountAmount += l.quotePrice; // 負數
      else if (l.category === "gift") {
        /* 贈品列 quotePrice=0 不計 */
      } else addonAmount += l.quotePrice;
    }
    const finalAmount = vehicleAmount + addonAmount + discountAmount;
    return {
      vehicle: vehicleAmount,
      addon: addonAmount,
      discount: discountAmount,
      final: finalAmount,
    };
  }, [lines]);

  const persistSnapshot = (kind: VehicleKind) => {
    if (typeof window === "undefined") return;
    const snapshot = {
      quoteNo,
      customerName,
      rsName,
      vehicleKind: kind,
      model: selectedCar.model,
      totalAmount: totals.final,
      expiresAt,
      savedAt: new Date().toISOString(),
    };
    try {
      window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
    } catch {
      /* swallow */
    }
  };

  const goToContract = () => {
    persistSnapshot(vehicleKind);
    router.push(`/sales/orders?type=${vehicleKind}`);
  };

  // ============================================================
  // Layout
  // ============================================================

  return (
    <div className="-m-4 md:-m-8 bg-[#F8F7F4] min-h-[calc(100dvh-4rem)] flex flex-col">
      <main className="flex-1 pb-20">
        <div className="max-w-5xl mx-auto px-6 py-5 space-y-3">
          {/* Page Header */}
          <header
            className="flex items-center gap-2.5 flex-wrap"
            data-testid="quote-page-header"
          >
            <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
              賞車報價單
            </h1>
            <span
              className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium"
              data-testid="quote-sprint-chip"
            >
              銷售 · RS04-v1-quote
            </span>
            <span className="text-[12px] text-[#9A9890]">
              新車 / 中古車共用格式 · 成交後依車種產生對應合約書
            </span>
            <span
              className="ml-auto px-2 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] font-mono"
              data-testid="quote-no"
            >
              {quoteNo}
            </span>
          </header>

          {/* Client Bar */}
          <div
            className="bg-[#1A3A5C] rounded-lg px-4 py-3 flex items-center gap-4 flex-wrap"
            data-testid="quote-client-bar"
          >
            <ClientCell label="客戶" value={customerName} />
            <CellDivider />
            <ClientCell label="報價單號" value={quoteNo} mono />
            <CellDivider />
            <ClientCell label="負責 RS" value={rsName} />
            <CellDivider />
            <ClientCell label="有效期" value={expiresAt} mono valueColor="#F0C97E" />
          </div>

          {/* Vehicle Switch */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="inline-flex bg-[#F4F3F0] rounded-lg p-[3px]">
              {(
                [
                  { v: "new", label: "🆕 新車報價" },
                  { v: "used", label: "🔄 中古車報價" },
                ] as const
              ).map((o) => {
                const active = vehicleKind === o.v;
                return (
                  <button
                    key={o.v}
                    type="button"
                    onClick={() => setVehicleKind(o.v)}
                    data-testid={`quote-vs-${o.v}`}
                    className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors ${
                      active
                        ? "bg-[#1A3A5C] text-white"
                        : "text-[#7A7A78] hover:text-[#2C2C2A]"
                    }`}
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>
            <span
              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                vehicleKind === "used"
                  ? "bg-[#FDF3E3] text-[#854F0B]"
                  : "bg-[#EAF4FB] text-[#185FA5]"
              }`}
              data-testid="quote-vehicle-badge"
            >
              {vehicleKind === "used" ? "中古車" : "新車"}
            </span>
          </div>

          {/* Car Selector */}
          <SectionCard
            icon="🏍️"
            iconBg="bg-[#FDECEA]"
            title="車款選擇"
            subtitle="點選下方車款建立報價單，中古車需補填車籍資料"
          >
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {CARS.map((car) => {
                const sel = car.id === selectedCarId;
                return (
                  <button
                    key={car.id}
                    type="button"
                    onClick={() => handleSelectCar(car.id)}
                    data-testid={`quote-car-${car.id}`}
                    className={`text-left rounded-lg border-[1.5px] px-3 py-2.5 transition-colors ${
                      sel
                        ? "bg-[#FFF5F5] border-[#C8001A]"
                        : "bg-[#FAFAF8] border-[#EEECE6] hover:border-[#B4B2A9]"
                    }`}
                  >
                    <div className="text-[13px] font-bold text-[#2C2C2A]">
                      {car.model}
                    </div>
                    <div className="text-[11px] text-[#9A9890] mt-0.5">
                      {car.cc}
                    </div>
                    <div className="text-[13.5px] font-bold font-mono text-[#C8001A] mt-1">
                      NT${formatNumber(car.price)}
                    </div>
                  </button>
                );
              })}
            </div>

            {vehicleKind === "used" && (
              <div
                className="mt-3 p-3 rounded-md border border-[#F0C97E] bg-[#FFF8E1]"
                data-testid="quote-used-fields"
              >
                <Grid cols={2}>
                  <Field label="車身號碼（VIN）">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="輸入 VIN"
                      value={usedVin}
                      onChange={(e) => setUsedVin(e.target.value)}
                      data-testid="quote-used-vin"
                    />
                  </Field>
                  <Field label="行駛里程（km）">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="例：12,500"
                      value={usedMileage}
                      onChange={(e) => setUsedMileage(e.target.value)}
                    />
                  </Field>
                  <Field label="出廠年份">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="例：2023"
                      value={usedYear}
                      onChange={(e) => setUsedYear(e.target.value)}
                    />
                  </Field>
                  <Field label="認證等級">
                    <select
                      className={inputCls}
                      value={usedCertLevel}
                      onChange={(e) => setUsedCertLevel(e.target.value)}
                    >
                      {USED_CERT_LEVELS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                </Grid>
              </div>
            )}
          </SectionCard>

          {/* Quote Table */}
          <SectionCard
            icon="💰"
            iconBg="bg-[#EAF4FB]"
            title="報價明細"
            subtitle="含車輛 · 贈品 · 配件 · 保險 · 辦牌 · 優惠"
            trailing={
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(true)}
                  className={btnGhostSm}
                  data-testid="quote-add-item-btn"
                >
                  ＋ 新增項目
                </button>
                <button
                  type="button"
                  onClick={() => showToast("📄 報價單已匯出 PDF")}
                  className={btnGhostSm}
                >
                  📄 匯出
                </button>
              </div>
            }
          >
            <div className="overflow-x-auto -mx-4">
              {/* TODO(P1-λ): 此 mock-only 報價單明細 table 暫不升級到 <DataGrid>，待接真實 helper 後再做。 */}
              <table className="w-full border-collapse" data-testid="quote-table">
                <thead>
                  <tr className="bg-[#FAFAF8] border-b-2 border-[#EEECE6]">
                    <Th width="40%">項目</Th>
                    <Th>備註</Th>
                    <Th align="right">定價</Th>
                    <Th align="right">報價</Th>
                    <Th width="50px"> </Th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORY_ORDER.map((cat) => {
                    const rows = lines.filter((l) => l.category === cat);
                    if (rows.length === 0) return null;
                    return (
                      <Fragment key={`cat-group-${cat}`}>
                        <tr key={`cat-${cat}`}>
                          <td
                            colSpan={5}
                            className="px-4 pt-2 pb-1 text-[10.5px] font-bold tracking-wider uppercase text-[#9A9890] bg-[#FAFAF8] border-b border-[#F4F3F0]"
                          >
                            {CATEGORY_LABEL[cat]}
                          </td>
                        </tr>
                        {rows.map((l) => (
                          <tr
                            key={l.id}
                            className="border-b border-[#F4F3F0]"
                            data-testid={`quote-line-${l.id}`}
                          >
                            <td className="px-4 py-2 text-[12.5px]">
                              <div className="font-medium text-[#2C2C2A]">
                                {l.name}
                              </div>
                              {l.note && l.category === "vehicle" && (
                                <div className="text-[11px] text-[#9A9890] mt-0.5">
                                  {l.note}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-[12px]">
                              {l.note && l.category !== "vehicle" && (
                                <span
                                  className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-semibold ${badgeCls(
                                    l.noteBadge,
                                  )}`}
                                >
                                  {l.note}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right text-[12.5px] font-mono text-[#5A5955]">
                              {l.listPrice === null
                                ? "—"
                                : `$${formatNumber(l.listPrice)}`}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {l.isGift ? (
                                <span className="text-[12.5px] font-bold text-[#C8001A]">
                                  贈送
                                </span>
                              ) : l.category === "discount" ? (
                                <span className="text-[12.5px] font-mono font-bold text-[#C8001A]">
                                  -${formatNumber(Math.abs(l.quotePrice))}
                                </span>
                              ) : (
                                <input
                                  type="text"
                                  className="w-[110px] h-[26px] px-2 rounded border border-[#D5D3CB] text-right text-[12px] font-mono font-semibold text-[#185FA5] outline-none focus:border-[#85B7EB]"
                                  value={formatNumber(l.quotePrice)}
                                  onChange={(e) =>
                                    updateQuotePrice(l.id, e.target.value)
                                  }
                                  data-testid={`quote-input-${l.id}`}
                                />
                              )}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {l.removable && (
                                <button
                                  type="button"
                                  onClick={() => removeLine(l.id)}
                                  className="w-6 h-6 rounded text-[12px] text-[#9A9890] hover:bg-[#F4F3F0] hover:text-[#C8001A]"
                                  data-testid={`quote-remove-${l.id}`}
                                  aria-label="刪除"
                                >
                                  ✕
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </SectionCard>

          {/* Total Bar */}
          <div
            className="bg-[#1A3A5C] rounded-lg px-4 py-3.5 flex items-center justify-between flex-wrap gap-3"
            data-testid="quote-total-bar"
          >
            <div className="flex gap-5 items-center flex-wrap">
              <TotalItem label="車輛定價" value={`$${formatNumber(totals.vehicle)}`} />
              <TotalItem label="附加費用" value={`$${formatNumber(totals.addon)}`} />
              <TotalItem
                label="優惠折讓"
                value={`-$${formatNumber(Math.abs(totals.discount))}`}
                valueColor="#FF8080"
              />
              <div className="border-l border-white/20 pl-5">
                <div className="text-[10.5px] text-white/55 mb-0.5">
                  客戶實付總額
                </div>
                <div
                  className="text-[22px] font-bold font-mono text-[#5BC4A8]"
                  data-testid="quote-total-final"
                >
                  ${formatNumber(totals.final)}
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  persistSnapshot(vehicleKind);
                  showToast("📲 報價單已傳送 LINE 給客戶");
                }}
                className={btnGhost}
                data-testid="quote-send-line"
              >
                📲 傳送客戶
              </button>
              <button
                type="button"
                onClick={goToContract}
                className={btnRed}
                data-testid="quote-go-contract"
              >
                成交 → 建立合約書
              </button>
            </div>
          </div>
        </div>
      </main>

      {/* Add Item Modal */}
      {modalOpen && (
        <div
          className="fixed inset-0 bg-black/35 z-50 flex items-center justify-center px-4"
          onClick={() => setModalOpen(false)}
          data-testid="quote-modal-overlay"
        >
          <div
            className="bg-white rounded-xl w-[460px] max-w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="quote-modal"
          >
            <div className="px-5 py-3.5 border-b border-[#EEECE6] flex items-center justify-between">
              <div className="text-[14px] font-bold">＋ 新增報價項目</div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="text-[20px] text-[#9A9890] hover:text-[#2C2C2A]"
                aria-label="關閉"
              >
                ×
              </button>
            </div>
            <div className="p-5 space-y-3">
              <Field label="項目名稱">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="例：快拆牌架"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  data-testid="quote-add-name"
                />
              </Field>
              <Grid cols={2}>
                <Field label="定價">
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="NT$"
                    value={addList}
                    onChange={(e) => setAddList(e.target.value)}
                  />
                </Field>
                <Field label="報價">
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="NT$"
                    value={addPrice}
                    onChange={(e) => setAddPrice(e.target.value)}
                    data-testid="quote-add-price"
                  />
                </Field>
              </Grid>
            </div>
            <div className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className={btnGhost}
              >
                取消
              </button>
              <button
                type="button"
                onClick={addLine}
                className={btnPrimary}
                data-testid="quote-add-submit"
              >
                ✅ 加入
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg text-[12.5px] z-50 bg-[#1A3A5C] text-white max-w-[320px] leading-relaxed"
          data-testid="quote-toast"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helper components
// ============================================================

function ClientCell({
  label,
  value,
  mono,
  valueColor,
}: {
  label: string;
  value: string;
  mono?: boolean;
  valueColor?: string;
}) {
  return (
    <div>
      <div className="text-[11px] text-white/55">{label}</div>
      <div
        className={`text-[13px] font-semibold ${mono ? "font-mono text-[12px]" : ""}`}
        style={{ color: valueColor ?? (mono ? "#5BC4A8" : "#fff") }}
      >
        {value}
      </div>
    </div>
  );
}

function CellDivider() {
  return <div className="w-px h-5 bg-white/15" />;
}

function TotalItem({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div className="text-center">
      <div className="text-[10.5px] text-white/55 mb-0.5">{label}</div>
      <div
        className="text-[15px] font-bold font-mono"
        style={{ color: valueColor ?? "#fff" }}
      >
        {value}
      </div>
    </div>
  );
}

function Th({
  children,
  align = "left",
  width,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  width?: string;
}) {
  return (
    <th
      className="text-[10.5px] font-bold tracking-wider uppercase text-[#9A9890] px-4 py-2 whitespace-nowrap"
      style={{ textAlign: align, width }}
    >
      {children}
    </th>
  );
}

function badgeCls(kind: QuoteLine["noteBadge"]): string {
  if (kind === "amber") return "bg-[#FDF3E3] text-[#854F0B]";
  if (kind === "teal") return "bg-[#E1F5EE] text-[#0F6E56]";
  return "bg-[#EAF4FB] text-[#185FA5]";
}

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md border border-[#D5D3CB] text-[12.5px] outline-none focus:border-[#85B7EB] bg-white";

const btnPrimary =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#1A3A5C] text-white hover:bg-[#0F2A45] transition-colors";
const btnRed =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#C8001A] text-white hover:bg-[#A8001A] transition-colors";
const btnGhost =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] transition-colors";
const btnGhostSm =
  "h-[26px] px-3 rounded-md text-[11.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] transition-colors";

function SectionCard({
  icon,
  iconBg,
  title,
  subtitle,
  trailing,
  children,
}: {
  icon: string;
  iconBg: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-7 h-7 rounded-md flex items-center justify-center text-[13px] flex-shrink-0 ${iconBg}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#2C2C2A]">{title}</div>
            {subtitle && (
              <div className="text-[11px] text-[#9A9890] mt-0.5 leading-tight">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {trailing}
      </header>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 mb-2.5">
      <label className="text-[11.5px] font-semibold text-[#4A4A48]">
        {label}{" "}
        {required && <span className="text-[#C8001A] text-[11px]">*</span>}
      </label>
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return (
    <div
      className={`grid gap-x-4 gap-y-0 ${
        cols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"
      }`}
    >
      {children}
    </div>
  );
}

// ============================================================
// 工具函式
// ============================================================

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
function parseLooseInt(s: string): number {
  const cleaned = s.replace(/[^\d-]/g, "");
  const n = parseInt(cleaned, 10);
  return Number.isFinite(n) ? n : 0;
}
