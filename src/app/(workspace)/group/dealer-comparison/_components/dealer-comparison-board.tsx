"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { DealerComparisonMetric, DealerComparisonRow } from "@/domain/group-analytics";

const METRIC_LABEL: Record<DealerComparisonMetric, string> = {
  ro_count: "工單量",
  revenue: "服務營收",
};

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";

export function DealerComparisonBoard({
  rows,
  metric,
  from,
  to,
  error,
}: {
  rows: DealerComparisonRow[];
  metric: DealerComparisonMetric;
  from: string;
  to: string;
  error: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useSetPageHeader({
    title: "經銷商分組比較",
    breadcrumb: [
      { label: "集團管理", href: "/group/dashboard" },
      { label: "經銷商分組比較" },
    ],
    hideSearch: true,
  });

  function pushParams(next: Partial<{ metric: string; from: string; to: string }>) {
    const params = new URLSearchParams({ metric, from, to, ...next });
    startTransition(() => router.push(`/group/dealer-comparison?${params.toString()}`));
  }

  const maxValue = Math.max(...rows.map((r) => r.value), 1);

  const columns: DataGridColumn<DealerComparisonRow>[] = [
    {
      id: "rank",
      header: "排名",
      width: 60,
      sortable: false,
      cell: (r) => rows.findIndex((x) => x.dealerOrgId === r.dealerOrgId) + 1,
    },
    {
      id: "dealer",
      header: "經銷商",
      cell: (r) => <span className="font-medium text-[#2C2C2A]">{r.dealerName}</span>,
      exportValue: (r) => r.dealerName,
    },
    {
      id: "storeCount",
      header: "門店數",
      width: 90,
      align: "right",
      cell: (r) => r.storeCount,
      exportValue: (r) => r.storeCount,
    },
    {
      id: "value",
      header: METRIC_LABEL[metric],
      width: 260,
      align: "right",
      cell: (r) => (
        <div className="flex items-center gap-2 justify-end">
          <div className="flex-1 h-[6px] bg-[#F2F2F2] rounded-full overflow-hidden max-w-[140px]">
            <div
              className="h-full bg-[#1A3A5C] rounded-full"
              style={{ width: `${Math.max((r.value / maxValue) * 100, 2)}%` }}
            />
          </div>
          <span className="tabular-nums font-mono text-[#1A3A5C] font-semibold w-[90px] text-right">
            {metric === "revenue" ? `NT$ ${r.value.toLocaleString("zh-TW")}` : r.value.toLocaleString("zh-TW")}
          </span>
        </div>
      ),
      exportValue: (r) => r.value,
      sortValue: (r) => r.value,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">經銷商分組比較</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">代理商層級</span>
        <span className="text-[12px] text-[#9A9890]">彙總範圍 = 該經銷商底下所有門店加總</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">指標</label>
            <select
              className={inputClass}
              value={metric}
              disabled={isPending}
              onChange={(e) => pushParams({ metric: e.target.value })}
            >
              <option value="ro_count">工單量</option>
              <option value="revenue">服務營收</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">起始日</label>
            <input
              type="date"
              className={inputClass}
              value={from}
              disabled={isPending}
              onChange={(e) => pushParams({ from: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">結束日</label>
            <input
              type="date"
              className={inputClass}
              value={to}
              disabled={isPending}
              onChange={(e) => pushParams({ to: e.target.value })}
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="px-4 py-2 rounded text-[13px] border bg-[#FDECEA] text-[#CC0000] border-[#F5AEAD]">
          {error}
        </div>
      )}

      <div className="text-[12px] text-[#9A9890]">
        共 <b className="text-[#2C2C2A]">{rows.length}</b> 家經銷商
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.dealerOrgId}
        persistKey="group/dealer-comparison"
        exportFileName="dealer-comparison"
        emptyMessage="目前品牌底下沒有經銷商層級資料"
        disabled={isPending}
      />
    </main>
  );
}
