"use client";

import { useState, useTransition } from "react";

import { receiveTransfer } from "@/domain/transfers";

export function ReceiveTransferButton({
  transferId,
  trNo,
  onResult,
}: {
  transferId: string;
  trNo: string;
  onResult?: (r: { ok: boolean; msg: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<
    | { ok: true; gr_no: string }
    | { ok: false; error: string }
    | null
  >(null);

  function run() {
    setConfirming(false);
    setResult(null);
    startTransition(async () => {
      const res = await receiveTransfer(transferId);
      if (res.ok) {
        setResult({ ok: true, gr_no: res.data.gr_no });
        onResult?.({ ok: true, msg: `✓ 已收貨 ${res.data.gr_no}` });
      } else {
        setResult({ ok: false, error: res.error });
        onResult?.({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setConfirming(true)}
        disabled={pending}
        className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
      >
        {pending ? "收貨中⋯" : "確認收貨"}
      </button>
      {result?.ok ? (
        <span className="text-[11px] text-[#3B6D11]">✓ {result.gr_no}</span>
      ) : null}
      {result?.ok === false ? (
        <span className="text-[11px] text-[#CC0000]">{result.error}</span>
      ) : null}

      {confirming ? (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">確認收貨</h3>
            </header>
            <div className="px-4 py-3 text-[12.5px] text-[#2C2C2A]">
              確認收貨「<b>{trNo}</b>」？在途庫存將翻成可用。
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                取消
              </button>
              <button
                type="button"
                onClick={run}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                確認收貨
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </span>
  );
}
