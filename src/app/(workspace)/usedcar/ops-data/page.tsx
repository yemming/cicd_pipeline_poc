"use client";

import { useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";

type MonthData = {
  visits: number | null;
  evalTotal: number | null;
  evalOwn: number | null;
  evalOther: number | null;
  leads: number | null;
  tradeTotal: number | null;
  tradeOwn: number | null;
  tradeOther: number | null;
  newSales: number | null;
};

const months = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

const newCarData: (MonthData | null)[] = [
  { visits: 924, evalTotal: 69, evalOwn: 6, evalOther: 63, leads: 68, tradeTotal: 7, tradeOwn: 0, tradeOther: 7, newSales: 93 },
  { visits: 916, evalTotal: 66, evalOwn: 13, evalOther: 53, leads: 57, tradeTotal: 1, tradeOwn: 0, tradeOther: 1, newSales: 151 },
  { visits: 1350, evalTotal: 146, evalOwn: 11, evalOther: 135, leads: 144, tradeTotal: 12, tradeOwn: 1, tradeOther: 11, newSales: 214 },
  { visits: 1181, evalTotal: 99, evalOwn: 6, evalOther: 93, leads: 109, tradeTotal: 8, tradeOwn: 0, tradeOther: 8, newSales: 244 },
  { visits: 1267, evalTotal: 119, evalOwn: 16, evalOther: 103, leads: 107, tradeTotal: 12, tradeOwn: 2, tradeOther: 10, newSales: 267 },
  { visits: 1330, evalTotal: 123, evalOwn: 8, evalOther: 115, leads: 113, tradeTotal: 11, tradeOwn: 0, tradeOther: 11, newSales: 235 },
  null, null, null, null, null, null,
];

type AfterSalesMonthData = {
  visits: number | null;
  evalOwn: number | null;
  tradeOwn: number | null;
  repurchase: number | null;
};

const afterSalesData: (AfterSalesMonthData | null)[] = [
  { visits: 342, evalOwn: 6, tradeOwn: 2, repurchase: 1 },
  { visits: 318, evalOwn: 4, tradeOwn: 1, repurchase: 0 },
  { visits: 489, evalOwn: 11, tradeOwn: 3, repurchase: 2 },
  { visits: 421, evalOwn: 8, tradeOwn: 2, repurchase: 1 },
  { visits: 465, evalOwn: 9, tradeOwn: 3, repurchase: 1 },
  { visits: 502, evalOwn: 12, tradeOwn: 4, repurchase: 2 },
  null, null, null, null, null, null,
];

function calcNewCarTotal(): MonthData {
  const valid = newCarData.filter(Boolean) as MonthData[];
  return {
    visits: valid.reduce((s, d) => s + (d.visits ?? 0), 0),
    evalTotal: valid.reduce((s, d) => s + (d.evalTotal ?? 0), 0),
    evalOwn: valid.reduce((s, d) => s + (d.evalOwn ?? 0), 0),
    evalOther: valid.reduce((s, d) => s + (d.evalOther ?? 0), 0),
    leads: valid.reduce((s, d) => s + (d.leads ?? 0), 0),
    tradeTotal: valid.reduce((s, d) => s + (d.tradeTotal ?? 0), 0),
    tradeOwn: valid.reduce((s, d) => s + (d.tradeOwn ?? 0), 0),
    tradeOther: valid.reduce((s, d) => s + (d.tradeOther ?? 0), 0),
    newSales: valid.reduce((s, d) => s + (d.newSales ?? 0), 0),
  };
}

function calcAfterSalesTotal(): AfterSalesMonthData {
  const valid = afterSalesData.filter(Boolean) as AfterSalesMonthData[];
  return {
    visits: valid.reduce((s, d) => s + (d.visits ?? 0), 0),
    evalOwn: valid.reduce((s, d) => s + (d.evalOwn ?? 0), 0),
    tradeOwn: valid.reduce((s, d) => s + (d.tradeOwn ?? 0), 0),
    repurchase: valid.reduce((s, d) => s + (d.repurchase ?? 0), 0),
  };
}

function fmt(v: number | null): string {
  if (v === null) return "—";
  return v.toLocaleString();
}

function pct(num: number | null, den: number | null): string {
  if (!num || !den) return "—";
  return (num / den * 100).toFixed(1) + "%";
}

const TABS = ["新車軌道", "售後軌道", "統計KPI"] as const;
type Tab = typeof TABS[number];

export default function OpsDataPage() {
  const [tab, setTab] = useState<Tab>("新車軌道");

  useSetPageHeader({ title: "業務數據表" });

  const total = calcNewCarTotal();
  const asTotal = calcAfterSalesTotal();

  return (
    <div className="p-6 bg-gray-50 min-h-full">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="text-sm text-gray-500">新車/售後 × 置換業務 月度追蹤</div>
        </div>
        <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm">
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 18 }}>date_range</span>
          <span className="font-medium text-gray-700">2026 年</span>
          <span className="material-symbols-outlined text-gray-400" style={{ fontSize: 16 }}>expand_more</span>
        </div>
      </div>

      <div className="flex gap-1 bg-white border border-gray-100 rounded-xl p-1 mb-5 w-fit">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              tab === t ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}
            style={tab === t ? { backgroundColor: "#F43F5E" } : {}}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "新車軌道" && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="sticky left-0 bg-white text-left px-4 py-3 text-xs font-semibold text-gray-500 w-36">指標</th>
                {months.map((m) => (
                  <th key={m} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 min-w-[72px]">{m}</th>
                ))}
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-700 min-w-[80px] bg-gray-50">全年合計</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "首次進店（有效）", key: "visits" as keyof MonthData, indent: false, target: null },
                { label: "評估數（小計）", key: "evalTotal" as keyof MonthData, indent: false, target: 8 },
                { label: "　本品評估", key: "evalOwn" as keyof MonthData, indent: true, target: null },
                { label: "　異品評估", key: "evalOther" as keyof MonthData, indent: true, target: null },
                { label: "線索跟進數", key: "leads" as keyof MonthData, indent: false, target: null },
                { label: "總置換數", key: "tradeTotal" as keyof MonthData, indent: false, target: null },
                { label: "本品置換數", key: "tradeOwn" as keyof MonthData, indent: true, target: null },
                { label: "異品置換數", key: "tradeOther" as keyof MonthData, indent: true, target: null },
                { label: "新車銷量（訂單）", key: "newSales" as keyof MonthData, indent: false, target: null },
              ].map((row) => (
                <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className={`sticky left-0 bg-white px-4 py-2.5 font-medium text-gray-700 ${row.indent ? "text-xs text-gray-500" : ""}`}>
                    {row.label}
                    {row.target && <span className="ml-1 text-xs text-gray-400">（目標{row.target}%）</span>}
                  </td>
                  {newCarData.map((d, i) => {
                    const val = d ? d[row.key] : null;
                    const evalRate = row.key === "evalTotal" && d ? pct(d.evalTotal, d.visits) : null;
                    return (
                      <td key={i} className="text-center px-3 py-2.5 tabular-nums">
                        {d === null ? (
                          <span className="text-xs text-gray-300">待輸入</span>
                        ) : (
                          <div>
                            <div className="font-medium text-gray-800">{fmt(val as number | null)}</div>
                            {evalRate && (
                              <div className={`text-xs ${parseFloat(evalRate) >= 8 ? "text-green-500" : "text-red-400"}`}>
                                {evalRate}
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-center px-3 py-2.5 bg-gray-50 font-semibold text-gray-800 tabular-nums">
                    {fmt(total[row.key] as number | null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "售後軌道" && (
        <div className="bg-white rounded-xl border border-gray-100 overflow-x-auto">
          <table className="text-sm min-w-full">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="sticky left-0 bg-white text-left px-4 py-3 text-xs font-semibold text-gray-500 w-36">指標</th>
                {months.map((m) => (
                  <th key={m} className="text-center px-3 py-3 text-xs font-semibold text-gray-500 min-w-[72px]">{m}</th>
                ))}
                <th className="text-center px-3 py-3 text-xs font-semibold text-gray-700 min-w-[80px] bg-gray-50">全年合計</th>
              </tr>
            </thead>
            <tbody>
              {[
                { label: "進廠台次", key: "visits" as keyof AfterSalesMonthData },
                { label: "本品評估數", key: "evalOwn" as keyof AfterSalesMonthData },
                { label: "本品置換數", key: "tradeOwn" as keyof AfterSalesMonthData },
                { label: "回購數", key: "repurchase" as keyof AfterSalesMonthData },
              ].map((row) => (
                <tr key={row.label} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="sticky left-0 bg-white px-4 py-2.5 font-medium text-gray-700">{row.label}</td>
                  {afterSalesData.map((d, i) => (
                    <td key={i} className="text-center px-3 py-2.5 tabular-nums">
                      {d === null ? (
                        <span className="text-xs text-gray-300">待輸入</span>
                      ) : (
                        <span className="font-medium text-gray-800">{fmt(d[row.key])}</span>
                      )}
                    </td>
                  ))}
                  <td className="text-center px-3 py-2.5 bg-gray-50 font-semibold text-gray-800 tabular-nums">
                    {fmt(asTotal[row.key])}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "統計KPI" && (
        <div className="grid grid-cols-2 gap-4">
          {[
            {
              title: "首次進店評估率",
              target: "8%",
              rows: newCarData.slice(0, 6).map((d, i) => ({
                label: months[i],
                actual: d ? pct(d.evalTotal, d.visits) : "待輸入",
                ok: d ? parseFloat(pct(d.evalTotal, d.visits)) >= 8 : null,
              })),
            },
            {
              title: "綜合置換率",
              target: "1%",
              rows: newCarData.slice(0, 6).map((d, i) => ({
                label: months[i],
                actual: d ? pct(d.tradeTotal, d.visits) : "待輸入",
                ok: d ? parseFloat(pct(d.tradeTotal, d.visits)) >= 1 : null,
              })),
            },
          ].map((kpi) => (
            <div key={kpi.title} className="bg-white rounded-xl border border-gray-100 p-5">
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm font-semibold text-gray-700">{kpi.title}</div>
                <div className="text-xs bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">目標 {kpi.target}</div>
              </div>
              <div className="space-y-2">
                {kpi.rows.map((r) => (
                  <div key={r.label} className="flex items-center gap-3">
                    <div className="w-8 text-xs text-gray-400">{r.label}</div>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: r.ok !== null ? r.actual.replace("%", "") + "%" : "0%",
                          backgroundColor: r.ok === true ? "#10B981" : r.ok === false ? "#EF4444" : "#E5E7EB",
                          maxWidth: "100%",
                        }}
                      />
                    </div>
                    <div className={`w-14 text-right text-sm font-medium ${r.ok === true ? "text-green-600" : r.ok === false ? "text-red-500" : "text-gray-300"}`}>
                      {r.actual}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="col-span-2 bg-white rounded-xl border border-gray-100 p-5">
            <div className="text-sm font-semibold text-gray-700 mb-4">綜合置換量（台）</div>
            <div className="flex gap-4">
              {newCarData.slice(0, 6).map((d, i) => (
                <div key={i} className="flex-1 text-center">
                  <div className="text-xs text-gray-400 mb-1">{months[i]}</div>
                  <div
                    className="mx-auto rounded-t-sm bg-rose-400 transition-all"
                    style={{ height: `${(d?.tradeTotal ?? 0) * 8}px`, minHeight: 4 }}
                  />
                  <div className="text-sm font-bold text-gray-800 mt-1">{d?.tradeTotal ?? 0}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
