"use client";

/**
 * 中古車庫存看板（合併版）— 第九輪 BDN Batch A T2
 *
 * 取代：
 *   - `used-cars-board.tsx`（DataGrid only）
 *   - `usedcar-inventory-board.tsx`（卡片版、接 mock）
 *
 * 設計：單一 board，view toggle（卡片 / 列表）切換，資料源走真 DB（@/domain/used-car-inventory）。
 * 列表模式保留 DataGrid 既有功能；卡片模式照 RS03B_中古車庫存看板_v1.html 樣板。
 *
 * 中古車跟新車不同：used_car_inventory 表已經有 `cost` / `margin` 欄位，
 * 所以利潤% 直接 (margin / listing_price) * 100 計算（沒有 TODO）。
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";
import { BarChart } from "@/components/charts";
import {
  DisplayModeToggle,
  readPersistedMode,
  type DisplayMode,
} from "@/components/inventory/display-mode-toggle";
import {
  setUsedCarStatusAction,
  deleteUsedCarAction,
} from "@/lib/sales/used-car-actions";
import type {
  UsedCarInventoryRow,
  UsedCarDbStatus,
  UsedCarConditionGrade,
} from "@/domain/used-car-inventory.constants";
import type {
  UsedCarBoardKpi,
  UsedCarByModelDatum,
  UsedCarSlowMover,
} from "@/domain/used-car-inventory";
import {
  calcDaysInStock,
  statusLabel,
  inKmRange,
  USED_CAR_GRADE_OPTIONS,
  USED_CAR_STATUS_OPTIONS,
  USED_CAR_KM_RANGE_OPTIONS,
  type UsedCarKmRange,
} from "@/domain/used-car-inventory.constants";

// ── Design tokens ─────────────────────────────────────────────────────

const STATUS_CHIP: Record<UsedCarDbStatus, string> = {
  available: "bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]",
  reserved: "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]",
  sold: "bg-[#FDECEA] text-[#C8001A] border border-[#F5AEAD]",
  pending_inspection: "bg-[#EEEDFE] text-[#534AB7] border border-[#C5C0F0]",
  withdrawn: "bg-[#F2F2F2] text-[#6B6A68] border border-[#D5D3CB]",
};

const GRADE_BADGE: Record<UsedCarConditionGrade, string> = {
  S: "bg-[#7A1010] text-white",
  A: "bg-[#185FA5] text-white",
  B: "bg-[#0F6E56] text-white",
  C: "bg-[#854F0B] text-white",
  D: "bg-[#9A9890] text-white",
};

const PERSIST_KEY = "sales/showroom/used-cars";

// ── helpers ──

function marginRate(margin: number | null, price: number | null): number | null {
  if (margin == null || price == null || price <= 0) return null;
  return Math.round((margin / price) * 100);
}

function isLowMargin(margin: number | null, price: number | null): boolean {
  if (margin == null || price == null || price <= 0) return false;
  return (margin / price) * 100 <= 5;
}

function marginChipClass(rate: number | null): string {
  if (rate === null) return "bg-[#F2F2F2] text-[#6B6A68]";
  if (rate >= 15) return "bg-[#E1F5EE] text-[#0F6E56]";
  if (rate >= 8) return "bg-[#FDF3E3] text-[#854F0B]";
  return "bg-[#FDECEA] text-[#C8001A]";
}

function daysToneClass(days: number): string {
  if (days > 90) return "text-[#C8001A]";
  if (days > 60) return "text-[#854F0B]";
  return "text-[#0F6E56]";
}

function isAged90(listedDate: string | null, status: UsedCarDbStatus): boolean {
  if (status === "sold" || status === "withdrawn") return false;
  return calcDaysInStock(listedDate, null) > 90;
}

function isNegativeMargin(margin: number | null): boolean {
  return margin != null && margin < 0;
}

const LOW_MARGIN_ROW_BG = "bg-[#FEF7E6]";
const LOW_MARGIN_CHIP_CLASS =
  "inline-flex items-center text-[10.5px] px-1.5 py-0.5 rounded font-semibold bg-[#FDECEA] text-[#CC0000] whitespace-nowrap";

// ── Props ─────────────────────────────────────────────────────────────

type Props = {
  rows: UsedCarInventoryRow[];
  totalCount: number;
  /** "dealer" = 展廳接待視角；"usedcar" = 中古車輛模組視角 */
  viewMode?: "dealer" | "usedcar";
  /** A 級看板必傳，舊 caller 不傳則整段隱藏 */
  kpi?: UsedCarBoardKpi;
  byModel?: UsedCarByModelDatum[];
  slowMovers?: UsedCarSlowMover[];
};

type Banner = { ok: boolean; msg: string } | null;

// ─────────────────────────────────────────────────────────────────────

export default function UsedCarInventoryBoard({
  rows,
  totalCount,
  viewMode = "dealer",
  kpi,
  byModel,
  slowMovers,
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => readPersistedMode(PERSIST_KEY, "card"));

  const [grade, setGrade] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [kmRange, setKmRange] = useState<string>("");
  const [query, setQuery] = useState<string>("");

  const isUsedcarModule = viewMode === "usedcar";

  useSetPageHeader({
    title: "中古車庫存",
    breadcrumb: isUsedcarModule
      ? [{ label: "中古車輛" }, { label: "中古車庫存" }]
      : [{ label: "展廳接待" }, { label: "中古車庫存" }],
  });

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
  }

  // ── 前端過濾 ──
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (grade && r.condition_grade !== grade) return false;
      if (status && r.status !== status) return false;
      if (!inKmRange(r.mileage_km ?? 0, kmRange as UsedCarKmRange | "")) return false;
      if (q && !(r.model_display_name ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, grade, status, kmRange, query]);

  // ── 狀態切換 ──
  function handleSetStatus(row: UsedCarInventoryRow, next: UsedCarDbStatus) {
    startTransition(async () => {
      const res = await setUsedCarStatusAction(row.id, next);
      if (res.ok) {
        showBanner(true, `✓ ${row.model_display_name} 狀態已更新`);
        router.refresh();
      } else {
        showBanner(false, res.error);
      }
    });
  }

  // ── 刪除 ──
  function handleDelete(row: UsedCarInventoryRow) {
    if (!confirm(`確定要刪除「${row.model_display_name}」嗎？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteUsedCarAction(row.id);
      if (res.ok) {
        showBanner(true, `✓ 已刪除 ${row.model_display_name}`);
        router.refresh();
      } else {
        showBanner(false, res.error);
      }
    });
  }

  // ── DataGrid columns（列表模式）──
  const columns: DataGridColumn<UsedCarInventoryRow>[] = [
    {
      id: "condition_grade",
      header: "等級",
      width: 60,
      hideable: false,
      sortable: false,
      cell: (r) =>
        r.condition_grade ? (
          <span
            className={
              "inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[11px] font-bold " +
              (GRADE_BADGE[r.condition_grade] ?? "bg-[#9A9890] text-white")
            }
          >
            {r.condition_grade}
          </span>
        ) : (
          <span className="text-[11px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.condition_grade ?? "",
    },
    {
      id: "model_display_name",
      header: "車款",
      width: 180,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/sales/showroom/used-cars/${r.id}`}
          className="font-semibold text-[12.5px] text-[#185FA5] hover:underline"
        >
          {r.model_display_name}
        </Link>
      ),
      exportValue: (r) => r.model_display_name,
      sortValue: (r) => r.model_display_name,
    },
    {
      id: "year",
      header: "年份",
      width: 65,
      cell: (r) => <span className="text-[12px]">{r.year}</span>,
      exportValue: (r) => String(r.year),
      sortValue: (r) => r.year,
    },
    {
      id: "vin",
      header: "VIN 末 5",
      width: 90,
      defaultHidden: true,
      cell: (r) => (
        <span className="font-mono text-[12px]">{r.vin ? r.vin.slice(-5) : "—"}</span>
      ),
      exportValue: (r) => (r.vin ? r.vin.slice(-5) : ""),
    },
    {
      id: "color",
      header: "顏色",
      width: 70,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          {r.color_hex && (
            <span
              className="w-3 h-3 rounded-full border border-[#D5D3CB] shrink-0"
              style={{ background: r.color_hex }}
            />
          )}
          <span className="text-[12px]">{r.color ?? "—"}</span>
        </span>
      ),
      exportValue: (r) => r.color ?? "",
      sortValue: (r) => r.color ?? "",
    },
    {
      id: "mileage_km",
      header: "里程 (km)",
      width: 95,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px]">{(r.mileage_km ?? 0).toLocaleString()}</span>
      ),
      exportValue: (r) => String(r.mileage_km ?? 0),
      sortValue: (r) => r.mileage_km ?? 0,
    },
    {
      id: "days_in_stock",
      header: "在庫天數",
      width: 110,
      align: "right",
      cell: (r) => {
        const days = calcDaysInStock(r.listed_date, r.status === "sold" ? r.sold_date : null);
        const aged = isAged90(r.listed_date, r.status);
        return (
          <span className="inline-flex items-center gap-1 justify-end">
            <span className={"font-mono font-semibold text-[12px] " + daysToneClass(days)}>
              {days} 天
            </span>
            {aged && (
              <span
                className="text-[10px] px-1 py-0.5 rounded font-semibold bg-[#FDECEA] text-[#CC0000] whitespace-nowrap"
                data-testid={`chip-aged-90-${r.id}`}
              >
                老
              </span>
            )}
          </span>
        );
      },
      exportValue: (r) =>
        String(calcDaysInStock(r.listed_date, r.status === "sold" ? r.sold_date : null)),
      sortValue: (r) =>
        calcDaysInStock(r.listed_date, r.status === "sold" ? r.sold_date : null),
    },
    {
      id: "cost",
      header: "成本 (NT$)",
      width: 110,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[11.5px]">
          {r.cost != null ? r.cost.toLocaleString() : "—"}
        </span>
      ),
      exportValue: (r) => String(r.cost ?? ""),
      sortValue: (r) => r.cost ?? 0,
    },
    {
      id: "listing_price",
      header: "售價 (NT$)",
      width: 115,
      align: "right",
      cell: (r) => (
        <span className="font-mono font-bold text-[12px] text-[#1A3A5C]">
          {r.listing_price != null ? r.listing_price.toLocaleString() : "—"}
        </span>
      ),
      exportValue: (r) => String(r.listing_price ?? ""),
      sortValue: (r) => r.listing_price ?? 0,
    },
    {
      id: "margin_rate",
      header: "毛利率",
      width: 120,
      align: "right",
      cell: (r) => {
        const rate = marginRate(r.margin, r.listing_price);
        const neg = isNegativeMargin(r.margin);
        const low = !neg && isLowMargin(r.margin, r.listing_price);
        return (
          <span className="inline-flex items-center gap-1 justify-end">
            <span
              className={"text-[10.5px] px-1.5 py-0.5 rounded font-semibold " + marginChipClass(rate)}
              data-testid={`margin-rate-${r.id}`}
            >
              {rate === null ? "—" : `${rate}%`}
            </span>
            {neg && (
              <span
                className="text-[10px] px-1 py-0.5 rounded font-semibold bg-[#C8001A] text-white whitespace-nowrap"
                data-testid={`chip-neg-margin-${r.id}`}
              >
                負利
              </span>
            )}
            {low && (
              <span className="text-[10px] px-1 py-0.5 rounded font-semibold bg-[#FDECEA] text-[#CC0000] whitespace-nowrap">
                低毛利
              </span>
            )}
          </span>
        );
      },
      exportValue: (r) => {
        const rate = marginRate(r.margin, r.listing_price);
        return rate === null ? "" : `${rate}%`;
      },
      sortValue: (r) => marginRate(r.margin, r.listing_price) ?? -999,
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => (
        <span
          className={
            "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold whitespace-nowrap " +
            (STATUS_CHIP[r.status] ?? "")
          }
        >
          {statusLabel(r.status)}
        </span>
      ),
      exportValue: (r) => statusLabel(r.status),
      sortValue: (r) => r.status,
    },
    {
      id: "lien_cleared",
      header: "動保",
      width: 70,
      defaultHidden: true,
      cell: (r) => {
        if (r.lien_cleared === null || r.lien_cleared === undefined)
          return <span className="text-[11px] text-[#9A9890]">—</span>;
        return r.lien_cleared ? (
          <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11]">
            已清償
          </span>
        ) : (
          <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-[#FDECEA] text-[#CC0000]">
            未清償
          </span>
        );
      },
      exportValue: (r) =>
        r.lien_cleared === null ? "" : r.lien_cleared ? "已清償" : "未清償",
    },
    {
      id: "note",
      header: "備註",
      width: 160,
      defaultHidden: true,
      sortable: false,
      cell: (r) => (
        <span className="text-[11.5px] text-[#5A5955] line-clamp-1">{r.note ?? ""}</span>
      ),
      exportValue: (r) => r.note ?? "",
    },
  ];

  return (
    <main
      className="px-6 py-5 space-y-3"
      data-testid="usedcar-inventory-board"
      data-display-mode={displayMode}
      data-view-mode={viewMode}
    >
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">中古車庫存</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {isUsedcarModule ? "中古車輛 / RS03B" : "展廳接待 / RS03B"}
        </span>
        {isUsedcarModule && (
          <span
            className="px-2 py-0.5 text-[11px] rounded-full bg-[#FDF3E3] text-[#854F0B] font-medium"
            data-testid="usedcar-perspective-chip"
          >
            中古車輛
          </span>
        )}
        <span className="text-[12px] text-[#9A9890]">
          展廳中古車庫存管理 — 等級、整備、保留與在庫天數
        </span>
      </header>

      {/* KPI Row — A 級看板（M01-7）*/}
      {kpi && (
        <section
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5"
          data-testid="usedcar-kpi-row"
        >
          <KpiCard
            label="總台數"
            value={kpi.total}
            tone="gray"
            layout="vertical"
          />
          <KpiCard
            label="在庫可售"
            value={kpi.available}
            tone="teal"
            layout="vertical"
          />
          <KpiCard
            label="平均毛利率"
            value={`${kpi.avgMarginRate}%`}
            tone={kpi.avgMarginRate >= 15 ? "green" : kpi.avgMarginRate >= 8 ? "amber" : "red"}
            layout="vertical"
          />
          <KpiCard
            label="庫齡 > 90 天"
            value={kpi.aged90}
            tone={kpi.aged90 === 0 ? "gray" : "amber"}
            layout="vertical"
          />
          <KpiCard
            label="負毛利車"
            value={kpi.negativeMargin}
            tone={kpi.negativeMargin === 0 ? "gray" : "red"}
            layout="vertical"
          />
          <KpiCard
            label="本月已售"
            value={kpi.soldThisMonth}
            tone="blue"
            layout="vertical"
          />
        </section>
      )}

      {/* BarChart by-model + Slow Movers 並排 */}
      {(byModel || slowMovers) && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div
            className="lg:col-span-2 bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="usedcar-by-model-chart"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ 各車型庫存（依狀態堆疊）
              </span>
              <span className="text-[11px] text-[#9A9890]">
                — 哪些車有量、哪些車型卡很久
              </span>
            </header>
            <div className="px-3 py-3">
              {!byModel || byModel.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-[#9A9890]">
                  尚無庫存資料
                </div>
              ) : (
                <BarChart
                  data={byModel as unknown as Record<string, unknown>[]}
                  categoryKey="model"
                  valueKey={[
                    { key: "available", label: "在庫可售", color: "#0F6E56" },
                    { key: "pending_inspection", label: "整備中", color: "#534AB7" },
                    { key: "reserved", label: "已保留", color: "#854F0B" },
                    { key: "sold", label: "已售出", color: "#C8001A" },
                    { key: "withdrawn", label: "已下架", color: "#9A9890" },
                  ]}
                  stacked
                  showLegend
                  size="md"
                />
              )}
            </div>
          </div>
          <div
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="usedcar-slow-movers"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#854F0B]">
                ⚠ 庫齡 &gt; 90 天
              </span>
              <span className="text-[11px] text-[#9A9890]">老闆要看哪些賣不動</span>
              <span className="ml-auto inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-[#FDF3E3] text-[#854F0B]">
                {slowMovers?.length ?? 0}
              </span>
            </header>
            <div className="max-h-[260px] overflow-y-auto">
              {!slowMovers || slowMovers.length === 0 ? (
                <div className="py-10 text-center text-[12px] text-[#9A9890]">
                  ✓ 沒有庫齡過長的車
                </div>
              ) : (
                <ul className="divide-y divide-[#F4F2EC]">
                  {slowMovers.slice(0, 10).map((s) => (
                    <li key={s.id} className="px-4 py-2 hover:bg-[#FAFAF8]">
                      <Link
                        href={`/sales/showroom/used-cars/${s.id}`}
                        className="flex items-center gap-2 text-[12px]"
                      >
                        <span className="font-semibold text-[#2C2C2A] truncate flex-1">
                          {s.model_display_name}
                        </span>
                        <span className="text-[10.5px] text-[#9A9890] whitespace-nowrap">
                          {s.color ?? "—"}
                        </span>
                        <span className="font-mono font-bold text-[#C8001A] text-[12px] whitespace-nowrap">
                          {s.days_in_stock} 天
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Banner */}
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

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">等級</label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
              data-testid="filter-grade"
            >
              {USED_CAR_GRADE_OPTIONS.map((o) => (
                <option key={o.value || "all-grade"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
              data-testid="filter-status"
            >
              {USED_CAR_STATUS_OPTIONS.map((o) => (
                <option key={o.value || "all-status"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">里程</label>
            <select
              value={kmRange}
              onChange={(e) => setKmRange(e.target.value)}
              className="h-[30px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
              data-testid="filter-km"
            >
              {USED_CAR_KM_RANGE_OPTIONS.map((o) => (
                <option key={o.value || "all-km"} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">搜尋</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="車款 / 關鍵字"
              className="h-[30px] w-[180px] px-2 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] outline-none"
              data-testid="filter-search"
            />
          </div>
          <div className="flex gap-2 ml-auto items-end">
            <button
              onClick={() => {
                setGrade(""); setStatus(""); setKmRange(""); setQuery("");
              }}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar：count + view toggle + 視角切換 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-[#9A9890]" data-testid="usedcar-count">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆庫存（顯示{" "}
          <b>{filtered.length}</b> 筆）
        </span>
        <div className="ml-auto flex gap-2 items-center">
          <Link
            href={isUsedcarModule ? "/sales/showroom/used-cars" : "/usedcar/stock"}
            className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            {isUsedcarModule ? "← 展廳視角" : "→ 中古車模組視角"}
          </Link>
          <DisplayModeToggle value={displayMode} onChange={setDisplayMode} persistKey={PERSIST_KEY} />
        </div>
      </div>

      {/* Card / List */}
      {displayMode === "card" ? (
        <CardGrid
          rows={filtered}
          onSetStatus={handleSetStatus}
          onDelete={handleDelete}
          isPending={isPending}
        />
      ) : (
        <DataGrid
          columns={columns}
          data={filtered}
          rowKey={(r) => r.id}
          persistKey="sales/showroom/used-cars"
          exportFileName="used-car-inventory"
          emptyMessage="沒有符合條件的中古車庫存"
          disabled={isPending}
          rowActionsWidth={200}
          rowActions={(r) => (
            <>
              <button
                onClick={() => router.push(`/sales/showroom/used-cars/${r.id}`)}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                詳情
              </button>
              {r.status !== "sold" && (
                <button
                  onClick={() =>
                    handleSetStatus(r, r.status === "available" ? "reserved" : "available")
                  }
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                >
                  {r.status === "available" ? "保留" : "取消保留"}
                </button>
              )}
              <button
                onClick={() => handleDelete(r)}
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
              >
                刪除
              </button>
            </>
          )}
        />
      )}
    </main>
  );
}

// ── Card Grid ─────────────────────────────────────────────────────────

function CardGrid({
  rows,
  onSetStatus,
  onDelete,
  isPending,
}: {
  rows: UsedCarInventoryRow[];
  onSetStatus: (row: UsedCarInventoryRow, next: UsedCarDbStatus) => void;
  onDelete: (row: UsedCarInventoryRow) => void;
  isPending: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-white border border-[#EEECE6] rounded-lg py-12 text-center text-[12px] text-[#9A9890]">
        沒有符合條件的中古車庫存
      </div>
    );
  }
  return (
    <div
      data-testid="usedcar-card-grid"
      className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
    >
      {rows.map((r) => {
        const rate = marginRate(r.margin, r.listing_price);
        const neg = isNegativeMargin(r.margin);
        const low = !neg && isLowMargin(r.margin, r.listing_price);
        const days = calcDaysInStock(r.listed_date, r.status === "sold" ? r.sold_date : null);
        const aged = isAged90(r.listed_date, r.status);
        const warn = neg || low || aged;
        return (
          <article
            key={r.id}
            data-testid={`usedcar-card-${r.id}`}
            data-low-margin={low ? "true" : "false"}
            data-neg-margin={neg ? "true" : "false"}
            data-aged-90={aged ? "true" : "false"}
            className={
              "border rounded-lg overflow-hidden hover:shadow-md transition " +
              (neg
                ? "border-[#F5AEAD] bg-[#FDECEA]"
                : aged
                  ? "border-[#F0C97E] bg-[#FDF3E3]"
                  : warn
                    ? "border-[#F0C97E] " + LOW_MARGIN_ROW_BG
                    : "border-[#EEECE6] bg-white hover:border-[#85B7EB]")
            }
          >
            <div
              className="h-[110px] flex items-center justify-center relative overflow-hidden"
              style={{
                background: r.images && r.images.length > 0
                  ? "#F8F7F4"
                  : r.color_hex
                    ? `linear-gradient(135deg, ${r.color_hex} 0%, ${r.color_hex}99 100%)`
                    : "linear-gradient(135deg, #5A5955 0%, #9A9890 100%)",
              }}
            >
              {r.images && r.images.length > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={r.images[0]}
                  alt={r.model_display_name ?? "車輛照片"}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <span className="text-[40px] opacity-60">🏍️</span>
              )}
              {r.condition_grade && (
                <span
                  className={
                    "absolute top-2 left-2 w-[28px] h-[28px] rounded-full flex items-center justify-center text-[12px] font-bold " +
                    (GRADE_BADGE[r.condition_grade] ?? "bg-[#9A9890] text-white")
                  }
                >
                  {r.condition_grade}
                </span>
              )}
              <span
                className={
                  "absolute top-2 right-2 text-[10.5px] font-bold px-2 py-0.5 rounded " +
                  (STATUS_CHIP[r.status] ?? "")
                }
              >
                {statusLabel(r.status)}
              </span>
            </div>
            <div className="p-3">
              <Link
                href={`/sales/showroom/used-cars/${r.id}`}
                className="block text-[13px] font-bold text-[#2C2C2A] hover:text-[#185FA5]"
              >
                {r.model_display_name}
              </Link>
              <div className="text-[11px] text-[#9A9890] mb-2">
                {r.year} 年 · {r.color ?? "—"}
                {r.vin && <> · VIN {r.vin.slice(-5)}</>}
              </div>
              <div className="space-y-0.5 mb-2">
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">里程</span>
                  <span className="font-mono font-semibold">
                    {(r.mileage_km ?? 0).toLocaleString()} km
                  </span>
                </div>
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">收購成本</span>
                  <span className="font-mono font-semibold">
                    {r.cost != null ? `NT$ ${r.cost.toLocaleString()}` : "—"}
                  </span>
                </div>
                <div className="flex justify-between text-[11.5px]">
                  <span className="text-[#9A9890]">在庫天數</span>
                  <span className={"font-mono font-semibold " + daysToneClass(days)}>
                    {days} 天
                  </span>
                </div>
              </div>
              <div className="mb-2">
                <div className="text-[15px] font-bold font-mono text-[#1A3A5C]">
                  {r.listing_price != null ? `NT$ ${r.listing_price.toLocaleString()}` : "—"}
                </div>
                <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                  <span
                    className={"text-[11px] px-1.5 py-0.5 rounded font-semibold " + marginChipClass(rate)}
                    data-testid={`margin-chip-${r.id}`}
                  >
                    利潤 {rate === null ? "—" : `${rate}%`}
                  </span>
                  {neg && (
                    <span
                      className="inline-flex items-center text-[10.5px] px-1.5 py-0.5 rounded font-semibold bg-[#C8001A] text-white whitespace-nowrap"
                      data-testid={`chip-neg-margin-${r.id}`}
                    >
                      ⚠️ 負利潤
                    </span>
                  )}
                  {low && (
                    <span
                      className={LOW_MARGIN_CHIP_CLASS}
                      data-testid={`chip-low-margin-${r.id}`}
                    >
                      ⚠️ 低毛利
                    </span>
                  )}
                  {aged && (
                    <span
                      className="inline-flex items-center text-[10.5px] px-1.5 py-0.5 rounded font-semibold bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E] whitespace-nowrap"
                      data-testid={`chip-aged-90-card-${r.id}`}
                    >
                      庫齡 {days} 天
                    </span>
                  )}
                </div>
              </div>
              {/* 動保 / 認證 chip 列 */}
              {(r.lien_cleared !== null || r.condition_grade === "S") && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {r.lien_cleared === true && (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EAF3DE] text-[#3B6D11]"
                      data-testid={`chip-lien-cleared-${r.id}`}
                    >
                      動保已清償
                    </span>
                  )}
                  {r.lien_cleared === false && (
                    <span
                      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDECEA] text-[#CC0000]"
                      data-testid={`chip-lien-uncleared-${r.id}`}
                    >
                      動保未清償
                    </span>
                  )}
                </div>
              )}
              {r.note && (
                <div className="text-[10.5px] text-[#854F0B] mb-2 line-clamp-2">📌 {r.note}</div>
              )}
              <div className="flex gap-1.5">
                <Link
                  href={`/sales/showroom/used-cars/${r.id}`}
                  className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] inline-flex items-center justify-center"
                  data-testid={`btn-appraise-${r.id}`}
                >
                  評估
                </Link>
                {r.status !== "sold" ? (
                  <button
                    onClick={() =>
                      onSetStatus(r, r.status === "available" ? "reserved" : "available")
                    }
                    disabled={isPending}
                    className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#085041] disabled:opacity-50"
                    data-testid={`btn-reserve-${r.id}`}
                  >
                    {r.status === "available" ? "保留" : "取消保留"}
                  </button>
                ) : (
                  <button
                    onClick={() => onDelete(r)}
                    disabled={isPending}
                    className="flex-1 h-[28px] rounded text-[11.5px] font-semibold bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                    data-testid={`btn-delete-${r.id}`}
                  >
                    刪除
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
