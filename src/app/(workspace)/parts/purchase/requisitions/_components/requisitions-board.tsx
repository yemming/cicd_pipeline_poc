"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  approveRequisition,
  convertRequisition,
  rejectRequisition,
  type RequisitionWithLines,
} from "@/domain/requisitions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

type Banner = { ok: boolean; msg: string } | null;
type ConfirmTone = "danger" | "primary" | "success";
type ConfirmState =
  | null
  | {
      title: string;
      message: React.ReactNode;
      confirmLabel: string;
      confirmTone: ConfirmTone;
      onConfirm: () => void;
    };

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft:     { label: "草稿",       chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  submitted: { label: "待審核",     chip: "bg-[#FDF3E3] text-[#854F0B]" },
  pending:   { label: "待審核",     chip: "bg-[#FDF3E3] text-[#854F0B]" },
  approved:  { label: "已核准",     chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  converted: { label: "已轉採購單", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  rejected:  { label: "已拒絕",     chip: "bg-[#FDECEA] text-[#CC0000]" },
  cancelled: { label: "已拒絕",     chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const STATUS_OPTIONS = [
  { value: "", label: "全部" },
  { value: "submitted", label: "待審核" },
  { value: "approved", label: "已核准" },
  { value: "converted", label: "已轉採購單" },
  { value: "cancelled", label: "已拒絕" },
];

function formatDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function RequisitionsBoard({
  rows,
  canEdit,
  initialStatus,
}: {
  rows: RequisitionWithLines[];
  canEdit: boolean;
  initialStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [banner, setBanner] = useState<Banner>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmState>(null);

  function flash(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    startTransition(() =>
      router.push(`/parts/purchase/requisitions${params.toString() ? "?" + params : ""}`),
    );
  }

  function resetFilter() {
    setStatus("");
    startTransition(() => router.push("/parts/purchase/requisitions"));
  }

  function doApprove(r: RequisitionWithLines) {
    setConfirmModal({
      title: "確認核准",
      message: (
        <>
          確認核准「<b>{r.req_no}</b>」？核准後即可轉為正式採購單。
        </>
      ),
      confirmLabel: "確認核准",
      confirmTone: "success",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          const res = await approveRequisition(r.id);
          if (res.ok) {
            flash({ ok: true, msg: "✓ 已核准" });
            router.refresh();
          } else flash({ ok: false, msg: res.error });
        });
      },
    });
  }

  function doReject(r: RequisitionWithLines) {
    setConfirmModal({
      title: "確認拒絕",
      message: (
        <>
          確定拒絕「<b>{r.req_no}</b>」？此動作會將狀態切為「已拒絕」、後續不可再核准或轉採購單。
        </>
      ),
      confirmLabel: "確認拒絕",
      confirmTone: "danger",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          const res = await rejectRequisition(r.id);
          if (res.ok) {
            flash({ ok: true, msg: "✓ 已拒絕" });
            router.refresh();
          } else flash({ ok: false, msg: res.error });
        });
      },
    });
  }

  function doConvert(r: RequisitionWithLines) {
    setConfirmModal({
      title: "確認轉採購單",
      message: (
        <>
          「<b>{r.req_no}</b>」轉採購單？
          <div className="text-[11px] text-[#9A9890] mt-1">
            demo 階段：僅切換狀態為「已轉採購單」，未實際建立 PO。
          </div>
        </>
      ),
      confirmLabel: "確認轉採購單",
      confirmTone: "primary",
      onConfirm: () => {
        setConfirmModal(null);
        startTransition(async () => {
          const res = await convertRequisition(r.id);
          if (res.ok) {
            flash({ ok: true, msg: "✓ 已轉採購單（demo）" });
            router.refresh();
          } else flash({ ok: false, msg: res.error });
        });
      },
    });
  }

  const columns: DataGridColumn<RequisitionWithLines>[] = useMemo(
    () => [
      {
        id: "req_no",
        header: "需求單號",
        width: 140,
        hideable: false,
        cell: (r) => (
          <span className="font-mono font-semibold text-[12px] text-[#1A3A5C]">
            {r.req_no ?? "—"}
          </span>
        ),
        exportValue: (r) => r.req_no ?? "",
        sortValue: (r) => r.req_no ?? "",
      },
      {
        id: "store_name",
        header: "提出門店",
        width: 160,
        cell: (r) => <span className="text-[12.5px]">{r.store_name ?? "—"}</span>,
        exportValue: (r) => r.store_name ?? "",
        sortValue: (r) => r.store_name ?? "",
      },
      {
        id: "item",
        header: "料號 / 品名",
        width: 240,
        sortable: false,
        cell: (r) =>
          r.first_item ? (
            <div>
              <div className="text-[12.5px]">{r.first_item.name}</div>
              <div className="font-mono text-[11px] text-[#9A9890]">{r.first_item.code}</div>
              {r.line_count > 1 ? (
                <span className="inline-block mt-0.5 text-[10px] text-[#9A9890]">
                  +{r.line_count - 1} 項
                </span>
              ) : null}
            </div>
          ) : (
            <span className="text-[12.5px] text-[#9A9890]">—</span>
          ),
        exportValue: (r) =>
          r.first_item ? `${r.first_item.code} ${r.first_item.name}` : "",
      },
      {
        id: "qty",
        header: "需求數量",
        width: 100,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">
            {r.first_item ? r.first_item.qty.toLocaleString("en-US") : "—"}
          </span>
        ),
        exportValue: (r) => r.first_item?.qty ?? 0,
        sortValue: (r) => r.first_item?.qty ?? 0,
      },
      {
        id: "required_date",
        header: "需求日期",
        width: 120,
        cell: (r) => (
          <span className="font-mono text-[12px]">{formatDate(r.required_date)}</span>
        ),
        exportValue: (r) => r.required_date ?? "",
        sortValue: (r) => r.required_date ?? "",
      },
      {
        id: "status",
        header: "狀態",
        width: 110,
        hideable: false,
        cell: (r) => {
          const def = STATUS_LABEL[r.status ?? "submitted"] ?? STATUS_LABEL.submitted;
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) =>
          (STATUS_LABEL[r.status ?? "submitted"] ?? STATUS_LABEL.submitted).label,
        sortValue: (r) => r.status ?? "",
      },
      {
        id: "notes",
        header: "備註",
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">{r.notes || "—"}</span>
        ),
        exportValue: (r) => r.notes ?? "",
        sortValue: (r) => r.notes ?? "",
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">採購需求處理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          4.3
        </span>
        <span className="text-[12px] text-[#9A9890]">需求單建立 · 審核 · 轉採購單</span>
      </header>

      <div className="bg-[#EAF4FB] border border-[#B5D4F4] rounded-md px-4 py-2.5 text-[12px] text-[#1A3A5C]">
        📋 需求處理：門店服務人員提出備料/補貨需求，採購部門審核後轉為正式採購單。
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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
              onClick={resetFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/parts/purchase/requisitions/new"
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center disabled:opacity-50"
            >
              ＋ 新增需求
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/purchase/requisitions"
        exportFileName="requisitions"
        emptyMessage="沒有符合條件的需求單"
        disabled={isPending}
        rowActionsWidth={canEdit ? 320 : 90}
        rowActions={(r) => {
          const st = r.status ?? "submitted";
          const isPendingStatus = st === "submitted" || st === "pending";
          const isApproved = st === "approved";
          return (
            <>
              <Link
                href={`/parts/purchase/requisitions/${r.id}`}
                className="h-[26px] px-2.5 rounded bg-white border border-[#D5D3CB] text-[11.5px] text-[#5A5955] inline-flex items-center hover:border-[#9A9890]"
              >
                詳細
              </Link>
              {canEdit && isPendingStatus ? (
                <>
                  <button
                    type="button"
                    onClick={() => doApprove(r)}
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  >
                    核准
                  </button>
                  <button
                    type="button"
                    onClick={() => doReject(r)}
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                  >
                    拒絕
                  </button>
                </>
              ) : null}
              {canEdit && isApproved ? (
                <button
                  type="button"
                  onClick={() => doConvert(r)}
                  disabled={isPending}
                  className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
                >
                  轉採購單
                </button>
              ) : null}
            </>
          );
        }}
      />

      {!canEdit ? (
        <div className="text-[11px] text-[#9A9890]">
          💡 你目前沒有審核權限（PR_APPROVE），僅能檢視
        </div>
      ) : null}

      {/* Confirm Modal */}
      {confirmModal ? (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3
                className={`text-[14px] font-semibold ${
                  confirmModal.confirmTone === "danger" ? "text-[#CC0000]" : "text-[#2C2C2A]"
                }`}
              >
                {confirmModal.title}
              </h3>
            </header>
            <div className="px-4 py-3 text-[12.5px] text-[#2C2C2A]">
              {confirmModal.message}
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmModal(null)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmModal.onConfirm}
                disabled={isPending}
                className={`h-[30px] px-3.5 rounded text-[12.5px] font-medium disabled:opacity-60 ${
                  confirmModal.confirmTone === "danger"
                    ? "bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9]"
                    : confirmModal.confirmTone === "success"
                      ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                      : "bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                }`}
              >
                {confirmModal.confirmLabel}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {/* Banner fixed bottom-right */}
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
