"use client";

import { useState, useTransition } from "react";

import { approveTransfer } from "@/domain/transfers";

/**
 * B 門店主管審批調撥申請 —— pull 模型審批閘門的入口 UI。
 * 只在 status='draft' 的列顯示（見 transfer-in-board.tsx rowActions）。
 */
export function ApproveTransferButton({
  transferId,
  trNo,
  onResult,
}: {
  transferId: string;
  trNo: string;
  onResult?: (r: { ok: boolean; msg: string }) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [modal, setModal] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  function runApprove() {
    setModal(null);
    startTransition(async () => {
      const res = await approveTransfer(transferId, "approve");
      if (res.ok) {
        onResult?.({ ok: true, msg: `✓ 已核准並出貨 ${trNo}` });
      } else {
        onResult?.({ ok: false, msg: `核准失敗：${res.error}` });
      }
    });
  }

  function runReject() {
    const reason = rejectReason.trim();
    if (!reason) {
      onResult?.({ ok: false, msg: "請填寫退回原因" });
      return;
    }
    startTransition(async () => {
      const res = await approveTransfer(transferId, "reject", reason);
      if (res.ok) {
        setModal(null);
        setRejectReason("");
        onResult?.({ ok: true, msg: `✓ 已退回 ${trNo}` });
      } else {
        onResult?.({ ok: false, msg: `退回失敗：${res.error}` });
      }
    });
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setModal("approve")}
        disabled={pending}
        className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
      >
        {pending ? "處理中⋯" : "核准"}
      </button>
      <button
        type="button"
        onClick={() => setModal("reject")}
        disabled={pending}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
      >
        退回
      </button>

      {modal === "approve" ? (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[420px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">核准調撥申請</h3>
            </header>
            <div className="px-4 py-3 text-[12.5px] text-[#2C2C2A]">
              核准「<b>{trNo}</b>」？核准後將立即依 FIFO 扣來源倉庫存、建立目標倉在途庫存。
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={runApprove}
                disabled={pending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
              >
                {pending ? "核准中⋯" : "確認核准"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {modal === "reject" ? (
        <div className="fixed inset-0 z-[100] bg-black/30 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-[440px]">
            <header className="px-4 py-3 border-b border-[#EEECE6]">
              <h3 className="text-[14px] font-semibold text-[#2C2C2A]">退回調撥申請</h3>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955] leading-relaxed">
                退回「<b>{trNo}</b>」？草稿階段尚未動過庫存，退回即轉為已取消。
              </p>
              <div>
                <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
                  退回原因 <span className="text-[#CC0000]">*</span>
                </label>
                <textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                  placeholder="例如：目標倉無需求、來源倉庫存另有他用⋯"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                  autoFocus
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={pending}
                className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                關閉
              </button>
              <button
                type="button"
                onClick={runReject}
                disabled={pending || !rejectReason.trim()}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#A30000] disabled:opacity-50"
              >
                {pending ? "退回中⋯" : "確認退回"}
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </span>
  );
}
