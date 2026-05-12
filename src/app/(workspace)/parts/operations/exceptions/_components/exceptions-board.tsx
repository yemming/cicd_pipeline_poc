"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { voidAdjustment } from "@/domain/adjustments";
import type { AdjustmentListRow } from "@/domain/adjustments";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft: { label: "草稿", chip: "bg-[#FEF9C3] text-[#5C4500]" },
  pending: { label: "待審核", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  approved: { label: "已核准", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  posted: { label: "已過帳", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  cancelled: { label: "已作廢", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const TYPE_LABEL: Record<string, { label: string; chip: string }> = {
  exception_in: { label: "例外進貨", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  exception_out: { label: "例外出貨", chip: "bg-[#FDECEA] text-[#CC0000]" },
  damage: { label: "損耗報廢", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  manual: { label: "手動調整", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  count: { label: "盤點調整", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  other: { label: "其他", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

const TYPE_OPTIONS = [
  { value: "", label: "全部" },
  { value: "exception_in", label: "例外進貨" },
  { value: "exception_out", label: "例外出貨" },
  { value: "damage", label: "損耗報廢" },
  { value: "manual", label: "手動調整" },
  { value: "count", label: "盤點調整" },
  { value: "other", label: "其他" },
];

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "posted", label: "已過帳" },
  { value: "cancelled", label: "已作廢" },
];

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}
function fmtDate(d: string | null): string {
  return d ? new Date(d).toLocaleDateString("zh-TW") : "—";
}

export function ExceptionsBoard({
  rows,
  totalCount,
  canEdit,
  warehouses,
  page,
  pageSize,
  initialType,
  initialStatus,
  initialWarehouse,
  initialQ,
}: {
  rows: AdjustmentListRow[];
  totalCount: number;
  canEdit: boolean;
  warehouses: Array<{ id: string; code: string | null; name: string }>;
  page: number;
  pageSize: number;
  initialType: string;
  initialStatus: string;
  initialWarehouse: string;
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [fType, setFType] = useState(initialType);
  const [fStatus, setFStatus] = useState(initialStatus);
  const [fWh, setFWh] = useState(initialWarehouse);
  const [fQ, setFQ] = useState(initialQ);
  const [banner, setBanner] = useState<Banner>(null);
  const [voidModal, setVoidModal] = useState<{ id: string; adj_no: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");

  const flash = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildHref = (override: Partial<{ type: string; status: string; warehouse: string; q: string; page: number }> = {}) => {
    const p = new URLSearchParams();
    const t = override.type ?? fType;
    const s = override.status ?? fStatus;
    const w = override.warehouse ?? fWh;
    const q = override.q ?? fQ.trim();
    if (t) p.set("type", t);
    if (s) p.set("status", s);
    if (w) p.set("warehouse", w);
    if (q) p.set("q", q);
    if (override.page && override.page > 1) p.set("page", String(override.page));
    const qs = p.toString();
    return qs ? `/parts/operations/exceptions?${qs}` : "/parts/operations/exceptions";
  };

  const submitFilters = () => startTransition(() => router.push(buildHref({ page: 1 })));
  const resetFilters = () => {
    setFType("");
    setFStatus("");
    setFWh("");
    setFQ("");
    startTransition(() => router.push("/parts/operations/exceptions"));
  };
  const goToPage = (next: number) => startTransition(() => router.push(buildHref({ page: next })));

  const confirmVoid = () => {
    if (!voidModal) return;
    const reason = voidReason.trim();
    if (!reason) {
      flash({ ok: false, msg: "請填寫作廢原因" });
      return;
    }
    startTransition(async () => {
      const res = await voidAdjustment(voidModal.id, reason);
      if (res.ok) {
        flash({ ok: true, msg: `✓ 已作廢 ${voidModal.adj_no}` });
        setVoidModal(null);
        setVoidReason("");
        router.refresh();
      } else {
        flash({ ok: false, msg: `作廢失敗：${res.error}` });
      }
    });
  };

  const totalAmount = useMemo(
    () => rows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0),
    [rows],
  );

  const columns: DataGridColumn<AdjustmentListRow>[] = useMemo(
    () => [
      {
        id: "adj_no",
        header: "調整單號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/operations/exceptions/${r.id}`}
            className="font-mono font-semibold text-[12px] text-[#1A3A5C] hover:underline"
          >
            {r.adj_no ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.adj_no ?? "",
        sortValue: (r) => r.adj_no ?? "",
      },
      {
        id: "type",
        header: "類型",
        width: 110,
        cell: (r) => {
          const def = TYPE_LABEL[r.type ?? ""] ?? TYPE_LABEL.other;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) => (TYPE_LABEL[r.type ?? ""] ?? TYPE_LABEL.other).label,
        sortValue: (r) => r.type ?? "",
      },
      {
        id: "warehouse_name",
        header: "倉庫",
        width: 140,
        cell: (r) => <span className="text-[12.5px]">{r.warehouse_name ?? "—"}</span>,
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "reason",
        header: "原因",
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955] truncate inline-block max-w-[260px]">
            {r.reason ?? "—"}
          </span>
        ),
        exportValue: (r) => r.reason ?? "",
        sortValue: (r) => r.reason ?? "",
      },
      {
        id: "total_amount",
        header: "影響金額",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">{fmtMoney(r.total_amount)}</span>
        ),
        exportValue: (r) => r.total_amount ?? 0,
        sortValue: (r) => Number(r.total_amount ?? 0),
      },
      {
        id: "created_at",
        header: "建立日",
        width: 110,
        cell: (r) => <span className="font-mono text-[12px]">{fmtDate(r.created_at)}</span>,
        exportValue: (r) => r.created_at ?? "",
        sortValue: (r) => r.created_at ?? "",
      },
      {
        id: "status",
        header: "狀態",
        width: 100,
        hideable: false,
        cell: (r) => {
          const def = STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.draft;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) => (STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.draft).label,
        sortValue: (r) => r.status ?? "",
      },
    ],
    [],
  );

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">例外出入庫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          7.1
        </span>
        <span className="text-[12px] text-[#9A9890]">
          非標準流程的庫存調整：例外進出 / 損耗 / 手動調整
        </span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">類型</label>
            <select
              value={fType}
              onChange={(e) => setFType(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">倉庫</label>
            <select
              value={fWh}
              onChange={(e) => setFWh(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.code ? `${w.code} ` : ""}
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">單號搜尋</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="搜尋 ADJ 編號..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[200px]"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/parts/operations/exceptions/new"
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center ${
                canEdit
                  ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                  : "bg-[#0F6E56] text-white opacity-60 pointer-events-none"
              }`}
            >
              ＋ 新增調整單
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆（本頁 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
        <span className="text-[12px] text-[#9A9890]">
          本頁影響總額 <b className="text-[#2C2C2A] font-mono">{fmtMoney(totalAmount)}</b>
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/operations/exceptions"
        exportFileName="inventory-adjustments"
        emptyMessage="沒有符合條件的調整單"
        disabled={isPending}
        pagination={{
          page,
          pageSize,
          totalCount,
          onPageChange: goToPage,
        }}
        rowActionsWidth={170}
        rowActions={(r) => (
          <>
            <Link
              href={`/parts/operations/exceptions/${r.id}`}
              className="h-[26px] px-2.5 rounded bg-white border border-[#D5D3CB] text-[11.5px] text-[#5A5955] inline-flex items-center hover:border-[#9A9890]"
            >
              詳細
            </Link>
            {canEdit && r.status === "posted" ? (
              <button
                type="button"
                onClick={() => {
                  setVoidModal({ id: r.id, adj_no: r.adj_no ?? "—" });
                  setVoidReason("");
                }}
                className="h-[26px] px-2.5 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[11.5px] text-[#CC0000] hover:bg-[#fbdcd9]"
              >
                作廢
              </button>
            ) : null}
          </>
        )}
      />

      {!canEdit ? (
        <div className="text-[11px] text-[#9A9890]">
          💡 你目前沒有例外調整權限（parts.exception.ops），僅能檢視
        </div>
      ) : null}

      {voidModal ? (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]"
          onClick={() => !isPending && setVoidModal(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl w-[440px] max-w-[90vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">
                作廢調整單 {voidModal.adj_no}
              </h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                作廢後會自動反向回沖庫存：原入庫的扣回、原出庫的補回。
              </p>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  作廢原因 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                  placeholder="例如：建錯類型、應走 PO 流程⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setVoidModal(null)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmVoid}
                disabled={isPending || !voidReason.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-50"
              >
                {isPending ? "作廢中⋯" : "確認作廢"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[110] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
    </main>
  );
}
