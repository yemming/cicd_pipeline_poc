"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";

import type {
  AbcClass,
  TurnoverAction,
  TurnoverOverview,
  TurnoverRow,
} from "@/domain/analytics";

const CLASS_BADGE: Record<AbcClass, string> = {
  A: "bg-[#FDECEA] text-[#CC0000]",
  B: "bg-[#FDF3E3] text-[#854F0B]",
  C: "bg-[#EAF4FB] text-[#185FA5]",
};

const ACTION_META: Record<
  TurnoverAction,
  { label: string; cls: string }
> = {
  preferred_replenish: {
    label: "優先補貨",
    cls: "bg-[#EAF3DE] text-[#3B6D11]",
  },
  normal_replenish: {
    label: "正常補貨",
    cls: "bg-[#EAF3DE] text-[#3B6D11]",
  },
  watch: {
    label: "觀察補貨",
    cls: "bg-[#FDF3E3] text-[#854F0B]",
  },
  stop_replenish: {
    label: "停止補貨",
    cls: "bg-[#FDF3E3] text-[#854F0B]",
  },
  clearance: {
    label: "建議清倉",
    cls: "bg-[#FDECEA] text-[#CC0000]",
  },
};

function fmtNTCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `NT$ ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `NT$ ${(n / 10_000).toFixed(1)} 萬`;
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}

function turnoverColor(ratio: number): string {
  if (ratio >= 8) return "text-[#3B6D11]";
  if (ratio >= 3) return "text-[#185FA5]";
  if (ratio >= 1) return "text-[#854F0B]";
  return "text-[#CC0000]";
}

export function TurnoverBoard({
  overview,
  rows,
}: {
  overview: TurnoverOverview;
  rows: TurnoverRow[];
}) {
  const [classFilter, setClassFilter] = useState<AbcClass | "all">("all");
  const [search, setSearch] = useState("");
  const [sortMode, setSortMode] = useState<
    "ratio_asc" | "ratio_desc" | "amount_desc"
  >("ratio_asc");

  const filteredRows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    const out = rows.filter((r) => {
      if (classFilter !== "all" && r.abc_class !== classFilter) return false;
      if (
        kw &&
        !r.item_code.toLowerCase().includes(kw) &&
        !r.item_name.toLowerCase().includes(kw)
      ) {
        return false;
      }
      return true;
    });
    out.sort((a, b) => {
      if (sortMode === "ratio_desc") return b.turnover_ratio - a.turnover_ratio;
      if (sortMode === "amount_desc") return b.out_amount_12m - a.out_amount_12m;
      return a.turnover_ratio - b.turnover_ratio; // default: 低→高
    });
    return out;
  }, [rows, classFilter, search, sortMode]);

  // ── Charts: monthly trend bar heights ──────────────────────────────────────
  const maxMonthly = useMemo(() => {
    const max = overview.monthly_trend.reduce(
      (m, b) => Math.max(m, b.out_qty),
      0,
    );
    return max > 0 ? max : 1;
  }, [overview.monthly_trend]);

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          報表：庫存周轉率
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          §12.2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          各類別周轉率分析 · 月度趨勢 · 低周轉料號明細（共 {overview.total_items} 料號，
          {overview.classified_items} 已分類）
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          <Link
            href="/parts/analytics/abc"
            className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] font-medium bg-white text-[#5A5955] border border-[#D5D3CB] hover:border-[#9A9890]"
          >
            ↳ ABC 分類報表
          </Link>
        </span>
      </header>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          accent="#1A3A5C"
          label="整體周轉率（12M）"
          value={`${overview.overall_ratio.toFixed(1)} 次`}
          sub={
            overview.overall_days != null
              ? `平均周轉天數 ${overview.overall_days} 天`
              : "—"
          }
        />
        <KpiClassTile
          cls="A"
          ratio={overview.class_avg.A}
          target={overview.class_target.A}
          count={overview.class_count.A}
        />
        <KpiClassTile
          cls="B"
          ratio={overview.class_avg.B}
          target={overview.class_target.B}
          count={overview.class_count.B}
        />
        <KpiClassTile
          cls="C"
          ratio={overview.class_avg.C}
          target={overview.class_target.C}
          count={overview.class_count.C}
        />
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              ABC 分類
            </label>
            <div className="flex gap-1.5">
              {(["all", "A", "B", "C"] as const).map((id) => {
                const active = classFilter === id;
                const tone =
                  id === "all" ? "" : CLASS_BADGE[id as AbcClass];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setClassFilter(id)}
                    className={`h-[30px] px-2.5 rounded text-[12px] font-medium border transition
                      ${
                        active
                          ? id === "all"
                            ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                            : `${tone} border-current`
                          : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                      }`}
                  >
                    {id === "all" ? "全部" : `${id} 類`}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              排序
            </label>
            <select
              value={sortMode}
              onChange={(e) =>
                setSortMode(
                  e.target.value as
                    | "ratio_asc"
                    | "ratio_desc"
                    | "amount_desc",
                )
              }
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
            >
              <option value="ratio_asc">周轉率 低→高</option>
              <option value="ratio_desc">周轉率 高→低</option>
              <option value="amount_desc">12M 銷售額 高→低</option>
            </select>
          </div>

          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[11px] text-[#9A9890] font-medium">
              搜尋
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="料號 / 商品名稱…"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
            />
          </div>
        </div>
      </section>

      {/* Monthly Trend */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 月度出庫趨勢（近 6 個月）
          </span>
          <span className="text-[11px] text-[#9A9890]">資料來源：stock_issues</span>
        </header>
        <div className="px-4 py-4">
          {overview.monthly_trend.every((b) => b.out_qty === 0) ? (
            <div className="text-[12px] text-[#9A9890] py-6 text-center">
              近 6 個月尚無出庫資料
            </div>
          ) : (
            <div className="flex items-end gap-3 h-[120px]">
              {overview.monthly_trend.map((b, idx) => {
                const isLatest = idx === overview.monthly_trend.length - 1;
                const heightPct = (b.out_qty / maxMonthly) * 100;
                return (
                  <div
                    key={b.month}
                    className="flex flex-col items-center gap-1 flex-1 min-w-0"
                  >
                    <div
                      className="w-full rounded-t flex items-end justify-center"
                      style={{
                        height: `${Math.max(2, heightPct)}%`,
                        background: isLatest ? "#0F6E56" : "#D5D3CB",
                      }}
                    />
                    <div className="text-[10px] text-[#9A9890]">
                      {b.month.slice(5)} 月
                    </div>
                    <div
                      className={`text-[11px] font-medium ${
                        isLatest ? "text-[#0F6E56]" : "text-[#2C2C2A]"
                      }`}
                    >
                      {b.out_qty.toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Detail Table */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 庫存周轉率明細
          </span>
          <span className="text-[12px] text-[#9A9890]">
            顯示 <b className="text-[#2C2C2A]">{filteredRows.length}</b> /{" "}
            <b className="text-[#2C2C2A]">{rows.length}</b> 料號
          </span>
        </header>
        <div className="p-3">
          <TurnoverGrid rows={filteredRows} />
        </div>
      </section>

      {/* Caveat */}
      <div className="bg-[#FDF3E3] border border-[#F5DDA0] text-[#854F0B] rounded-md px-3 py-2 text-[11.5px] leading-relaxed">
        <b>計算說明</b>：12M 出庫量 / 出庫金額取自 ABC 分類重跑結果；期初庫存由「期末 + 出庫 − 入庫」倒推（非歷史 snapshot）；周轉率分母採「平均庫存」=（期初 + 期末）/ 2；期末為 0 但仍有出貨者周轉率以 999 表示（超高周轉）。
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// KPI Tiles
// ──────────────────────────────────────────────────────────────────────────

function KpiTile({
  accent,
  label,
  value,
  sub,
  trend,
  trendColor,
}: {
  accent: string;
  label: string;
  value: string;
  sub: string;
  trend?: string;
  trendColor?: string;
}) {
  return (
    <div
      className="bg-white border border-[#EEECE6] rounded-lg p-3.5"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="text-[22px] font-bold text-[#2C2C2A] mt-1">{value}</div>
      <div className="text-[11px] text-[#5A5955] mt-0.5">{sub}</div>
      {trend ? (
        <div
          className="text-[11px] font-semibold mt-1"
          style={{ color: trendColor ?? "#5A5955" }}
        >
          {trend}
        </div>
      ) : null}
    </div>
  );
}

function KpiClassTile({
  cls,
  ratio,
  target,
  count,
}: {
  cls: AbcClass;
  ratio: number;
  target: number;
  count: number;
}) {
  const accent =
    cls === "A" ? "#CC0000" : cls === "B" ? "#EF9F27" : "#185FA5";
  const onTarget = ratio >= target;
  const trend = onTarget
    ? `▲ 達標（目標 ≥ ${target}）`
    : ratio === 0
      ? `— 無數據（目標 ≥ ${target}）`
      : `▼ 偏低（目標 ≥ ${target}）`;
  const trendColor = onTarget ? "#3B6D11" : ratio === 0 ? "#9A9890" : "#CC0000";
  return (
    <KpiTile
      accent={accent}
      label={`${cls} 類平均周轉率`}
      value={`${ratio.toFixed(1)} 次`}
      sub={`${count} 種零件`}
      trend={trend}
      trendColor={trendColor}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────────
// DataGrid
// ──────────────────────────────────────────────────────────────────────────

function TurnoverGrid({ rows }: { rows: TurnoverRow[] }) {
  const columns: DataGridColumn<TurnoverRow>[] = useMemo(
    () => [
      {
        id: "code",
        header: "料號",
        width: 140,
        hideable: false,
        cell: (r) => (
          <span className="font-mono text-[12px] font-semibold text-[#1A3A5C]">
            {r.item_code}
          </span>
        ),
        sortValue: (r) => r.item_code,
        exportValue: (r) => r.item_code,
      },
      {
        id: "name",
        header: "商品名稱",
        cell: (r) => (
          <span className="font-medium text-[#2C2C2A]">{r.item_name}</span>
        ),
        sortValue: (r) => r.item_name,
        exportValue: (r) => r.item_name,
      },
      {
        id: "category",
        header: "品類",
        width: 110,
        cell: (r) =>
          r.category ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
              {r.category}
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        sortValue: (r) => r.category ?? "",
        exportValue: (r) => r.category ?? "",
      },
      {
        id: "abc",
        header: "ABC",
        width: 70,
        cell: (r) =>
          r.abc_class ? (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-bold ${CLASS_BADGE[r.abc_class]}`}
            >
              {r.abc_class}
            </span>
          ) : (
            <span className="text-[#9A9890] text-[11px]">未分</span>
          ),
        sortValue: (r) => r.abc_class ?? "Z",
        exportValue: (r) => r.abc_class ?? "",
      },
      {
        id: "begin",
        header: "期初庫存",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[#5A5955]">
            {r.beginning_qty_estimated.toLocaleString()}
          </span>
        ),
        sortValue: (r) => r.beginning_qty_estimated,
        exportValue: (r) => r.beginning_qty_estimated,
      },
      {
        id: "out",
        header: "12M 出庫量",
        width: 110,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[#2C2C2A]">
            {r.out_qty_12m.toLocaleString()}
          </span>
        ),
        sortValue: (r) => r.out_qty_12m,
        exportValue: (r) => r.out_qty_12m,
      },
      {
        id: "end",
        header: "期末庫存",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[#2C2C2A]">
            {r.ending_qty.toLocaleString()}
          </span>
        ),
        sortValue: (r) => r.ending_qty,
        exportValue: (r) => r.ending_qty,
      },
      {
        id: "value",
        header: "占用成本",
        width: 130,
        align: "right",
        defaultHidden: true,
        cell: (r) => (
          <span className="font-mono text-[#854F0B]">
            {fmtNTCompact(r.ending_value)}
          </span>
        ),
        sortValue: (r) => r.ending_value,
        exportValue: (r) => Math.round(r.ending_value),
      },
      {
        id: "amount",
        header: "12M 銷售額",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono">{fmtNTCompact(r.out_amount_12m)}</span>
        ),
        sortValue: (r) => r.out_amount_12m,
        exportValue: (r) => Math.round(r.out_amount_12m),
      },
      {
        id: "ratio",
        header: "周轉率",
        width: 90,
        align: "right",
        cell: (r) => (
          <span
            className={`font-mono font-semibold ${turnoverColor(r.turnover_ratio)}`}
          >
            {r.turnover_ratio >= 999 ? "∞" : r.turnover_ratio.toFixed(2)}
          </span>
        ),
        sortValue: (r) => r.turnover_ratio,
        exportValue: (r) =>
          r.turnover_ratio >= 999 ? "Infinity" : r.turnover_ratio,
      },
      {
        id: "days",
        header: "周轉天數",
        width: 90,
        align: "right",
        defaultHidden: true,
        cell: (r) => (
          <span className="font-mono text-[#5A5955]">
            {r.turnover_days == null
              ? "—"
              : r.turnover_days > 365 * 3
                ? "∞"
                : r.turnover_days.toLocaleString()}
          </span>
        ),
        sortValue: (r) => r.turnover_days,
        exportValue: (r) => r.turnover_days ?? "",
      },
      {
        id: "action",
        header: "建議動作",
        width: 110,
        sortable: false,
        cell: (r) => {
          const meta = ACTION_META[r.suggested_action];
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${meta.cls}`}
            >
              {meta.label}
            </span>
          );
        },
        exportValue: (r) => ACTION_META[r.suggested_action].label,
      },
    ],
    [],
  );

  return (
    <DataGrid
      columns={columns}
      data={rows}
      rowKey={(r) => r.item_id}
      persistKey="parts/analytics/turnover"
      exportFileName="inventory-turnover"
      emptyMessage="尚無周轉率資料 — 請先到 ABC 分類報表執行重跑"
    />
  );
}
