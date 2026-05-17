"use client";

import { useState, useTransition } from "react";
import {
  deleteSubscriptionAction,
  toggleSubscriptionActiveAction,
} from "@/lib/notifications/actions";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  const [showConfirm, setShowConfirm] = useState(false);

  if (action === "toggle") {
    return (
      <button
        type="button"
        className={`h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] ${
          isPending ? "opacity-60 pointer-events-none" : ""
        }`}
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await toggleSubscriptionActiveAction(id, !isActive);
          })
        }
      >
        {isPending ? "切換中⋯" : isActive ? "停用" : "啟用"}
      </button>
    );
  }

  // delete
  return (
    <>
      <button
        type="button"
        className={`h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] ${
          isPending ? "opacity-60 pointer-events-none" : ""
        }`}
        disabled={isPending}
        onClick={() => setShowConfirm(true)}
      >
        {isPending ? "刪除中⋯" : "刪除"}
      </button>
      {showConfirm && (
        <ConfirmDialog
          title="確定刪除此訂閱？"
          message="刪除後此訂閱將永久消失，無法復原。"
          confirmLabel="確認刪除"
          variant="danger"
          isPending={isPending}
          onConfirm={() => {
            setShowConfirm(false);
            startTransition(async () => {
              await deleteSubscriptionAction(id);
            });
          }}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  );
}
