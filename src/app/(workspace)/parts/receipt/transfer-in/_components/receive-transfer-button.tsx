"use client";

import { useState, useTransition } from "react";

import { receiveTransferAction } from "@/lib/parts/actions";

export function ReceiveTransferButton({
  transferId,
  trNo,
}: {
  transferId: string;
  trNo: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; gr_no: string }
    | { ok: false; error: string }
    | null
  >(null);

  function onClick() {
    if (!confirm(`確認收貨 ${trNo}？在途庫存會翻成可用。`)) return;
    setResult(null);
    startTransition(async () => {
      const res = await receiveTransferAction(transferId);
      if (res.ok) {
        setResult({ ok: true, gr_no: res.data.gr_no });
      } else {
        setResult({ ok: false, error: res.error });
      }
    });
  }

  return (
    <span>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2 py-1 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[12px] font-semibold rounded"
      >
        {pending ? "收貨中…" : "確認收貨"}
      </button>
      {result?.ok && (
        <span className="ml-2 text-[11px] text-[#006644]">
          ✓ {result.gr_no}
        </span>
      )}
      {result?.ok === false && (
        <span className="ml-2 text-[11px] text-[#BF2600]">{result.error}</span>
      )}
    </span>
  );
}
