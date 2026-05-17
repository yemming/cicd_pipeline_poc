"use client";

/**
 * ConfirmDialog — 通用確認對話框，取代 native confirm()/alert()
 *
 * 使用方式：
 *   const [showConfirm, setShowConfirm] = useState(false);
 *   <button onClick={() => setShowConfirm(true)}>刪除</button>
 *   {showConfirm && (
 *     <ConfirmDialog
 *       title="確定刪除？"
 *       message="此動作無法復原。"
 *       confirmLabel="確認刪除"
 *       variant="danger"
 *       isPending={isPending}
 *       onConfirm={() => { setShowConfirm(false); startTransition(async () => { ... }); }}
 *       onCancel={() => setShowConfirm(false)}
 *     />
 *   )}
 *
 * 視覺對齊 design pattern：邊框 #EEECE6、按鈕 h-[30px]、危險紅 #CC0000、主色 #1A3A5C。
 */

import type { ReactNode } from "react";

export type ConfirmDialogProps = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  pendingLabel?: string;
  variant?: "danger" | "primary";
  isPending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "確認",
  cancelLabel = "取消",
  pendingLabel,
  variant = "primary",
  isPending = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmClass =
    variant === "danger"
      ? "bg-[#CC0000] text-white hover:bg-[#a30000]"
      : "bg-[#1A3A5C] text-white hover:bg-[#0F2A45]";
  const defaultPending = variant === "danger" ? "處理中⋯" : "處理中⋯";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onCancel();
      }}
    >
      <div className="bg-white border border-[#EEECE6] rounded-lg shadow-lg w-[420px] max-w-[92vw] overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
        </header>
        <div className="px-4 py-4">
          {message != null && (
            <div className="text-[12.5px] text-[#2C2C2A] leading-relaxed">
              {message}
            </div>
          )}
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isPending}
              className={`h-[30px] px-3.5 rounded text-[12.5px] font-medium disabled:opacity-60 ${confirmClass}`}
            >
              {isPending ? (pendingLabel ?? defaultPending) : confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export type AlertDialogProps = {
  title: string;
  message?: ReactNode;
  variant?: "info" | "error" | "success";
  okLabel?: string;
  onClose: () => void;
};

export function AlertDialog({
  title,
  message,
  variant = "info",
  okLabel = "確定",
  onClose,
}: AlertDialogProps) {
  const headerClass =
    variant === "error"
      ? "bg-[#FDECEA] text-[#CC0000] border-b-[#F5AEAD]"
      : variant === "success"
        ? "bg-[#EAF3DE] text-[#3B6D11] border-b-[#C5DC9F]"
        : "bg-[#F8F7F4] text-[#2C2C2A] border-b-[#EEECE6]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30"
      role="alertdialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white border border-[#EEECE6] rounded-lg shadow-lg w-[420px] max-w-[92vw] overflow-hidden">
        <header className={`px-4 py-2.5 border-b ${headerClass}`}>
          <h2 className="text-[13px] font-semibold">{title}</h2>
        </header>
        <div className="px-4 py-4">
          {message != null && (
            <div className="text-[12.5px] text-[#2C2C2A] leading-relaxed">
              {message}
            </div>
          )}
          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
            >
              {okLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
