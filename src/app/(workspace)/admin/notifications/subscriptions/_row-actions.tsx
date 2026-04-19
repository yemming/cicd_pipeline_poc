"use client";

import { useTransition } from "react";
import {
  deleteSubscriptionAction,
  toggleSubscriptionActiveAction,
} from "@/lib/notifications/actions";

export function SubscriptionRowActions({
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
          isActive ? "bg-success-container text-success" : "bg-surface-container text-on-surface-variant"
        } ${isPending ? "opacity-60 pointer-events-none" : ""}`}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await toggleSubscriptionActiveAction(id, !isActive);
          })
        }
      >
        {isPending ? "…" : isActive ? "✓ 啟用中" : "已停用"}
      </button>
    );
  }

  // delete
  return (
    <button
      type="button"
      className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-error hover:bg-error-container ${
        isPending ? "opacity-60 pointer-events-none" : ""
      }`}
      disabled={isPending}
      onClick={() => {
        if (!confirm("確定刪除此訂閱？")) return;
        startTransition(async () => {
          await deleteSubscriptionAction(id);
        });
      }}
    >
      {isPending ? "刪除中…" : "刪除"}
    </button>
  );
}
