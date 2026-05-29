"use client";

/**
 * GRP08 SA（服務顧問）能效診斷 — client board（4 張 D3 散佈圖 + 門店切換 + 返修率告警）
 *
 * 診斷理念（建議書）：「平均值說謊，散佈圖才說真話。某個 SA 接很多車卻沒增項、毛利
 * 偏低、或客戶不滿意，點自己會跑到危險象限，管理層一眼看到。」
 *
 * 四張散佈圖（§5.2）：
 *   A1 接車產值  x=接車台次  y=單車產值    診斷：接很多但沒增項（高台次低產值）
 *   A2 接車毛利  x=接車台次  y=毛利率      診斷：高台次低毛利（Marvin 型態）
 *   A3 增項能力  x=增項率    y=增項金額    診斷：開口率低、增項話術不足
 *   A4 客戶信任  x=接車台次  y=個人平均NPS  診斷：高台次但客戶不滿意
 *
 * 售後綠主題（#0F6E56）、點=菱形（與銷售圓形區隔）。門店切換是純前端 filter。
 *
 * 返修率告警（GRP08 差異點）：任一 SA rework_rate > 5% → 頁面頂端紅色告警橫幅，
 * 列出超標 SA + 返修率，點出「需立即介入」（呼應 AC 案例某店 45%）。
 *
 * 天條：不直連 supabase；資料由 server page 經 @/domain/group-analytics 注入。
 */

import { useMemo, useState } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { D3ScatterChart, type ScatterTag } from "@/components/charts/d3-scatter";
import type { SAEffStaff } from "@/domain/group-analytics";

const THEME = "#0F6E56"; // 售後綠
const ALL_STORES = "__all__";
const REWORK_THRESHOLD = 0.05; // 返修率 > 5% 觸發告警

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
  xv: (s: SAEffStaff) => number | null,
  yv: (s: SAEffStaff) => number | null,
  xf: (v: number) => string,
  yf: (v: number) => string,
) {
  return function Tooltip(s: SAEffStaff) {
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

export function SaEfficiencyBoard({ staff }: { staff: SAEffStaff[] }) {
  useSetPageHeader({
    title: "SA 能效診斷",
    breadcrumb: [
      { label: "集團管理", href: "/group/dashboard" },
      { label: "SA 能效診斷" },
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

  // 返修率告警：掃當前 filter 後的資料，挑 rework_rate > 5% 者（null 不算超標）
  const reworkAlerts = useMemo(
    () =>
      filtered
        .filter((s) => s.rework_rate != null && s.rework_rate > REWORK_THRESHOLD)
        .sort((a, b) => (b.rework_rate ?? 0) - (a.rework_rate ?? 0)),
    [filtered],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">SA 能效診斷</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          GRP08
        </span>
        <span className="text-[12px] text-[#9A9890]">
          平均值說謊，散佈圖才說真話 — 接車產值／毛利／增項／信任四象限，異常自己現形
        </span>
      </header>

      {/* 返修率告警橫幅：任一 SA 返修率 > 5% 才顯示 */}
      {reworkAlerts.length > 0 && (
        <section className="rounded-lg border border-[#F5AEAD] bg-[#FDECEA] px-4 py-3 text-[#CC0000]">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">warning</span>
            <span className="text-[13px] font-semibold">
              返修率異常告警 — {reworkAlerts.length} 位 SA 返修率超過 5%，需立即介入
            </span>
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[12px]">
            {reworkAlerts.map((s) => (
              <li key={s.staff_id} className="inline-flex items-center gap-1.5">
                <b>{s.name}</b>
                <span className="text-[#9A4040]">{s.store ?? "未分配門店"}</span>
                <span className="font-semibold">返修率 {fmtPct(s.rework_rate as number)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
            共 <b className="text-[#2C2C2A]">{filtered.length}</b> 位服務顧問
          </span>

          {/* 診斷分類圖例 */}
          <div className="ml-auto mb-1 flex items-center gap-3 flex-wrap">
            {(["star", "watch", "danger", "neutral"] as ScatterTag[]).map((t) => (
              <span key={t} className="inline-flex items-center gap-1 text-[11px] text-[#5A5955]">
                <span
                  className="inline-block w-2.5 h-2.5 rotate-45"
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
        {/* A1 接車產值：x=接車台次、y=單車產值 */}
        <ChartCard title="A1 · 接車產值" diagnosis="右下＝接很多車但單車產值低（沒做增項建議）">
          <D3ScatterChart<SAEffStaff>
            data={filtered}
            x={(s) => s.intake_count}
            y={(s) => s.avg_revenue_per_ro}
            xLabel="接車台次"
            yLabel="單車產值"
            xFormat={fmtCount}
            yFormat={fmtMoney}
            colorTheme={THEME}
            markerShape="diamond"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip(
              "接車台次",
              "單車產值",
              (s) => s.intake_count,
              (s) => s.avg_revenue_per_ro,
              fmtCount,
              fmtMoney,
            )}
            emptyMessage="尚無單車產值資料（待 demo seed）"
          />
        </ChartCard>

        {/* A2 接車毛利：x=接車台次、y=毛利率 */}
        <ChartCard title="A2 · 接車毛利" diagnosis="右下＝高台次低毛利（衝量但工料毛利薄，Marvin 型態）">
          <D3ScatterChart<SAEffStaff>
            data={filtered}
            x={(s) => s.intake_count}
            y={(s) => s.gross_margin_rate}
            xLabel="接車台次"
            yLabel="毛利率"
            xFormat={fmtCount}
            yFormat={fmtPct}
            colorTheme={THEME}
            markerShape="diamond"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip(
              "接車台次",
              "毛利率",
              (s) => s.intake_count,
              (s) => s.gross_margin_rate,
              fmtCount,
              fmtPct,
            )}
            emptyMessage="尚無毛利率資料（待 demo seed）"
          />
        </ChartCard>

        {/* A3 增項能力：x=增項率、y=增項金額 */}
        <ChartCard title="A3 · 增項能力" diagnosis="左下＝開口率低、增項話術不足（保養／檢修建議沒做）">
          <D3ScatterChart<SAEffStaff>
            data={filtered}
            x={(s) => s.addon_rate}
            y={(s) => s.addon_amount}
            xLabel="增項率"
            yLabel="增項金額"
            xFormat={fmtPct}
            yFormat={fmtMoney}
            colorTheme={THEME}
            markerShape="diamond"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip(
              "增項率",
              "增項金額",
              (s) => s.addon_rate,
              (s) => s.addon_amount,
              fmtPct,
              fmtMoney,
            )}
            emptyMessage="尚無增項資料（待 demo seed）"
          />
        </ChartCard>

        {/* A4 客戶信任：x=接車台次、y=個人平均 NPS */}
        <ChartCard title="A4 · 客戶信任" diagnosis="右下＝高台次但客戶不滿意（衝量犧牲服務品質）">
          <D3ScatterChart<SAEffStaff>
            data={filtered}
            x={(s) => s.intake_count}
            y={(s) => s.avg_nps}
            xLabel="接車台次"
            yLabel="個人平均 NPS"
            xFormat={fmtCount}
            yFormat={fmtScore}
            colorTheme={THEME}
            markerShape="diamond"
            tagOf={(s) => s.tag}
            tooltip={makeTooltip(
              "接車台次",
              "個人平均 NPS",
              (s) => s.intake_count,
              (s) => s.avg_nps,
              fmtCount,
              fmtScore,
            )}
            emptyMessage="尚無 NPS 資料（待 demo seed）"
          />
        </ChartCard>
      </div>

      <p className="text-[11px] text-[#9A9890] leading-relaxed">
        資料窗：近 3 個月滾動。即時計算（接車台次／單車產值）；毛利率／增項率／增項金額／個人
        NPS／返修率等細粒度指標現行交易表尚無，由 KPI 快照（demo seed）補上 — 缺值的點會略過不畫。
      </p>
    </main>
  );
}
