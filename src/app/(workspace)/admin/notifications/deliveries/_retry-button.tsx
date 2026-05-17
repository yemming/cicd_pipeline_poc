"use client";

import { useState, useTransition } from "react";
import { retryDeliveryAction } from "@/lib/notifications/actions";

export function RetryButton({ deliveryId }: { deliveryId: string }) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok?: boolean; error?: string } | null>(null);

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11.5px] ${
          result?.ok
            ? "bg-[#EAF3DE] text-[#3B6D11]"
            : "bg-[#EAF4FB] text-[#185FA5] hover:bg-[#DBEAF5]"
        } ${isPending ? "opacity-60 pointer-events-none" : ""}`}
        disabled={isPending}
        onClick={() => {
          setResult(null);
          startTransition(async () => {
            const r = await retryDeliveryAction(deliveryId);
            setResult(r);
          });
        }}
      >
        {isPending ? "重送中…" : result?.ok ? "✓ 已重送" : "重送"}
      </button>
      {result && !result.ok && result.error && (
        <span className="text-[11px] text-[#CC0000]" title={result.error}>
          ⚠️ {result.error.slice(0, 24)}…
        </span>
      )}
    </div>
  );
}
