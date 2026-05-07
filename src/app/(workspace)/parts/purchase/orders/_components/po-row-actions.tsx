"use client";

import { useTransition } from "react";
import { approvePurchaseOrder, cancelPurchaseOrder } from "@/lib/parts/actions";

export function PORowActions({ poId, status }: { poId: string; status: string }) {
  const [isPending, startTransition] = useTransition();

  const handleApprove = () => {
    if (!confirm("確定審核這張採購單嗎?審核後即可進入入庫流程。")) return;
    startTransition(async () => {
      const result = await approvePurchaseOrder(poId);
      if (!result.ok) alert("審核失敗:" + result.error);
    });
  };

  const handleCancel = () => {
    if (!confirm("確定取消這張採購單嗎?此動作無法還原。")) return;
    startTransition(async () => {
      const result = await cancelPurchaseOrder(poId);
      if (!result.ok) alert("取消失敗:" + result.error);
    });
  };

  if (status === "pending") {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={handleApprove}
          disabled={isPending}
          className="h-7 px-2.5 bg-[#185FA5] hover:bg-[#1A3A5C] text-white text-[11px] font-medium rounded disabled:opacity-60 inline-flex items-center gap-1"
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
          className="h-7 px-2 text-[11px] text-[#CC0000] hover:bg-[#FDECEA] rounded disabled:opacity-60"
        >
          取消
        </button>
      </div>
    );
  }

  if (status === "approved" || status === "partial_received") {
    return (
      <a
        href={`/parts/receipt/po-grn?po=${poId}`}
        className="inline-flex items-center h-7 px-2.5 bg-[#0F6E56] hover:bg-[#0a513f] text-white text-[11px] font-medium rounded"
      >
        去入庫 →
      </a>
    );
  }

  return <span className="text-[11px] text-[#9A9890]">—</span>;
}
