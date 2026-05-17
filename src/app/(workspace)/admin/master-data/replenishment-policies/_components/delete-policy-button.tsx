"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { deleteReplenishmentPolicyAction } from "@/lib/master-data/replenishment-policy-actions";

export function DeletePolicyButton({ policyId }: { policyId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    if (!confirm("確定刪除此補貨計畫？")) return;
    startTransition(async () => {
      setError(null);
      const res = await deleteReplenishmentPolicyAction(policyId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/admin/master-data/replenishment-policies");
    });
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={onClick}
        disabled={isPending}
        className="px-3 py-1.5 text-[13px] text-[#BF2600] border border-[#FFBDAD] rounded hover:bg-[#FFEBE6] disabled:opacity-60 disabled:pointer-events-none"
      >
        {isPending ? "刪除中…" : "刪除這筆計畫"}
      </button>
      {error && (
        <span className="text-[12px] text-[#BF2600]">{error}</span>
      )}
    </div>
  );
}
