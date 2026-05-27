"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  SOURCE_TYPE_LABELS,
  DECISION_LABELS,
  type UsedPurchaseRequestRow,
  type UsedPurchaseSourceType,
  type UsedPurchaseDecision,
} from "@/domain/used-purchase-requests.constants";

const BASE = "/sales/inventory/used-purchase";

function decisionChip(d: UsedPurchaseDecision | null): { label: string; cls: string } {
  if (d === "approved") return { label: "已收購", cls: "bg-[#EAF3DE] text-[#3B6D11]" };
  if (d === "conditional")
    return { label: "條件收購", cls: "bg-[#FDF3E3] text-[#854F0B]" };
  if (d === "rejected") return { label: "不收購", cls: "bg-[#FDECEA] text-[#CC0000]" };
  return { label: "待決策", cls: "bg-[#F2F2F2] text-[#6B6A68]" };
}

function fmtNT(v: number | null): string {
  if (v == null) return "—";
  return `NT$${Number(v).toLocaleString("en-US")}`;
}

export default function UsedPurchaseBoard({
  rows,
  totalCount,
  canEdit,
  filters,
}: {
  rows: UsedPurchaseRequestRow[];
  totalCount: number;
  canEdit: boolean;
  filters: { source: string; decision: string; q: string };
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [fSource, setFSource] = useState(filters.source);
  const [fDecision, setFDecision] = useState(filters.decision);
  const [fQ, setFQ] = useState(filters.q);

  const buildQs = (o: { source?: string; decision?: string; q?: string }) => {
    const params = new URLSearchParams();
    const source = o.source ?? fSource;
    const decision = o.decision ?? fDecision;
    const q = o.q ?? fQ;
    if (source) params.set("source", source);
    if (decision) params.set("decision", decision);
    if (q.trim()) params.set("q", q.trim());
    const qs = params.toString();
    return qs ? `${BASE}?${qs}` : BASE;
  };

  const submitFilters = () => startTransition(() => router.push(buildQs({})));
  const resetFilters = () => {
    setFSource("");
    setFDecision("");
    setFQ("");
    startTransition(() => router.push(BASE));
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<UsedPurchaseRequestRow>[] = [
    {
      id: "application_no",
      header: "申請單號",
      width: 160,
      hideable: false,
      cell: (r) => (
        <Link
          href={`${BASE}/${r.id}`}
          className="font-mono font-semibold text-[12px] text-[#185FA5] hover:underline"
        >
          {r.application_no}
        </Link>
      ),
      exportValue: (r) => r.application_no,
      sortValue: (r) => r.application_no,
    },
    {
      id: "source_type",
      header: "來源類型",
      width: 110,
      cell: (r) =>
        r.source_type ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEF4FB] text-[#185FA5]">
            {SOURCE_TYPE_LABELS[r.source_type]}
          </span>
        ) : (
          <span className="text-[12px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.source_type ? SOURCE_TYPE_LABELS[r.source_type] : ""),
      sortValue: (r) => r.source_type ?? "",
    },
    {
      id: "seller_name",
      header: "賣方",
      width: 130,
      cell: (r) => <span className="text-[12.5px]">{r.seller_name ?? "—"}</span>,
      exportValue: (r) => r.seller_name ?? "",
      sortValue: (r) => r.seller_name ?? "",
    },
    {
      id: "vehicle",
      header: "車型 / 年份",
      width: 160,
      cell: (r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        const name =
          (typeof meta.vehicle_model_name === "string" && meta.vehicle_model_name) ||
          r.vin ||
          "—";
        return (
          <span className="text-[12.5px]">
            {name}
            {r.year ? <span className="text-[#9A9890]"> · {r.year}</span> : null}
          </span>
        );
      },
      exportValue: (r) => {
        const meta = (r.metadata ?? {}) as Record<string, unknown>;
        return (typeof meta.vehicle_model_name === "string" && meta.vehicle_model_name) || r.vin || "";
      },
      sortValue: (r) => r.year ?? 0,
    },
    {
      id: "vin",
      header: "VIN",
      width: 160,
      defaultHidden: true,
      cell: (r) => <span className="font-mono text-[11.5px]">{r.vin ?? "—"}</span>,
      exportValue: (r) => r.vin ?? "",
      sortValue: (r) => r.vin ?? "",
    },
    {
      id: "actual_price",
      header: "實際收購價",
      width: 120,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px]">
          {fmtNT(r.actual_price ?? r.suggested_price)}
        </span>
      ),
      exportValue: (r) => r.actual_price ?? r.suggested_price ?? 0,
      sortValue: (r) => r.actual_price ?? r.suggested_price ?? 0,
    },
    {
      id: "decision",
      header: "決策",
      width: 100,
      cell: (r) => {
        const c = decisionChip(r.decision);
        return (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${c.cls}`}
          >
            {c.label}
          </span>
        );
      },
      exportValue: (r) => decisionChip(r.decision).label,
      sortValue: (r) => r.decision ?? "",
    },
    {
      id: "used_car_id",
      header: "中古車主檔",
      width: 110,
      cell: (r) =>
        r.used_car_id ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EAF3DE] text-[#3B6D11]">
            已建立
          </span>
        ) : (
          <span className="text-[12px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => (r.used_car_id ? "已建立" : ""),
      sortValue: (r) => (r.used_car_id ? 1 : 0),
    },
    {
      id: "created_at",
      header: "建立時間",
      width: 130,
      defaultHidden: true,
      cell: (r) => (
        <span className="font-mono text-[11.5px] text-[#9A9890]">
          {r.created_at ? r.created_at.slice(0, 16).replace("T", " ") : "—"}
        </span>
      ),
      exportValue: (r) => r.created_at ?? "",
      sortValue: (r) => r.created_at ?? "",
    },
  ];

  const sourceOpts: { value: string; label: string }[] = [
    { value: "", label: "全部來源" },
    ...(Object.entries(SOURCE_TYPE_LABELS) as [UsedPurchaseSourceType, string][]).map(
      ([value, label]) => ({ value, label }),
    ),
  ];
  const decisionOpts: { value: string; label: string }[] = [
    { value: "", label: "全部決策" },
    { value: "pending", label: "待決策" },
    ...(Object.entries(DECISION_LABELS) as [UsedPurchaseDecision, string][]).map(
      ([value, label]) => ({ value, label }),
    ),
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">中古車收購申請</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_INV05
        </span>
        <span className="text-[12px] text-[#9A9890]">
          直購中古車入庫起點・確認收購後建主檔 + 觸發 PD-UC 整備工單
        </span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>來源類型</label>
            <select
              value={fSource}
              onChange={(e) => setFSource(e.target.value)}
              className={`${inputClass} w-[140px]`}
            >
              {sourceOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>決策</label>
            <select
              value={fDecision}
              onChange={(e) => setFDecision(e.target.value)}
              className={`${inputClass} w-[130px]`}
            >
              {decisionOpts.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>單號 / VIN / 賣方</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入關鍵字..."
              className={`${inputClass} w-[220px]`}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中…" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href={`${BASE}/new`}
              aria-disabled={!canEdit}
              className={`h-[30px] px-3 inline-flex items-center rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${
                canEdit ? "" : "pointer-events-none opacity-50"
              }`}
            >
              ＋ 新增收購申請
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b> 筆收購申請
          （本頁顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/inventory/used-purchase"
        exportFileName={`used-purchase-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q || filters.source || filters.decision
            ? "無符合條件的收購申請，請調整篩選條件"
            : "尚無收購申請，點右上「＋ 新增收購申請」開始填寫"
        }
        rowActionsWidth={90}
        rowActions={(r) => (
          <Link
            href={`${BASE}/${r.id}`}
            className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            詳情
          </Link>
        )}
      />
    </main>
  );
}
