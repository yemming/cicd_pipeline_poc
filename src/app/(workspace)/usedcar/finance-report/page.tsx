"use client";

import { useSetPageHeader } from "@/components/page-header-context";

const months = ["1月", "2月", "3月", "4月", "5月", "6月"];

type MonthFinance = {
  amt: number | null;
  units: number | null;
  profit: number | null;
};

type FinanceRow = {
  label: string;
  months: (MonthFinance | null)[];
  color: string;
};

const data: FinanceRow[] = [
  {
    label: "批售",
    color: "#6B7280",
    months: [
      { amt: 229000, units: 4, profit: 31000 },
      { amt: 186000, units: 3, profit: 22000 },
      { amt: 312000, units: 5, profit: 38000 },
      { amt: 195000, units: 3, profit: 24000 },
      { amt: 278000, units: 4, profit: 31000 },
      { amt: 341000, units: 5, profit: 42000 },
    ],
  },
  {
    label: "PO 零售",
    color: "#3B82F6",
    months: [
      { amt: 450000, units: 1, profit: 48000 },
      { amt: 680000, units: 2, profit: 71000 },
      null,
      { amt: 520000, units: 1, profit: 55000 },
      { amt: 890000, units: 2, profit: 94000 },
      { amt: 430000, units: 1, profit: 46000 },
    ],
  },
  {
    label: "LPO 零售",
    color: "#8B5CF6",
    months: [
      null,
      { amt: 320000, units: 1, profit: 53000 },
      { amt: 465000, units: 1, profit: 77000 },
      null,
      { amt: 390000, units: 1, profit: 65000 },
      { amt: 510000, units: 1, profit: 85000 },
    ],
  },
  {
    label: "CPO 零售",
    color: "#F43F5E",
    months: [
      { amt: 1240000, units: 1, profit: 160000 },
      null,
      { amt: 2481723, units: 2, profit: 321377 },
      { amt: 1890000, units: 2, profit: 244000 },
      { amt: 3120000, units: 3, profit: 403000 },
      { amt: 1560000, units: 1, profit: 201000 },
    ],
  },
];

type StockRow = {
  prevStock: number;
  internalPurchase: number;
  externalPurchase: number;
  totalAmt: number;
};

const stockData: (StockRow | null)[] = [
  { prevStock: 12, internalPurchase: 6, externalPurchase: 2, totalAmt: 6800000 },
  { prevStock: 14, internalPurchase: 5, externalPurchase: 1, totalAmt: 7200000 },
  { prevStock: 16, internalPurchase: 8, externalPurchase: 3, totalAmt: 9400000 },
  { prevStock: 19, internalPurchase: 6, externalPurchase: 2, totalAmt: 8600000 },
  { prevStock: 21, internalPurchase: 7, externalPurchase: 2, totalAmt: 9800000 },
  { prevStock: 24, internalPurchase: 9, externalPurchase: 3, totalAmt: 11200000 },
];

function ntd(v: number | null): string {
  if (v === null) return "—";
  if (v >= 1000000) return `NT$${(v / 1000000).toFixed(2)}M`;
  return `NT$${v.toLocaleString()}`;
}

function calcMonthTotal(m: MonthFinance | null) {
  return m ?? { amt: null, units: null, profit: null };
}

function calcMargin(m: MonthFinance | null): string {
  if (!m || !m.profit || !m.amt) return "—";
  return (m.profit / m.amt * 100).toFixed(1) + "%";
}

const summaryCards = [
  { label: "批售總金額", value: "NT$5,511,300", sub: "77 台", color: "#6B7280" },
  { label: "零售總金額", value: "NT$6,889,294", sub: "26 台", color: "#F43F5E" },
  { label: "批售毛利率", value: "9.4%", sub: "全年平均", color: "#10B981" },
  { label: "零售毛利率", value: "7.5%", sub: "全年平均", color: "#3B82F6" },
  { label: "庫存周轉係數", value: "0.38", sub: "目標 0.5", color: "#F59E0B" },
  { label: "單車約當流轉天", value: "11.4 天", sub: "目標 10天以下", color: "#EF4444" },
];

const profitContrib = [
  { label: "PO 零售", pct: 30.8, profitPct: 10.6, color: "#3B82F6" },
  { label: "LPO 零售", pct: 15.4, profitPct: 16.6, color: "#8B5CF6" },
  { label: "CPO 零售", pct: 53.8, profitPct: 72.9, color: "#F43F5E" },
];

export default function FinanceReportPage() {
  useSetPageHeader({ title: "財務報表" });

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 18 }}>date_range</span>
          <span className="font-medium text-gray-700">2026 年</span>
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 16 }}>expand_more</span>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-3 mb-5">
        {summaryCards.map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <div className="text-xs text-gray-500 mb-1">{c.label}</div>
            <div className="text-xl font-bold" style={{ color: c.color }}>{c.value}</div>
            <div className="text-xs text-gray-400 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto mb-4">
        <table className="text-sm min-w-full">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="sticky left-0 bg-white text-left px-4 py-3 text-xs font-semibold text-gray-500 w-28">業務類型</th>
              <th className="sticky left-28 bg-white text-left px-3 py-3 text-xs font-semibold text-gray-500 w-20">指標</th>
              {months.map((m) => (
                <th key={m} className="text-right px-4 py-3 text-xs font-semibold text-gray-500 min-w-[100px]">{m}</th>
              ))}
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-700 min-w-[110px] bg-gray-50">全年合計</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row, ri) => (
              <>
                {["金額", "台數", "毛利", "毛利率"].map((metric, mi) => (
                  <tr
                    key={`${row.label}-${metric}`}
                    className={`border-b ${mi === 3 ? "border-gray-200" : "border-gray-50"} hover:bg-gray-50/50`}
                  >
                    {mi === 0 && (
                      <td
                        className="sticky left-0 bg-white px-4 py-2 font-semibold text-sm align-top pt-3"
                        rowSpan={4}
                        style={{ color: row.color }}
                      >
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: row.color }} />
                          {row.label}
                        </div>
                      </td>
                    )}
                    <td className="sticky left-28 bg-white px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{metric}</td>
                    {row.months.map((m, i) => {
                      const mdata = calcMonthTotal(m);
                      let display = "—";
                      let colorClass = "text-gray-800";
                      if (metric === "金額") display = ntd(mdata.amt);
                      if (metric === "台數") display = mdata.units !== null ? `${mdata.units} 台` : "—";
                      if (metric === "毛利") display = ntd(mdata.profit);
                      if (metric === "毛利率") {
                        display = calcMargin(m);
                        if (display !== "—") {
                          colorClass = parseFloat(display) >= 10 ? "text-green-600" : "text-gray-700";
                        }
                      }
                      return (
                        <td key={i} className={`text-right px-4 py-2 tabular-nums ${colorClass} ${metric === "毛利率" ? "font-semibold" : ""}`}>
                          {display}
                        </td>
                      );
                    })}
                    <td className="text-right px-4 py-2 bg-gray-50 font-semibold text-gray-700 tabular-nums">
                      {(() => {
                        const valid = row.months.filter(Boolean) as MonthFinance[];
                        if (metric === "金額") return ntd(valid.reduce((s, m) => s + (m.amt ?? 0), 0));
                        if (metric === "台數") return `${valid.reduce((s, m) => s + (m.units ?? 0), 0)} 台`;
                        if (metric === "毛利") return ntd(valid.reduce((s, m) => s + (m.profit ?? 0), 0));
                        if (metric === "毛利率") {
                          const totalAmt = valid.reduce((s, m) => s + (m.amt ?? 0), 0);
                          const totalProfit = valid.reduce((s, m) => s + (m.profit ?? 0), 0);
                          return totalAmt > 0 ? (totalProfit / totalAmt * 100).toFixed(1) + "%" : "—";
                        }
                        return "—";
                      })()}
                    </td>
                  </tr>
                ))}
              </>
            ))}

            {["前月庫存", "本月內採", "本月外採", "庫存金額"].map((metric, mi) => (
              <tr
                key={`stock-${metric}`}
                className={`border-b ${mi === 3 ? "border-gray-200" : "border-gray-50"} hover:bg-gray-50/50`}
              >
                {mi === 0 && (
                  <td className="sticky left-0 bg-white px-4 py-2 font-semibold text-sm align-top pt-3 text-amber-600" rowSpan={4}>
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full bg-amber-500" />
                      零售庫存
                    </div>
                  </td>
                )}
                <td className="sticky left-28 bg-white px-3 py-2 text-xs text-gray-500 whitespace-nowrap">{metric}</td>
                {stockData.map((s, i) => {
                  let val = "—";
                  if (s) {
                    if (metric === "前月庫存") val = `${s.prevStock} 台`;
                    if (metric === "本月內採") val = `${s.internalPurchase} 台`;
                    if (metric === "本月外採") val = `${s.externalPurchase} 台`;
                    if (metric === "庫存金額") val = ntd(s.totalAmt);
                  }
                  return <td key={i} className="text-right px-4 py-2 tabular-nums text-gray-700">{val}</td>;
                })}
                <td className="text-right px-4 py-2 bg-gray-50 font-semibold text-gray-700 tabular-nums">
                  {metric === "庫存金額"
                    ? ntd(stockData.filter(Boolean).reduce((s, d) => s + (d?.totalAmt ?? 0), 0))
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 p-5">
        <div className="text-sm font-semibold text-gray-700 mb-4">零售毛利貢獻分析</div>
        <div className="grid grid-cols-3 gap-6">
          {profitContrib.map((p) => (
            <div key={p.label}>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                <span className="text-sm font-medium text-gray-700">{p.label}</span>
              </div>
              <div className="space-y-2">
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>銷售額佔比</span>
                    <span className="font-semibold" style={{ color: p.color }}>{p.pct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${p.pct}%`, backgroundColor: p.color, opacity: 0.6 }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>毛利貢獻</span>
                    <span className="font-semibold" style={{ color: p.color }}>{p.profitPct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${p.profitPct}%`, backgroundColor: p.color }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
