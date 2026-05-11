"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
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

  // 找最快即將到期的合約做 banner
  const earliestExpiring = rows
    .filter((c) => c.computed_status === "expiring")
    .sort((a, b) => (a.days_left ?? 0) - (b.days_left ?? 0))[0];

  const columns: DataGridColumn<ContractWithSupplier>[] = [
    {
      id: "contract_no",
      header: "合約編號",
      width: 130,
      hideable: false,
      cell: (r) => <span className="font-mono text-[12px]">{r.contract_no ?? "—"}</span>,
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
      header: "合約類型",
      width: 100,
      cell: (r) => {
        const def = TYPE_LABEL[r.contract_type] ?? { label: r.contract_type, chip: "bg-[#F2F2F2] text-[#6B6A68]" };
        return (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}>
            {def.label}
          </span>
        );
      },
      exportValue: (r) => r.contract_type,
      sortValue: (r) => r.contract_type,
    },
    {
      id: "amount_limit",
      header: "合約金額上限",
      width: 130,
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
      width: 90,
      align: "right",
      cell: (r) => {
        if (r.days_left === null) return <span className="text-[#9A9890]">—</span>;
        const color =
          r.computed_status === "expiring"
            ? "text-[#854F0B]"
            : r.computed_status === "expired"
              ? "text-[#CC0000]"
              : "text-[#0F6E56]";
        return <span className={`font-mono text-[12px] ${color}`}>{r.days_left} 天</span>;
      },
      exportValue: (r) => (r.days_left ?? 0).toString(),
      sortValue: (r) => r.days_left ?? Number.MAX_SAFE_INTEGER,
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => {
        const def = STATUS_LABEL[r.computed_status];
        return (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}>
            {def.label}
          </span>
        );
      },
      exportValue: (r) => STATUS_LABEL[r.computed_status].label,
      sortValue: (r) => r.computed_status,
    },
  ];

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

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <Kpi label="有效合約" value={kpis.validCount} valueColor="text-[#0F6E56]" sub="筆合約生效中" />
        <Kpi
          label="即將到期（90 天內）"
          value={kpis.expiringCount}
          valueColor="text-[#854F0B]"
          sub={kpis.expiringCount > 0 ? "需盡快展延" : "—"}
          subColor={kpis.expiringCount > 0 ? "text-[#854F0B]" : "text-[#9A9890]"}
        />
        <Kpi
          label="已到期"
          value={kpis.expiredCount}
          valueColor="text-[#CC0000]"
          sub={kpis.expiredCount === 0 ? "無逾期合約" : "需處理"}
        />
      </div>

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
        rowActionsWidth={90}
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

function Kpi({
  label,
  value,
  valueColor,
  sub,
  subColor,
}: {
  label: string;
  value: number;
  valueColor: string;
  sub: string;
  subColor?: string;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div className={`text-[24px] font-semibold font-mono mt-1 ${valueColor}`}>{value}</div>
      <div className={`text-[11px] mt-0.5 ${subColor ?? "text-[#9A9890]"}`}>{sub}</div>
    </div>
  );
}
