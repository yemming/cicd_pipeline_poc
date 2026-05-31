"use client";

/**
 * GRP19 品牌認證中古車能效 — client board
 * （4 張 D3 散佈圖〔每點＝門店、圓圈大小＝現有庫存〕 + 門店切換 + 排名表 + 庫存清單）
 *
 * 四張散佈圖：
 *   U1 收購能力  x=本季收購台數  y=收購價差率
 *   U2 售出效率  x=本季售出台數  y=售出毛利率
 *   U3 庫存周轉  x=本季收購台數  y=平均翻車天數  （右上＝多量慢翻，滯銷危險）
 *   U4 綜合獲利  x=收購價差率    y=售出毛利率
 *
 * 門店切換：選店 → 散佈圖該點外圈高亮 + 庫存清單與 KPI 篩到該店；全部門店 = 集團彙總。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useMemo, useState } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3ScatterChart, type ScatterTag } from "@/components/charts/d3-scatter";
import type { UsedCarStoreEff, UsedCarInventoryItem } from "@/domain/group-analytics";

const THEME = "#185FA5"; // 中古車業務藍
const ALL_STORES = "__all__";
const DEAD_DAYS = 60; // 翻車天數 > 60 標警示

const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const fmtCount = (v: number) => String(Math.round(v));
const fmtDays = (v: number) => `${Math.round(v)} 天`;
const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const fmtKm = (v: number) => `${Math.round(v).toLocaleString("en-US")} km`;

const TAG_LABEL: Record<ScatterTag, string> = {
  star: "標竿",
  watch: "待提升",
  danger: "滯銷風險",
  neutral: "中性",
};
const TAG_DOT: Record<ScatterTag, string> = {
  star: "#0F6E56",
  watch: "#F59E0B",
  danger: "#CC0000",
  neutral: "#9A9890",
};

/** status → 中文銷售狀態。 */
const STATUS_LABEL: Record<string, string> = {
  available: "在庫",
  reserved: "已預訂",
  sold: "已售出",
  pending_inspection: "待檢驗",
  pending_recon: "待整備",
};

function ChartCard({
  title,
  diagnosis,
  children,
}: {
  title: string;
  diagnosis: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
        <p className="text-[11px] text-[#9A9890] mt-0.5">{diagnosis}</p>
      </header>
      <div className="px-3 py-3">{children}</div>
    </section>
  );
}

function makeTooltip(
  xLabel: string,
  yLabel: string,
  xv: (s: UsedCarStoreEff) => number | null,
  yv: (s: UsedCarStoreEff) => number | null,
  xf: (v: number) => string,
  yf: (v: number) => string,
) {
  return function Tooltip(s: UsedCarStoreEff) {
    const x = xv(s);
    const y = yv(s);
    return (
      <div className="leading-tight">
        <div className="text-[12px] font-semibold text-[#2C2C2A]">{s.store}</div>
        <div className="text-[10px] text-[#9A9890]">現有庫存 {s.inventory_count} 台</div>
        <div className="mt-1 text-[11px] text-[#5A5955]">
          <span className="text-[#9A9890]">{xLabel}：</span>
          {x == null ? "—" : xf(x)}
        </div>
        <div className="text-[11px] text-[#5A5955]">
          <span className="text-[#9A9890]">{yLabel}：</span>
          {y == null ? "—" : yf(y)}
        </div>
      </div>
    );
  };
}

function KpiCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="text-[20px] font-semibold text-[#2C2C2A] leading-tight mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-[#9A9890] mt-0.5">{hint}</div>}
    </div>
  );
}

export function UsedCarEfficiencyBoard({
  stores,
  inventory,
}: {
  stores: UsedCarStoreEff[];
  inventory: UsedCarInventoryItem[];
}) {
  useSetPageHeader({
    title: "品牌認證中古車能效",
    breadcrumb: [
      { label: "集團管理", href: "/group/dashboard" },
      { label: "品牌認證中古車能效" },
    ],
    hideSearch: true,
  });

  const [store, setStore] = useState<string>(ALL_STORES);

  const selectedStore = useMemo(
    () => (store === ALL_STORES ? null : stores.find((s) => s.store === store) ?? null),
    [stores, store],
  );

  // KPI：選店看該店，否則集團彙總
  const kpis = useMemo(() => {
    const list = selectedStore ? [selectedStore] : stores;
    const acquired = list.reduce((a, s) => a + s.acquired_count, 0);
    const sold = list.reduce((a, s) => a + s.sold_count, 0);
    const inv = list.reduce((a, s) => a + s.inventory_count, 0);
    const turns = list.filter((s) => s.turnover_days != null);
    const avgTurn = turns.length
      ? turns.reduce((a, s) => a + (s.turnover_days as number), 0) / turns.length
      : null;
    return { acquired, sold, inv, avgTurn };
  }, [stores, selectedStore]);

  // 庫存清單：選店則篩該店
  const invFiltered = useMemo(
    () => (selectedStore ? inventory.filter((r) => r.store === selectedStore.store) : inventory),
    [inventory, selectedStore],
  );

  const ranked = useMemo(
    () => [...stores].sort((a, b) => b.acquired_count - a.acquired_count),
    [stores],
  );

  const selectedKey = selectedStore?.store_id ?? null;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">品牌認證中古車能效</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GRP19
        </span>
        <span className="text-[12px] text-[#9A9890]">
          收購能力／售出效率／庫存周轉／綜合獲利四象限 — 圓圈大小＝現有庫存台數
        </span>
      </header>

      {/* KPI 卡 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard label="本季收購台數" value={fmtCount(kpis.acquired)} hint="近 3 個月" />
        <KpiCard label="本季售出台數" value={fmtCount(kpis.sold)} hint="近 3 個月" />
        <KpiCard
          label="均值翻車天數"
          value={kpis.avgTurn == null ? "—" : fmtDays(kpis.avgTurn)}
          hint="收購到售出"
        />
        <KpiCard label="現有庫存台數" value={fmtCount(kpis.inv)} hint="未售出" />
      </div>

      {/* Filter Bar：門店切換 + 圖例 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-3 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">門店</label>
            <select
              value={store}
              onChange={(e) => setStore(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] focus:outline-none bg-white min-w-[160px]"
            >
              <option value={ALL_STORES}>全部門店</option>
              {stores.map((s) => (
                <option key={s.store_id} value={s.store}>
                  {s.store}
                </option>
              ))}
            </select>
          </div>

          <span className="text-[12px] text-[#9A9890] ml-1 mb-1.5">
            共 <b className="text-[#2C2C2A]">{stores.length}</b> 間門店
            {selectedStore && (
              <>
                ｜ 庫存 <b className="text-[#2C2C2A]">{invFiltered.length}</b> 台
              </>
            )}
          </span>

          <div className="ml-auto mb-1 flex items-center gap-3 flex-wrap">
            {(["star", "watch", "danger", "neutral"] as ScatterTag[]).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] text-[#5A5955]">
                <span
                  className="inline-block w-2.5 h-2.5 rounded-full"
                  style={{ background: TAG_DOT[t] }}
                />
                {TAG_LABEL[t]}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 4 張散佈圖 2×2 grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ChartCard title="U1 · 收購能力" diagnosis="右上＝多量高差價（收購最強，量質俱佳）">
          <D3ScatterChart<UsedCarStoreEff>
            data={stores}
            x={(s) => s.acquired_count}
            y={(s) => s.spread_rate}
            xLabel="本季收購台數"
            yLabel="收購價差率"
            xFormat={fmtCount}
            yFormat={fmtPct}
            colorTheme={THEME}
            markerShape="circle"
            sizeOf={(s) => s.inventory_count}
            tagOf={(s) => s.tag}
            keyOf={(s) => s.store_id}
            selectedKey={selectedKey}
            onSelect={(s) => setStore((prev) => (prev === s.store ? ALL_STORES : s.store))}
            tooltip={makeTooltip("本季收購台數", "收購價差率", (s) => s.acquired_count, (s) => s.spread_rate, fmtCount, fmtPct)}
            emptyMessage="尚無中古車資料"
          />
        </ChartCard>

        <ChartCard title="U2 · 售出效率" diagnosis="右上＝多量高毛利（最理想的中古車門店）">
          <D3ScatterChart<UsedCarStoreEff>
            data={stores}
            x={(s) => s.sold_count}
            y={(s) => s.margin_rate}
            xLabel="本季售出台數"
            yLabel="售出毛利率"
            xFormat={fmtCount}
            yFormat={fmtPct}
            colorTheme={THEME}
            markerShape="circle"
            sizeOf={(s) => s.inventory_count}
            tagOf={(s) => s.tag}
            keyOf={(s) => s.store_id}
            selectedKey={selectedKey}
            onSelect={(s) => setStore((prev) => (prev === s.store ? ALL_STORES : s.store))}
            tooltip={makeTooltip("本季售出台數", "售出毛利率", (s) => s.sold_count, (s) => s.margin_rate, fmtCount, fmtPct)}
            emptyMessage="尚無售出資料"
          />
        </ChartCard>

        <ChartCard title="U3 · 庫存周轉" diagnosis="右上＝多量慢翻（大量滯銷，資金壓力高）">
          <D3ScatterChart<UsedCarStoreEff>
            data={stores}
            x={(s) => s.acquired_count}
            y={(s) => s.turnover_days}
            xLabel="本季收購台數"
            yLabel="平均翻車天數"
            xFormat={fmtCount}
            yFormat={fmtDays}
            colorTheme={THEME}
            markerShape="circle"
            sizeOf={(s) => s.inventory_count}
            tagOf={(s) => s.tag}
            keyOf={(s) => s.store_id}
            selectedKey={selectedKey}
            onSelect={(s) => setStore((prev) => (prev === s.store ? ALL_STORES : s.store))}
            tooltip={makeTooltip("本季收購台數", "平均翻車天數", (s) => s.acquired_count, (s) => s.turnover_days, fmtCount, fmtDays)}
            emptyMessage="尚無周轉資料"
          />
        </ChartCard>

        <ChartCard title="U4 · 綜合獲利" diagnosis="右上＝高差價高毛利（收購與銷售雙優，標竿）">
          <D3ScatterChart<UsedCarStoreEff>
            data={stores}
            x={(s) => s.spread_rate}
            y={(s) => s.margin_rate}
            xLabel="收購價差率"
            yLabel="售出毛利率"
            xFormat={fmtPct}
            yFormat={fmtPct}
            colorTheme={THEME}
            markerShape="circle"
            sizeOf={(s) => s.inventory_count}
            tagOf={(s) => s.tag}
            keyOf={(s) => s.store_id}
            selectedKey={selectedKey}
            onSelect={(s) => setStore((prev) => (prev === s.store ? ALL_STORES : s.store))}
            tooltip={makeTooltip("收購價差率", "售出毛利率", (s) => s.spread_rate, (s) => s.margin_rate, fmtPct, fmtPct)}
            emptyMessage="尚無獲利資料"
          />
        </ChartCard>
      </div>

      {/* 門店綜合績效排名 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">🔄 各門店中古車綜合績效</h2>
          <p className="text-[11px] text-[#9A9890] mt-0.5">
            依本季收購台數排序 ｜ 平均翻車天數超過 {DEAD_DAYS} 天標警示
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6] bg-[#FBFAF8]">
                <th className="text-left font-medium px-3 py-2 w-10">#</th>
                <th className="text-left font-medium px-3 py-2">門店</th>
                <th className="text-right font-medium px-3 py-2">收購台數</th>
                <th className="text-right font-medium px-3 py-2">收購價差率</th>
                <th className="text-right font-medium px-3 py-2">售出台數</th>
                <th className="text-right font-medium px-3 py-2">售出毛利率</th>
                <th className="text-right font-medium px-3 py-2">平均翻車天數</th>
                <th className="text-right font-medium px-3 py-2">現有庫存</th>
                <th className="text-right font-medium px-3 py-2">滯銷率</th>
                <th className="text-center font-medium px-3 py-2">評級</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => {
                const flagged = s.turnover_days != null && s.turnover_days > DEAD_DAYS;
                return (
                  <tr
                    key={s.store_id}
                    className={`border-b border-[#F2F1ED] cursor-pointer hover:bg-[#F8F7F4] ${
                      flagged ? "bg-[#FDF3E3]" : ""
                    } ${selectedKey === s.store_id ? "ring-1 ring-[#185FA5]" : ""}`}
                    onClick={() => setStore((prev) => (prev === s.store ? ALL_STORES : s.store))}
                  >
                    <td className="px-3 py-2 text-[#9A9890]">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-[#2C2C2A]">{s.store}</td>
                    <td className="px-3 py-2 text-right">{fmtCount(s.acquired_count)}</td>
                    <td className="px-3 py-2 text-right">
                      {s.spread_rate == null ? "—" : fmtPct(s.spread_rate)}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtCount(s.sold_count)}</td>
                    <td className="px-3 py-2 text-right">
                      {s.margin_rate == null ? "—" : fmtPct(s.margin_rate)}
                    </td>
                    <td
                      className={`px-3 py-2 text-right ${flagged ? "text-[#B45309] font-semibold" : ""}`}
                    >
                      {s.turnover_days == null ? "—" : fmtDays(s.turnover_days)}
                    </td>
                    <td className="px-3 py-2 text-right">{fmtCount(s.inventory_count)}</td>
                    <td className="px-3 py-2 text-right">
                      {s.deadstock_rate == null ? "—" : fmtPct(s.deadstock_rate)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium"
                        style={{ background: `${TAG_DOT[s.tag]}1A`, color: TAG_DOT[s.tag] }}
                      >
                        {TAG_LABEL[s.tag]}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {ranked.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-[#9A9890]">
                    尚無中古車門店資料
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 庫存清單 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            品牌認證中古車庫存清單
            {selectedStore && <span className="text-[#185FA5]"> — {selectedStore.store}</span>}
          </h2>
          <p className="text-[11px] text-[#9A9890] mt-0.5">
            含已售出與在庫車輛 ｜ 在庫天數超過 {DEAD_DAYS} 天標警示
          </p>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6] bg-[#FBFAF8]">
                <th className="text-left font-medium px-3 py-2">車牌/車號</th>
                <th className="text-left font-medium px-3 py-2">車型</th>
                <th className="text-left font-medium px-3 py-2">門店</th>
                <th className="text-right font-medium px-3 py-2">年式</th>
                <th className="text-right font-medium px-3 py-2">里程</th>
                <th className="text-right font-medium px-3 py-2">收購價</th>
                <th className="text-right font-medium px-3 py-2">售價</th>
                <th className="text-left font-medium px-3 py-2">收購日</th>
                <th className="text-right font-medium px-3 py-2">在庫天數</th>
                <th className="text-center font-medium px-3 py-2">認證</th>
                <th className="text-center font-medium px-3 py-2">銷售狀態</th>
              </tr>
            </thead>
            <tbody>
              {invFiltered.map((r) => {
                const isSold = r.status === "sold";
                const flagged = !isSold && r.days_in_stock != null && r.days_in_stock > DEAD_DAYS;
                return (
                  <tr
                    key={r.id}
                    className={`border-b border-[#F2F1ED] ${flagged ? "bg-[#FDF3E3]" : ""}`}
                  >
                    <td className="px-3 py-2 font-mono text-[#2C2C2A]">{r.license_plate ?? "—"}</td>
                    <td className="px-3 py-2 text-[#2C2C2A]">{r.model_display_name ?? "—"}</td>
                    <td className="px-3 py-2 text-[#5A5955]">{r.store ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.year ?? "—"}</td>
                    <td className="px-3 py-2 text-right">
                      {r.mileage_km == null ? "—" : fmtKm(r.mileage_km)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.acquisition_price == null ? "—" : fmtMoney(r.acquisition_price)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {r.listing_price == null ? "—" : fmtMoney(r.listing_price)}
                    </td>
                    <td className="px-3 py-2 text-[#5A5955]">{r.acquisition_date ?? "—"}</td>
                    <td
                      className={`px-3 py-2 text-right ${flagged ? "text-[#B45309] font-semibold" : ""}`}
                    >
                      {r.days_in_stock == null ? "—" : fmtDays(r.days_in_stock)}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                        {r.condition_grade ?? "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                          isSold
                            ? "bg-[#EAF3DE] text-[#3B6D11]"
                            : "bg-[#F2F2F2] text-[#6B6A68]"
                        }`}
                      >
                        {STATUS_LABEL[r.status ?? ""] ?? r.status ?? "—"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {invFiltered.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-3 py-6 text-center text-[#9A9890]">
                    尚無庫存車輛
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-[#9A9890] leading-relaxed">
        資料窗：近 3 個月滾動。全部指標真實計算自中古車庫存（used_car_inventory）：收購／售出台數、
        收購價差率、售出毛利率、平均翻車天數、現有庫存與滯銷率。點散佈圖圓點或排名列可切換單店深鑽。
      </p>
    </main>
  );
}
