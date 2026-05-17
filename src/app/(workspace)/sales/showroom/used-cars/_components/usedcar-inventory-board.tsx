"use client";

import Link from "next/link";
import { useMemo, useState, useEffect } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { UsedCarInventoryData } from "@/domain/sales-usedcar-inventory";
import {
  inKmRange,
  type BusinessTag,
  type UsedCarGrade,
  type UsedCarKmRange,
  type UsedCarStatus,
  type UsedCarUnit,
} from "@/domain/sales-usedcar-inventory.constants";

// ── BDN #13 業務 chip helpers ─────────────────────────────────────────
const BIZ_CHIP_BASE =
  "inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap";

/**
 * 動保塗銷 chip — true=已清償（綠）、false=未清償（紅）、undefined=不渲染。
 */
function LienChip({ cleared }: { cleared?: boolean }) {
  if (cleared === undefined) return null;
  if (cleared) {
    return (
      <span
        className={BIZ_CHIP_BASE + " bg-[#EAF3DE] text-[#3B6D11]"}
        data-testid="chip-lien-cleared"
      >
        已清償
      </span>
    );
  }
  return (
    <span
      className={BIZ_CHIP_BASE + " bg-[#FDECEA] text-[#CC0000]"}
      data-testid="chip-lien-uncleared"
    >
      未清償
    </span>
  );
}

/**
 * 年審 chip — 距今 ≤120 天時為「4 個月內驗車」黃 chip、其餘「正常」灰 chip。
 * 沒給 dueDate 一律不渲染（不知道狀態就不亂猜）。
 */
function InspectionChip({ dueDate }: { dueDate?: string }) {
  if (!dueDate) return null;
  const due = new Date(dueDate + "T00:00:00");
  if (Number.isNaN(due.getTime())) return null;
  const now = new Date();
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 120) {
    return (
      <span
        className={BIZ_CHIP_BASE + " bg-[#FDF3E3] text-[#854F0B]"}
        data-testid="chip-inspection-due"
      >
        4 個月內驗車
      </span>
    );
  }
  return (
    <span
      className={BIZ_CHIP_BASE + " bg-[#F2F2F2] text-[#6B6A68]"}
      data-testid="chip-inspection-normal"
    >
      正常
    </span>
  );
}

/**
 * 衍生業務推薦 chip 列 — 每個 tag 一個藍 chip，空陣列不渲染。
 */
function BusinessChips({ tags }: { tags?: BusinessTag[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <>
      {tags.map((t) => (
        <span
          key={t}
          className={BIZ_CHIP_BASE + " bg-[#EAF4FB] text-[#185FA5]"}
          data-testid={`chip-biz-${t}`}
        >
          {t}
        </span>
      ))}
    </>
  );
}

const TONE_TEXT: Record<string, string> = {
  teal: "text-[#0F6E56]",
  purple: "text-[#534AB7]",
  amber: "text-[#854F0B]",
  navy: "text-[#1A3A5C]",
  red: "text-[#C8001A]",
};

const STATUS_CHIP: Record<UsedCarStatus, string> = {
  "在庫可售": "bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]",
  "整備中": "bg-[#EEEDFE] text-[#534AB7] border border-[#C5C0F0]",
  "已保留": "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]",
  "已售出": "bg-[#FDECEA] text-[#C8001A] border border-[#F5AEAD]",
};

const GRADE_BADGE: Record<UsedCarGrade, string> = {
  S: "bg-[#7A1010] text-white",
  A: "bg-[#185FA5] text-white",
  B: "bg-[#0F6E56] text-white",
  C: "bg-[#854F0B] text-white",
  D: "bg-[#9A9890] text-white",
};

type DisplayMode = "card" | "list";
type Banner = { ok: boolean; msg: string } | null;

function marginRate(margin: number, price: number): number {
  if (price <= 0) return 0;
  return Math.round((margin / price) * 100);
}

/**
 * BDN #19 — 低毛利警示判定：毛利率 ≤ 5%
 * 注意：用未 round 的實際比率判定，避免 5.4% round 到 5 而誤判。
 * price <= 0 時無法判定、不警示（避免雜訊）。
 */
function isLowMargin(margin: number, price: number): boolean {
  if (price <= 0) return false;
  return (margin / price) * 100 <= 5;
}

const LOW_MARGIN_ROW_BG = "bg-[#FEF7E6]";
const LOW_MARGIN_CHIP_CLASS =
  "inline-flex items-center text-[10.5px] px-1.5 py-0.5 rounded font-semibold bg-[#FDECEA] text-[#CC0000] whitespace-nowrap";

function marginChipClass(rate: number): string {
  if (rate >= 15) return "bg-[#E1F5EE] text-[#0F6E56]";
  if (rate >= 8) return "bg-[#FDF3E3] text-[#854F0B]";
  return "bg-[#FDECEA] text-[#C8001A]";
}

function daysToneClass(days: number): string {
  if (days > 45) return "text-[#C8001A]";
  if (days > 30) return "text-[#854F0B]";
  return "text-[#0F6E56]";
}

/**
 * 視角差異（A9 RS03B 共用）：
 * - `dealer`（預設）：銷售模組底下，掛 `/sales/showroom/used-cars`，breadcrumb 走「展廳接待」
 * - `usedcar`：中古車輛模組底下，掛 `/usedcar/stock`，breadcrumb 走「中古車輛」
 *
 * Day 1 兩視角資料同源（USED_CAR_INVENTORY_UNITS）。
 */
export type UsedCarInventoryViewMode = "dealer" | "usedcar";

export default function UsedCarInventoryBoard({
  data,
  viewMode = "dealer",
}: {
  data: UsedCarInventoryData;
  viewMode?: UsedCarInventoryViewMode;
}) {
  const isUsedcarModule = viewMode === "usedcar";

  useSetPageHeader({
    title: "中古車庫存看板",
    breadcrumb: isUsedcarModule
      ? [{ label: "中古車輛" }, { label: "中古車庫存" }]
      : [{ label: "展廳接待" }, { label: "中古車庫存" }],
    hideSearch: true,
  });

  const [grade, setGrade] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [kmRange, setKmRange] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [displayMode, setDisplayMode] = useState<DisplayMode>("card");
  const [banner, setBanner] = useState<Banner>(null);

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.units.filter((u) => {
      if (grade && u.grade !== grade) return false;
      if (status && u.status !== status) return false;
      if (!inKmRange(u.km, (kmRange as UsedCarKmRange | ""))) return false;
      if (q && !u.model.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data.units, grade, status, kmRange, query]);

  function showToast(unit: UsedCarUnit, action: "appraise" | "quote") {
    if (action === "appraise") {
      setBanner({ ok: true, msg: `📋 ${unit.model} 評估鑑價（待 RS06 上線）` });
    } else {
      setBanner({ ok: true, msg: `🏍️ ${unit.model} 報價（待 RS04 上線）` });
    }
  }

  return (
    <main
      className="px-6 py-5 space-y-3"
      data-view-mode={viewMode}
      data-testid={`usedcar-inventory-${viewMode}`}
    >
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">中古車庫存看板</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {isUsedcarModule ? "中古車輛 / RS03B" : "銷售模組 / RS03B"}
        </span>
        {isUsedcarModule && (
          <span
            className="px-2 py-0.5 text-[11px] rounded-full bg-[#FDF3E3] text-[#854F0B] font-medium"
            data-testid="usedcar-perspective-chip"
          >
            中古車輛
          </span>
        )}
        {isUsedcarModule && (
          <span
            className="px-2 py-0.5 text-[11px] rounded-full bg-[#F0EFFE] text-[#534AB7] font-semibold"
            data-testid="star6-marker-chip"
          >
            ★6
          </span>
        )}
        <span className="text-[12px] text-[#9A9890]">
          等級、整備、保留與在庫天數 — 看板統一管理中古車庫存與報價接續
        </span>
      </header>

      {/* ★6 跨模組 banner — 中古車庫存 ↔ 備件庫存查詢（D5.1） */}
      {isUsedcarModule && (
        <section
          className="bg-[#F0EFFE] border border-[#C4BEF0] rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap"
          data-testid="star6-cross-module-banner"
        >
          <span className="text-[11px] text-[#534AB7] font-semibold">
            ★6 跨模組
          </span>
          <span className="text-[12px] text-[#26215C]">
            本頁是<strong>中古車銷售視角</strong>（等級、整備、保留、在庫天數）；
            備件庫存查詢從<strong>零件視角</strong>看 stock_items 即時水位，同源不同切面。
          </span>
          <div className="ml-auto flex gap-1.5 flex-wrap">
            <Link
              href="/parts/operations/balance"
              className="h-[26px] px-3 rounded-full text-[11.5px] inline-flex items-center bg-[#534AB7] text-white hover:bg-[#3F3793] font-medium"
            >
              → 備件庫存查詢
            </Link>
          </div>
        </section>
      )}

      {/* KPI */}
      <section
        data-testid="usedcar-kpi-row"
        className="grid grid-cols-2 md:grid-cols-5 gap-2.5"
      >
        {data.kpis.map((k) => (
          <div
            key={k.key}
            data-testid={`usedcar-kpi-${k.key}`}
            className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3"
          >
            <div className="text-[11px] text-[#9A9890]">{k.label}</div>
            <div
              className={
                "text-[22px] font-bold font-mono leading-none mb-0.5 mt-1 " +
                (TONE_TEXT[k.tone] ?? "text-[#2C2C2A]")
              }
            >
              {k.value}
            </div>
            <div className="text-[10.5px] text-[#9A9890]">{k.subtitle}</div>
          </div>
        ))}
      </section>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-center flex-wrap">
          <span className="text-[11.5px] font-semibold text-[#5A5955]">篩選：</span>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12px] focus:border-[#185FA5] outline-none"
            data-testid="filter-grade"
          >
            {data.gradeOptions.map((o) => (
              <option key={o.value || "all-grade"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12px] focus:border-[#185FA5] outline-none"
            data-testid="filter-status"
          >
            {data.statusOptions.map((o) => (
              <option key={o.value || "all-status"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={kmRange}
            onChange={(e) => setKmRange(e.target.value)}
            className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12px] focus:border-[#185FA5] outline-none"
            data-testid="filter-km"
          >
            {data.kmRangeOptions.map((o) => (
              <option key={o.value || "all-km"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜尋車款…"
            className="h-[30px] w-[180px] px-2 rounded border border-[#D5D3CB] text-[12px] focus:border-[#185FA5] outline-none"
            data-testid="filter-search"
          />
          <div className="ml-auto flex gap-1" data-testid="view-toggle">
            <button
              className={
                "h-[28px] px-3 rounded text-[12px] border transition " +
                (displayMode === "card"
                  ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                  : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]")
              }
              onClick={() => setDisplayMode("card")}
              data-testid="view-toggle-card"
            >
              ⊞ 卡片
            </button>
            <button
              className={
                "h-[28px] px-3 rounded text-[12px] border transition " +
                (displayMode === "list"
                  ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                  : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]")
              }
              onClick={() => setDisplayMode("list")}
              data-testid="view-toggle-list"
            >
              ≡ 列表
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar (count) */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]" data-testid="usedcar-count">
          共 <b className="text-[#2C2C2A]">{data.units.length}</b> 筆庫存（顯示 <b>{filtered.length}</b> 筆）
        </span>
      </div>

      {/* Card / List */}
      {displayMode === "card" ? (
        <CardGrid units={filtered} onAction={showToast} />
      ) : (
        <ListView units={filtered} onAction={showToast} />
      )}

      {banner && (
        <div
          className={
            "fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 " +
            (banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]")
          }
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

// ────────────────────────────── Card Grid ──────────────────────────────

function CardGrid({
  units,
  onAction,
}: {
  units: UsedCarUnit[];
  onAction: (u: UsedCarUnit, action: "appraise" | "quote") => void;
}) {
  if (units.length === 0) {
    return (
      <div className="bg-white border border-[#EEECE6] rounded-lg py-12 text-center text-[12px] text-[#9A9890]">
        沒有符合條件的庫存
      </div>
    );
  }
  return (
    <div
      data-testid="usedcar-card-grid"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {units.map((u) => {
        const rate = marginRate(u.margin, u.price);
        const lowMargin = isLowMargin(u.margin, u.price);
        return (
          <article
            key={u.id}
            data-testid={`usedcar-card-${u.id}`}
            data-low-margin={lowMargin ? "true" : "false"}
            className={
              "border border-[#EEECE6] rounded-lg overflow-hidden hover:border-[#85B7EB] hover:shadow-md transition cursor-pointer " +
              (lowMargin ? LOW_MARGIN_ROW_BG : "bg-white")
            }
          >
            <div
              className="h-[110px] flex items-center justify-center relative"
              style={{ background: `linear-gradient(135deg, ${u.colorHex} 0%, ${u.colorHex}99 100%)` }}
            >
              <span className="text-[40px] opacity-60">🏍️</span>
              <span
                className={
                  "absolute top-2 left-2 w-[28px] h-[28px] rounded-full flex items-center justify-center text-[12px] font-bold " +
                  GRADE_BADGE[u.grade]
                }
              >
                {u.grade}
              </span>
              <span
                className={
                  "absolute top-2 right-2 text-[10.5px] font-bold px-2 py-0.5 rounded " +
                  STATUS_CHIP[u.status]
                }
              >
                {u.status}
              </span>
            </div>
            <div className="p-3">
              <div className="text-[13px] font-bold text-[#2C2C2A]">{u.model}</div>
              <div className="text-[11px] text-[#9A9890] mb-2">
                {u.year} 年 · {u.color}
              </div>
              <div className="space-y-0.5 mb-2">
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">里程</span>
                  <span className="font-mono font-semibold">{u.km.toLocaleString()} km</span>
                </div>
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">收購成本</span>
                  <span className="font-mono font-semibold">NT$ {u.cost.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">在庫天數</span>
                  <span className={"font-mono font-semibold " + daysToneClass(u.daysInStock)}>
                    {u.daysInStock} 天
                  </span>
                </div>
              </div>
              <div className="mb-2">
                <div className="text-[15px] font-bold font-mono text-[#1A3A5C]">
                  NT$ {u.price.toLocaleString()}
                </div>
                <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                  <span className={"text-[11px] px-1.5 py-0.5 rounded font-semibold " + marginChipClass(rate)}>
                    利潤 {rate}%
                  </span>
                  {lowMargin && (
                    <span
                      className={LOW_MARGIN_CHIP_CLASS}
                      data-testid={`chip-low-margin-${u.id}`}
                    >
                      ⚠️ 低毛利
                    </span>
                  )}
                </div>
              </div>
              {u.note && (
                <div className="text-[10.5px] text-[#854F0B] mb-2">📌 {u.note}</div>
              )}
              {/* BDN #13 — 三組業務 chip：動保塗銷 / 年審 / 衍生業務 */}
              {(u.lienCleared !== undefined ||
                u.inspectionDueDate ||
                (u.recommendedServices && u.recommendedServices.length > 0)) && (
                <div
                  className="flex flex-wrap gap-1 mb-2"
                  data-testid={`biz-chips-${u.id}`}
                >
                  <LienChip cleared={u.lienCleared} />
                  <InspectionChip dueDate={u.inspectionDueDate} />
                  <BusinessChips tags={u.recommendedServices} />
                </div>
              )}
              <div className="flex gap-1.5">
                <button
                  className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0]"
                  onClick={() => onAction(u, "appraise")}
                  data-testid={`btn-appraise-${u.id}`}
                >
                  評估
                </button>
                <button
                  className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#085041]"
                  onClick={() => onAction(u, "quote")}
                  data-testid={`btn-quote-${u.id}`}
                >
                  報價
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

// ────────────────────────────── List View ──────────────────────────────

function ListView({
  units,
  onAction,
}: {
  units: UsedCarUnit[];
  onAction: (u: UsedCarUnit, action: "appraise" | "quote") => void;
}) {
  // 註：DataGrid 不支援 row className 注入，row-wide 低毛利 amber 底色已移除；
  //     低毛利仍以 ⚠️ 低毛利 chip 顯示在「利潤」cell。
  const columns: DataGridColumn<UsedCarUnit>[] = [
    {
      id: "grade",
      header: "等",
      width: 40,
      cell: (u) => (
        <span
          className={
            "inline-flex items-center justify-center w-[20px] h-[20px] rounded-full text-[10px] font-bold " +
            GRADE_BADGE[u.grade]
          }
        >
          {u.grade}
        </span>
      ),
      exportValue: (u) => u.grade,
      sortValue: (u) => u.grade,
    },
    {
      id: "model",
      header: "車款",
      cell: (u) => <span className="text-[12.5px] font-semibold">{u.model}</span>,
      exportValue: (u) => u.model,
      sortValue: (u) => u.model,
      hideable: false,
    },
    {
      id: "year",
      header: "年份",
      align: "right",
      cell: (u) => <span className="text-[12px]">{u.year}</span>,
      exportValue: (u) => u.year,
      sortValue: (u) => u.year,
    },
    {
      id: "km",
      header: "里程",
      align: "right",
      cell: (u) => <span className="text-[12px] font-mono">{u.km.toLocaleString()}</span>,
      exportValue: (u) => u.km,
      sortValue: (u) => u.km,
    },
    {
      id: "daysInStock",
      header: "在庫天",
      align: "right",
      cell: (u) => (
        <span className={"text-[12px] font-mono font-bold " + daysToneClass(u.daysInStock)}>
          {u.daysInStock} 天
        </span>
      ),
      exportValue: (u) => u.daysInStock,
      sortValue: (u) => u.daysInStock,
    },
    {
      id: "cost",
      header: "成本",
      align: "right",
      cell: (u) => <span className="text-[11.5px] font-mono">{u.cost.toLocaleString()}</span>,
      exportValue: (u) => u.cost,
      sortValue: (u) => u.cost,
    },
    {
      id: "price",
      header: "售價",
      align: "right",
      cell: (u) => (
        <span className="text-[12px] font-mono font-bold">{u.price.toLocaleString()}</span>
      ),
      exportValue: (u) => u.price,
      sortValue: (u) => u.price,
    },
    {
      id: "margin",
      header: "利潤",
      sortable: false,
      cell: (u) => {
        const rate = marginRate(u.margin, u.price);
        const lowMargin = isLowMargin(u.margin, u.price);
        return (
          <div
            className="inline-flex items-center gap-1 flex-wrap"
            data-low-margin={lowMargin ? "true" : "false"}
            data-testid={`usedcar-row-${u.id}`}
          >
            <span
              className={
                "text-[10.5px] px-1.5 py-0.5 rounded font-semibold " + marginChipClass(rate)
              }
            >
              {rate}%
            </span>
            {lowMargin && (
              <span
                className={LOW_MARGIN_CHIP_CLASS}
                data-testid={`row-chip-low-margin-${u.id}`}
              >
                ⚠️ 低毛利
              </span>
            )}
          </div>
        );
      },
      exportValue: (u) => marginRate(u.margin, u.price),
    },
    {
      id: "status",
      header: "狀態",
      cell: (u) => (
        <span
          className={
            "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold " +
            STATUS_CHIP[u.status]
          }
        >
          {u.status}
        </span>
      ),
      exportValue: (u) => u.status,
      sortValue: (u) => u.status,
    },
  ];

  return (
    <div data-testid="usedcar-list-view">
      <DataGrid
        columns={columns}
        data={units}
        rowKey={(u) => u.id}
        persistKey="sales/showroom/usedcar-inventory"
        exportFileName="usedcar-inventory"
        emptyMessage="沒有符合條件的庫存"
        rowActionsWidth={140}
        rowActions={(u) => (
          <>
            <button
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              onClick={() => onAction(u, "appraise")}
              data-testid={`row-btn-appraise-${u.id}`}
            >
              評估
            </button>
            <button
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#142E4A]"
              onClick={() => onAction(u, "quote")}
              data-testid={`row-btn-quote-${u.id}`}
            >
              報價
            </button>
          </>
        )}
      />
    </div>
  );
}
