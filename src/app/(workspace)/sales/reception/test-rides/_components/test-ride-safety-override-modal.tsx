"use client";

/**
 * 主管放行 NG 項目 Modal（RS04 裁示）
 *
 * 背景：安全確認清單有 NG 項目時，不是「RS 自己填段文字就能放行」，
 * 而是要有授權的主管做判斷後才能繼續進 Step3 簽名。此 modal 是那個「判斷」
 * 的 UI 入口：列出所有 NG 項目 + 原因，要求輸入放行原因，送出後打
 * overrideSafetyCheckNgAction（domain 層驗證操作者是否為主管，不是主管會
 * 回錯誤，這裡把錯誤清楚顯示給使用者）。
 *
 * UI 互動規範：送出為寫入動作 → pending 時整個 modal 鎖 + 按鈕文字換進行式。
 */

import type { SafetyNgItem } from "@/domain/sales-test-drives.constants";

export function TestRideSafetyOverrideModal({
  ngItems,
  reason,
  onReasonChange,
  onSubmit,
  onClose,
  isPending,
  error,
}: {
  ngItems: SafetyNgItem[];
  reason: string;
  onReasonChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
  isPending: boolean;
  error: string | null;
}) {
  const canSubmit = reason.trim().length > 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={() => !isPending && onClose()}
    >
      <div
        className={`bg-white rounded-lg shadow-xl w-[560px] max-w-[94vw] max-h-[90vh] overflow-y-auto ${
          isPending ? "pointer-events-none opacity-60" : ""
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-[#EEECE6]">
          <h2 className="text-[15px] font-semibold text-[#2C2C2A]">
            主管確認放行 — 安全清單 NG 項目
          </h2>
          <p className="text-[11.5px] text-[#9A9890] mt-0.5">
            此清單有 NG 項目，需主管判斷後方可進入客戶簽名步驟；放行動作將記入稽核紀錄
          </p>
        </header>

        <div className="px-5 py-4 space-y-3">
          <div>
            <div className="text-[11px] text-[#9A9890] font-medium mb-1.5">
              NG 項目（{ngItems.length}）
            </div>
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {ngItems.map((ng) => (
                <div
                  key={ng.item_id}
                  className="flex items-start gap-2 px-2.5 py-2 bg-[#FDECEA] border border-[#F5AEAD] rounded"
                >
                  <span className="text-[#CC0000] font-bold text-[11px] shrink-0 mt-0.5">
                    NG
                  </span>
                  <div>
                    <div className="text-[12px] font-medium text-[#2C2C2A]">
                      {ng.item_label}
                    </div>
                    <div className="text-[11.5px] text-[#5A5955] mt-0.5">
                      原因：{ng.ng_note || "（未填）"}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[11px] text-[#9A9890] font-medium">
              放行原因 <span className="text-[#CC0000]">*</span>
            </label>
            <textarea
              rows={3}
              className="mt-1 w-full border border-[#D5D3CB] rounded px-2.5 py-1.5 text-[12.5px] text-[#2C2C2A] outline-none focus:border-[#185FA5] resize-none bg-white disabled:bg-[#F4F3F0]"
              placeholder="例：輕微刮傷，不影響行車安全，客戶已知情"
              value={reason}
              onChange={(e) => onReasonChange(e.target.value)}
              disabled={isPending}
            />
          </div>

          {error && (
            <div className="rounded-md bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[12px] px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <footer className="px-5 py-3 border-t border-[#EEECE6] flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isPending || !canSubmit}
            className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            title={!canSubmit ? "請先填寫放行原因" : "主管確認放行"}
          >
            {isPending && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {isPending ? "處理中⋯" : "主管確認放行"}
          </button>
        </footer>
      </div>
    </div>
  );
}
