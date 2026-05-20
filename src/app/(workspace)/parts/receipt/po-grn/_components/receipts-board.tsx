"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { KpiCard } from "@/components/visualization/KpiCard";
import { payReceipt, returnReceipt, voidReceipt } from "@/domain/receipts";
import type {
  ReceiptKpis,
  StockReceiptListRow,
  WarehouseOption,
} from "@/domain/receipts";

type Banner = { ok: boolean; msg: string } | null;

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft: { label: "草稿", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  completed: { label: "已過帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  posted: { label: "已過帳", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  cancelled: { label: "已作廢", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "completed", label: "已過帳" },
  { value: "cancelled", label: "已作廢" },
];

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtMoneyShort(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toLocaleString("en-US");
}

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function ReceiptsBoard({
  rows,
  total,
  kpis,
  warehouses,
  canEdit,
  loadError,
  filter,
  pagination,
}: {
  rows: StockReceiptListRow[];
  total: number;
  kpis: ReceiptKpis;
  warehouses: WarehouseOption[];
  canEdit: boolean;
  loadError: string | null;
  filter: {
    status: string;
    warehouse_id: string;
    q: string;
    date_from: string;
    date_to: string;
  };
  pagination: { page: number; pageSize: number; totalCount: number };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [q, setQ] = useState(filter.q);
  const [status, setStatus] = useState(filter.status);
  const [warehouseId, setWarehouseId] = useState(filter.warehouse_id);
  const [dateFrom, setDateFrom] = useState(filter.date_from);
  const [dateTo, setDateTo] = useState(filter.date_to);

  // modals
  const [voidFor, setVoidFor] = useState<{ id: string; gr_no: string } | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [payFor, setPayFor] = useState<{ id: string; gr_no: string } | null>(null);
  const [returnFor, setReturnFor] = useState<{ id: string; gr_no: string } | null>(null);
  const [returnReason, setReturnReason] = useState("");

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function pushWith(params: URLSearchParams) {
    startTransition(() => {
      router.push(
        `/parts/receipt/po-grn${params.toString() ? `?${params.toString()}` : ""}`,
      );
    });
  }

  function applyFilters() {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (warehouseId) params.set("warehouse_id", warehouseId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    // filter 改變必 reset page=1
    pushWith(params);
  }

  function resetFilters() {
    setQ("");
    setStatus("");
    setWarehouseId("");
    setDateFrom("");
    setDateTo("");
    pushWith(new URLSearchParams());
  }

  function goToPage(next: number) {
    const params = new URLSearchParams();
    if (q.trim()) params.set("q", q.trim());
    if (status) params.set("status", status);
    if (warehouseId) params.set("warehouse_id", warehouseId);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    if (next > 1) params.set("page", String(next));
    pushWith(params);
  }

  function confirmVoid() {
    if (!voidFor) return;
    const reason = voidReason.trim();
    startTransition(async () => {
      const res = await voidReceipt(voidFor.id, reason);
      if (res.ok) {
        showBanner(true, `✓ ${voidFor.gr_no} 已作廢、庫存已沖回`);
        setVoidFor(null);
        setVoidReason("");
        router.refresh();
      } else {
        showBanner(false, `作廢失敗：${res.error}`);
      }
    });
  }

  function confirmPay() {
    if (!payFor) return;
    startTransition(async () => {
      const res = await payReceipt({ receipt_id: payFor.id });
      if (res.ok) {
        showBanner(true, `✓ ${payFor.gr_no} 已結款（自動產分錄）`);
        setPayFor(null);
        router.refresh();
      } else {
        showBanner(false, `結款失敗：${res.error}`);
      }
    });
  }

  function confirmReturn() {
    if (!returnFor) return;
    const reason = returnReason.trim();
    startTransition(async () => {
      const res = await returnReceipt({
        receipt_id: returnFor.id,
        reason: reason || undefined,
      });
      if (res.ok) {
        showBanner(true, `✓ ${returnFor.gr_no} 已退回供應商（自動產分錄）`);
        setReturnFor(null);
        setReturnReason("");
        router.refresh();
      } else {
        showBanner(false, `退回失敗：${res.error}`);
      }
    });
  }

  const columns: DataGridColumn<StockReceiptListRow>[] = useMemo(
    () => [
      {
        id: "gr_no",
        header: "入庫單號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/parts/receipt/po-grn/${r.id}`}
            className="font-mono font-semibold text-[12px] text-[#1A3A5C] hover:underline"
          >
            {r.gr_no ?? "—"}
          </Link>
        ),
        exportValue: (r) => r.gr_no ?? "",
        sortValue: (r) => r.gr_no ?? "",
      },
      {
        id: "vendor_name",
        header: "供應商",
        width: 180,
        cell: (r) => <span className="text-[12.5px]">{r.vendor_name ?? "—"}</span>,
        exportValue: (r) => r.vendor_name ?? "",
        sortValue: (r) => r.vendor_name ?? "",
      },
      {
        id: "warehouse_name",
        header: "入庫倉",
        width: 140,
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
        cell: (r) => <span className="font-mono text-[12px]">{fmtDate(r.receipt_date)}</span>,
        exportValue: (r) => r.receipt_date ?? "",
        sortValue: (r) => r.receipt_date ?? "",
      },
      {
        id: "qty_received_total",
        header: "入庫總數",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">{r.qty_received_total ?? 0}</span>
        ),
        exportValue: (r) => r.qty_received_total ?? 0,
        sortValue: (r) => r.qty_received_total ?? 0,
      },
      {
        id: "amount_total",
        header: "金額",
        width: 130,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px] text-[#2C2C2A]">
            {fmtMoney(r.amount_total)}
          </span>
        ),
        exportValue: (r) => Number(r.amount_total ?? 0),
        sortValue: (r) => Number(r.amount_total ?? 0),
      },
      {
        id: "payment_status",
        header: "付款",
        width: 80,
        cell: (r) => {
          const meta = (r.metadata ?? {}) as { payment?: { status?: string } };
          const paid = meta.payment?.status === "paid";
          return paid ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
              已付款
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
              未付
            </span>
          );
        },
        exportValue: (r) => {
          const meta = (r.metadata ?? {}) as { payment?: { status?: string } };
          return meta.payment?.status === "paid" ? "已付款" : "未付";
        },
        sortValue: (r) => {
          const meta = (r.metadata ?? {}) as { payment?: { status?: string } };
          return meta.payment?.status === "paid" ? 1 : 0;
        },
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        hideable: false,
        cell: (r) => {
          const def = STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.completed;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          (STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.completed).label,
        sortValue: (r) => r.status ?? "",
      },
    ],
    [],
  );

  const isPending = pending;

  return (
    <main className={`px-6 py-5 space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* 1. Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">採購入庫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M04U-17
        </span>
        <span className="text-[12px] text-[#9A9890]">
          PO 收貨・庫存自動寫入・支援結款／退回／作廢
        </span>
      </header>

      {/* 2. Banner */}
      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
      {loadError ? (
        <div className="px-4 py-2 rounded bg-[#FDECEA] text-[#CC0000] text-[12.5px] border border-[#F5AEAD]">
          載入失敗：{loadError}
        </div>
      ) : null}

      {/* 3. KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <KpiCard
          label="入庫單總數"
          value={kpis.totalCount}
          tone="blue"
          layout="vertical"
        />
        <KpiCard
          label="已過帳入庫"
          value={kpis.completedCount}
          tone="teal"
          layout="vertical"
        />
        <KpiCard
          label="已過帳金額"
          value={fmtMoneyShort(kpis.totalAmount)}
          tone="green"
          layout="vertical"
        />
        <KpiCard
          label={`已結款 / 已退回`}
          value={`${kpis.paidCount} / ${kpis.returnedCount}`}
          tone="amber"
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
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
              href="/parts/receipt/po-grn/new"
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center ${
                canEdit
                  ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                  : "bg-[#0F6E56] text-white opacity-60 pointer-events-none"
              }`}
            >
              ＋ 新增入庫
            </Link>
          </div>
        </div>
      </section>

      {/* 5. Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{total}</b> 筆採購入庫（顯示{" "}
          <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
      </div>

      {/* 6. Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/receipt/po-grn"
        exportFileName="stock-receipts"
        emptyMessage="沒有符合條件的入庫單"
        disabled={isPending}
        rowActionsWidth={canEdit ? 260 : 100}
        rowActions={(r) => {
          const meta = (r.metadata ?? {}) as {
            payment?: { status?: string };
            return?: { status?: string };
          };
          const isPaid = meta.payment?.status === "paid";
          const isReturned = meta.return?.status === "returned";
          const isCancelled = r.status === "cancelled";
          const isActive =
            r.status === "completed" || r.status === "posted";
          return (
            <div className="flex gap-1">
              <Link
                href={`/parts/receipt/po-grn/${r.id}`}
                className="h-[26px] px-2.5 inline-flex items-center rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                檢視
              </Link>
              {canEdit && isActive && !isPaid && !isReturned ? (
                <button
                  type="button"
                  onClick={() =>
                    setPayFor({ id: r.id, gr_no: r.gr_no ?? "" })
                  }
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                >
                  結款
                </button>
              ) : null}
              {canEdit && isActive && !isPaid && !isReturned ? (
                <button
                  type="button"
                  onClick={() => {
                    setReturnFor({ id: r.id, gr_no: r.gr_no ?? "" });
                    setReturnReason("");
                  }}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDF3E3] border border-[#F5C97A] text-[#854F0B] hover:bg-[#fbe9c5]"
                >
                  退回
                </button>
              ) : null}
              {canEdit && !isCancelled ? (
                <button
                  type="button"
                  onClick={() => {
                    setVoidFor({ id: r.id, gr_no: r.gr_no ?? "" });
                    setVoidReason("");
                  }}
                  className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                >
                  作廢
                </button>
              ) : null}
            </div>
          );
        }}
        pagination={{
          page: pagination.page,
          pageSize: pagination.pageSize,
          totalCount: pagination.totalCount,
          onPageChange: goToPage,
        }}
      />

      {/* Void modal */}
      {voidFor ? (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl w-[480px] max-w-full">
            <header className="px-5 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">作廢入庫單</h3>
            </header>
            <div className="px-5 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955]">
                即將作廢{" "}
                <span className="font-mono font-semibold">{voidFor.gr_no}</span>
                ，已寫入的庫存將沖回、來源 PO 狀態還原。請填寫作廢原因：
              </p>
              <textarea
                className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                rows={3}
                placeholder="例如：供應商送錯品項、品項損壞退回⋯"
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                autoFocus
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
                disabled={isPending || !voidReason.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-60"
              >
                {isPending ? "作廢中⋯" : "確認作廢"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Pay modal */}
      {payFor ? (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl w-[440px] max-w-full">
            <header className="px-5 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">確認結款</h3>
            </header>
            <div className="px-5 py-4 text-[12.5px] text-[#5A5955] leading-relaxed">
              將為入庫單{" "}
              <span className="font-mono font-semibold">{payFor.gr_no}</span>{" "}
              產生 <b>VENDOR_PAYMENT_BANK</b> 分錄（自動 posted）。
              此操作不可復原。
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPayFor(null)}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmPay}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {isPending ? "結款中⋯" : "確認結款"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Return modal */}
      {returnFor ? (
        <div className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl w-[480px] max-w-full">
            <header className="px-5 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">退回供應商</h3>
            </header>
            <div className="px-5 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                即將退回{" "}
                <span className="font-mono font-semibold">{returnFor.gr_no}</span>
                ，產生 <b>PARTS_RETURN_TO_SUPPLIER</b> 沖銷分錄。
                可填寫退貨原因（選填）：
              </p>
              <textarea
                className="w-full border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
                rows={3}
                placeholder="例如：品項規格不符、客戶取消訂單⋯"
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
              />
            </div>
            <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReturnFor(null);
                  setReturnReason("");
                }}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmReturn}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#FDF3E3] border border-[#F5C97A] text-[#854F0B] hover:bg-[#fbe9c5] disabled:opacity-60"
              >
                {isPending ? "退貨中⋯" : "確認退回"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </main>
  );
}
