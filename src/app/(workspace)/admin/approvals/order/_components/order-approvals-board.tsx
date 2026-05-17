"use client";

/**
 * /admin/approvals/order — 訂單送簽簽核中心 List View
 *
 * Design Pattern：List View 規格（CLAUDE.md §Design Pattern）
 * 操作：[查看詳情]（→ /sales/orders/[id]）/ [核准] / [駁回]
 * 樂觀更新 + pending 鎖（CLAUDE.md §UX 互動規範）
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  approveSalesOrderAction,
  rejectSalesOrderAction,
} from "@/lib/sales/order-actions";
import type { SalesOrderRow } from "@/domain/sales-orders.constants";
import { useSetPageHeader } from "@/components/page-header-context";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

type Banner = { ok: boolean; msg: string } | null;

function fmtNT(n: number | null): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function OrderApprovalsBoard({
  rows,
  canApprove,
}: {
  rows: SalesOrderRow[];
  canApprove: boolean;
}) {
  useSetPageHeader({
    title: "訂單簽核",
    breadcrumb: [{ label: "簽核管理", href: "/admin/approvals" }, { label: "訂單簽核" }],
    hideSearch: true,
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{ id: string; orderNo: string } | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [approveModal, setApproveModal] = useState<SalesOrderRow | null>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const handleApprove = (row: SalesOrderRow) => {
    if (!canApprove) {
      showBanner({ ok: false, msg: "沒有簽核權限" });
      return;
    }
    setApproveModal(row);
  };
  const doApprove = () => {
    if (!approveModal) return;
    const row = approveModal;
    setApproveModal(null);
    setPendingId(row.id);
    startTransition(async () => {
      const res = await approveSalesOrderAction(row.id);
      setPendingId(null);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已核准 ${row.order_no}` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const handleRejectSubmit = () => {
    if (!rejectModal) return;
    if (!canApprove) {
      showBanner({ ok: false, msg: "沒有簽核權限" });
      return;
    }
    const note = rejectNote.trim();
    if (!note) {
      showBanner({ ok: false, msg: "請填寫駁回原因" });
      return;
    }
    const id = rejectModal.id;
    const orderNo = rejectModal.orderNo;
    setPendingId(id);
    startTransition(async () => {
      const res = await rejectSalesOrderAction(id, note);
      setPendingId(null);
      if (res.ok) {
        setRejectModal(null);
        setRejectNote("");
        showBanner({ ok: true, msg: `✓ 已駁回 ${orderNo}` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const columns = useMemo<DataGridColumn<SalesOrderRow>[]>(
    () => [
      {
        id: "order_no",
        header: "訂單號",
        width: 150,
        hideable: false,
        cell: (r) => (
          <Link
            href={`/sales/orders/${r.id}`}
            className="font-mono font-semibold text-[#1A3A5C] hover:underline"
          >
            {r.order_no}
          </Link>
        ),
        exportValue: (r) => r.order_no,
        sortValue: (r) => r.order_no,
      },
      {
        id: "contract_type",
        header: "類型",
        width: 70,
        cell: (r) => (
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
              r.contract_type === "new"
                ? "bg-[#EAF4FB] text-[#185FA5]"
                : "bg-[#FDF3E3] text-[#854F0B]"
            }`}
          >
            {r.contract_type === "new" ? "新車" : "中古"}
          </span>
        ),
        exportValue: (r) => (r.contract_type === "new" ? "新車" : "中古"),
        sortValue: (r) => r.contract_type,
      },
      {
        id: "customer",
        header: "客戶",
        width: 160,
        cell: (r) => (
          <div className="flex flex-col">
            <span className="text-[12.5px] text-[#2C2C2A]">{r.customer_name ?? "—"}</span>
            {r.customer_phone && (
              <span className="text-[11px] text-[#9A9890]">{r.customer_phone}</span>
            )}
          </div>
        ),
        exportValue: (r) =>
          [r.customer_name, r.customer_phone].filter(Boolean).join(" / "),
        sortValue: (r) => r.customer_name ?? "",
      },
      {
        id: "vehicle",
        header: "車輛",
        width: 200,
        cell: (r) => (
          <span className="text-[12.5px] text-[#2C2C2A]">
            {r.contract_type === "new"
              ? (r.vehicle_model_name ?? "—")
              : (r.used_brand_model ?? "—")}
          </span>
        ),
        exportValue: (r) =>
          r.contract_type === "new"
            ? (r.vehicle_model_name ?? "")
            : (r.used_brand_model ?? ""),
        sortValue: (r) =>
          (r.contract_type === "new" ? r.vehicle_model_name : r.used_brand_model) ?? "",
      },
      {
        id: "amount",
        header: "金額",
        width: 120,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12.5px] text-[#2C2C2A]">
            {fmtNT(r.total_amount ?? r.deal_price ?? null)}
          </span>
        ),
        exportValue: (r) => String(r.total_amount ?? r.deal_price ?? ""),
        sortValue: (r) => r.total_amount ?? r.deal_price ?? 0,
      },
      {
        id: "rs_name",
        header: "業務",
        width: 100,
        cell: (r) => r.rs_name ?? "—",
        exportValue: (r) => r.rs_name ?? "",
        sortValue: (r) => r.rs_name ?? "",
      },
      {
        id: "submitted_at",
        header: "送簽時間",
        width: 140,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{fmtDateTime(r.submitted_at)}</span>
        ),
        exportValue: (r) => fmtDateTime(r.submitted_at),
        sortValue: (r) => r.submitted_at ?? "",
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">訂單簽核</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          S1-6
        </span>
        <span className="text-[12px] text-[#9A9890]">
          待簽核訂單（送簽中）—— 核准後將進入「已簽約」狀態
        </span>
      </header>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆待簽核訂單
        </span>
        {!canApprove && (
          <span className="ml-3 px-2 py-0.5 rounded-md bg-[#FDF3E3] text-[#854F0B] text-[11px]">
            僅檢視模式（無簽核權限）
          </span>
        )}
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/approvals/order"
        exportFileName="order-approvals"
        emptyMessage="目前沒有待簽核的訂單"
        disabled={isPending}
        rowActionsWidth={240}
        rowActions={(r) => {
          const isRowPending = pendingId === r.id;
          return (
            <>
              <Link
                href={`/sales/orders/${r.id}`}
                className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                查看
              </Link>
              <button
                type="button"
                disabled={!canApprove || isRowPending || isPending}
                onClick={() => handleApprove(r)}
                className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {isRowPending ? "簽核中⋯" : "核准"}
              </button>
              <button
                type="button"
                disabled={!canApprove || isRowPending || isPending}
                onClick={() => {
                  setRejectModal({ id: r.id, orderNo: r.order_no });
                  setRejectNote("");
                }}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
              >
                駁回
              </button>
            </>
          );
        }}
      />

      {/* Reject modal */}
      {rejectModal && (
        <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center px-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-[#EEECE6]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
                駁回訂單{" "}
                <span className="font-mono text-[#185FA5]">{rejectModal.orderNo}</span>
              </h2>
            </header>
            <div className="px-4 py-4 space-y-2">
              <label className="text-[11px] text-[#9A9890] font-medium">
                駁回原因（必填）
              </label>
              <textarea
                value={rejectNote}
                onChange={(e) => setRejectNote(e.target.value)}
                rows={4}
                placeholder="例：訂金未到帳、客戶資料不齊全、折扣過大需重新議價⋯"
                className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
                disabled={isPending}
              />
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex items-center justify-end gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={() => {
                  setRejectModal(null);
                  setRejectNote("");
                }}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                disabled={isPending || !rejectNote.trim()}
                onClick={handleRejectSubmit}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-50"
              >
                {isPending ? "駁回中⋯" : "確認駁回"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Approve confirm dialog */}
      {approveModal && (
        <ConfirmDialog
          title="確認核准訂單？"
          message={`確定核准訂單「${approveModal.order_no}」？核准後將進入「已簽約」狀態。`}
          confirmLabel="確認核准"
          variant="primary"
          isPending={isPending}
          onConfirm={doApprove}
          onCancel={() => setApproveModal(null)}
        />
      )}

      {/* Banner */}
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
    </main>
  );
}
