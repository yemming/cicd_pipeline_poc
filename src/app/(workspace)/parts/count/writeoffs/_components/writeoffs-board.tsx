"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { WriteoffListRow, WriteoffItemOption } from "@/domain/writeoffs";
import {
  APPROVAL_THRESHOLD,
  SENIOR_APPROVAL_THRESHOLD,
} from "@/domain/loss-overflow.constants";
import {
  createInventoryWriteoffAction,
  approveInventoryWriteoffAction,
  rejectInventoryWriteoffAction,
} from "@/lib/parts-count/writeoff-actions";

// ──────────────────────────────────────────────
// Style constants
// ──────────────────────────────────────────────
const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const labelClass = "text-[11px] text-[#9A9890] font-medium";

// ──────────────────────────────────────────────
// Lookup maps
// ──────────────────────────────────────────────
const STATUS_OPTIONS = [
  { value: "", label: "全部狀態" },
  { value: "pending", label: "待審" },
  { value: "approved", label: "已核准" },
  { value: "rejected", label: "已駁回" },
];

const STATUS_CHIP: Record<string, { label: string; chip: string }> = {
  pending: { label: "待審", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  approved: { label: "已核准", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  rejected: { label: "已駁回", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const TIER_CHIP: Record<string, { label: string; chip: string }> = {
  self: { label: "自批", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  manager: { label: "主管", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  store_manager: { label: "店長", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "手動",
  count_adjustment: "盤點調整",
  workorder: "工單",
  return_writeoff: "退貨報廢",
};

function fmtMoney(n: number | null | undefined): string {
  if (n == null) return "—";
  return "NT$ " + Math.round(n).toLocaleString("zh-TW");
}

function calcTierLabel(totalLoss: number): string {
  if (totalLoss >= SENIOR_APPROVAL_THRESHOLD) return `金額 ≥ NT$ ${SENIOR_APPROVAL_THRESHOLD.toLocaleString()}，需店長審批`;
  if (totalLoss >= APPROVAL_THRESHOLD) return `金額 ≥ NT$ ${APPROVAL_THRESHOLD.toLocaleString()}，需主管審批`;
  return `金額 < NT$ ${APPROVAL_THRESHOLD.toLocaleString()}，可自批（自動核准）`;
}

type Banner = { ok: boolean; msg: string } | null;

// ──────────────────────────────────────────────
// Board
// ──────────────────────────────────────────────
export function WriteoffsBoard({
  rows,
  totalCount,
  itemOptions,
  canEdit,
  initialStatus,
}: {
  rows: WriteoffListRow[];
  totalCount: number;
  itemOptions: WriteoffItemOption[];
  canEdit: boolean;
  initialStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [status, setStatus] = useState(initialStatus);
  const [createOpen, setCreateOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<WriteoffListRow | null>(null);

  function flash(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function applyFilter() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    startTransition(() =>
      router.push(`/parts/count/writeoffs${qs ? "?" + qs : ""}`),
    );
  }

  function resetFilter() {
    setStatus("");
    startTransition(() => router.push("/parts/count/writeoffs"));
  }

  function handleApprove(row: WriteoffListRow) {
    if (busyId) return;
    setBusyId(row.id);
    startTransition(async () => {
      const res = await approveInventoryWriteoffAction(row.id);
      setBusyId(null);
      if (res.ok) {
        flash(true, `✓ 已核准報廢單（${row.item_code ?? row.id.slice(0, 8)}）`);
        router.refresh();
      } else {
        flash(false, res.error);
      }
    });
  }

  function openReject(row: WriteoffListRow) {
    if (busyId) return;
    setRejectTarget(row);
  }

  const columns = useMemo<DataGridColumn<WriteoffListRow>[]>(
    () => [
      {
        id: "item_code",
        header: "料號",
        width: 130,
        hideable: false,
        cell: (r) => (
          <span className="font-mono font-semibold text-[#1A3A5C]">
            {r.item_code ?? "—"}
          </span>
        ),
        exportValue: (r) => r.item_code ?? "",
        sortValue: (r) => r.item_code ?? "",
      },
      {
        id: "item_name",
        header: "品名",
        width: 200,
        cell: (r) => (
          <span className="text-[12px] text-[#2C2C2A]">{r.item_name ?? "—"}</span>
        ),
        exportValue: (r) => r.item_name ?? "",
        sortValue: (r) => r.item_name ?? "",
      },
      {
        id: "qty",
        header: "數量",
        width: 80,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px]">{r.qty.toLocaleString()}</span>
        ),
        exportValue: (r) => String(r.qty),
        sortValue: (r) => r.qty,
      },
      {
        id: "unit_cost",
        header: "單位成本",
        width: 110,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px] text-[#5A5955]">
            {fmtMoney(r.unit_cost)}
          </span>
        ),
        exportValue: (r) => String(r.unit_cost ?? ""),
        sortValue: (r) => r.unit_cost ?? 0,
      },
      {
        id: "total_loss",
        header: "損失金額",
        width: 120,
        align: "right",
        cell: (r) => (
          <span className="font-mono text-[12px] font-semibold text-[#CC0000]">
            {fmtMoney(r.total_loss)}
          </span>
        ),
        exportValue: (r) => String(r.total_loss ?? ""),
        sortValue: (r) => r.total_loss ?? 0,
      },
      {
        id: "writeoff_reason",
        header: "報廢原因",
        width: 180,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955] line-clamp-2">
            {r.writeoff_reason}
          </span>
        ),
        exportValue: (r) => r.writeoff_reason,
        sortValue: (r) => r.writeoff_reason,
      },
      {
        id: "source",
        header: "來源",
        width: 100,
        cell: (r) => (
          <span className="text-[12px] text-[#5A5955]">
            {SOURCE_LABEL[r.source] ?? r.source}
          </span>
        ),
        exportValue: (r) => SOURCE_LABEL[r.source] ?? r.source,
        sortValue: (r) => r.source,
      },
      {
        id: "approval_tier",
        header: "審批層",
        width: 90,
        cell: (r) => {
          const tier = r.approval_tier ?? "self";
          const def = TIER_CHIP[tier] ?? { label: tier, chip: "bg-[#F2F2F2] text-[#6B6A68]" };
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) => TIER_CHIP[r.approval_tier ?? "self"]?.label ?? (r.approval_tier ?? ""),
        sortValue: (r) => r.approval_tier ?? "",
      },
      {
        id: "status",
        header: "狀態",
        width: 90,
        cell: (r) => {
          const def = STATUS_CHIP[r.status] ?? { label: r.status, chip: "bg-[#F2F2F2] text-[#6B6A68]" };
          return (
            <span
              className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
            >
              {def.label}
            </span>
          );
        },
        exportValue: (r) => STATUS_CHIP[r.status]?.label ?? r.status,
        sortValue: (r) => r.status,
      },
      {
        id: "requested_at",
        header: "申請時間",
        width: 110,
        cell: (r) => (
          <span className="font-mono text-[11.5px] text-[#5A5955]">
            {r.requested_at ? r.requested_at.slice(0, 10) : "—"}
          </span>
        ),
        exportValue: (r) => r.requested_at?.slice(0, 10) ?? "",
        sortValue: (r) => r.requested_at ?? "",
      },
    ],
    [],
  );

  return (
    <main className="px-6 py-5 space-y-3">
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

      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">庫存報廢審批</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          庫存 · 8.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          建立報廢單、三級審批流程 — &lt; NT$ {APPROVAL_THRESHOLD.toLocaleString()} 自批 / ≥{" "}
          {APPROVAL_THRESHOLD.toLocaleString()} 主管 / ≥ {SENIOR_APPROVAL_THRESHOLD.toLocaleString()} 店長
        </span>
      </header>

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputClass} w-[140px]`}
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
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
            >
              重置
            </button>
            {canEdit && (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                disabled={isPending}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                ＋ 新增報廢
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆報廢記錄
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/count/writeoffs"
        exportFileName="inventory-writeoffs"
        emptyMessage="沒有符合條件的報廢記錄"
        disabled={isPending}
        rowActionsWidth={180}
        rowActions={(r) => {
          if (r.status !== "pending") {
            return <span className="text-[11px] text-[#9A9890]">—</span>;
          }
          const busy = busyId === r.id;
          return (
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={busy || isPending}
                onClick={() => handleApprove(r)}
                className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
              >
                {busy ? "處理中⋯" : "審批通過"}
              </button>
              <button
                type="button"
                disabled={busy || isPending}
                onClick={() => openReject(r)}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
              >
                駁回
              </button>
            </div>
          );
        }}
      />

      {/* 新增報廢 Modal */}
      {createOpen && (
        <CreateWriteoffModal
          itemOptions={itemOptions}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            flash(true, "✓ 報廢單已建立");
            router.refresh();
          }}
          onError={(msg) => flash(false, msg)}
        />
      )}

      {/* 駁回 Modal */}
      {rejectTarget && (
        <RejectWriteoffModal
          row={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onRejected={() => {
            const code = rejectTarget.item_code ?? rejectTarget.id.slice(0, 8);
            setRejectTarget(null);
            flash(true, `✓ 已駁回報廢單（${code}）`);
            router.refresh();
          }}
          onError={(msg) => flash(false, msg)}
        />
      )}
    </main>
  );
}

// ──────────────────────────────────────────────
// 新增報廢 Modal
// ──────────────────────────────────────────────
function CreateWriteoffModal({
  itemOptions,
  onClose,
  onCreated,
  onError,
}: {
  itemOptions: WriteoffItemOption[];
  onClose: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const [itemId, setItemId] = useState(itemOptions[0]?.id ?? "");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState(
    itemOptions[0]?.standard_cost != null
      ? String(itemOptions[0].standard_cost)
      : "",
  );
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();

  // 選品項時帶入 standard_cost 預設值
  function handleItemChange(id: string) {
    setItemId(id);
    const opt = itemOptions.find((o) => o.id === id);
    if (opt?.standard_cost != null) {
      setUnitCost(String(opt.standard_cost));
    } else {
      setUnitCost("");
    }
  }

  const totalLoss =
    Number(qty) > 0 && Number(unitCost) >= 0
      ? Number(qty) * Number(unitCost)
      : null;

  function submit() {
    if (!itemId) { onError("請選擇品項"); return; }
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) { onError("數量必須為正數"); return; }
    const costNum = Number(unitCost);
    if (!Number.isFinite(costNum) || costNum < 0) { onError("單位成本不可為負數"); return; }
    if (!reason.trim()) { onError("請填寫報廢原因"); return; }

    startTransition(async () => {
      const res = await createInventoryWriteoffAction({
        item_id: itemId,
        qty: qtyNum,
        unit_cost: costNum,
        writeoff_reason: reason.trim(),
        source: "manual",
      });
      if (res.ok) {
        onCreated();
      } else {
        onError(res.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-[500px] max-w-[95vw] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">新增報廢單</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[#9A9890] hover:text-[#2C2C2A] text-[20px] leading-none"
          >
            ×
          </button>
        </header>

        <div className="p-4 space-y-3">
          {/* 品項 */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>品項 *</label>
            <select
              value={itemId}
              onChange={(e) => handleItemChange(e.target.value)}
              className={inputClass}
              disabled={pending}
            >
              {itemOptions.length === 0 && (
                <option value="">（無可用品項）</option>
              )}
              {itemOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} ・ {o.name}
                </option>
              ))}
            </select>
          </div>

          {/* 數量 + 單位成本 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>報廢數量 *</label>
              <input
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="例：2"
                className={inputClass}
                disabled={pending}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>單位成本 (NT$) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                placeholder="自動帶入標準成本"
                className={inputClass}
                disabled={pending}
              />
            </div>
          </div>

          {/* 損失金額預覽 + 審批層說明 */}
          {totalLoss !== null && (
            <div
              className={`px-3 py-2 rounded text-[12px] ${
                totalLoss >= SENIOR_APPROVAL_THRESHOLD
                  ? "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
                  : totalLoss >= APPROVAL_THRESHOLD
                    ? "bg-[#FDF3E3] text-[#854F0B] border border-[#F5D9B0]"
                    : "bg-[#EAF4FB] text-[#185FA5] border border-[#B8DBEF]"
              }`}
            >
              損失金額：
              <b>NT$ {Math.round(totalLoss).toLocaleString()}</b>
              　—　{calcTierLabel(totalLoss)}
            </div>
          )}

          {/* 報廢原因 */}
          <div className="flex flex-col gap-1">
            <label className={labelClass}>報廢原因 *</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="請說明報廢原因（毀損原因、處置方式等）"
              className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
              disabled={pending}
            />
          </div>
        </div>

        <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !itemId || !qty || !unitCost || !reason.trim()}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {pending ? "建立中⋯" : "建立報廢單"}
          </button>
        </footer>
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────
// 駁回 Modal
// ──────────────────────────────────────────────
function RejectWriteoffModal({
  row,
  onClose,
  onRejected,
  onError,
}: {
  row: WriteoffListRow;
  onClose: () => void;
  onRejected: () => void;
  onError: (msg: string) => void;
}) {
  const [rejectReason, setRejectReason] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!rejectReason.trim()) { onError("請填寫駁回原因"); return; }
    startTransition(async () => {
      const res = await rejectInventoryWriteoffAction(row.id, rejectReason.trim());
      if (res.ok) {
        onRejected();
      } else {
        onError(res.error);
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg w-[440px] max-w-[95vw] shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">駁回報廢單</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[#9A9890] hover:text-[#2C2C2A] text-[20px] leading-none"
          >
            ×
          </button>
        </header>

        <div className="p-4 space-y-3">
          {/* 摘要資訊 */}
          <div className="px-3 py-2 bg-[#F8F7F4] rounded border border-[#EEECE6] text-[12px] space-y-0.5">
            <div>
              <span className="text-[#9A9890]">品項：</span>
              <span className="font-mono text-[#1A3A5C] font-semibold">
                {row.item_code ?? "—"}
              </span>
              {row.item_name && (
                <span className="text-[#5A5955] ml-1">・{row.item_name}</span>
              )}
            </div>
            <div>
              <span className="text-[#9A9890]">損失金額：</span>
              <span className="font-semibold text-[#CC0000]">{fmtMoney(row.total_loss)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className={labelClass}>駁回原因 *</label>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              placeholder="請說明駁回理由，申請人將收到通知"
              className="border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
              disabled={pending}
              autoFocus
            />
          </div>
        </div>

        <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !rejectReason.trim()}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
          >
            {pending ? "駁回中⋯" : "確認駁回"}
          </button>
        </footer>
      </div>
    </div>
  );
}
