"use client";

import { useState, useTransition } from "react";

import { recalcAbcAction } from "@/lib/parts/actions";

export function RecalcButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onClick() {
    if (!confirm("確定重跑 ABC 分類？將改寫 abc_classification_results。")) return;
    setResult(null);
    startTransition(async () => {
      const res = await recalcAbcAction();
      if (res.ok) {
        setResult({
          ok: true,
          msg: `✓ 已重跑 ・ A:${res.data.a_count} B:${res.data.b_count} C:${res.data.c_count}（共 ${res.data.items_classified}）`,
        });
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <span>
      <button type="button" onClick={onClick} disabled={pending}
        className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded">
        <span className="material-symbols-outlined text-[16px]">refresh</span>
        {pending ? "重跑中…" : "重跑 ABC"}
      </button>
      {result && (
        <span className={`ml-3 text-[12px] ${result.ok ? "text-[#006644]" : "text-[#BF2600]"}`}>{result.msg}</span>
      )}
    </span>
  );
}
