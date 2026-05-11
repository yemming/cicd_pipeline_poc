"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";

import { RecalcButton } from "./recalc-button";

import type { AbcClass, AbcOverview, AbcResultRow } from "@/domain/analytics";

const CLASS_BADGE: Record<AbcClass, string> = {
  A: "bg-[#FDECEA] text-[#CC0000]",
  B: "bg-[#FDF3E3] text-[#854F0B]",
  C: "bg-[#EAF4FB] text-[#185FA5]",
};

const CLASS_LABEL: Record<AbcClass, string> = {
  A: "A 類",
  B: "B 類",
  C: "C 類",
};

function fmtNT(n: number): string {
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}

function fmtNTCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `NT$ ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `NT$ ${(n / 10_000).toFixed(1)} 萬`;
  return `NT$ ${Math.round(n).toLocaleString("en-US")}`;
}

type TabId = "overview" | "turnover" | "stale" | "shortage" | "detail";

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: "overview", label: "ABC 結構總覽", icon: "📊" },
  { id: "turnover", label: "庫存周轉率", icon: "🔄" },
  { id: "stale", label: "呆滯庫存分析", icon: "⚫" },
  { id: "shortage", label: "缺貨率報告", icon: "🚨" },
  { id: "detail", label: "ABC 零件明細", icon: "📋" },
];

export function AbcBoard({
  overview,
  rows,
  canEdit,
}: {
  overview: AbcOverview;
  rows: AbcResultRow[];
  canEdit: boolean;
}) {
  const [tab, setTab] = useState<TabId>("overview");
  const [classFilter, setClassFilter] = useState<AbcClass | "all">("all");
  const [search, setSearch] = useState("");

  const filteredRows = useMemo(() => {
    const kw = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (classFilter !== "all" && r.abc_class !== classFilter) return false;
      if (kw && !r.item_code.toLowerCase().includes(kw) && !r.item_name.toLowerCase().includes(kw)) return false;
      return true;
    });
  }, [rows, classFilter, search]);

  const { kpi, config, changedCount } = overview;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">ABC 分類與庫存分析報表</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          §12
        </span>
        <span className="text-[12px] text-[#9A9890]">
          以過去 {config?.rolling_period_months ?? 12} 個月滾動資料自動分類（A ≤ {config?.threshold_a_pct ?? 80}% / B ≤ {config?.threshold_b_pct ?? 95}%）
          {config?.last_recalc_at
            ? ` ・ 上次重跑 ${new Date(config.last_recalc_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`
            : " ・ 尚未跑過"}
        </span>
        <span className="ml-auto inline-flex items-center gap-2">
          {canEdit ? <RecalcButton /> : null}
        </span>
      </header>

      {changedCount > 0 ? (
        <div className="bg-[#FDF3E3] border border-[#F5DDA0] text-[#854F0B] rounded-md px-3 py-1.5 text-[11.5px]">
          本次重跑有 <b>{changedCount}</b> 個料件分類異動（與上次不同），可至「ABC 零件明細」確認。
        </div>
      ) : null}

      {/* Tabs */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {TABS.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-[#EEECE6] inline-flex items-center gap-1.5
                  ${active
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"}`}
              >
                <span>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        {tab === "overview" ? (
          <OverviewTab kpi={kpi} pct={overview.pct} amounts={overview.amounts} config={config} />
        ) : tab === "detail" ? (
          <DetailTab
            rows={filteredRows}
            totalRows={rows.length}
            classFilter={classFilter}
            setClassFilter={setClassFilter}
            search={search}
            setSearch={setSearch}
          />
        ) : (
          <PendingTab tab={tab} />
        )}
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: 總覽
// ──────────────────────────────────────────────────────────────────────────

function OverviewTab({
  kpi,
  pct,
  amounts,
  config,
}: {
  kpi: AbcOverview["kpi"];
  pct: AbcOverview["pct"];
  amounts: AbcOverview["amounts"];
  config: AbcOverview["config"];
}) {
  const a = pct.A;
  const b = a + pct.B;
  // conic-gradient 字串
  const pieBg = `conic-gradient(#CC0000 0% ${a.toFixed(2)}%, #EF9F27 ${a.toFixed(2)}% ${b.toFixed(2)}%, #185FA5 ${b.toFixed(2)}% 100%)`;

  return (
    <div className="space-y-3">
      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <KpiTile
          accent="#CC0000"
          label="A 類零件（高頻高值）"
          value={`${kpi.a.count} 種`}
          sub={`佔零件種類 ${kpi.a.pctOfTypes.toFixed(0)}%`}
          trend={`佔庫存金額 ${kpi.a.pctOfAmount.toFixed(0)}%`}
          trendColor="#3B6D11"
        />
        <KpiTile
          accent="#EF9F27"
          label="B 類零件（中頻中值）"
          value={`${kpi.b.count} 種`}
          sub={`佔零件種類 ${kpi.b.pctOfTypes.toFixed(0)}%`}
          trend={`佔庫存金額 ${kpi.b.pctOfAmount.toFixed(0)}%`}
          trendColor="#854F0B"
        />
        <KpiTile
          accent="#185FA5"
          label="C 類零件（低頻低值）"
          value={`${kpi.c.count} 種`}
          sub={`佔零件種類 ${kpi.c.pctOfTypes.toFixed(0)}%`}
          trend={`佔庫存金額 ${kpi.c.pctOfAmount.toFixed(0)}%`}
          trendColor="#185FA5"
        />
        <KpiTile
          accent="#0F6E56"
          label="12 個月出貨總額"
          value={fmtNTCompact(amounts.total)}
          sub={`${kpi.total.count} 種零件`}
        />
      </div>

      {/* Pie + 策略表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">ABC 出貨金額結構</span>
            <span className="text-[11px] text-[#9A9890]">金額佔比</span>
          </header>
          <div className="px-4 py-4 flex items-center gap-5">
            {amounts.total > 0 ? (
              <div
                className="w-[140px] h-[140px] rounded-full shrink-0 shadow-md"
                style={{ background: pieBg }}
              />
            ) : (
              <div className="w-[140px] h-[140px] rounded-full shrink-0 bg-[#F2F2F2] flex items-center justify-center text-[11px] text-[#9A9890]">
                尚無資料
              </div>
            )}
            <div className="flex-1 flex flex-col gap-2">
              <LegendRow color="#CC0000" label="A 類（高頻高值）" pct={pct.A} amount={amounts.A} />
              <LegendRow color="#EF9F27" label="B 類（中頻中值）" pct={pct.B} amount={amounts.B} />
              <LegendRow color="#185FA5" label="C 類（低頻低值）" pct={pct.C} amount={amounts.C} />
            </div>
          </div>
        </section>

        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">各類別管理策略</span>
          </header>
          <div className="px-4 py-3">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[11px] text-[#9A9890]">
                  <th className="text-left font-medium pb-2 border-b border-[#EEECE6]">類別</th>
                  <th className="text-center font-medium pb-2 border-b border-[#EEECE6]">盤點頻率</th>
                  <th className="text-left font-medium pb-2 border-b border-[#EEECE6]">採購策略</th>
                </tr>
              </thead>
              <tbody>
                <StrategyRow
                  badge="A"
                  freqDays={config?.count_freq_a_days ?? 30}
                  strategy="少量多次補貨，降低積壓"
                />
                <StrategyRow
                  badge="B"
                  freqDays={config?.count_freq_b_days ?? 90}
                  strategy="中等批量，定期補貨"
                />
                <StrategyRow
                  badge="C"
                  freqDays={config?.count_freq_c_days ?? 365}
                  strategy="大批量採購或接單採購"
                />
              </tbody>
            </table>
            <div className="mt-3 text-[11px] text-[#9A9890]">
              詳細參數調整：
              <Link href="/parts/analytics/abc-settings" className="text-[#185FA5] hover:underline">
                ABC 分類設定
              </Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

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
    <div className="bg-white border border-[#EEECE6] rounded-lg p-3.5" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className="text-[22px] font-bold text-[#2C2C2A] mt-1">{value}</div>
      <div className="text-[11px] text-[#5A5955] mt-0.5">{sub}</div>
      {trend ? (
        <div className="text-[11px] font-semibold mt-1" style={{ color: trendColor ?? "#5A5955" }}>
          {trend}
        </div>
      ) : null}
    </div>
  );
}

function LegendRow({ color, label, pct, amount }: { color: string; label: string; pct: number; amount: number }) {
  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-2 text-[12px]">
        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
        <span className="text-[#5A5955] flex-1">{label}</span>
        <span className="font-bold text-[#2C2C2A]">{pct.toFixed(0)}%</span>
      </div>
      <div className="text-[10.5px] text-[#9A9890] ml-[18px] -mt-0.5">{fmtNT(amount)}</div>
    </div>
  );
}

function StrategyRow({ badge, freqDays, strategy }: { badge: AbcClass; freqDays: number; strategy: string }) {
  return (
    <tr className="border-b border-[#EEECE6] last:border-b-0">
      <td className="py-2.5">
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-bold ${CLASS_BADGE[badge]}`}>
          {CLASS_LABEL[badge]}
        </span>
      </td>
      <td className="py-2.5 text-center font-medium text-[#2C2C2A]">{freqDays} 天</td>
      <td className="py-2.5 text-[#5A5955]">{strategy}</td>
    </tr>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: 零件明細（DataGrid）
// ──────────────────────────────────────────────────────────────────────────

function DetailTab({
  rows,
  totalRows,
  classFilter,
  setClassFilter,
  search,
  setSearch,
}: {
  rows: AbcResultRow[];
  totalRows: number;
  classFilter: AbcClass | "all";
  setClassFilter: (v: AbcClass | "all") => void;
  search: string;
  setSearch: (v: string) => void;
}) {
  const columns: DataGridColumn<AbcResultRow>[] = useMemo(
    () => [
      {
        id: "rank",
        header: "排名",
        width: 70,
        align: "right",
        hideable: false,
        cell: (r) => (r.rank_in_brand != null ? r.rank_in_brand.toLocaleString() : "—"),
        sortValue: (r) => r.rank_in_brand,
        exportValue: (r) => r.rank_in_brand ?? "",
      },
      {
        id: "code",
        header: "備件代碼",
        width: 150,
        hideable: false,
        cell: (r) => <span className="font-mono text-[12px] text-[#5A5955]">{r.item_code}</span>,
        sortValue: (r) => r.item_code,
        exportValue: (r) => r.item_code,
      },
      {
        id: "name",
        header: "商品名稱",
        cell: (r) => <span className="font-medium text-[#2C2C2A]">{r.item_name}</span>,
        sortValue: (r) => r.item_name,
        exportValue: (r) => r.item_name,
      },
      {
        id: "class",
        header: "ABC 分類",
        width: 100,
        align: "left",
        cell: (r) => (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-bold ${CLASS_BADGE[r.abc_class]}`}>
            {CLASS_LABEL[r.abc_class]}
          </span>
        ),
        sortValue: (r) => r.abc_class,
        exportValue: (r) => r.abc_class,
      },
      {
        id: "prev",
        header: "上次",
        width: 70,
        cell: (r) =>
          r.prev_class ? (
            <span className={`text-[11px] ${r.prev_class !== r.abc_class ? "text-[#CC0000] font-bold" : "text-[#9A9890]"}`}>
              {r.prev_class}
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        sortValue: (r) => r.prev_class ?? "",
        exportValue: (r) => r.prev_class ?? "",
      },
      {
        id: "qty",
        header: "12M 出庫數量",
        width: 120,
        align: "right",
        cell: (r) => <span className="font-mono">{r.output_qty_12m.toLocaleString()}</span>,
        sortValue: (r) => r.output_qty_12m,
        exportValue: (r) => r.output_qty_12m,
      },
      {
        id: "amount",
        header: "12M 出庫金額",
        width: 160,
        align: "right",
        cell: (r) => <span className="font-mono font-semibold">{fmtNT(r.output_amount_12m)}</span>,
        sortValue: (r) => r.output_amount_12m,
        exportValue: (r) => Math.round(r.output_amount_12m),
      },
      {
        id: "cum",
        header: "累積佔比",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="text-[#5A5955]">{r.cum_pct != null ? `${r.cum_pct.toFixed(2)}%` : "—"}</span>
        ),
        sortValue: (r) => r.cum_pct,
        exportValue: (r) => r.cum_pct ?? "",
      },
    ],
    [],
  );

  const filterButtons: { id: AbcClass | "all"; label: string; cls?: AbcClass }[] = [
    { id: "all", label: "全部" },
    { id: "A", label: "A 類", cls: "A" },
    { id: "B", label: "B 類", cls: "B" },
    { id: "C", label: "C 類", cls: "C" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5">
          {filterButtons.map((b) => {
            const active = classFilter === b.id;
            const tone = b.cls ? CLASS_BADGE[b.cls] : "";
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setClassFilter(b.id)}
                className={`h-[26px] px-2.5 rounded text-[11.5px] font-medium border transition
                  ${active
                    ? b.cls
                      ? `${tone} border-current`
                      : "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                    : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"}`}
              >
                {b.label}
              </button>
            );
          })}
        </div>
        <input
          type="text"
          placeholder="搜尋料號 / 商品名稱…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] w-[220px] focus:outline-none focus:border-[#185FA5]"
        />
        <span className="ml-auto text-[12px] text-[#9A9890]">
          顯示 <b className="text-[#2C2C2A]">{rows.length}</b> / <b className="text-[#2C2C2A]">{totalRows}</b> 筆
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/analytics/abc"
        exportFileName="abc-classification"
        emptyMessage="尚無 ABC 結果 — 點右上「重跑 ABC」"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Tab: 周轉率 / 呆滯 / 缺貨（placeholder，指向姊妹頁或待落地）
// ──────────────────────────────────────────────────────────────────────────

function PendingTab({ tab }: { tab: TabId }) {
  const map: Record<Exclude<TabId, "overview" | "detail">, { title: string; desc: string; link?: { href: string; label: string } }> = {
    turnover: {
      title: "庫存周轉率報表",
      desc: "依出庫量 / 期末庫存計算周轉次數，識別熱銷與滯銷品。",
      link: { href: "/parts/analytics/turnover", label: "前往庫存周轉率報表" },
    },
    stale: {
      title: "呆滯庫存分析",
      desc: ">90 / 180 / 365 天無出庫品項清單，建議處置動作。",
      link: { href: "/parts/analytics/stale", label: "前往呆滯庫存分析" },
    },
    shortage: {
      title: "缺貨率報告",
      desc: "本月缺貨次數最多的品項、平均工單延誤天數。",
    },
  };
  const info = map[tab as keyof typeof map];
  if (!info) return null;
  return (
    <div className="bg-[#F8F7F4] border border-dashed border-[#D5D3CB] rounded-md px-4 py-8 text-center space-y-2">
      <div className="text-[13px] font-semibold text-[#2C2C2A]">{info.title}</div>
      <div className="text-[12px] text-[#5A5955]">{info.desc}</div>
      {info.link ? (
        <Link
          href={info.link.href}
          className="inline-flex items-center h-[28px] px-3 rounded text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
        >
          {info.link.label} →
        </Link>
      ) : (
        <div className="text-[11.5px] text-[#9A9890]">（待後續 sprint 落地）</div>
      )}
    </div>
  );
}
