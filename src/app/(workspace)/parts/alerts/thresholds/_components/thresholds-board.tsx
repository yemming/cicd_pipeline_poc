"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization";
import { LineChart } from "@/components/charts/LineChart";
import type { ThresholdListRow, WarehouseLookup } from "@/domain/alerts";
import {
  setThresholdActiveAction,
  deleteThresholdAction,
  updateThresholdAction,
} from "@/domain/alerts";
import { getStockTrend, type StockTrend, type ThresholdStats } from "@/domain/parts-thresholds";
import {
  ABC_CHIP,
  ALERT_PRIORITY_CHIP,
  ALERT_PRIORITY_OPTIONS,
} from "@/domain/alerts.constants";

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

export function ThresholdsBoard({
  rows,
  warehouses,
  canEdit,
  stats,
  initialAbc,
  initialQ,
  initialWarehouseId,
  initialPriority,
  initialIsActive,
}: {
  rows: ThresholdListRow[];
  warehouses: WarehouseLookup[];
  canEdit: boolean;
  stats: ThresholdStats;
  initialAbc: string;
  initialQ: string;
  initialWarehouseId: string;
  initialPriority: string;
  initialIsActive: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [abc, setAbc] = useState(initialAbc);
  const [q, setQ] = useState(initialQ);
  const [warehouseId, setWarehouseId] = useState(initialWarehouseId);
  const [priority, setPriority] = useState(initialPriority);
  const [isActive, setIsActive] = useState(initialIsActive);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  // Panel state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [trend, setTrend] = useState<StockTrend | null>(null);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState<string | null>(null);
  const [savingField, setSavingField] = useState<null | "safety_stock" | "reorder_point" | "max_stock" | "alert_priority">(
    null,
  );

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  function buildHref(extra: Record<string, string | undefined>) {
    const params = new URLSearchParams();
    const merged: Record<string, string | undefined> = {
      abc_class: abc || undefined,
      q: q || undefined,
      warehouse_id: warehouseId || undefined,
      priority: priority || undefined,
      is_active: isActive || undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(merged)) {
      if (v === undefined || v === "" || v === null) continue;
      params.set(k, v);
    }
    const qs = params.toString();
    return `/parts/alerts/thresholds${qs ? "?" + qs : ""}`;
  }

  function applyFilter() {
    startTransition(() => router.push(buildHref({})));
  }

  function resetFilter() {
    setAbc("");
    setQ("");
    setWarehouseId("");
    setPriority("");
    setIsActive("");
    startTransition(() => router.push("/parts/alerts/thresholds"));
  }

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function toggleActive(r: ThresholdListRow) {
    startTransition(async () => {
      const res = await setThresholdActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function removeRow(r: ThresholdListRow) {
    if (
      !confirm(
        `確定刪除「${r.item_code ?? r.item_id} @ ${r.warehouse_name ?? r.warehouse_id}」的水位設定？此動作無法復原。`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      const res = await deleteThresholdAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        if (selectedId === r.id) setSelectedId(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // 載入 trend：selectedId 變化時
  useEffect(() => {
    if (!selected) {
      setTrend(null);
      setTrendError(null);
      return;
    }
    let cancelled = false;
    setTrendLoading(true);
    setTrendError(null);
    setTrend(null);
    (async () => {
      try {
        const res = await getStockTrend(selected.item_id, selected.warehouse_id, 90);
        if (cancelled) return;
        if (!res) {
          setTrendError("沒有水位曲線資料");
        } else {
          setTrend(res);
        }
      } catch (e) {
        if (cancelled) return;
        setTrendError(e instanceof Error ? e.message : "讀取曲線失敗");
      } finally {
        if (!cancelled) setTrendLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  async function savePanelField(
    field: "safety_stock" | "reorder_point" | "max_stock" | "alert_priority",
    rawValue: string,
  ) {
    if (!selected) return;
    if (!canEdit) return;
    let patch: Record<string, number | string | null> = {};
    if (field === "alert_priority") {
      patch = { alert_priority: rawValue };
    } else {
      const trimmed = rawValue.trim();
      if (field === "max_stock" && trimmed === "") {
        patch = { max_stock: null };
      } else {
        const num = Number(trimmed);
        if (trimmed === "" || Number.isNaN(num) || num < 0) {
          showBanner({ ok: false, msg: "請輸入 ≥ 0 的數字" });
          return;
        }
        patch[field] = num;
      }
    }
    setSavingField(field);
    const res = await updateThresholdAction(selected.id, patch);
    setSavingField(null);
    if (res.ok) {
      showBanner({ ok: true, msg: "✓ 已更新" });
      // 重抓 trend（threshold line 變化）
      router.refresh();
      try {
        const refreshed = await getStockTrend(selected.item_id, selected.warehouse_id, 90);
        if (refreshed) setTrend(refreshed);
      } catch {
        /* swallow */
      }
    } else {
      showBanner({ ok: false, msg: res.error });
    }
  }

  const columns = useMemo<DataGridColumn<ThresholdListRow>[]>(() => {
    const numberEdit = (field: "min_stock" | "safety_stock" | "reorder_point" | "max_stock") =>
      canEdit
        ? {
            type: "text" as const,
            getValue: (r: ThresholdListRow) => {
              const v = r[field];
              return v == null ? "" : String(v);
            },
            onSave: async (r: ThresholdListRow, value: string) => {
              const trimmed = value.trim();
              const num = trimmed === "" ? null : Number(trimmed);
              if (trimmed !== "" && (Number.isNaN(num) || num! < 0)) {
                return { ok: false as const, error: "請輸入 ≥ 0 的數字" };
              }
              if (field === "max_stock") {
                const res = await updateThresholdAction(r.id, { max_stock: num });
                if (res.ok) {
                  showBanner({ ok: true, msg: "✓ 已更新" });
                  router.refresh();
                  return { ok: true as const };
                }
                return { ok: false as const, error: res.error };
              }
              if (num == null) {
                return { ok: false as const, error: "此欄不可為空" };
              }
              const patch: Record<string, number> = {};
              patch[field] = num;
              const res = await updateThresholdAction(r.id, patch);
              if (res.ok) {
                showBanner({ ok: true, msg: "✓ 已更新" });
                router.refresh();
                return { ok: true as const };
              }
              return { ok: false as const, error: res.error };
            },
          }
        : undefined;

    return [
      {
        id: "item_code",
        header: "料號",
        width: 130,
        hideable: false,
        cell: (r) => (
          <button
            type="button"
            onClick={() => setSelectedId(r.id)}
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline text-left"
          >
            {r.item_code ?? "—"}
          </button>
        ),
        exportValue: (r) => r.item_code ?? "",
        sortValue: (r) => r.item_code ?? "",
      },
      {
        id: "item_name",
        header: "品名",
        width: 180,
        cell: (r) => r.item_name ?? "—",
        exportValue: (r) => r.item_name ?? "",
        sortValue: (r) => r.item_name ?? "",
      },
      {
        id: "warehouse_name",
        header: "倉庫",
        width: 110,
        cell: (r) => r.warehouse_name ?? "—",
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "abc_class",
        header: "ABC",
        width: 64,
        cell: (r) =>
          r.abc_class ? (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                ABC_CHIP[r.abc_class] ?? "bg-[#F2F2F2] text-[#6B6A68]"
              }`}
            >
              {r.abc_class}
            </span>
          ) : (
            "—"
          ),
        exportValue: (r) => r.abc_class ?? "",
        sortValue: (r) => r.abc_class ?? "",
      },
      {
        id: "safety_stock",
        header: "安全",
        width: 70,
        align: "right",
        cell: (r) => <span className="font-mono text-[12px]">{r.safety_stock ?? "—"}</span>,
        exportValue: (r) => (r.safety_stock ?? "").toString(),
        sortValue: (r) => r.safety_stock ?? 0,
        editable: numberEdit("safety_stock"),
      },
      {
        id: "reorder_point",
        header: "再訂購",
        width: 80,
        align: "right",
        cell: (r) => <span className="font-mono text-[12px]">{r.reorder_point ?? "—"}</span>,
        exportValue: (r) => (r.reorder_point ?? "").toString(),
        sortValue: (r) => r.reorder_point ?? 0,
        editable: numberEdit("reorder_point"),
      },
      {
        id: "max_stock",
        header: "最高",
        width: 70,
        align: "right",
        cell: (r) => <span className="font-mono text-[12px]">{r.max_stock ?? "—"}</span>,
        exportValue: (r) => (r.max_stock ?? "").toString(),
        sortValue: (r) => r.max_stock ?? 0,
        editable: numberEdit("max_stock"),
      },
      {
        id: "min_stock",
        header: "最低",
        width: 70,
        align: "right",
        defaultHidden: true,
        cell: (r) => <span className="font-mono text-[12px]">{r.min_stock ?? "—"}</span>,
        exportValue: (r) => (r.min_stock ?? "").toString(),
        sortValue: (r) => r.min_stock ?? 0,
        editable: numberEdit("min_stock"),
      },
      {
        id: "alert_priority",
        header: "告警等級",
        width: 90,
        cell: (r) => {
          const def =
            ALERT_PRIORITY_CHIP[r.alert_priority ?? ""] ??
            ALERT_PRIORITY_CHIP.normal;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          ALERT_PRIORITY_CHIP[r.alert_priority ?? ""]?.label ?? r.alert_priority ?? "",
        sortValue: (r) => r.alert_priority ?? "",
      },
      {
        id: "is_active",
        header: "啟用",
        width: 64,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              r.is_active
                ? "bg-[#EAF3DE] text-[#3B6D11]"
                : "bg-[#F2F2F2] text-[#6B6A68]"
            }`}
          >
            {r.is_active ? "啟用" : "停用"}
          </span>
        ),
        exportValue: (r) => (r.is_active ? "啟用" : "停用"),
        sortValue: (r) => (r.is_active ? 1 : 0),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canEdit]);

  // KPI 列
  const kpiSlot = (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <KpiCard
        label="已設定水位 SKU"
        value={stats.configured}
        tone="blue"
        layout="horizontal"
      />
      <KpiCard
        label="缺料中（低於安全）"
        value={stats.below_safety}
        tone="red"
        layout="horizontal"
      />
      <KpiCard
        label="接近再訂購點"
        value={stats.near_reorder}
        tone="amber"
        layout="horizontal"
      />
      <KpiCard
        label="超出最高水位"
        value={stats.over_max}
        tone="purple"
        layout="horizontal"
      />
    </div>
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">庫存水位設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          10.1
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定每個料號的安全庫存、再訂購點、最大水位；點擊料號開啟 90 天水位曲線
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>商品搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="代碼或名稱..."
              className={`${inputClass} w-[200px]`}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>倉庫</label>
            <select
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
              className={`${inputClass} w-[160px]`}
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code} ・ {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>ABC 類別</label>
            <select
              value={abc}
              onChange={(e) => setAbc(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
              <option value="">全部</option>
              <option value="A">A 類</option>
              <option value="B">B 類</option>
              <option value="C">C 類</option>
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>告警等級</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className={`${inputClass} w-[110px]`}
            >
              <option value="">全部</option>
              {ALERT_PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>啟用狀態</label>
            <select
              value={isActive}
              onChange={(e) => setIsActive(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
              <option value="">全部</option>
              <option value="true">啟用</option>
              <option value="false">停用</option>
            </select>
          </div>

          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            <Link
              href="/parts/alerts/thresholds/new"
              aria-disabled={!canEdit}
              tabIndex={!canEdit ? -1 : 0}
              title={canEdit ? "" : "沒有編輯權限"}
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center bg-[#0F6E56] text-white hover:bg-[#0a5742] ${
                !canEdit ? "opacity-50 pointer-events-none" : ""
              }`}
            >
              ＋ 新增水位
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆水位設定
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/alerts/thresholds"
        exportFileName="stock-thresholds"
        emptyMessage="沒有符合條件的水位設定"
        disabled={isPending}
        kpiSlot={kpiSlot}
        rowActionsWidth={220}
        rowActions={(r) => (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedId(r.id)}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              曲線
            </button>
            <Link
              href={`/parts/alerts/thresholds/${r.id}`}
              className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </Link>
            <button
              type="button"
              onClick={() => toggleActive(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {r.is_active ? "停用" : "啟用"}
            </button>
            <button
              type="button"
              onClick={() => removeRow(r)}
              disabled={!canEdit || isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
            >
              刪除
            </button>
          </div>
        )}
      />

      {/* 右側 Panel */}
      {selected && (
        <ThresholdTrendPanel
          row={selected}
          trend={trend}
          loading={trendLoading}
          error={trendError}
          canEdit={canEdit}
          savingField={savingField}
          onClose={() => setSelectedId(null)}
          onSave={savePanelField}
        />
      )}

      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 右側 Panel：曲線 + 三條閾值 + inline edit
// ─────────────────────────────────────────────────────────────────────────────

function ThresholdTrendPanel({
  row,
  trend,
  loading,
  error,
  canEdit,
  savingField,
  onClose,
  onSave,
}: {
  row: ThresholdListRow;
  trend: StockTrend | null;
  loading: boolean;
  error: string | null;
  canEdit: boolean;
  savingField: null | "safety_stock" | "reorder_point" | "max_stock" | "alert_priority";
  onClose: () => void;
  onSave: (
    field: "safety_stock" | "reorder_point" | "max_stock" | "alert_priority",
    value: string,
  ) => Promise<void>;
}) {
  // 取最近一日資料 → 決定狀態（高於 max / 低於 safety / 在帶間）
  const latest = trend?.days[trend.days.length - 1];
  const stateBadge = (() => {
    if (!latest) return null;
    const { safety, reorder, max } = trend!.threshold;
    if (max != null && latest.closing > max) {
      return { label: "超出最高", chip: "bg-[#F3E8FF] text-[#6B21A8]" };
    }
    if (safety != null && latest.closing < safety) {
      return { label: "低於安全", chip: "bg-[#FDECEA] text-[#CC0000]" };
    }
    if (reorder != null && latest.closing <= reorder * 1.1) {
      return { label: "接近再訂購", chip: "bg-[#FDF3E3] text-[#854F0B]" };
    }
    return { label: "正常區間", chip: "bg-[#EAF3DE] text-[#3B6D11]" };
  })();

  return (
    <div
      className="fixed inset-0 z-40 bg-black/20 flex justify-end"
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[640px] h-full bg-white border-l border-[#EEECE6] shadow-2xl overflow-y-auto"
      >
        {/* Panel Header */}
        <header className="sticky top-0 bg-white border-b border-[#EEECE6] px-5 py-3 flex items-center gap-3 z-10">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono font-semibold text-[#1A3A5C] text-[14px]">
                {row.item_code ?? "—"}
              </span>
              {stateBadge && (
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${stateBadge.chip}`}
                >
                  {stateBadge.label}
                </span>
              )}
            </div>
            <div className="text-[12px] text-[#5A5955] truncate mt-0.5">
              {row.item_name ?? "—"} ・ {row.warehouse_name ?? "—"}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-[28px] w-[28px] rounded inline-flex items-center justify-center text-[#5A5955] hover:bg-[#F8F7F4]"
            aria-label="關閉"
          >
            ✕
          </button>
        </header>

        {/* Chart */}
        <section className="px-5 py-4 border-b border-[#EEECE6]">
          <div className="flex items-baseline gap-2 mb-2">
            <h3 className="text-[13px] font-semibold text-[#2C2C2A]">近 90 天庫存曲線</h3>
            {trend && (
              <span className="text-[11px] text-[#9A9890]">
                今日 closing = <b className="font-mono text-[#2C2C2A]">{trend.current}</b>
              </span>
            )}
          </div>

          {loading && (
            <div className="h-[260px] flex items-center justify-center text-[12px] text-[#9A9890]">
              讀取曲線中⋯
            </div>
          )}
          {!loading && error && (
            <div className="h-[120px] flex items-center justify-center text-[12px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded">
              {error}
            </div>
          )}
          {!loading && !error && trend && trend.days.length > 0 && (
            <>
              <LineChart
                data={trend.days}
                xKey="label"
                yKey={[
                  { key: "closing", label: "庫存", color: "#1A3A5C" },
                  { key: "max", label: "最高", color: "#6B21A8" },
                  { key: "reorder", label: "再訂購", color: "#854F0B" },
                  { key: "safety", label: "安全", color: "#CC0000" },
                ]}
                tone="blue"
                size="md"
                showLegend
                showDots={false}
                smooth={false}
              />
              <div className="flex gap-3 mt-2 flex-wrap text-[11px]">
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-[#1A3A5C]" />庫存
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-[#CC0000]" />安全 {trend.threshold.safety ?? "—"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-[#854F0B]" />再訂購 {trend.threshold.reorder ?? "—"}
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-3 h-0.5 bg-[#6B21A8]" />最高 {trend.threshold.max ?? "—"}
                </span>
              </div>
            </>
          )}
        </section>

        {/* Inline edit form */}
        <section className="px-5 py-4 space-y-3">
          <h3 className="text-[13px] font-semibold text-[#2C2C2A]">調整水位閾值</h3>

          <PanelNumberField
            label="安全庫存"
            field="safety_stock"
            value={row.safety_stock}
            disabled={!canEdit || savingField !== null}
            saving={savingField === "safety_stock"}
            onSave={onSave}
            hint="低於此值會觸發缺料告警"
          />
          <PanelNumberField
            label="再訂購點"
            field="reorder_point"
            value={row.reorder_point}
            disabled={!canEdit || savingField !== null}
            saving={savingField === "reorder_point"}
            onSave={onSave}
            hint="低於此值會自動進入補貨建議清單"
          />
          <PanelNumberField
            label="最高水位"
            field="max_stock"
            value={row.max_stock}
            disabled={!canEdit || savingField !== null}
            saving={savingField === "max_stock"}
            onSave={onSave}
            hint="可留空；高於此值會觸發超儲備告警"
            allowEmpty
          />

          <div className="flex flex-col gap-1">
            <label className={labelClass}>告警等級</label>
            <select
              value={row.alert_priority ?? "medium"}
              disabled={!canEdit || savingField !== null}
              onChange={(e) => onSave("alert_priority", e.target.value)}
              className={`${inputClass} w-full disabled:opacity-60`}
            >
              {ALERT_PRIORITY_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {savingField === "alert_priority" && (
              <span className="text-[11px] text-[#9A9890]">儲存中⋯</span>
            )}
          </div>
        </section>

        <footer className="px-5 py-3 border-t border-[#EEECE6] flex gap-2 sticky bottom-0 bg-white">
          <Link
            href={`/parts/alerts/thresholds/${row.id}`}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            開啟完整詳情
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
          >
            完成
          </button>
        </footer>
      </aside>
    </div>
  );
}

function PanelNumberField({
  label,
  field,
  value,
  disabled,
  saving,
  hint,
  allowEmpty,
  onSave,
}: {
  label: string;
  field: "safety_stock" | "reorder_point" | "max_stock";
  value: number | null;
  disabled: boolean;
  saving: boolean;
  hint?: string;
  allowEmpty?: boolean;
  onSave: (
    field: "safety_stock" | "reorder_point" | "max_stock" | "alert_priority",
    value: string,
  ) => Promise<void>;
}) {
  const [local, setLocal] = useState(value == null ? "" : String(value));

  useEffect(() => {
    setLocal(value == null ? "" : String(value));
  }, [value]);

  const dirty = local !== (value == null ? "" : String(value));

  return (
    <div className="flex flex-col gap-1">
      <label className={labelClass}>
        {label}
        {hint && <span className="ml-2 text-[10px] text-[#9A9890] font-normal">{hint}</span>}
      </label>
      <div className="flex gap-2">
        <input
          type="number"
          min={0}
          step={1}
          value={local}
          onChange={(e) => setLocal(e.target.value)}
          disabled={disabled || saving}
          placeholder={allowEmpty ? "（不設上限）" : ""}
          className={`${inputClass} flex-1 disabled:opacity-60`}
        />
        <button
          type="button"
          onClick={() => {
            if (!dirty) return;
            onSave(field, local);
          }}
          disabled={disabled || saving || !dirty}
          className="h-[30px] px-3 rounded text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-40"
        >
          {saving ? "儲存中⋯" : "儲存"}
        </button>
      </div>
    </div>
  );
}
