"use client";

import { useState, useTransition } from "react";

import { recalcAbc } from "@/domain/analytics";

export function RecalcButton({ onDone }: { onDone?: () => void } = {}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onClick() {
    if (!confirm("確定重跑 ABC 分類？將以最近 12 個月出貨資料重新分類所有料件。")) return;
    setResult(null);
    startTransition(async () => {
      const res = await recalcAbc();
      if (res.ok) {
        setResult({
          ok: true,
          msg: `✓ 已重跑 ・ A:${res.data.a_count} B:${res.data.b_count} C:${res.data.c_count}（共 ${res.data.items_classified}）`,
        });
        onDone?.();
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60 inline-flex items-center gap-1.5"
      >
        <span className="material-symbols-outlined text-[16px]">refresh</span>
        {pending ? "重跑中⋯" : "重跑 ABC"}
      </button>
      {result && (
        <span className={`text-[11.5px] ${result.ok ? "text-[#3B6D11]" : "text-[#CC0000]"}`}>
          {result.msg}
        </span>
      )}
    </span>
  );
}
