"use client";

import { useState, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";
import { SparkLine } from "@/components/charts/SparkLine";
import { getItem7DayMovement } from "@/domain/parts-balance";
import { createReplenishmentFromBalance } from "@/lib/parts-balance/balance-actions";
import { querySerialNo, type SerialTraceResult } from "@/domain/stock";
import type { BalanceRow, BalanceStats, AlertLevel, AbcClass } from "@/domain/parts-balance";

const ABC_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部" },
  { value: "A", label: "A 類（高價值）" },
  { value: "B", label: "B 類（中價值）" },
  { value: "C", label: "C 類（低價值）" },
  { value: "D", label: "D 類" },
];

const ALERT_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部" },
  { value: "out_of_stock", label: "缺料" },
  { value: "below_safety", label: "低於安全" },
  { value: "below_reorder", label: "低於再訂購點" },
  { value: "over_max", label: "超儲備" },
  { value: "stale", label: "呆滯料（90天無異動）" },
  { value: "none", label: "正常" },
];

const ALERT_META: Record<AlertLevel, { label: string; cls: string; dot: string }> = {
  out_of_stock: {
    label: "缺料",
    cls: "bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]",
    dot: "bg-[#CC0000]",
  },
  below_safety: {
    label: "低於安全",
    cls: "bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]",
    dot: "bg-[#E24B4A]",
  },
  below_reorder: {
    label: "低於再訂購",
    cls: "bg-[#FDF3E3] text-[#854F0B] border-[#F0D89A]",
    dot: "bg-[#EF9F27]",
  },
  over_max: {
    label: "超儲備",
    cls: "bg-[#EAF4FB] text-[#185FA5] border-[#BCDDF1]",
    dot: "bg-[#378ADD]",
  },
  stale: {
    label: "呆滯料",
    cls: "bg-[#F2F2F2] text-[#6B6A68] border-[#D5D3CB]",
    dot: "bg-[#6B6A68]",
  },
  none: {
    label: "正常",
    cls: "bg-[#EAF3DE] text-[#3B6D11] border-[#C5DC9F]",
    dot: "bg-[#3B6D11]",
  },
};

function abcChipClass(c: AbcClass): string {
  switch (c) {
    case "A":
      return "bg-[#FDECEA] text-[#CC0000]";
    case "B":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "C":
      return "bg-[#E8F5F0] text-[#0F6E56]";
    case "D":
      return "bg-[#EAF4FB] text-[#185FA5]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

export function BalanceBoard({
  rows,
  totalCount,
  stats,
  warehouses,
  categories,
  canReplenish,
  page,
  pageSize,
  initialQ,
  initialWarehouse,
  initialAbc,
  initialAlert,
  initialCategory,
  initialIncludeZero,
}: {
  rows: BalanceRow[];
  totalCount: number;
  stats: BalanceStats;
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  categories: string[];
  canReplenish: boolean;
  page: number;
  pageSize: number;
  initialQ: string;
  initialWarehouse: string;
  initialAbc: string;
  initialAlert: string;
  initialCategory: string;
  initialIncludeZero: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fQ, setFQ] = useState(initialQ);
  const [fWh, setFWh] = useState(initialWarehouse);
  const [fAbc, setFAbc] = useState(initialAbc);
  const [fAlert, setFAlert] = useState(initialAlert);
  const [fCat, setFCat] = useState(initialCategory);
  const [fZero, setFZero] = useState(initialIncludeZero);
  const [selected, setSelected] = useState<BalanceRow | null>(null);
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [serialOpen, setSerialOpen] = useState(false);
  const [replenishingId, setReplenishingId] = useState<string | null>(null);

  // banner auto-dismiss
  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  const buildHref = (
    override: Partial<{
      q: string;
      warehouse: string;
      abc: string;
      alert: string;
      category: string;
      include_zero: boolean;
      page: number;
    }> = {},
  ) => {
    const p = new URLSearchParams();
    const q = override.q ?? fQ.trim();
    const wh = override.warehouse ?? fWh;
    const abc = override.abc ?? fAbc;
    const al = override.alert ?? fAlert;
    const cat = override.category ?? fCat;
    const z = override.include_zero ?? fZero;
    if (q) p.set("q", q);
    if (wh) p.set("warehouse", wh);
    if (abc) p.set("abc", abc);
    if (al) p.set("alert", al);
    if (cat) p.set("category", cat);
    if (z) p.set("include_zero", "1");
    if (override.page && override.page > 1) p.set("page", String(override.page));
    const qs = p.toString();
    return qs ? `/parts/operations/balance?${qs}` : "/parts/operations/balance";
  };

  const submitFilters = () => {
    startTransition(() => router.push(buildHref({ page: 1 })));
  };
  const resetFilters = () => {
    setFQ("");
    setFWh("");
    setFAbc("");
    setFAlert("");
    setFCat("");
    setFZero(false);
    startTransition(() => router.push("/parts/operations/balance"));
  };
  const goToPage = (next: number) => {
    startTransition(() => router.push(buildHref({ page: next })));
  };

  const quickFilterAbc = (abc: string) => {
    setFAbc(abc);
    startTransition(() => router.push(buildHref({ abc, page: 1 })));
  };
  const quickFilterAlert = (al: string) => {
    setFAlert(al);
    startTransition(() => router.push(buildHref({ alert: al, page: 1 })));
  };

  const onReplenish = async (row: BalanceRow) => {
    if (!canReplenish) {
      setBanner({ ok: false, msg: "沒有執行補貨計算的權限" });
      return;
    }
    setReplenishingId(row.item_id);
    setBanner(null);
    try {
      const res = await createReplenishmentFromBalance({ warehouseId: row.warehouse_id });
      if (res.ok) {
        setBanner({
          ok: true,
          msg: `✓ 已產生補貨建議（${res.lines} 條）— 跳轉中⋯`,
        });
        setTimeout(
          () => router.push(`/parts/purchase/replenishment?run=${res.runId}`),
          800,
        );
      } else {
        setBanner({ ok: false, msg: `失敗：${res.error}` });
      }
    } catch (e) {
      setBanner({ ok: false, msg: e instanceof Error ? e.message : String(e) });
    } finally {
      setReplenishingId(null);
    }
  };

  const columns: DataGridColumn<BalanceRow>[] = [
    {
      id: "alert_level",
      header: "告警",
      width: 110,
      cell: (r) => {
        const meta = ALERT_META[r.alert_level];
        return (
          <span
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium border ${meta.cls}`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
            {meta.label}
          </span>
        );
      },
      exportValue: (r) => ALERT_META[r.alert_level].label,
      sortValue: (r) => (r.alert_level === "none" ? "z" : r.alert_level),
    },
    {
      id: "item_code",
      header: "料號",
      width: 140,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/parts/setup/items/${r.item_id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5] hover:underline"
          onClick={(e) => e.stopPropagation()}
        >
          {r.item_code}
        </Link>
      ),
      exportValue: (r) => r.item_code,
      sortValue: (r) => r.item_code,
    },
    {
      id: "item_name",
      header: "品名",
      cell: (r) => <span className="text-[12.5px]">{r.item_name}</span>,
      exportValue: (r) => r.item_name,
      sortValue: (r) => r.item_name,
    },
    {
      id: "abc_class",
      header: "ABC",
      width: 70,
      cell: (r) =>
        r.abc_class ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              quickFilterAbc(r.abc_class!);
            }}
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${abcChipClass(r.abc_class)} hover:ring-1 hover:ring-offset-1 hover:ring-current cursor-pointer`}
            title={`篩選 ${r.abc_class} 類`}
          >
            {r.abc_class}
          </button>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.abc_class ?? "",
      sortValue: (r) => r.abc_class ?? "z",
    },
    {
      id: "category",
      header: "品類",
      width: 110,
      cell: (r) =>
        r.item_category ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
            {r.item_category}
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.item_category ?? "",
      sortValue: (r) => r.item_category ?? "",
    },
    {
      id: "warehouse_name",
      header: "倉庫",
      width: 130,
      cell: (r) => <span className="text-[12.5px]">{r.warehouse_name ?? "—"}</span>,
      exportValue: (r) => r.warehouse_name ?? "",
      sortValue: (r) => r.warehouse_name ?? "",
    },
    {
      id: "qty_available",
      header: "可用",
      width: 80,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12.5px] text-[#2C2C2A]">{r.qty_available}</span>
      ),
      exportValue: (r) => r.qty_available,
      sortValue: (r) => r.qty_available,
    },
    {
      id: "qty_reserved",
      header: "保留",
      width: 70,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12.5px] text-[#9A9890]">{r.qty_reserved}</span>
      ),
      exportValue: (r) => r.qty_reserved,
      sortValue: (r) => r.qty_reserved,
      defaultHidden: true,
    },
    {
      id: "qty_total",
      header: "在庫總量",
      width: 100,
      align: "right",
      cell: (r) => (
        <span className="font-mono font-semibold text-[12.5px] text-[#1A3A5C]">{r.qty_total}</span>
      ),
      exportValue: (r) => r.qty_total,
      sortValue: (r) => r.qty_total,
    },
    {
      id: "safety_stock",
      header: "安全",
      width: 70,
      align: "right",
      cell: (r) =>
        r.safety_stock != null ? (
          <span className="font-mono text-[11.5px] text-[#5A5955]">{r.safety_stock}</span>
        ) : (
          <span className="text-[#9A9890] text-[11.5px]">—</span>
        ),
      exportValue: (r) => r.safety_stock ?? "",
      sortValue: (r) => r.safety_stock ?? -1,
    },
    {
      id: "reorder_point",
      header: "再訂購",
      width: 80,
      align: "right",
      cell: (r) =>
        r.reorder_point != null ? (
          <span className="font-mono text-[11.5px] text-[#5A5955]">{r.reorder_point}</span>
        ) : (
          <span className="text-[#9A9890] text-[11.5px]">—</span>
        ),
      exportValue: (r) => r.reorder_point ?? "",
      sortValue: (r) => r.reorder_point ?? -1,
    },
    {
      id: "max_stock",
      header: "最高",
      width: 70,
      align: "right",
      cell: (r) =>
        r.max_stock != null ? (
          <span className="font-mono text-[11.5px] text-[#5A5955]">{r.max_stock}</span>
        ) : (
          <span className="text-[#9A9890] text-[11.5px]">—</span>
        ),
      exportValue: (r) => r.max_stock ?? "",
      sortValue: (r) => r.max_stock ?? -1,
      defaultHidden: true,
    },
    {
      id: "avg_unit_cost",
      header: "均成本",
      width: 90,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#5A5955]">
          {r.avg_unit_cost > 0 ? `$${r.avg_unit_cost.toFixed(0)}` : "—"}
        </span>
      ),
      exportValue: (r) => r.avg_unit_cost,
      sortValue: (r) => r.avg_unit_cost,
      defaultHidden: true,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">商品庫存查詢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          庫存 · 7.1 v2
        </span>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#F0EFFE] text-[#534AB7] font-semibold">
          ★6
        </span>
        <span className="text-[12px] text-[#9A9890]">
          整合 ABC 分類 · 告警階層 · 7 日入出庫走勢 · 一鍵生補貨
        </span>
      </header>

      {/* KPI 4 顆 — brand 全集視角 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard
          tone="blue"
          layout="vertical"
          label="總 SKU"
          value={stats.total_skus}
        />
        <KpiCard
          tone="red"
          layout="vertical"
          label="低於安全 / 缺料"
          value={stats.below_safety + stats.out_of_stock}
          delta={
            stats.total_skus > 0
              ? {
                  value: Number(
                    (
                      ((stats.below_safety + stats.out_of_stock) / stats.total_skus) *
                      100
                    ).toFixed(0),
                  ),
                  tone: "negative",
                }
              : undefined
          }
        />
        <KpiCard
          tone="amber"
          layout="vertical"
          label="超儲備"
          value={stats.over_max}
        />
        <KpiCard
          tone="purple"
          layout="vertical"
          label="告警中"
          value={stats.alerting}
        />
      </div>

      {/* 跨模組 banner — 備件庫存 ↔ 銷售展間 / 整車 / 中古車 */}
      <section className="bg-[#F0EFFE] border border-[#C4BEF0] rounded-lg px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <span className="text-[11px] text-[#534AB7] font-semibold">★6 跨模組</span>
        <span className="text-[12px] text-[#26215C]">
          本頁是<strong>備件視角</strong>（stock_items 即時水位 + 告警），銷售看板從
          <strong>銷售視角</strong>看整車與展間配額。
        </span>
        <div className="ml-auto flex gap-1.5 flex-wrap">
          <Link
            href="/sales/showroom/stock"
            className="h-[26px] px-3 rounded-full text-[11.5px] inline-flex items-center bg-[#534AB7] text-white hover:bg-[#3F3793] font-medium"
          >
            → 展間庫存
          </Link>
          <Link
            href="/inventory/vehicles"
            className="h-[26px] px-3 rounded-full text-[11.5px] inline-flex items-center bg-white border border-[#C4BEF0] text-[#534AB7] hover:bg-[#F5F4FE] font-medium"
          >
            → 整車庫存
          </Link>
          <Link
            href="/usedcar/stock"
            className="h-[26px] px-3 rounded-full text-[11.5px] inline-flex items-center bg-white border border-[#C4BEF0] text-[#534AB7] hover:bg-[#F5F4FE] font-medium"
          >
            → 中古車庫存
          </Link>
        </div>
      </section>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">商品搜尋</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="料號或品名..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[180px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">倉庫</label>
            <select
              value={fWh}
              onChange={(e) => setFWh(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">ABC 分類</label>
            <select
              value={fAbc}
              onChange={(e) => setFAbc(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {ABC_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">告警等級</label>
            <select
              value={fAlert}
              onChange={(e) => setFAlert(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {ALERT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">品類</label>
            <select
              value={fCat}
              onChange={(e) => setFCat(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 h-[30px] text-[12px] text-[#5A5955] cursor-pointer">
            <input type="checkbox" checked={fZero} onChange={(e) => setFZero(e.target.checked)} />
            含零庫存
          </label>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              type="button"
              onClick={() => setSerialOpen(true)}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#185FA5] hover:border-[#185FA5]"
            >
              🔍 序列號
            </button>
          </div>
        </div>

        {/* Quick filter chips（按告警等級 + ABC 快速篩） */}
        <div className="mt-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[11px] text-[#9A9890]">快速篩選：</span>
          {(["below_safety", "below_reorder", "over_max", "stale"] as AlertLevel[]).map((al) => {
            const m = ALERT_META[al];
            const active = fAlert === al;
            return (
              <button
                key={al}
                type="button"
                onClick={() => quickFilterAlert(active ? "" : al)}
                className={`h-[24px] px-2 rounded-full text-[11px] border inline-flex items-center gap-1 ${
                  active
                    ? `${m.cls} ring-1 ring-current`
                    : `${m.cls} opacity-70 hover:opacity-100`
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                {m.label}
              </button>
            );
          })}
          <span className="text-[11px] text-[#9A9890] ml-2">·</span>
          {(["A", "B", "C"] as const).map((c) => {
            const active = fAbc === c;
            return (
              <button
                key={c}
                type="button"
                onClick={() => quickFilterAbc(active ? "" : c)}
                className={`h-[24px] px-2.5 rounded-full text-[11px] inline-flex items-center font-medium ${abcChipClass(
                  c,
                )} ${active ? "ring-1 ring-current" : "opacity-70 hover:opacity-100"}`}
              >
                {c} 類
              </button>
            );
          })}
        </div>
      </section>

      {/* 主版面：左 DataGrid + 右 Detail Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <div className="min-w-0">
          <DataGrid
            columns={columns}
            data={rows}
            rowKey={(r) => `${r.item_id}::${r.warehouse_id ?? ""}`}
            persistKey="parts/operations/balance-v2"
            exportFileName="stock-balance-v2"
            emptyMessage={
              rows.length === 0 && totalCount === 0
                ? "沒有符合條件的庫存資料"
                : "本頁無資料（嘗試換頁或調整篩選）"
            }
            disabled={isPending}
            rowActionsWidth={170}
            rowActions={(r) => (
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setSelected(r)}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  詳情
                </button>
                {(r.alert_level === "below_safety" ||
                  r.alert_level === "below_reorder" ||
                  r.alert_level === "out_of_stock") && (
                  <button
                    type="button"
                    onClick={() => onReplenish(r)}
                    disabled={replenishingId === r.item_id || !canReplenish}
                    title={!canReplenish ? "沒有補貨權限" : "為該倉跑一輪補貨建議"}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 inline-flex items-center gap-1"
                  >
                    {replenishingId === r.item_id ? "計算中⋯" : "⚡ 補貨"}
                  </button>
                )}
              </div>
            )}
            pagination={{
              page,
              pageSize,
              totalCount,
              onPageChange: goToPage,
            }}
          />
        </div>
        <DetailPanel selected={selected} onClose={() => setSelected(null)} />
      </div>

      {serialOpen && <SerialQueryModal onClose={() => setSerialOpen(false)} />}

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

// ─────────────────────────────────────────────
// Detail Panel — 顯示選中 row 的 7 日 in/out SparkLine
// ─────────────────────────────────────────────
function DetailPanel({
  selected,
  onClose,
}: {
  selected: BalanceRow | null;
  onClose: () => void;
}) {
  const [movement, setMovement] = useState<{
    in_series: number[];
    out_series: number[];
    net_series: number[];
    labels: string[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected) {
      setMovement(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setMovement(null);
    (async () => {
      try {
        const m = await getItem7DayMovement(selected.item_id);
        if (!cancelled) setMovement(m);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected]);

  if (!selected) {
    return (
      <aside className="bg-white border border-[#EEECE6] rounded-lg p-6 flex flex-col items-center justify-center text-center min-h-[280px]">
        <div className="w-12 h-12 rounded-full bg-[#F8F7F4] flex items-center justify-center text-[24px] text-[#9A9890] mb-2">
          📦
        </div>
        <div className="text-[12.5px] text-[#5A5955]">點任一列「詳情」</div>
        <div className="text-[11px] text-[#9A9890] mt-1">查看該料件 7 日入出庫走勢</div>
      </aside>
    );
  }

  const meta = ALERT_META[selected.alert_level];
  const netSum = movement ? movement.net_series.reduce((s, v) => s + v, 0) : 0;
  const inSum = movement ? movement.in_series.reduce((s, v) => s + v, 0) : 0;
  const outSum = movement ? movement.out_series.reduce((s, v) => s + v, 0) : 0;

  return (
    <aside className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">料件詳情</h2>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[#9A9890] hover:text-[#2C2C2A] text-[16px] leading-none"
          aria-label="關閉"
        >
          ✕
        </button>
      </header>
      <div className="px-4 py-3 space-y-3">
        <div>
          <div className="font-mono font-semibold text-[13px] text-[#1A3A5C]">
            {selected.item_code}
          </div>
          <div className="text-[12.5px] text-[#2C2C2A]">{selected.item_name}</div>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {selected.abc_class && (
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-medium ${abcChipClass(selected.abc_class)}`}
              >
                {selected.abc_class} 類
              </span>
            )}
            <span
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10.5px] font-medium border ${meta.cls}`}
            >
              <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
              {meta.label}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-[#F8F7F4] rounded px-2 py-1.5">
            <div className="text-[10px] text-[#9A9890]">可用</div>
            <div className="text-[14px] font-semibold font-mono text-[#1A3A5C]">
              {selected.qty_available}
            </div>
          </div>
          <div className="bg-[#F8F7F4] rounded px-2 py-1.5">
            <div className="text-[10px] text-[#9A9890]">保留</div>
            <div className="text-[14px] font-semibold font-mono text-[#854F0B]">
              {selected.qty_reserved}
            </div>
          </div>
          <div className="bg-[#F8F7F4] rounded px-2 py-1.5">
            <div className="text-[10px] text-[#9A9890]">總量</div>
            <div className="text-[14px] font-semibold font-mono text-[#0F6E56]">
              {selected.qty_total}
            </div>
          </div>
        </div>

        <div className="text-[11px] text-[#5A5955] space-y-1">
          <div>
            倉庫：<span className="text-[#2C2C2A]">{selected.warehouse_name ?? "—"}</span>
          </div>
          <div>
            門檻：安全{" "}
            <span className="text-[#2C2C2A] font-mono">{selected.safety_stock ?? "—"}</span> · 再訂購{" "}
            <span className="text-[#2C2C2A] font-mono">{selected.reorder_point ?? "—"}</span> · 最高{" "}
            <span className="text-[#2C2C2A] font-mono">{selected.max_stock ?? "—"}</span>
          </div>
          {selected.last_movement_at && (
            <div>
              最後異動：
              <span className="font-mono text-[#2C2C2A]">
                {selected.last_movement_at.slice(0, 10)}
              </span>
            </div>
          )}
        </div>

        {/* SparkLine 區塊 */}
        <div className="border-t border-[#EEECE6] pt-2">
          <div className="text-[11px] text-[#9A9890] font-semibold tracking-wider mb-1.5">
            ▼ 7 日入出庫走勢
          </div>
          {loading && (
            <div className="text-[11.5px] text-[#9A9890] py-4 text-center">載入中⋯</div>
          )}
          {error && (
            <div className="text-[11.5px] text-[#CC0000] py-2 px-2 bg-[#FDECEA] rounded">
              {error}
            </div>
          )}
          {!loading && !error && movement && (
            <>
              <div className="grid grid-cols-3 gap-2 text-center mb-2">
                <div>
                  <div className="text-[10px] text-[#9A9890]">入庫</div>
                  <div className="text-[12px] font-semibold font-mono text-[#0F6E56]">
                    +{inSum}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9A9890]">出庫</div>
                  <div className="text-[12px] font-semibold font-mono text-[#CC0000]">
                    −{outSum}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-[#9A9890]">淨變動</div>
                  <div
                    className={`text-[12px] font-semibold font-mono ${
                      netSum >= 0 ? "text-[#0F6E56]" : "text-[#CC0000]"
                    }`}
                  >
                    {netSum >= 0 ? "+" : ""}
                    {netSum}
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <div>
                  <div className="text-[10.5px] text-[#9A9890] mb-0.5">入庫</div>
                  <SparkLine data={movement.in_series} tone="green" height={28} />
                </div>
                <div>
                  <div className="text-[10.5px] text-[#9A9890] mb-0.5">出庫</div>
                  <SparkLine data={movement.out_series} tone="red" height={28} />
                </div>
                <div>
                  <div className="text-[10.5px] text-[#9A9890] mb-0.5">淨變動</div>
                  <SparkLine data={movement.net_series} tone="blue" height={28} />
                </div>
              </div>
              <div className="flex justify-between mt-1 text-[9.5px] text-[#9A9890] font-mono">
                {movement.labels.map((l, i) => (
                  <span key={i}>{l}</span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="border-t border-[#EEECE6] pt-2 flex flex-col gap-1.5">
          <Link
            href={`/parts/setup/items/${selected.item_id}`}
            className="h-[28px] inline-flex items-center justify-center rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            進入料件詳情
          </Link>
        </div>
      </div>
    </aside>
  );
}

// ─────────────────────────────────────────────
// Serial Modal — 保留舊功能（querySerialNo）
// ─────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  on_hand: "在庫",
  available: "可用",
  reserved: "保留",
  issued: "已發",
  damaged: "損壞",
  frozen: "凍結",
  in_transit: "在途",
  consignment: "寄存",
  quarantine: "隔離",
  disposed: "報廢",
};

function SerialQueryModal({ onClose }: { onClose: () => void }) {
  const [sn, setSn] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SerialTraceResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const trimmed = sn.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await querySerialNo(trimmed);
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/30 flex items-center justify-center z-[100]"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-[640px] max-w-[92vw] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">序列號查詢</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[#9A9890] hover:text-[#2C2C2A] text-[16px] leading-none"
          >
            ✕
          </button>
        </header>
        <div className="px-4 py-4 space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={sn}
              onChange={(e) => setSn(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="輸入序列號 (SN)..."
              className="flex-1 h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
              autoFocus
            />
            <button
              type="button"
              onClick={submit}
              disabled={loading || !sn.trim()}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {loading ? "查詢中⋯" : "查詢"}
            </button>
          </div>

          {error && (
            <div className="px-3 py-2 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[12px]">
              {error}
            </div>
          )}

          {result && !result.found && (
            <div className="px-3 py-3 rounded bg-[#F8F7F4] text-[12.5px] text-[#5A5955]">
              查無此序列號 <b className="font-mono">{result.serial_no}</b>
            </div>
          )}

          {result && result.found && (
            <div className="space-y-3">
              <div className="bg-[#F8F7F4] rounded-lg p-3 grid grid-cols-2 gap-x-4 gap-y-2">
                <div>
                  <div className="text-[11px] text-[#9A9890]">序列號</div>
                  <div className="text-[12.5px] font-mono font-semibold text-[#1A3A5C]">
                    {result.serial_no}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">料號 / 品名</div>
                  <div className="text-[12.5px]">
                    <span className="font-mono font-semibold text-[#1A3A5C]">
                      {result.item.code}
                    </span>{" "}
                    {result.item.name}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">當前位置</div>
                  <div className="text-[12.5px]">{result.current.warehouse_name ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890]">狀態 / 數量</div>
                  <div className="text-[12.5px]">
                    {STATUS_LABEL[result.current.status] ?? result.current.status}{" "}
                    <b className="font-mono">{result.current.qty}</b>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[12px] font-semibold text-[#2C2C2A] mb-1.5">異動軌跡</div>
                {result.history.length === 0 ? (
                  <div className="px-3 py-3 rounded bg-[#F8F7F4] text-[12px] text-[#9A9890]">
                    沒有異動紀錄
                  </div>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="bg-[#F8F7F4] text-left text-[11px] text-[#9A9890]">
                        <th className="px-2 py-1.5">時間</th>
                        <th className="px-2 py-1.5">類型</th>
                        <th className="px-2 py-1.5">單據</th>
                        <th className="px-2 py-1.5">倉庫</th>
                        <th className="px-2 py-1.5 text-right">數量</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.history.map((h, i) => (
                        <tr key={i} className="border-t border-[#EEECE6]">
                          <td className="px-2 py-1.5 font-mono text-[11.5px] text-[#5A5955]">
                            {h.event_time?.slice(0, 19).replace("T", " ")}
                          </td>
                          <td className="px-2 py-1.5">{h.doc_kind}</td>
                          <td className="px-2 py-1.5 font-mono text-[11.5px] text-[#1A3A5C]">
                            {h.doc_no ?? "—"}
                          </td>
                          <td className="px-2 py-1.5">{h.warehouse_name ?? "—"}</td>
                          <td className="px-2 py-1.5 text-right font-mono">{h.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
