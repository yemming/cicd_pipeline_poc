"use client";

import { useTransition } from "react";
import { deleteTargetAction, toggleTargetActiveAction } from "@/lib/notifications/actions";

export function TargetRowActions({
  id,
  isActive,
  action,
}: {
  id: string;
  isActive: boolean;
  action: "toggle" | "delete";
}) {
  const [isPending, startTransition] = useTransition();

  if (action === "toggle") {
    return (
      <button
        type="button"
        className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${
          isActive
            ? "bg-success-container text-success"
            : "bg-surface-container text-on-surface-variant"
        } ${isPending ? "opacity-60 pointer-events-none" : ""}`}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await toggleTargetActiveAction(id, !isActive);
          })
        }
      >
        {isPending ? "…" : isActive ? "✓ 啟用中" : "已停用"}
      </button>
    );
  }

  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-error hover:bg-error-container ${
        isPending ? "opacity-60 pointer-events-none" : ""
      }`}
      disabled={isPending}
      onClick={() => {
        if (!confirm("確定刪除此目標？（相關訂閱會一起消失）")) return;
        startTransition(async () => {
          await deleteTargetAction(id);
        });
      }}
    >
      {isPending ? "刪除中…" : "刪除"}
    </button>
  );
}
