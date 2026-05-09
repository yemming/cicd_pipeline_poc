"use client";

import { useState, useTransition, useEffect } from "react";
import { runStubAction, type StubActionKey } from "@/lib/parts/actions";

type Variant = "primary" | "secondary" | "ghost";

/**
 * Stub 按鈕 — 點下去呼叫 server action,固定回「下版開放」提示。
 *
 * 用途:讓 W2-W6 specific routes 在 UI 上有可點按鈕,
 *       展示 pipeline 端點齊備、實作排程清楚,但不真寫 DB。
 */
export function StubActionButton({
  actionKey,
  label,
  variant = "primary",
}: {
  actionKey: StubActionKey;
  label: string;
  variant?: Variant;
}) {
  const [isPending, startTransition] = useTransition();
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!hint) return;
    const t = setTimeout(() => setHint(null), 4500);
    return () => clearTimeout(t);
  }, [hint]);

  const handle = () => {
    setHint(null);
    startTransition(async () => {
      const r = await runStubAction(actionKey);
      if (!r.ok) setHint(r.error ?? "下版開放");
    });
  };

  const variantCls: Record<Variant, string> = {
    primary: "bg-[#185FA5] hover:bg-[#0a4480] text-white",
    secondary: "bg-[#0F6E56] hover:bg-[#0a513f] text-white",
    ghost: "bg-white border border-[#D8D6CF] hover:bg-[#F5F5F4] text-[#1A1917]",
  };

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handle}
        disabled={isPending}
        data-stub-action={actionKey}
        className={`inline-flex items-center gap-1.5 h-7 px-3 text-[12px] font-medium rounded ${variantCls[variant]} disabled:opacity-60`}
      >
        {isPending && (
          <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        )}
        {isPending ? "處理中⋯" : label}
      </button>
      {hint && (
        <span
          role="status"
          className="text-[11px] bg-[#FDF3E3] text-[#854F0B] border border-[#F5E0B7] rounded px-2 py-0.5 max-w-[420px]"
        >
          💡 {hint}
        </span>
      )}
    </div>
  );
}
