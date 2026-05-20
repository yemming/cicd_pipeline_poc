"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization";
import { BarChart, HeatMap, type HeatMapDatum } from "@/components/charts";

import {
  type AbcClass,
  type AgeBucketBar,
  type StaleBucketKey,
  type StaleOverview,
  type StaleReasonCode,
  type StaleRow,
  type StaleKpiStats,
  type WarehouseAgeHeatCell,
  ABC_BADGE_CLASS,
  ACTION_META,
  AGE_BUCKET_META,
  REASON_META,
  fmtNTCompact,
  pct,
} from "@/domain/parts-analytics-stale.constants";

import { createCleanupPlanFromStale } from "@/lib/parts-analytics/stale-actions";

// ──────────────────────────────────────────────────────────────────────────
// Board
// ──────────────────────────────────────────────────────────────────────────

type Lookup = { id: string; name: string };

type Banner = { ok: boolean; msg: string } | null;

export function StaleBoard({
  overview,
  rows,
  kpiStats,
  ageBuckets,
  whHeatCells,
  warehouses,
}: {
  overview: StaleOverview;
  rows: StaleRow[];
  kpiStats: StaleKpiStats;
  ageBuckets: AgeBucketBar[];
  whHeatCells: WarehouseAgeHeatCell[];
  warehouses: Lookup[];
}) {
  const [bucketFilter, setBucketFilter] = useState<StaleBucketKey | "all">("all");
  const [abcFilter, setAbcFilter] = useState<AbcClass | "all">("all");
  const [reasonFilter, setReasonFilter] = useState<StaleReasonCode | "all">("all");
  const [warehouseFilter, setWarehouseFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [banner, setBanner] = useState<Banner>(null);
  const [planResult, setPlanResult] = useState<{
    plan_id: string;
    item_count: number;
    total_value: number;
    storage_hint: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const filteredRows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (bucketFilter !== "all" && r.bucket !== bucketFilter) return false;
      if (abcFilter !== "all" && r.abc_class !== abcFilter) return false;
      if (reasonFilter !== "all" && r.reason_code !== reasonFilter) return false;
      if (warehouseFilter !== "all" && r.warehouse_name !== warehouseFilter) {
        // 用 warehouse name 過濾（rows 上沒有 wh_id）
        // warehouseFilter 帶的是 warehouse id，但 row 上是 name，所以這裡 fallback to name compare
        // 若兩者都不等於就跳過
        const wh = warehouses.find((w) => w.id === warehouseFilter);
        if (!wh || wh.name !== r.warehouse_name) return false;
      }
      if (
        kw &&
        !r.item_code.toLowerCase().includes(kw) &&
        !r.item_name.toLowerCase().includes(kw)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, bucketFilter, abcFilter, reasonFilter, warehouseFilter, search, warehouses]);

  function resetFilters() {
    setBucketFilter("all");
    setAbcFilter("all");
    setReasonFilter("all");
    setWarehouseFilter("all");
    setSearch("");
  }

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll(currentRows: StaleRow[]) {
    setSelectedIds((prev) => {
      const allSelected = currentRows.every((r) => prev.has(r.item_id));
      if (allSelected) {
        const next = new Set(prev);
        for (const r of currentRows) next.delete(r.item_id);
        return next;
      }
      const next = new Set(prev);
      for (const r of currentRows) next.add(r.item_id);
      return next;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function handleCreateCleanupPlan() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      setBanner({ ok: false, msg: "請先勾選要納入清庫計畫的呆滯料號" });
      return;
    }
    setBanner(null);
    setPlanResult(null);

    startTransition(async () => {
      const res = await createCleanupPlanFromStale(ids);
      if (res.ok) {
        setPlanResult(res.data);
        setBanner({
          ok: true,
          msg: `✓ 已產出清庫計畫草稿（${res.data.item_count} 個料號，總積壓 ${fmtNTCompact(res.data.total_value)}）`,
        });
        clearSelection();
        // 2.2s 自動關掉成功 banner
        setTimeout(() => setBanner(null), 2200);
      } else {
        setBanner({ ok: false, msg: res.error });
      }
    });
  }

  // KPI delta tone
  const skuDelta =
    kpiStats.stale_sku_delta_pct == null
      ? undefined
      : {
          value: kpiStats.stale_sku_delta_pct,
          tone:
            kpiStats.stale_sku_delta_pct > 0
              ? ("negative" as const)
              : kpiStats.stale_sku_delta_pct < 0
                ? ("positive" as const)
                : ("neutral" as const),
        };

  // HeatMap data shape：x = bucket label, y = warehouse name, value = count
  const heatData: HeatMapDatum[] = whHeatCells.map((c) => ({
    x: AGE_BUCKET_META[c.bucket].shortLabel,
    y: c.warehouse_name,
    value: c.count,
  }));

  const hasStaleData = rows.length > 0;
  const allCurrentSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedIds.has(r.item_id));

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          報表：呆滯庫存佔比
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          §12.3 · A 級
        </span>
        <span className="text-[12px] text-[#9A9890]">
          90 天+未銷售庫存分析 · 庫齡分佈 · 倉庫熱力 · 一鍵產清庫計畫（共 {overview.total_stale_count} 料號 / 總 SKU {overview.total_sku_count}）
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          tone="amber"
          layout="vertical"
          label="呆滯 SKU 數"
          value={`${kpiStats.stale_sku_count} 個`}
          delta={skuDelta}
        />
        <KpiCard
          tone="red"
          layout="vertical"
          label="總積壓金額"
          value={fmtNTCompact(kpiStats.total_stale_value)}
        />
        <KpiCard
          tone="red"
          layout="vertical"
          label="最老 SKU 庫齡"
          value={kpiStats.oldest_days >= 999 ? "∞" : `${kpiStats.oldest_days} 天`}
        />
        <KpiCard
          tone="amber"
          layout="vertical"
          label="平均庫齡"
          value={`${kpiStats.avg_idle_days} 天`}
        />
      </div>

      {/* Charts row：庫齡分佈（BarChart）+ 倉庫×庫齡熱力（HeatMap） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              📊 庫齡分佈（全光譜）
            </span>
            <span className="text-[11px] text-[#9A9890]">
              ≥ 90 天視為呆滯
            </span>
          </header>
          <div className="px-4 py-3">
            {ageBuckets.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[#9A9890]">
                目前無庫存資料
              </div>
            ) : (
              <BarChart
                data={ageBuckets}
                categoryKey="label"
                valueKey="count"
                tone="amber"
                size="md"
                rainbow
              />
            )}
          </div>
        </section>

        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              🔥 倉庫 × 庫齡熱力（呆滯件數）
            </span>
            <span className="text-[11px] text-[#9A9890]">
              色越深 = 呆滯越集中
            </span>
          </header>
          <div className="px-4 py-3">
            {heatData.length === 0 ? (
              <div className="py-6 text-center text-[12px] text-[#9A9890]">
                目前無倉庫呆滯資料
              </div>
            ) : (
              <HeatMap data={heatData} tone="red" size="md" showValues />
            )}
          </div>
        </section>
      </div>

      {/* Reason analysis（保留 B 級的原因分析卡，作為輔助 context） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            📂 呆滯原因分析
          </span>
        </header>
        <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-2">
          {overview.reasons.length === 0 ? (
            <div className="col-span-full py-3 text-center text-[12px] text-[#9A9890]">
              目前無呆滯料號
            </div>
          ) : (
            overview.reasons.map((r) => {
              const meta = REASON_META[r.code];
              return (
                <div
                  key={r.code}
                  className="flex justify-between items-center text-[12.5px] py-1.5 px-2 rounded border border-[#EEECE6]"
                >
                  <span className="text-[#2C2C2A]">
                    {meta.emoji} {meta.label}
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

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              呆滯天數
            </label>
            <select
              value={bucketFilter}
              onChange={(e) => setBucketFilter(e.target.value as StaleBucketKey | "all")}
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none disabled:opacity-50"
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
                const tone = id === "all" ? "" : ABC_BADGE_CLASS[id as AbcClass];
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setAbcFilter(id)}
                    disabled={isPending}
                    className={`h-[30px] px-2.5 rounded text-[12px] font-medium border transition disabled:opacity-50
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
              onChange={(e) => setReasonFilter(e.target.value as StaleReasonCode | "all")}
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none disabled:opacity-50"
            >
              <option value="all">全部</option>
              <option value="discontinued">停產車型</option>
              <option value="overstock">採購過量</option>
              <option value="rev_change">規格改版</option>
              <option value="other">其他</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">
              倉庫
            </label>
            <select
              value={warehouseFilter}
              onChange={(e) => setWarehouseFilter(e.target.value)}
              disabled={isPending}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none disabled:opacity-50"
            >
              <option value="all">全部倉庫</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
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
              disabled={isPending}
              placeholder="料號 / 商品名稱…"
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none disabled:opacity-50"
            />
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              重置
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar — 含一鍵產清庫計畫 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] text-[#9A9890]">
          顯示 <b className="text-[#2C2C2A]">{filteredRows.length}</b> /{" "}
          <b className="text-[#2C2C2A]">{rows.length}</b> 料號
          {selectedIds.size > 0 ? (
            <>
              {" "}
              · 已勾選 <b className="text-[#1A3A5C]">{selectedIds.size}</b> 個
            </>
          ) : null}
        </span>
        <div className="ml-auto flex gap-1.5">
          {selectedIds.size > 0 ? (
            <button
              type="button"
              onClick={clearSelection}
              disabled={isPending}
              className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              清除選取
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleCreateCleanupPlan}
            disabled={isPending || selectedIds.size === 0}
            className="h-[26px] px-3 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "產生中⋯" : `📋 一鍵產清庫計畫草稿（${selectedIds.size}）`}
          </button>
        </div>
      </div>

      {/* plan result card */}
      {planResult ? (
        <div className="bg-[#EAF3DE] border border-[#C5DC9F] rounded-lg px-4 py-3 text-[12px] text-[#3B6D11]">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold">✓ 已產出清庫計畫草稿</span>
            <span className="font-mono text-[#185FA5]">plan_id: {planResult.plan_id.slice(0, 8)}…</span>
            <span>· 包含 <b>{planResult.item_count}</b> 個料號</span>
            <span>· 總積壓 <b>{fmtNTCompact(planResult.total_value)}</b></span>
            <button
              type="button"
              onClick={() => setPlanResult(null)}
              className="ml-auto text-[11px] text-[#185FA5] hover:underline"
            >
              關閉
            </button>
          </div>
          <div className="mt-1 text-[11px] text-[#5A5955]">{planResult.storage_hint}</div>
        </div>
      ) : null}

      {/* Detail Table */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          isPending ? "pointer-events-none opacity-60" : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            📋 呆滯庫存明細（閒置天數高→低）
          </span>
          <label className="flex items-center gap-2 text-[11.5px] text-[#5A5955] cursor-pointer">
            <input
              type="checkbox"
              checked={allCurrentSelected}
              onChange={() => toggleSelectAll(filteredRows)}
              disabled={isPending || filteredRows.length === 0}
              className="h-3.5 w-3.5"
            />
            全選當前 {filteredRows.length} 列
          </label>
        </header>
        <div className="p-3">
          {!hasStaleData ? (
            <div className="py-12 text-center text-[12.5px] text-[#9A9890]">
              🎉 目前沒有閒置 ≥ 90 天的料號 — 庫存周轉狀況良好
            </div>
          ) : (
            <StaleGrid
              rows={filteredRows}
              selectedIds={selectedIds}
              onToggleRow={toggleSelected}
              disabled={isPending}
            />
          )}
        </div>
      </section>

      {/* Caveat */}
      <div className="bg-[#FDF3E3] border border-[#F5DDA0] text-[#854F0B] rounded-md px-3 py-2 text-[11.5px] leading-relaxed">
        <b>計算說明</b>：呆滯定義 = 閒置天數 ≥ 90 天，閒置天數取 max(stock_issues.issue_date, stock_items.last_movement_at)；尚未包含調撥（stock_transfers）異動。原因分類為 heuristic（停產 = items.is_active=false；過量 = 12M 入庫量 ≥ 出庫量 ×3 或進貨無出貨）；本月新增定義為閒置天數 90-120 天區間。倉庫熱力圖以「庫存量最大倉」為主，跨倉料號可能高估單一倉佔比。佔總庫存金額 {pct(overview.total_stale_value, overview.total_inventory_value)}。
      </div>

      {/* Banner（fixed bottom-right） */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// DataGrid
// ──────────────────────────────────────────────────────────────────────────

function StaleGrid({
  rows,
  selectedIds,
  onToggleRow,
  disabled,
}: {
  rows: StaleRow[];
  selectedIds: Set<string>;
  onToggleRow: (id: string) => void;
  disabled: boolean;
}) {
  const columns: DataGridColumn<StaleRow>[] = useMemo(
    () => [
      {
        id: "select",
        header: "選",
        width: 42,
        hideable: false,
        sortable: false,
        cell: (r) => (
          <input
            type="checkbox"
            checked={selectedIds.has(r.item_id)}
            onChange={() => onToggleRow(r.item_id)}
            disabled={disabled}
            onClick={(e) => e.stopPropagation()}
            className="h-3.5 w-3.5"
            aria-label={`選取 ${r.item_code}`}
          />
        ),
        exportValue: (r) => (selectedIds.has(r.item_id) ? "Y" : ""),
      },
      {
        id: "code",
        header: "料號",
        width: 130,
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
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-bold ${ABC_BADGE_CLASS[r.abc_class]}`}
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
        id: "warehouse",
        header: "主要倉庫",
        width: 110,
        cell: (r) =>
          r.warehouse_name ? (
            <span className="text-[12px] text-[#5A5955]">{r.warehouse_name}</span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        sortValue: (r) => r.warehouse_name ?? "",
        exportValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "qty",
        header: "庫存量",
        width: 80,
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
        header: "積壓金額",
        width: 120,
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
        header: "庫齡",
        width: 90,
        align: "right",
        cell: (r) => {
          const color =
            r.days_idle >= 365
              ? "text-[#CC0000]"
              : r.days_idle >= 180
                ? "text-[#D85A30]"
                : "text-[#854F0B]";
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-mono font-semibold ${color} bg-[#FDF3E3]`}
            >
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
    [selectedIds, onToggleRow, disabled],
  );

  return (
    <DataGrid
      columns={columns}
      data={rows}
      rowKey={(r) => r.item_id}
      persistKey="parts/analytics/stale"
      exportFileName="stale-inventory"
      emptyMessage="目前沒有符合條件的呆滯料號"
      disabled={disabled}
    />
  );
}
