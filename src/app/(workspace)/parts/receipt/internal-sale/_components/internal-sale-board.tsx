"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";

import {
  deleteInternalSaleReceipt,
  postInternalSaleReceipt,
  voidInternalSaleReceipt,
  type InternalSaleReceiptKpis,
  type InternalSaleReceiptRow,
  type WarehouseOption,
} from "@/domain/internal-sale-receipts";
import {
  INTERNAL_SALE_RECEIPT_STATUSES,
  fmtDate,
  fmtNT,
  statusChipClass,
  statusLabel,
} from "@/domain/internal-sale-receipts.constants";

type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

function fmtNTShort(n: number): string {
  if (n >= 10000) return `${(n / 1000).toFixed(0)}K`;
  return n.toLocaleString("en-US");
}

export function InternalSaleBoard({
  rows,
  total,
  kpis,
  warehouses,
  filter,
  canEdit,
  loadError,
}: {
  rows: InternalSaleReceiptRow[];
  total: number;
  kpis: InternalSaleReceiptKpis;
  warehouses: WarehouseOption[];
  filter: {
    status: string;
    warehouse_id: string;
    q: string;
    date_from: string;
    date_to: string;
  };
  canEdit: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  // filter form state
  const [q, setQ] = useState(filter.q);
  const [status, setStatus] = useState(filter.status);
  const [warehouseId, setWarehouseId] = useState(filter.warehouse_id);
  const [dateFrom, setDateFrom] = useState(filter.date_from);
  const [dateTo, setDateTo] = useState(filter.date_to);

  // modal state
  const [voidFor, setVoidFor] = useState<{ id: string; doc_no: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [deleteFor, setDeleteFor] = useState<{ id: string; doc_no: string } | null>(null);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilters() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status !== "all") params.set("status", status);
    if (warehouseId) params.set("warehouse_id", warehouseId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    startTransition(() => {
      router.push(
        `/parts/receipt/internal-sale${params.toString() ? `?${params.toString()}` : ""}`,
      );
    });
  }
  function resetFilters() {
    setQ("");
    setStatus("all");
    setWarehouseId("");
    setDateFrom("");
    setDateTo("");
    startTransition(() => router.push("/parts/receipt/internal-sale"));
  }

  function handlePost(id: string, doc_no: string) {
    startTransition(async () => {
      const res = await postInternalSaleReceipt(id);
      if (res.ok) {
        showBanner(true, `✓ ${doc_no} 已過帳，庫存已寫入`);
        router.refresh();
      } else {
        showBanner(false, `過帳失敗：${res.error}`);
      }
    });
  }

  function confirmVoid() {
    if (!voidFor) return;
    const { id, doc_no } = voidFor;
    const reason = voidReason;
    startTransition(async () => {
      const res = await voidInternalSaleReceipt(id, reason);
      if (res.ok) {
        showBanner(true, `✓ ${doc_no} 已作廢、庫存已沖回`);
        setVoidFor(null);
        setVoidReason("");
        router.refresh();
      } else {
        showBanner(false, `作廢失敗：${res.error}`);
      }
    });
  }

  function confirmDelete() {
    if (!deleteFor) return;
    const { id, doc_no } = deleteFor;
    startTransition(async () => {
      const res = await deleteInternalSaleReceipt(id);
      if (res.ok) {
        showBanner(true, `✓ ${doc_no} 已刪除`);
        setDeleteFor(null);
        router.refresh();
      } else {
        showBanner(false, `刪除失敗：${res.error}`);
        setDeleteFor(null);
      }
    });
  }

  const columns: DataGridColumn<InternalSaleReceiptRow>[] = useMemo(
    () => [
      {
        id: "doc_no",
        header: "入庫單號",
        width: 160,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/receipt/internal-sale/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:text-[#185FA5]"
          >
            {r.doc_no}
          </Link>
        ),
        exportValue: (r) => r.doc_no,
        sortValue: (r) => r.doc_no,
      },
      {
        id: "source_label",
        header: "來源",
        width: 180,
        cell: (r) =>
          r.source_label ? (
            <span className="text-[12.5px] text-[#2C2C2A]">{r.source_label}</span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.source_label ?? "",
        sortValue: (r) => r.source_label ?? "",
      },
      {
        id: "warehouse",
        header: "入庫倉",
        width: 130,
        cell: (r) =>
          r.warehouse_name ? (
            <span className="px-1.5 py-0.5 text-[11px] rounded-md bg-[#EEF4FB] text-[#185FA5] whitespace-nowrap">
              {r.warehouse_name}
            </span>
          ) : (
            <span className="text-[#9A9890]">—</span>
          ),
        exportValue: (r) => r.warehouse_name ?? "",
        sortValue: (r) => r.warehouse_name ?? "",
      },
      {
        id: "receipt_date",
        header: "入庫日",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">{fmtDate(r.receipt_date)}</span>
        ),
        exportValue: (r) => r.receipt_date,
        sortValue: (r) => r.receipt_date,
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${statusChipClass(
              r.status,
            )}`}
          >
            {statusLabel(r.status)}
          </span>
        ),
        exportValue: (r) => statusLabel(r.status),
        sortValue: (r) => r.status,
      },
      {
        id: "qty_total",
        header: "數量",
        width: 90,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px] text-[#2C2C2A]">
            {r.qty_total.toLocaleString("en-US")}
          </span>
        ),
        exportValue: (r) => r.qty_total,
        sortValue: (r) => r.qty_total,
      },
      {
        id: "amount_total",
        header: "金額",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px] text-[#2C2C2A]">{fmtNT(r.amount_total)}</span>
        ),
        exportValue: (r) => Math.round(r.amount_total),
        sortValue: (r) => r.amount_total,
      },
      {
        id: "notes",
        header: "備註",
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{r.notes ?? "—"}</span>
        ),
        exportValue: (r) => r.notes ?? "",
        sortValue: (r) => r.notes ?? "",
      },
    ],
    [],
  );

  return (
    <main className={`px-6 py-5 space-y-3 ${pending ? "pointer-events-none opacity-60" : ""}`}>
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">內售入庫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M04U-16
        </span>
        <span className="text-[12px] text-[#9A9890]">
          內部銷售退回入庫・庫存自動寫回・支援過帳／作廢
        </span>
      </header>

      {/* 2. Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
      {loadError && (
        <div className="px-4 py-2 rounded bg-[#FDECEA] text-[#CC0000] text-[12.5px] border border-[#F5AEAD]">
          載入失敗：{loadError}
        </div>
      )}

      {/* 3. KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard label="入庫單總數" value={kpis.totalCount} tone="blue" layout="vertical" />
        <KpiCard label="草稿待過帳" value={kpis.draftCount} tone="amber" layout="vertical" />
        <KpiCard label="已過帳入庫" value={kpis.postedCount} tone="teal" layout="vertical" />
        <KpiCard
          label="已過帳金額"
          value={fmtNTShort(kpis.totalAmount)}
          tone="green"
          layout="vertical"
        />
      </div>

      {/* 4. Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>關鍵字</label>
            <input
              className={inputClass}
              style={{ width: 180 }}
              placeholder="入庫單號"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilters()}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              className={inputClass}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">全部</option>
              {INTERNAL_SALE_RECEIPT_STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>入庫倉</label>
            <select
              className={inputClass}
              style={{ minWidth: 140 }}
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">全部</option>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>入庫日期</label>
            <div className="flex gap-1 items-center">
              <input
                type="date"
                className={inputClass}
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <span className="text-[#9A9890]">~</span>
              <input
                type="date"
                className={inputClass}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilters}
              disabled={pending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {pending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              disabled={pending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            {canEdit && (
              <Link
                href="/parts/receipt/internal-sale/new"
                className="h-[30px] px-3 inline-flex items-center rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
              >
                ＋ 新增內售入庫
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 5. Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{total}</b> 筆內售入庫（顯示{" "}
          <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
      </div>

      {/* 6. Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/receipt/internal-sale"
        exportFileName="internal-sale-receipts"
        emptyMessage="尚無內售入庫記錄"
        disabled={pending}
        rowActionsWidth={canEdit ? 240 : 0}
        rowActions={
          canEdit
            ? (r) => (
                <div className="flex gap-1">
                  <Link
                    href={`/parts/receipt/internal-sale/${r.id}`}
                    className="h-[26px] px-2.5 inline-flex items-center rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  >
                    檢視
                  </Link>
                  {r.status === "draft" && (
                    <>
                      <button
                        type="button"
                        onClick={() => handlePost(r.id, r.doc_no)}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                      >
                        過帳
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteFor({ id: r.id, doc_no: r.doc_no })}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                      >
                        刪除
                      </button>
                    </>
                  )}
                  {r.status === "completed" && (
                    <button
                      type="button"
                      onClick={() => {
                        setVoidFor({ id: r.id, doc_no: r.doc_no });
                        setVoidReason("");
                      }}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                    >
                      作廢
                    </button>
                  )}
                </div>
              )
            : undefined
        }
      />

      {/* Void modal */}
      {voidFor && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl w-[480px] max-w-full">
            <header className="px-5 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">作廢內售入庫單</h3>
            </header>
            <div className="px-5 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955]">
                即將作廢 <span className="font-mono font-semibold">{voidFor.doc_no}</span>
                ，已寫入的庫存將沖回。請填寫作廢原因：
              </p>
              <textarea
                className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                rows={3}
                placeholder="例如：客戶要求重新整理單據、品項錯誤⋯"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
              />
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setVoidFor(null);
                  setVoidReason("");
                }}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmVoid}
                disabled={pending || !voidReason.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-60"
              >
                {pending ? "作廢中⋯" : "確認作廢"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Delete modal */}
      {deleteFor && (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl w-[420px] max-w-full">
            <header className="px-5 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">刪除草稿單</h3>
            </header>
            <div className="px-5 py-4 text-[12.5px] text-[#5A5955]">
              確認刪除草稿{" "}
              <span className="font-mono font-semibold">{deleteFor.doc_no}</span>？此操作不可復原。
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteFor(null)}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-60"
              >
                {pending ? "刪除中⋯" : "確認刪除"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}
