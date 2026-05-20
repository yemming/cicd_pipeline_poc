"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard, Timeline, type TimelineEvent } from "@/components/visualization";
import { DonutChart, type DonutDatum } from "@/components/charts";
import type {
  ContractStatus,
  ContractWithSupplier,
  ContractsKpis,
  SupplierOption,
} from "@/domain/contracts";

const STATUS_LABEL: Record<ContractStatus, { label: string; chip: string }> = {
  valid: { label: "有效", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  expiring: { label: "即將到期", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  expired: { label: "已到期", chip: "bg-[#FDECEA] text-[#CC0000]" },
  none: { label: "未生效", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

const TYPE_LABEL: Record<string, { label: string; chip: string }> = {
  annual: { label: "年度合約", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  framework: { label: "框架合約", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  one_off: { label: "單次合約", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

function formatDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

function formatAmount(n: number | null): string {
  if (n === null) return "無上限";
  return `NT$ ${n.toLocaleString("en-US")}`;
}

function formatMoneyShort(n: number): string {
  if (n >= 1_000_000) return `NT$ ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `NT$ ${(n / 1_000).toFixed(0)}K`;
  return `NT$ ${n.toLocaleString("en-US")}`;
}

export function ContractsBoard({
  rows,
  kpis,
  canEdit,
  supplierOptions,
  initialStatus,
  initialQ,
}: {
  rows: ContractWithSupplier[];
  kpis: ContractsKpis;
  canEdit: boolean;
  supplierOptions: SupplierOption[];
  initialStatus: string;
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);
  const [showSupplierPicker, setShowSupplierPicker] = useState(false);
  const [pickerValue, setPickerValue] = useState("");

  function applyFilter() {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    startTransition(() => {
      router.push(`/parts/setup/contracts${params.toString() ? "?" + params.toString() : ""}`);
    });
  }

  function reset() {
    setStatus("all");
    setQ("");
    startTransition(() => router.push("/parts/setup/contracts"));
  }

  // 統計與輔助：總合約金額、平均剩餘天數、Donut 類型分布、即將到期 Timeline
  const totals = useMemo(() => {
    const activeRows = rows.filter((c) => c.computed_status !== "expired" && c.status !== "terminated");
    const totalAmount = activeRows.reduce(
      (sum, c) => sum + (c.amount_limit ?? 0),
      0,
    );
    const validDaysLeft = activeRows
      .filter((c) => c.computed_status === "valid" && c.days_left !== null)
      .map((c) => c.days_left ?? 0);
    const avgDaysLeft =
      validDaysLeft.length > 0
        ? Math.round(validDaysLeft.reduce((a, b) => a + b, 0) / validDaysLeft.length)
        : 0;

    const typeCounts = new Map<string, number>();
    for (const c of rows) {
      const t = c.contract_type ?? "annual";
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1);
    }
    const typeDonut: DonutDatum[] = Array.from(typeCounts.entries())
      .map(([type, count]) => {
        const def = TYPE_LABEL[type];
        return {
          name: def?.label ?? type,
          value: count,
        };
      })
      .filter((d) => d.value > 0);

    return { totalAmount, avgDaysLeft, typeDonut };
  }, [rows]);

  // Timeline：所有 valid + expiring 合約依 effective_to 排序（近 6 筆）
  const expiringTimeline = useMemo<TimelineEvent[]>(() => {
    return rows
      .filter(
        (c) =>
          (c.computed_status === "valid" || c.computed_status === "expiring") &&
          c.effective_to !== null,
      )
      .sort(
        (a, b) =>
          new Date(a.effective_to ?? "9999").getTime() -
          new Date(b.effective_to ?? "9999").getTime(),
      )
      .slice(0, 6)
      .map((c) => {
        const tone: TimelineEvent["tone"] =
          c.computed_status === "expiring" ? "amber" : "green";
        return {
          id: c.id,
          time: formatDate(c.effective_to),
          title: `${c.contract_no} · ${c.supplier_name}`,
          tone,
          description: (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] text-[#5A5955]">
                剩 {c.days_left ?? 0} 天
              </span>
              {c.amount_limit !== null && (
                <span className="text-[11px] text-[#9A9890]">
                  · 上限 {formatMoneyShort(c.amount_limit)}
                </span>
              )}
            </div>
          ),
        };
      });
  }, [rows]);

  // 找最快即將到期的合約做 banner
  const earliestExpiring = rows
    .filter((c) => c.computed_status === "expiring")
    .sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0))[0];

  const columns: DataGridColumn<ContractWithSupplier>[] = [
    {
      id: "contract_no",
      header: "合約編號",
      width: 140,
      hideable: false,
      cell: (r) => (
        <span className="font-mono text-[12px] font-semibold text-[#1A3A5C]">
          {r.contract_no ?? "—"}
        </span>
      ),
      exportValue: (r) => r.contract_no ?? "",
      sortValue: (r) => r.contract_no ?? "",
    },
    {
      id: "supplier_name",
      header: "供應商",
      width: 200,
      cell: (r) => <span className="font-semibold text-[#2C2C2A]">{r.supplier_name}</span>,
      exportValue: (r) => r.supplier_name,
      sortValue: (r) => r.supplier_name,
    },
    {
      id: "contract_type",
      header: "類型",
      width: 100,
      cell: (r) => {
        const def =
          TYPE_LABEL[r.contract_type] ?? {
            label: r.contract_type,
            chip: "bg-[#F2F2F2] text-[#6B6A68]",
          };
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
          >
            {def.label}
          </span>
        );
      },
      exportValue: (r) => TYPE_LABEL[r.contract_type]?.label ?? r.contract_type,
      sortValue: (r) => r.contract_type,
    },
    {
      id: "amount_limit",
      header: "金額上限",
      width: 120,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{formatAmount(r.amount_limit)}</span>,
      exportValue: (r) => (r.amount_limit ?? "無上限").toString(),
      sortValue: (r) => r.amount_limit ?? Number.MAX_SAFE_INTEGER,
    },
    {
      id: "effective_from",
      header: "生效日",
      width: 100,
      cell: (r) => <span className="font-mono text-[12px]">{formatDate(r.effective_from)}</span>,
      exportValue: (r) => r.effective_from ?? "",
      sortValue: (r) => r.effective_from ?? "",
    },
    {
      id: "effective_to",
      header: "到期日",
      width: 100,
      cell: (r) => <span className="font-mono text-[12px]">{formatDate(r.effective_to)}</span>,
      exportValue: (r) => r.effective_to ?? "",
      sortValue: (r) => r.effective_to ?? "",
    },
    {
      id: "days_left",
      header: "剩餘天數",
      width: 110,
      align: "right",
      cell: (r) => {
        if (r.days_left === null)
          return <span className="text-[#9A9890]">—</span>;
        const color =
          r.computed_status === "expiring"
            ? "text-[#854F0B]"
            : r.computed_status === "expired"
              ? "text-[#CC0000]"
              : "text-[#0F6E56]";
        // 進度條：valid > 90 顯示綠 / expiring 顯示 amber / expired 顯示紅
        const pct = (() => {
          const d = r.days_left ?? 0;
          if (d < 0) return 100;
          if (d > 365) return 100;
          return Math.max(0, Math.min(100, (d / 365) * 100));
        })();
        const barColor =
          r.computed_status === "expiring"
            ? "bg-[#F59E0B]"
            : r.computed_status === "expired"
              ? "bg-[#EF4444]"
              : "bg-[#14B8A6]";
        return (
          <div className="flex flex-col items-end gap-0.5 min-w-[80px]">
            <span className={`font-mono text-[12px] ${color}`}>{r.days_left} 天</span>
            <div className="w-full h-1 rounded-full bg-[#F2F2F2] overflow-hidden">
              <div className={`h-full ${barColor}`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      },
      exportValue: (r) => (r.days_left ?? 0).toString(),
      sortValue: (r) => r.days_left ?? Number.MAX_SAFE_INTEGER,
    },
    {
      id: "status",
      header: "狀態",
      width: 100,
      cell: (r) => {
        const def = STATUS_LABEL[r.computed_status];
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
          >
            {def.label}
          </span>
        );
      },
      exportValue: (r) => STATUS_LABEL[r.computed_status].label,
      sortValue: (r) => r.computed_status,
    },
  ];

  const totalContractCount = kpis.validCount + kpis.expiringCount + kpis.expiredCount;

  const kpiSlot = (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <KpiCard
        label="有效合約"
        value={kpis.validCount}
        tone="green"
        icon={<span className="text-[18px]">📄</span>}
        delta={
          totalContractCount > 0
            ? {
                value: Math.round((kpis.validCount / totalContractCount) * 100),
                tone: "neutral",
              }
            : undefined
        }
      />
      <KpiCard
        label="即將到期（90 天內）"
        value={kpis.expiringCount}
        tone="amber"
        icon={<span className="text-[18px]">⏳</span>}
      />
      <KpiCard
        label="已到期"
        value={kpis.expiredCount}
        tone="red"
        icon={<span className="text-[18px]">⚠️</span>}
      />
      <KpiCard
        label="合約總金額"
        value={formatMoneyShort(totals.totalAmount)}
        tone="teal"
        icon={<span className="text-[18px]">💰</span>}
      />
      <KpiCard
        label="平均剩餘天數"
        value={`${totals.avgDaysLeft}d`}
        tone="blue"
        icon={<span className="text-[18px]">📅</span>}
      />
    </div>
  );

  const chartSlot = (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <section className="bg-white border border-[#EEECE6] rounded-md px-3 py-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[12px] font-semibold text-[#2C2C2A]">合約類型分布</span>
          <span className="text-[11px] text-[#9A9890]">
            共 {totals.typeDonut.length} 種類型
          </span>
        </div>
        {totals.typeDonut.length > 0 ? (
          <DonutChart
            data={totals.typeDonut}
            size="sm"
            showLegend
            centerLabel={String(rows.length)}
            centerCaption="份"
          />
        ) : (
          <div className="text-center text-[12px] text-[#9A9890] py-6">尚無資料</div>
        )}
      </section>
      <section className="bg-white border border-[#EEECE6] rounded-md px-3 py-2">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[12px] font-semibold text-[#2C2C2A]">最近到期排程</span>
          <span className="text-[11px] text-[#9A9890]">
            前 {expiringTimeline.length} 筆
          </span>
        </div>
        {expiringTimeline.length > 0 ? (
          <Timeline events={expiringTimeline} variant="horizontal" />
        ) : (
          <div className="text-center text-[12px] text-[#9A9890] py-6">
            無即將到期的合約
          </div>
        )}
      </section>
    </div>
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">採購合約設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          2.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          管理供應商採購合約、效期提醒與條款設定
        </span>
      </header>

      {/* Filter */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">合約狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="all">全部</option>
              <option value="valid">有效</option>
              <option value="expiring">即將到期</option>
              <option value="expired">已到期</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">合約 / 供應商</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="搜尋合約編號或供應商..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[240px]"
            />
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
              onClick={reset}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <button
              type="button"
              onClick={() => {
                setPickerValue("");
                setShowSupplierPicker(true);
              }}
              disabled={!canEdit || isPending}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
            >
              ＋ 新增合約
            </button>
          </div>
        </div>
      </section>

      {/* 即將到期 banner */}
      {earliestExpiring && (
        <div className="bg-[#FDF3E3] border border-[#FAC775] rounded-md px-4 py-2.5 text-[12px] text-[#854F0B] flex items-center gap-2.5">
          ⚠
          <span>
            <b>{earliestExpiring.supplier_name}</b> 合約將於{" "}
            {formatDate(earliestExpiring.effective_to)} 到期（剩餘{" "}
            {earliestExpiring.days_left} 天），請盡快啟動展延流程。
          </span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆合約
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/setup/contracts"
        exportFileName="contracts"
        emptyMessage="沒有符合條件的合約"
        disabled={isPending}
        rowActionsWidth={120}
        kpiSlot={kpiSlot}
        chartSlot={chartSlot}
        rowActions={(r) => (
          <button
            type="button"
            onClick={() =>
              startTransition(() =>
                router.push(`/parts/setup/contracts/${r.id}`),
              )
            }
            disabled={isPending}
            className={`h-[26px] px-2.5 rounded text-[11.5px] disabled:opacity-50 ${
              r.computed_status === "expiring"
                ? "bg-[#FDF3E3] border border-[#FAC775] text-[#854F0B] hover:bg-[#fbe7be]"
                : r.computed_status === "expired"
                  ? "bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                  : "bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            }`}
          >
            {r.computed_status === "expiring" ? "詳細 / 展延" : "詳細"}
          </button>
        )}
      />

      {/* Supplier picker modal */}
      {showSupplierPicker && (
        <div
          className="fixed inset-0 z-40 bg-black/30 flex items-start justify-center pt-24"
          onClick={() => setShowSupplierPicker(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[460px] max-w-[90vw] border border-[#EEECE6]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center justify-between">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                新增合約 — 第 1 步：選擇供應商
              </h2>
              <button
                type="button"
                onClick={() => setShowSupplierPicker(false)}
                className="text-[#9A9890] hover:text-[#5A5955] text-[14px]"
              >
                ✕
              </button>
            </header>
            <div className="px-4 py-4 space-y-3">
              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  供應商 <span className="text-[#CC0000]">*</span>
                </label>
                <select
                  value={pickerValue}
                  onChange={(e) => setPickerValue(e.target.value)}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                >
                  <option value="">請選擇供應商</option>
                  {supplierOptions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code ? `${s.code} · ` : ""}
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-[#9A9890] mt-1">
                  選好供應商後將跳到建立頁面填寫合約資料
                </p>
              </div>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowSupplierPicker(false)}
                  className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!pickerValue) return;
                    setShowSupplierPicker(false);
                    startTransition(() =>
                      router.push(
                        `/parts/setup/contracts/new?supplier_id=${pickerValue}`,
                      ),
                    );
                  }}
                  disabled={!pickerValue || isPending}
                  className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                >
                  下一步：填寫合約
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
