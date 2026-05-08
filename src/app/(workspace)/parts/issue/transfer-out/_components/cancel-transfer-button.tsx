"use client";

import { useState, useTransition } from "react";

import { cancelTransfer } from "@/lib/parts/actions";

export function CancelTransferButton({ transferId, trNo }: { transferId: string; trNo: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onClick() {
    if (!confirm(`確定取消調撥單 ${trNo}？在途庫存會搬回來源倉。`)) return;
    setError(null);
    startTransition(async () => {
      const res = await cancelTransfer(transferId);
      if (!res.ok) setError(res.error);
    });
  }

  return (
    <span>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="text-[12px] text-[#BF2600] hover:underline disabled:opacity-50"
      >
        {pending ? "取消中…" : "取消調撥"}
      </button>
      {error && <span className="ml-2 text-[11px] text-[#BF2600]">{error}</span>}
    </span>
  );
}
