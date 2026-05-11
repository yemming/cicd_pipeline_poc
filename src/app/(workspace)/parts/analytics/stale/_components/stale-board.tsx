"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";

import type {
  AbcClass,
  StaleBucketKey,
  StaleOverview,
  StaleReasonCode,
  StaleRow,
  StaleSuggestedAction,
} from "@/domain/analytics";

// ──────────────────────────────────────────────────────────────────────────
// Visual tokens
// ──────────────────────────────────────────────────────────────────────────

const CLASS_BADGE: Record<AbcClass, string> = {
  A: "bg-[#FDECEA] text-[#CC0000]",
  B: "bg-[#FDF3E3] text-[#854F0B]",
  C: "bg-[#EAF4FB] text-[#185FA5]",
};

const BUCKET_META: Record<
  StaleBucketKey,
  { label: string; color: string; barBg: string }
> = {
  b90_180: { label: "90–180 天", color: "#854F0B", barBg: "#854F0B" },
  b180_365: { label: "180–365 天", color: "#D85A30", barBg: "#D85A30" },
  b365_plus: { label: "365 天以上", color: "#CC0000", barBg: "#CC0000" },
};

const ACTION_META: Record<
  StaleSuggestedAction,
  { label: string; cls: string }
> = {
  scrap: { label: "申請報廢", cls: "bg-[#FDECEA] text-[#CC0000]" },
  promote: { label: "移促銷倉", cls: "bg-[#FDF3E3] text-[#854F0B]" },
  transfer: { label: "跨店調撥", cls: "bg-[#EAF4FB] text-[#185FA5]" },
  watch: { label: "觀察", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
};

const REASON_META: Record<
  StaleReasonCode,
  { emoji: string; cls: string }
> = {
  discontinued: { emoji: "🚗", cls: "bg-[#FDECEA] text-[#CC0000]" },
  overstock: { emoji: "📦", cls: "bg-[#FDF3E3] text-[#854F0B]" },
  rev_change: { emoji: "🔄", cls: "bg-[#FDF3E3] text-[#854F0B]" },
  other: { emoji: "❓", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
};

function fmtNTCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `NT$ ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `NT$ ${(n / 10_000).toFixed(1)} 萬`;
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}

function pct(n: number, base: number): string {
  if (base <= 0) return "—";
  return `${((n / base) * 100).toFixed(1)}%`;
}

// ──────────────────────────────────────────────────────────────────────────
// Board
// ──────────────────────────────────────────────────────────────────────────

export function StaleBoard({
  overview,
  rows,
}: {
  overview: StaleOverview;
  rows: StaleRow[];
}) {
  const [bucketFilter, setBucketFilter] = useState<StaleBucketKey | "all">(
    "all",
  );
  const [abcFilter, setAbcFilter] = useState<AbcClass | "all">("all");
  const [reasonFilter, setReasonFilter] = useState<StaleReasonCode | "all">(
    "all",
  );
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (bucketFilter !== "all" && r.bucket !== bucketFilter) return false;
      if (abcFilter !== "all" && r.abc_class !== abcFilter) return false;
      if (reasonFilter !== "all" && r.reason_code !== reasonFilter) return false;
      if (
        kw &&
        !r.item_code.toLowerCase().includes(kw) &&
        !r.item_name.toLowerCase().includes(kw)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, bucketFilter, abcFilter, reasonFilter, search]);

  const maxBucketCount = Math.max(
    1,
    overview.buckets.b90_180,
    overview.buckets.b180_365,
    overview.buckets.b365_plus,
  );

  const newTrendText =
    overview.new_this_month === 0
      ? "— 本月無新增"
      : `▲ +${overview.new_this_month} 近 30 天`;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          報表：呆滯庫存佔比
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          §12.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          90 天+未銷售庫存分析 · 原因歸類 · 處置建議（共 {overview.total_stale_count}{" "}
          料號 / 總 SKU {overview.total_sku_count}）
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          <Link
            href="/parts/analytics/turnover"
            className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] font-medium bg-white text-[#5A5955] border border-[#D5D3CB] hover:border-[#9A9890]"
          >
            ↳ 庫存周轉率
          </Link>
        </span>
      </header>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiTile
          accent="#CC0000"
          label="呆滯庫存金額"
          value={fmtNTCompact(overview.total_stale_value)}
          sub={`佔總庫存金額 ${pct(
            overview.total_stale_value,
            overview.total_inventory_value,
          )}`}
        />
        <KpiTile
          accent="#854F0B"
          label="呆滯料號數"
          value={`${overview.total_stale_count} 個`}
          sub={`佔總 SKU ${pct(overview.total_stale_count, overview.total_sku_count)}`}
        />
        <KpiTile
          accent="#CC0000"
          label="嚴重滯銷（180 天+）"
          value={`${overview.severe_count} 個`}
          sub={
            overview.severe_count > 0 ? "建議立即處置" : "目前無嚴重滯銷料號"
          }
          subColor={overview.severe_count > 0 ? "#CC0000" : "#3B6D11"}
        />
        <KpiTile
          accent="#854F0B"
          label="本月新增呆滯"
          value={`${overview.new_this_month} 個`}
          sub={newTrendText}
          subColor={overview.new_this_month > 0 ? "#854F0B" : "#9A9890"}
        />
      </div>

      {/* Bucket distribution + Reason analysis（兩張並排） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              📊 呆滯天數分佈
            </span>
          </header>
          <div className="px-4 py-4 flex flex-col gap-2.5">
            {(["b90_180", "b180_365", "b365_plus"] as const).map((key) => {
              const meta = BUCKET_META[key];
              const count = overview.buckets[key];
              const ratio = (count / maxBucketCount) * 100;
              return (
                <div key={key} className="flex items-center gap-2.5">
                  <div className="text-[12px] text-[#5A5955] min-w-[80px]">
                    {meta.label}
                  </div>
                  <div className="flex-1 bg-[#EEECE6] rounded h-[14px] overflow-hidden">
                    <div
                      className="h-full rounded transition-all"
                      style={{
                        width: `${Math.max(2, ratio)}%`,
                        background: meta.barBg,
                      }}
                    />
                  </div>
                  <div className="text-[12px] font-semibold min-w-[42px] text-right text-[#2C2C2A]">
                    {count} 件
                  </div>
                </div>
              );
            })}
            {overview.buckets.b365_plus > 0 ? (
              <div className="mt-2 px-3 py-2 rounded bg-[#FDECEA] text-[11.5px] text-[#CC0000] leading-relaxed">
                ⚠ {overview.buckets.b365_plus} 件超過 365 天未銷售，建議本月進行促銷或報廢處理。
              </div>
            ) : null}
          </div>
        </section>

        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              📂 呆滯原因分析
            </span>
          </header>
          <div className="px-4 py-3 flex flex-col">
            {overview.reasons.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[#9A9890]">
                目前無呆滯料號
              </div>
            ) : (
              overview.reasons.map((r) => {
                const meta = REASON_META[r.code];
                return (
                  <div
                    key={r.code}
                    className="flex justify-between items-center text-[12.5px] py-2 border-b border-[#EEECE6] last:border-0"
                  >
                    <span className="text-[#2C2C2A]">
                      {meta.emoji} {r.label}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${meta.cls}`}
                    >
                      {r.count} 件
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              呆滯天數
            </label>
            <select
              value={bucketFilter}
              onChange={(e) =>
                setBucketFilter(e.target.value as StaleBucketKey | "all")
              }
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
            >
              <option value="all">全部（90 天+）</option>
              <option value="b90_180">90–180 天</option>
              <option value="b180_365">180–365 天</option>
              <option value="b365_plus">365 天以上</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              ABC 分類
            </label>
            <div className="flex gap-1.5">
              {(["all", "A", "B", "C"] as const).map((id) => {
                const active = abcFilter === id;
                const tone = id === "all" ? "" : CLASS_BADGE[id as AbcClass];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAbcFilter(id)}
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
              呆滯原因
            </label>
            <select
              value={reasonFilter}
              onChange={(e) =>
                setReasonFilter(e.target.value as StaleReasonCode | "all")
              }
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
            >
              <option value="all">全部</option>
              <option value="discontinued">停產車型</option>
              <option value="overstock">採購過量</option>
              <option value="rev_change">規格改版</option>
              <option value="other">其他</option>
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

      {/* Detail Table */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            📋 呆滯庫存明細（閒置天數高→低）
          </span>
          <span className="text-[12px] text-[#9A9890]">
            顯示 <b className="text-[#2C2C2A]">{filteredRows.length}</b> /{" "}
            <b className="text-[#2C2C2A]">{rows.length}</b> 料號
          </span>
        </header>
        <div className="p-3">
          <StaleGrid rows={filteredRows} />
        </div>
      </section>

      {/* Caveat */}
      <div className="bg-[#FDF3E3] border border-[#F5DDA0] text-[#854F0B] rounded-md px-3 py-2 text-[11.5px] leading-relaxed">
        <b>計算說明</b>：呆滯定義 = 閒置天數 ≥ 90 天，閒置天數取 max(stock_issues.issue_date,
        stock_items.last_movement_at)；尚未包含調撥（stock_transfers）異動，純調撥單品可能被誤判呆滯。原因分類為 heuristic（停產 = items.is_active=false；過量 = 12M 入庫量 ≥ 出庫量 ×3 或進貨無出貨）；本月新增定義為閒置天數 90-120 天區間。
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// KPI Tile
// ──────────────────────────────────────────────────────────────────────────

function KpiTile({
  accent,
  label,
  value,
  sub,
  subColor,
}: {
  accent: string;
  label: string;
  value: string;
  sub: string;
  subColor?: string;
}) {
  return (
    <div
      className="bg-white border border-[#EEECE6] rounded-lg p-3.5"
      style={{ borderTop: `3px solid ${accent}` }}
    >
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className="text-[22px] font-bold mt-1"
        style={{ color: accent }}
      >
        {value}
      </div>
      <div
        className="text-[11px] mt-0.5"
        style={{ color: subColor ?? "#5A5955" }}
      >
        {sub}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// DataGrid
// ──────────────────────────────────────────────────────────────────────────

function StaleGrid({ rows }: { rows: StaleRow[] }) {
  const columns: DataGridColumn<StaleRow>[] = useMemo(
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
        header: "品名",
        cell: (r) => (
          <span className="font-medium text-[#2C2C2A]">{r.item_name}</span>
        ),
        sortValue: (r) => r.item_name,
        exportValue: (r) => r.item_name,
      },
      {
        id: "category",
        header: "分類",
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
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
              C
            </span>
          ),
        sortValue: (r) => r.abc_class ?? "Z",
        exportValue: (r) => r.abc_class ?? "",
      },
      {
        id: "qty",
        header: "庫存量",
        width: 90,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[#2C2C2A]">
            {r.qty.toLocaleString()}
          </span>
        ),
        sortValue: (r) => r.qty,
        exportValue: (r) => r.qty,
      },
      {
        id: "value",
        header: "庫存成本",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[#854F0B]">
            {fmtNTCompact(r.value)}
          </span>
        ),
        sortValue: (r) => r.value,
        exportValue: (r) => r.value,
      },
      {
        id: "days",
        header: "呆滯天數",
        width: 100,
        align: "right",
        cell: (r) => {
          const color =
            r.days_idle >= 365
              ? "text-[#CC0000]"
              : r.days_idle >= 180
                ? "text-[#D85A30]"
                : "text-[#854F0B]";
          return (
            <span className={`font-mono font-semibold ${color}`}>
              {r.days_idle >= 999 ? "∞" : `${r.days_idle} 天`}
            </span>
          );
        },
        sortValue: (r) => r.days_idle,
        exportValue: (r) => r.days_idle,
      },
      {
        id: "last_issue",
        header: "最近出庫",
        width: 110,
        align: "right",
        defaultHidden: true,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.last_issue_date ?? "（從未）"}
          </span>
        ),
        sortValue: (r) => r.last_issue_date ?? "",
        exportValue: (r) => r.last_issue_date ?? "",
      },
      {
        id: "reason",
        header: "呆滯原因",
        width: 120,
        cell: (r) => {
          const meta = REASON_META[r.reason_code];
          return (
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium ${meta.cls}`}
            >
              {meta.emoji} {r.reason_label}
            </span>
          );
        },
        sortValue: (r) => r.reason_code,
        exportValue: (r) => r.reason_label,
      },
      {
        id: "action",
        header: "建議處置",
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
      persistKey="parts/analytics/stale"
      exportFileName="stale-inventory"
      emptyMessage="目前沒有閒置 ≥ 90 天的料號 — 庫存周轉良好"
    />
  );
}
