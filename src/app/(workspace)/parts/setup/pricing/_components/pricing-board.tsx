"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createStorePriceAction,
  endPromoPricingAction,
  setPriceAsPromoAction,
  updatePriceOnlyAction,
} from "@/lib/parts-setup/pricing-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization";
import { BarChart, DonutChart, type DonutDatum } from "@/components/charts";
import type { PricingRow, StoreOption, PricingStats } from "@/domain/pricing";

const TYPE_LABEL: Record<PricingRow["pricing_type"], { label: string; chip: string }> = {
  default: { label: "預設", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  store_custom: { label: "門店自訂", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  promo: { label: "促銷中", chip: "bg-[#FDF3E3] text-[#854F0B]" },
};

const PRICING_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部類型" },
  { value: "default", label: "預設（沿用建議）" },
  { value: "store_custom", label: "門店自訂" },
  { value: "promo", label: "促銷中" },
];

const MARGIN_BAND_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "全部毛利率" },
  { value: "high", label: "高 (≥ 20%)" },
  { value: "mid", label: "中 (15–20%)" },
  { value: "low", label: "低 (< 15%)" },
  { value: "none", label: "未計算（缺成本/售價）" },
];

type Banner = { ok: boolean; msg: string } | null;

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return `NT$ ${n.toLocaleString("en-US")}`;
}

function fmtMoneyCompact(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

export function PricingBoard({
  stores,
  rows,
  stats,
  activeStoreId,
  activeStoreName,
  canEdit,
  initialQ,
  initialType,
  initialBand,
}: {
  stores: StoreOption[];
  rows: PricingRow[];
  stats: PricingStats;
  activeStoreId: string | null;
  activeStoreName: string | null;
  canEdit: boolean;
  initialQ: string;
  initialType: string;
  initialBand: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initialQ);
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [bandFilter, setBandFilter] = useState(initialBand);
  const [banner, setBanner] = useState<Banner>(null);
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  function pushParams(opts: { store?: string | null; q?: string; type?: string; band?: string }) {
    const params = new URLSearchParams();
    const sid = opts.store !== undefined ? opts.store : activeStoreId;
    if (sid) params.set("store", sid);
    const qv = opts.q !== undefined ? opts.q : q;
    if (qv) params.set("q", qv);
    const tv = opts.type !== undefined ? opts.type : typeFilter;
    if (tv) params.set("type", tv);
    const bv = opts.band !== undefined ? opts.band : bandFilter;
    if (bv) params.set("band", bv);
    startTransition(() => {
      router.push(`/parts/setup/pricing${params.toString() ? "?" + params.toString() : ""}`);
    });
  }

  function resetFilters() {
    setQ("");
    setTypeFilter("");
    setBandFilter("");
    startTransition(() => {
      router.push(
        activeStoreId ? `/parts/setup/pricing?store=${activeStoreId}` : "/parts/setup/pricing",
      );
    });
  }

  async function handlePromoToggle(r: PricingRow) {
    if (!r.price_id) {
      showBanner({
        ok: false,
        msg: "請先在「門市售價」欄填一次價格建立紀錄、再切促銷",
      });
      return;
    }
    setPendingRows((prev) => {
      const n = new Set(prev);
      n.add(r.id);
      return n;
    });
    try {
      const isPromo = r.pricing_type === "promo";
      const res = isPromo
        ? await endPromoPricingAction(r.price_id)
        : await setPriceAsPromoAction(r.price_id);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: isPromo ? "✓ 已結束促銷" : "✓ 已切成促銷",
        });
        startTransition(() => router.refresh());
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    } finally {
      setPendingRows((prev) => {
        const n = new Set(prev);
        n.delete(r.id);
        return n;
      });
    }
  }

  // client-side filter（type / band）— server 已過 store/q，這兩個交給 client 即時切
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (typeFilter && r.pricing_type !== typeFilter) return false;
      if (bandFilter === "high" && (r.margin_pct === null || r.margin_pct < 20)) return false;
      if (bandFilter === "mid" && (r.margin_pct === null || r.margin_pct < 15 || r.margin_pct >= 20))
        return false;
      if (bandFilter === "low" && (r.margin_pct === null || r.margin_pct >= 15)) return false;
      if (bandFilter === "none" && r.margin_pct !== null) return false;
      return true;
    });
  }, [rows, typeFilter, bandFilter]);

  const columns: DataGridColumn<PricingRow>[] = [
    {
      id: "code",
      header: "備件代碼",
      width: 130,
      hideable: false,
      cell: (r) => <span className="font-mono text-[12px]">{r.code}</span>,
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "商品名稱",
      width: 200,
      cell: (r) => r.name,
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "standard_cost",
      header: "標準成本",
      width: 110,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{fmtMoney(r.standard_cost)}</span>,
      exportValue: (r) => (r.standard_cost ?? 0).toString(),
      sortValue: (r) => r.standard_cost ?? 0,
    },
    {
      id: "suggested_price",
      header: "建議售價",
      width: 110,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{fmtMoney(r.suggested_price)}</span>,
      exportValue: (r) => (r.suggested_price ?? 0).toString(),
      sortValue: (r) => r.suggested_price ?? 0,
    },
    {
      id: "store_price",
      header: `${activeStoreName ?? "門市"}價`,
      width: 130,
      align: "right",
      cell: (r) => {
        // fallback row（沒實體 price_id）→ 顯示建議售價 + `*` + 灰斜體
        if (!r.price_id) {
          return (
            <span
              className="font-mono text-[12px] italic text-[#9A9890]"
              title="顯示建議售價（此門店尚未建立定價、點擊可建立）"
            >
              {fmtMoney(r.store_price)} *
            </span>
          );
        }
        const cls =
          r.pricing_type === "promo"
            ? "text-[#854F0B] bg-[#FDF3E3]"
            : r.pricing_type === "store_custom"
              ? "text-[#1A3A5C] bg-[#EBF3FF]"
              : "text-[#2C2C2A]";
        return (
          <span className={`font-mono text-[12px] px-1.5 py-0.5 rounded ${cls}`}>
            {fmtMoney(r.store_price)}
          </span>
        );
      },
      exportValue: (r) => (r.store_price ?? 0).toString(),
      sortValue: (r) => r.store_price ?? 0,
      editable: canEdit
        ? {
            type: "text",
            getValue: (r) => (r.store_price === null ? "" : String(r.store_price)),
            onSave: async (r, value) => {
              const trimmed = value.trim();
              if (!trimmed) return { ok: false, error: "價格不可為空" };
              const num = Number(trimmed.replace(/[^\d.-]/g, ""));
              if (!Number.isFinite(num) || num <= 0) {
                return { ok: false, error: "價格必須是大於 0 的數字" };
              }

              // fallback row（該店尚未建立定價）→ INSERT
              if (!r.price_id) {
                if (!activeStoreId) {
                  return { ok: false, error: "請先選擇門店" };
                }
                const res = await createStorePriceAction({
                  item_id: r.id,
                  org_id: activeStoreId,
                  price: num,
                });
                if (res.ok) {
                  showBanner({ ok: true, msg: "✓ 已建立此門店定價" });
                  startTransition(() => router.refresh());
                }
                return res;
              }

              // 既有 row → UPDATE
              const res = await updatePriceOnlyAction(r.price_id, num);
              if (res.ok) {
                showBanner({ ok: true, msg: "✓ 已更新門市售價" });
                startTransition(() => router.refresh());
              }
              return res;
            },
          }
        : undefined,
    },
    {
      id: "margin",
      header: "毛利率",
      width: 90,
      align: "right",
      cell: (r) => {
        if (r.margin_pct === null) return <span className="text-[#9A9890]">—</span>;
        const color =
          r.margin_pct >= 20
            ? "text-[#0F6E56]"
            : r.margin_pct >= 15
              ? "text-[#854F0B]"
              : "text-[#CC0000]";
        return <span className={`font-mono text-[12px] ${color}`}>{r.margin_pct}%</span>;
      },
      exportValue: (r) => (r.margin_pct ?? 0).toString(),
      sortValue: (r) => r.margin_pct ?? 0,
    },
    {
      id: "pricing_type",
      header: "定價類型",
      width: 100,
      cell: (r) => {
        const def = TYPE_LABEL[r.pricing_type];
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
          >
            {def.label}
          </span>
        );
      },
      exportValue: (r) => TYPE_LABEL[r.pricing_type].label,
      sortValue: (r) => r.pricing_type,
    },
    {
      id: "promo_end_date",
      header: "促銷到期",
      width: 100,
      defaultHidden: false,
      cell: (r) => {
        if (r.pricing_type !== "promo" || !r.promo_end_date) {
          return <span className="text-[#9A9890]">—</span>;
        }
        const d = new Date(r.promo_end_date);
        const days = Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const cls =
          days <= 3
            ? "bg-[#FDECEA] text-[#CC0000]"
            : days <= 7
              ? "bg-[#FDF3E3] text-[#854F0B]"
              : "bg-[#EAF4FB] text-[#185FA5]";
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap font-mono ${cls}`}
          >
            {d.toISOString().slice(5, 10)} (T{days >= 0 ? "+" : ""}
            {days}d)
          </span>
        );
      },
      exportValue: (r) => r.promo_end_date ?? "",
      sortValue: (r) => r.promo_end_date ?? "",
    },
  ];

  // Donut data：定價類型分布
  const typeDonut: DonutDatum[] = [
    { name: "預設", value: stats.default_count, color: "#9A9890" },
    { name: "門店自訂", value: stats.custom_count, color: "#1A3A5C" },
    { name: "促銷中", value: stats.promo_count, color: "#D97706" },
  ].filter((d) => d.value > 0);

  // Bar data：價格區間分布
  const priceBarData = stats.price_buckets.map((b) => ({
    bucket: b.label,
    count: b.count,
  }));

  // Bar data：Top 5 毛利
  const topMarginData = stats.top_margin.map((r) => ({
    name: r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name,
    margin: r.margin_pct,
    price: r.store_price,
  }));

  // Bar data：Bottom 5 毛利
  const bottomMarginData = stats.bottom_margin.map((r) => ({
    name: r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name,
    margin: r.margin_pct,
    price: r.store_price,
  }));

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">門市定價</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          3.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定各門店備件售價・支援門店差異定價與促銷規則
        </span>
      </header>

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

      {/* KPI 卡 — 6 個 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard
          label="商品總數"
          value={stats.total}
          tone="blue"
          icon={<span className="text-[18px]">📦</span>}
        />
        <KpiCard
          label="獨立定價"
          value={stats.with_store_price}
          tone="teal"
          icon={<span className="text-[18px]">🏷️</span>}
          delta={
            stats.total > 0
              ? {
                  value: Math.round((stats.with_store_price / stats.total) * 100),
                  tone: "neutral",
                }
              : undefined
          }
        />
        <KpiCard
          label="促銷中"
          value={stats.promo_count}
          tone="amber"
          icon={<span className="text-[18px]">🔥</span>}
        />
        <KpiCard
          label="即將到期促銷"
          value={stats.expiring_promo_count}
          tone={stats.expiring_promo_count > 0 ? "red" : "gray"}
          icon={<span className="text-[18px]">⏰</span>}
        />
        <KpiCard
          label="平均毛利率"
          value={stats.avg_margin_pct !== null ? `${stats.avg_margin_pct}%` : "—"}
          tone={
            stats.avg_margin_pct !== null && stats.avg_margin_pct >= 20
              ? "green"
              : stats.avg_margin_pct !== null && stats.avg_margin_pct >= 15
                ? "amber"
                : "red"
          }
          icon={<span className="text-[18px]">💹</span>}
        />
        <KpiCard
          label="高毛利商品"
          value={stats.high_margin_count}
          tone="green"
          icon={<span className="text-[18px]">⭐</span>}
          delta={
            stats.total > 0
              ? {
                  value: Math.round((stats.high_margin_count / stats.total) * 100),
                  tone: "positive",
                }
              : undefined
          }
        />
      </div>

      {/* 視覺化區 — 3 欄 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <section className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#2C2C2A]">定價類型分布</span>
            <span className="text-[11px] text-[#9A9890]">{activeStoreName ?? "—"}</span>
          </div>
          {typeDonut.length > 0 ? (
            <DonutChart
              data={typeDonut}
              size="sm"
              showLegend
              centerLabel={String(stats.total)}
              centerCaption="件"
            />
          ) : (
            <div className="text-center text-[12px] text-[#9A9890] py-10">尚無資料</div>
          )}
        </section>
        <section className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#2C2C2A]">售價區間分布</span>
            <span className="text-[11px] text-[#9A9890]">NT$</span>
          </div>
          {priceBarData.some((d) => d.count > 0) ? (
            <BarChart
              data={priceBarData}
              categoryKey="bucket"
              valueKey="count"
              tone="blue"
              size="sm"
              rainbow
            />
          ) : (
            <div className="text-center text-[12px] text-[#9A9890] py-10">尚無資料</div>
          )}
        </section>
        <section className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#2C2C2A]">Top 5 毛利商品</span>
            <span className="text-[11px] text-[#9A9890]">% 毛利率</span>
          </div>
          {topMarginData.length > 0 ? (
            <BarChart
              data={topMarginData}
              categoryKey="name"
              valueKey="margin"
              orientation="horizontal"
              tone="green"
              size="sm"
              rainbow
            />
          ) : (
            <div className="text-center text-[12px] text-[#9A9890] py-10">尚無資料</div>
          )}
        </section>
      </div>

      {/* 第二排：Bottom 5 + 毛利率分布 + 促銷概要 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <section className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#2C2C2A]">毛利率分布</span>
            <span className="text-[11px] text-[#9A9890]">
              均 {stats.avg_margin_pct !== null ? `${stats.avg_margin_pct}%` : "—"}
            </span>
          </div>
          <div className="px-1 py-2 space-y-2">
            <MarginBar
              label="高 (≥ 20%)"
              count={stats.high_margin_count}
              total={stats.total}
              tone="green"
            />
            <MarginBar
              label="中 (15–20%)"
              count={stats.mid_margin_count}
              total={stats.total}
              tone="amber"
            />
            <MarginBar
              label="低 (< 15%)"
              count={stats.low_margin_count}
              total={stats.total}
              tone="red"
            />
            <MarginBar
              label="未計算"
              count={stats.no_margin_count}
              total={stats.total}
              tone="gray"
            />
          </div>
        </section>
        <section className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[12px] font-semibold text-[#2C2C2A]">需關注：Bottom 5 毛利</span>
            <span className="text-[11px] text-[#9A9890]">% 毛利率</span>
          </div>
          {bottomMarginData.length > 0 ? (
            <BarChart
              data={bottomMarginData}
              categoryKey="name"
              valueKey="margin"
              orientation="horizontal"
              tone="red"
              size="sm"
              rainbow
            />
          ) : (
            <div className="text-center text-[12px] text-[#9A9890] py-10">尚無資料</div>
          )}
        </section>
        <section className="bg-white border border-[#EEECE6] rounded-lg px-3 py-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[12px] font-semibold text-[#2C2C2A]">促銷概要</span>
            <span className="text-[11px] text-[#9A9890]">
              {stats.promo_count} 個促銷品
            </span>
          </div>
          {stats.promo_count > 0 ? (
            <ul className="space-y-1.5">
              {rows
                .filter((r) => r.pricing_type === "promo")
                .slice(0, 6)
                .map((r) => {
                  const d = r.promo_end_date ? new Date(r.promo_end_date) : null;
                  const days = d
                    ? Math.ceil((d.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                    : null;
                  const cls =
                    days !== null && days <= 3
                      ? "bg-[#FDECEA] text-[#CC0000]"
                      : days !== null && days <= 7
                        ? "bg-[#FDF3E3] text-[#854F0B]"
                        : "bg-[#EAF4FB] text-[#185FA5]";
                  return (
                    <li
                      key={r.id}
                      className="flex items-center gap-2 text-[12px] py-1 px-1 rounded hover:bg-[#F8F7F4]"
                    >
                      <span className="font-mono text-[11px] text-[#9A9890] w-[100px] truncate">
                        {r.code}
                      </span>
                      <span className="flex-1 truncate text-[#2C2C2A]">{r.name}</span>
                      <span className="font-mono text-[11px] text-[#854F0B]">
                        {fmtMoneyCompact(r.store_price)}
                      </span>
                      {days !== null ? (
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-mono ${cls}`}
                        >
                          T{days >= 0 ? "+" : ""}
                          {days}d
                        </span>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
          ) : (
            <div className="text-center text-[12px] text-[#9A9890] py-10">目前無促銷品</div>
          )}
        </section>
      </div>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">門店</label>
            <select
              value={activeStoreId ?? ""}
              onChange={(e) => pushParams({ store: e.target.value })}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {stores.length === 0 && <option value="">（無門店）</option>}
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">商品搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pushParams({})}
              placeholder="代碼或名稱..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[200px]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">定價類型</label>
            <select
              value={typeFilter}
              onChange={(e) => {
                setTypeFilter(e.target.value);
                pushParams({ type: e.target.value });
              }}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {PRICING_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">毛利率區間</label>
            <select
              value={bandFilter}
              onChange={(e) => {
                setBandFilter(e.target.value);
                pushParams({ band: e.target.value });
              }}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {MARGIN_BAND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => pushParams({})}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              type="button"
              disabled
              title="Phase 2 開放"
              className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#9A9890] cursor-not-allowed"
            >
              批次調整
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          {activeStoreName ?? "—"} · 顯示 <b className="text-[#2C2C2A]">{filteredRows.length}</b>{" "}
          / {rows.length} 筆
        </span>
        {(typeFilter || bandFilter) && (
          <span className="text-[11px] text-[#185FA5]">（已套用篩選）</span>
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState hasStore={!!activeStoreId} />
      ) : (
        <DataGrid
          columns={columns}
          data={filteredRows}
          rowKey={(r) => r.id}
          persistKey="parts/setup/pricing"
          exportFileName="pricing"
          emptyMessage={
            typeFilter || bandFilter
              ? "篩選條件下無符合資料"
              : "尚無商品 / 定價資料"
          }
          disabled={isPending}
          rowActionsWidth={100}
          rowActions={(r) => {
            const isPromo = r.pricing_type === "promo";
            const isRowPending = pendingRows.has(r.id);
            const noPriceRow = !r.price_id;
            const disabled = !canEdit || isRowPending || noPriceRow;
            const baseClass = isPromo
              ? "bg-[#FDF3E3] border border-[#F5D9A0] text-[#854F0B] hover:bg-[#fbe9c8]"
              : "bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]";
            const tooltip = !canEdit
              ? "沒有權限"
              : noPriceRow
                ? "請先在「門市售價」欄填一次價格建立紀錄、再切促銷"
                : isPromo
                  ? "結束促銷（自動還原為建議售價）"
                  : "切成促銷";
            return (
              <button
                type="button"
                disabled={disabled}
                onClick={() => handlePromoToggle(r)}
                title={tooltip}
                className={`h-[26px] px-2.5 rounded text-[11.5px] disabled:opacity-50 ${
                  disabled ? "cursor-not-allowed" : "cursor-pointer"
                } ${baseClass}`}
              >
                {isRowPending ? "處理中⋯" : isPromo ? "結束促銷" : "促銷"}
              </button>
            );
          }}
        />
      )}
    </main>
  );
}

function EmptyState({ hasStore }: { hasStore: boolean }) {
  return (
    <section className="bg-white border border-dashed border-[#D5D3CB] rounded-lg px-6 py-12 text-center">
      <div className="text-[28px] mb-2">🏪</div>
      <div className="text-[14px] font-semibold text-[#2C2C2A] mb-1">
        {hasStore ? "此門店尚無商品資料" : "請先選擇門店"}
      </div>
      <div className="text-[12px] text-[#9A9890]">
        {hasStore
          ? "確認商品主檔已建立 active 商品、或調整搜尋條件"
          : "從上方下拉選單選擇門店、開始管理門市定價"}
      </div>
    </section>
  );
}

function MarginBar({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: "green" | "amber" | "red" | "gray";
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const barCls =
    tone === "green"
      ? "bg-[#0F6E56]"
      : tone === "amber"
        ? "bg-[#D97706]"
        : tone === "red"
          ? "bg-[#CC0000]"
          : "bg-[#9A9890]";
  const textCls =
    tone === "green"
      ? "text-[#0F6E56]"
      : tone === "amber"
        ? "text-[#854F0B]"
        : tone === "red"
          ? "text-[#CC0000]"
          : "text-[#6B6A68]";
  return (
    <div>
      <div className="flex items-center text-[11.5px] mb-0.5">
        <span className="text-[#5A5955]">{label}</span>
        <span className={`ml-auto font-mono ${textCls}`}>
          {count} <span className="text-[#9A9890]">({pct}%)</span>
        </span>
      </div>
      <div className="h-[6px] bg-[#F2F2F2] rounded-full overflow-hidden">
        <div
          className={`h-full ${barCls} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
