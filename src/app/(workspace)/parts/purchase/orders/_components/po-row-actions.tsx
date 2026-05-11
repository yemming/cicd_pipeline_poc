"use client";

import { useTransition } from "react";
import { approvePurchaseOrder, cancelPurchaseOrder } from "@/domain/orders";

export type PoActionResult = { ok: boolean; msg: string };

export function PORowActions({
  poId,
  status,
  onResult,
  onApproveAsk,
  onCancelAsk,
}: {
  poId: string;
  status: string;
  /** 完成後回報 board 顯示 banner（成功 / 失敗都呼叫） */
  onResult?: (r: PoActionResult) => void;
  /** 由 board 顯示 confirm modal；不傳就直接執行 */
  onApproveAsk?: (run: () => void) => void;
  onCancelAsk?: (run: () => void) => void;
}) {
  const [isPending, startTransition] = useTransition();

  const runApprove = () => {
    startTransition(async () => {
      const result = await approvePurchaseOrder(poId);
      onResult?.(
        result.ok
          ? { ok: true, msg: "✓ 已審核" }
          : { ok: false, msg: "審核失敗：" + result.error },
      );
    });
  };

  const runCancel = () => {
    startTransition(async () => {
      const result = await cancelPurchaseOrder(poId);
      onResult?.(
        result.ok
          ? { ok: true, msg: "✓ 已取消" }
          : { ok: false, msg: "取消失敗：" + result.error },
      );
    });
  };

  const handleApprove = () => {
    if (onApproveAsk) onApproveAsk(runApprove);
    else runApprove();
  };

  const handleCancel = () => {
    if (onCancelAsk) onCancelAsk(runCancel);
    else runCancel();
  };

  if (status === "pending") {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={handleApprove}
          disabled={isPending}
          className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 inline-flex items-center gap-1"
        >
          {isPending && (
            <span className="w-2.5 h-2.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          )}
          {isPending ? "處理中⋯" : "審核"}
        </button>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
        >
          取消
        </button>
      </div>
    );
  }

  if (status === "approved" || status === "partial_received") {
    return (
      <a
        href={`/parts/receipt/po-grn/new?po=${poId}`}
        className="inline-flex items-center h-[26px] px-2.5 rounded bg-[#1A3A5C] hover:bg-[#0F2A45] text-white text-[11.5px] font-medium"
      >
        去入庫 →
      </a>
    );
  }

  return <span className="text-[11px] text-[#9A9890]">—</span>;
}
