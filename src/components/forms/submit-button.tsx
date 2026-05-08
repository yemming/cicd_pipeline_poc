"use client";

import { useFormStatus } from "react-dom";

/**
 * 共用 SubmitButton：強制套上 useFormStatus pending 鎖 + spinner。
 *
 * CLAUDE.md MANDATORY：所有寫入 DB 的 button 必須讀 pending 狀態，
 * disabled + 視覺 loading + 文字切換成進行式。
 *
 * 用法：
 *   <form action={serverAction}>
 *     <SubmitButton idleLabel="建立" pendingLabel="建立中…" />
 *   </form>
 *
 * 自訂 transition 可再用 useTransition 場景：傳 `pending` prop 強制覆寫。
 */
export function SubmitButton({
  idleLabel,
  pendingLabel,
  pending: pendingOverride,
  variant = "primary",
  size = "md",
  className = "",
  type = "submit",
  onClick,
}: {
  idleLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  className?: string;
  type?: "submit" | "button";
  onClick?: () => void;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = pendingOverride ?? formPending;

  const variantCls =
    variant === "primary"
      ? "bg-[#0052CC] hover:bg-[#0747A6] active:bg-[#05389E] disabled:bg-[#0747A6]/70 text-white"
      : variant === "danger"
        ? "bg-[#BF2600] hover:bg-[#A12500] disabled:bg-[#BF2600]/70 text-white"
        : "bg-[#F4F5F7] hover:bg-[#EBECF0] active:bg-[#DFE1E6] disabled:bg-[#F4F5F7]/70 text-[#172B4D] border border-[#DFE1E6]";

  const sizeCls = size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-5 py-2 text-[14px]";

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={pending}
      className={`inline-flex items-center gap-2 rounded font-semibold transition-colors disabled:cursor-wait ${variantCls} ${sizeCls} ${className}`}
    >
      {pending && (
        <span
          className="inline-block w-3.5 h-3.5 border-[2px] border-white/40 border-t-white rounded-full animate-spin"
          aria-hidden
        />
      )}
      {pending ? (pendingLabel ?? `${idleLabel}中…`) : idleLabel}
    </button>
  );
}
