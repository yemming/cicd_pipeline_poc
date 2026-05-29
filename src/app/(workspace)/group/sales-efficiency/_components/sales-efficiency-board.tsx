"use client";

/**
 * GRP07 銷售顧問能效 — client board（4 張 D3 散佈圖 + 門店切換 filter）
 *
 * 診斷理念（建議書）：「平均值說謊，散佈圖才說真話。當某個人的點跑到左下角，
 * 管理層自己就看到了。」
 *
 * 四張常態散佈圖（§5.1）：
 *   S1 銷售能效  x=總接待量      y=成交率        診斷：右下=高流量低轉化
 *   S2 盈利能效  x=成交率        y=單車 GP3      診斷：右下=靠折扣衝量最危險
 *   S3 衍生能效  x=成交率        y=單車衍生毛利   診斷：金融保險話術不足
 *   S4 客戶信任  x=成交台次      y=個人平均 NPS   診斷：用服務換銷量的危險人物
 *
 * 銷售藍主題（#1A3A5C）、點=圓形。門店切換是純前端 filter（不重打 server）。
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useMemo, useState } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3ScatterChart, type ScatterTag } from "@/components/charts/d3-scatter";
import type { SalesEffStaff } from "@/domain/group-analytics";

const THEME = "#1A3A5C"; // 銷售藍
const ALL_STORES = "__all__";

/* ── 格式化 helper ── */
const fmtPct = (v: number) => `${Math.round(v * 1000) / 10}%`;
const fmtScore = (v: number) => String(Math.round(v * 10) / 10);
const fmtMoney = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`;
const fmtCount = (v: number) => String(Math.round(v));

/** tag → 中文標籤（圖例用） */
const TAG_LABEL: Record<ScatterTag, string> = {
  star: "明星",
  watch: "待輔導",
  danger: "危險",
  neutral: "資料不足",
};
const TAG_DOT: Record<ScatterTag, string> = {
  star: "#0F6E56",
  watch: "#F59E0B",
  danger: "#CC0000",
  neutral: "#9A9890",
};

/** 圖卡 wrapper（module-level，避免 render 內建元件 reset state） */
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

/** 共用 tooltip 工廠：顯示 姓名 / 門店 / 兩軸數值 */
function makeTooltip(
  xLabel: string,
  yLabel: string,
  xv: (s: SalesEffStaff) => number | null,
  yv: (s: SalesEffStaff) => number | null,
  xf: (v: number) => string,
  yf: (v: number) => string,
) {
  return function Tooltip(s: SalesEffStaff) {
    const x = xv(s);
    const y = yv(s);
    return (
      <div className="leading-tight">
        <div className="text-[12px] font-semibold text-[#2C2C2A]">{s.name}</div>
        <div className="text-[10px] text-[#9A9890]">{s.store ?? "未分配門店"}</div>
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

export function SalesEfficiencyBoard({ staff }: { staff: SalesEffStaff[] }) {
  useSetPageHeader({
    title: "銷售顧問能效",
    breadcrumb: [
      { label: "集團管理", href: "/group/dashboard" },
      { label: "銷售顧問能效" },
    ],
    hideSearch: true,
  });

  // 依資料出現的 store 去重，組門店下拉選項
  const stores = useMemo(() => {
    const set = new Set<string>();
    for (const s of staff) if (s.store) set.add(s.store);
    return [...set].sort((a, b) => a.localeCompare(b, "zh-Hant"));
  }, [staff]);

  const [store, setStore] = useState<string>(ALL_STORES);

  const filtered = useMemo(
    () => (store === ALL_STORES ? staff : staff.filter((s) => s.store === store)),
    [staff, store],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">銷售顧問能效</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GRP07
        </span>
        <span className="text-[12px] text-[#9A9890]">
          平均值說謊，散佈圖才說真話 — 異常自己跑到左下角，管理層一眼看到
        </span>
      </header>

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
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <span className="text-[12px] text-[#9A9890] ml-1 mb-1.5">
            共 <b className="text-[#2C2C2A]">{filtered.length}</b> 位銷售顧問
          </span>

          {/* 診斷分類圖例 */}
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
        {/* S1 銷售能效：x=總接待量、y=成交率 */}
        <ChartCard title="S1 · 銷售能效" diagnosis="右下＝高流量低轉化（新人或話術問題）">
          <D3ScatterChart<SalesEffStaff>
            data={filtered}
            x={(s) => s.reception_count}
            y={(s) => s.conversion_rate}
            xLabel="總接待量"
            yLabel="成交率"
            xFormat={fmtCount}
            yFormat={fmtPct}
            colorTheme={THEME}
            markerShape="circle"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip(
              "總接待量",
              "成交率",
              (s) => s.reception_count,
              (s) => s.conversion_rate,
              fmtCount,
              fmtPct,
            )}
          />
        </ChartCard>

        {/* S2 盈利能效：x=成交率、y=單車 GP3 */}
        <ChartCard title="S2 · 盈利能效" diagnosis="右下＝靠折扣衝量（最危險，成交率高但單車毛利薄）">
          <D3ScatterChart<SalesEffStaff>
            data={filtered}
            x={(s) => s.conversion_rate}
            y={(s) => s.avg_gp3}
            xLabel="成交率"
            yLabel="單車 GP3"
            xFormat={fmtPct}
            yFormat={fmtMoney}
            colorTheme={THEME}
            markerShape="circle"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip(
              "成交率",
              "單車 GP3",
              (s) => s.conversion_rate,
              (s) => s.avg_gp3,
              fmtPct,
              fmtMoney,
            )}
            emptyMessage="尚無 GP3 資料（待 demo seed）"
          />
        </ChartCard>

        {/* S3 衍生能效：x=成交率、y=單車衍生毛利 */}
        <ChartCard title="S3 · 衍生能效" diagnosis="低衍生毛利＝金融保險／精品話術不足">
          <D3ScatterChart<SalesEffStaff>
            data={filtered}
            x={(s) => s.conversion_rate}
            y={(s) => s.avg_derivative_gp}
            xLabel="成交率"
            yLabel="單車衍生毛利"
            xFormat={fmtPct}
            yFormat={fmtMoney}
            colorTheme={THEME}
            markerShape="circle"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip(
              "成交率",
              "單車衍生毛利",
              (s) => s.conversion_rate,
              (s) => s.avg_derivative_gp,
              fmtPct,
              fmtMoney,
            )}
            emptyMessage="尚無衍生毛利資料（待 demo seed）"
          />
        </ChartCard>

        {/* S4 客戶信任：x=成交台次、y=個人平均 NPS */}
        <ChartCard title="S4 · 客戶信任" diagnosis="高成交低 NPS＝用服務換銷量的危險人物">
          <D3ScatterChart<SalesEffStaff>
            data={filtered}
            x={(s) => s.deal_count}
            y={(s) => s.avg_nps}
            xLabel="成交台次"
            yLabel="個人平均 NPS"
            xFormat={fmtCount}
            yFormat={fmtScore}
            colorTheme={THEME}
            markerShape="circle"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip(
              "成交台次",
              "個人平均 NPS",
              (s) => s.deal_count,
              (s) => s.avg_nps,
              fmtCount,
              fmtScore,
            )}
            emptyMessage="尚無 NPS 資料（待 demo seed）"
          />
        </ChartCard>
      </div>

      <p className="text-[11px] text-[#9A9890] leading-relaxed">
        資料窗：近 3 個月滾動。即時計算（接待量／成交台次／成交率）；單車 GP3／衍生毛利／個人
        NPS 等細粒度指標現行交易表尚無，由 KPI 快照（demo seed）補上 — 缺值的點會略過不畫。
      </p>
    </main>
  );
}
