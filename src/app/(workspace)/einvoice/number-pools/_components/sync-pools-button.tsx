"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { syncNumberPoolsAction } from "@/lib/einvoice/actions";

export function SyncPoolsButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  function sync() {
    startTransition(async () => {
      const result = await syncNumberPoolsAction();
      if (result.ok) {
        setBanner({ ok: true, msg: `✓ 已同步綠界字軌：${result.data.year} 年共 ${result.data.synced} 筆` });
        router.refresh();
        setTimeout(() => setBanner(null), 3500);
      } else {
        setBanner({ ok: false, msg: result.error });
      }
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={sync}
        disabled={pending}
        className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
      >
        {pending ? "同步中⋯" : "↻ 向綠界同步字軌"}
      </button>
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </>
  );
}
