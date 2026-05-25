"use client";

/**
 * 試乘同意簽名 Modal（G3）— board 列尾「開始」+ detail view「開始試駕」共用。
 *
 * flow：點「開始試駕」→ 開此 modal → 客戶讀同意條款 + 手寫簽名 → 確認
 *      → startTestDriveWithSignatureAction（寫 metadata.signature + 切 in_progress）。
 * 沒簽 / 取消 → 不切狀態、不出車。
 *
 * UI 互動規範：簽名送出為寫入動作 → 送出時整個 modal pending 鎖
 * （pointer-events-none opacity-60 + 按鈕「儲存中⋯」），避免重複送出。
 */

import { useState, useTransition } from "react";

import { SignatureCanvas } from "@/components/signature-canvas";
import { TEST_DRIVE_CONSENT_VERSION } from "@/domain/sales-test-drives.constants";
import { startTestDriveWithSignatureAction } from "@/lib/sales/test-drives-actions";

export function TestRideConsentModal({
  testRideId,
  signerName,
  onSuccess,
  onClose,
}: {
  testRideId: string;
  signerName?: string | null;
  // 簽名成功（已切 in_progress）後回呼，由父層 router.refresh / showBanner
  onSuccess: () => void;
  // 關閉 / 取消（沒出車）
  onClose: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  // 已簽好、待送出的 dataURL（null = 尚未確認簽名 → 出車鈕 disabled）
  const [signedDataUrl, setSignedDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (!signedDataUrl) return;
    setError(null);
    startTransition(async () => {
      const res = await startTestDriveWithSignatureAction(testRideId, {
        dataUrl: signedDataUrl,
        signerName: signerName ?? undefined,
        consentVersion: TEST_DRIVE_CONSENT_VERSION,
      });
      if (res.ok) {
        onSuccess();
      } else {
        setError(res.error);
      }
    });
  }

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
            試乘同意條款 — 出車前簽名
          </h2>
          <p className="text-[11.5px] text-[#9A9890] mt-0.5">
            請客戶確認下列條款並簽名後出車
          </p>
        </header>

        <div className="px-5 py-4 space-y-4">
          {/* 同意條款條文（占位文字，正式條文到位再改版 consent_version） */}
          <div className="rounded-lg border border-[#EEECE6] bg-[#F8F7F4] px-4 py-3 text-[12px] text-[#5A5955] leading-relaxed max-h-[180px] overflow-y-auto">
            <p className="font-medium text-[#2C2C2A] mb-1.5">試乘同意暨免責聲明</p>
            <ol className="list-decimal pl-4 space-y-1">
              <li>
                本人已持有合法有效之機車駕駛執照，並於試乘前確認車輛狀況正常。
              </li>
              <li>
                試乘期間本人將遵守道路交通法規、配戴安全帽，並對自身行車安全負責。
              </li>
              <li>
                試乘期間因本人之故意或過失所致之事故、罰單、車輛損害，由本人負擔賠償責任。
              </li>
              <li>
                本人同意經銷商基於試乘服務目的，蒐集、處理及利用本人之個人資料。
              </li>
              <li>本人已充分了解並同意上述條款，自願簽名出車試乘。</li>
            </ol>
          </div>

          {/* 簽名板 */}
          <div>
            <div className="text-[11px] text-[#9A9890] font-medium mb-1.5">
              客戶簽名 *
            </div>
            {signedDataUrl ? (
              // 已確認簽名 → 顯示縮圖 + 可重簽
              <div className="space-y-2">
                <div className="border-2 border-[#0F6E56] rounded-xl overflow-hidden bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={signedDataUrl}
                    alt="客戶簽名"
                    className="w-full h-40 object-contain bg-neutral-50"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setSignedDataUrl(null)}
                  disabled={isPending}
                  className="text-[11.5px] text-[#185FA5] hover:underline disabled:opacity-40"
                >
                  ↺ 重新簽名
                </button>
              </div>
            ) : (
              <SignatureCanvas onSigned={(dataUrl) => setSignedDataUrl(dataUrl)} />
            )}
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
            onClick={submit}
            disabled={isPending || !signedDataUrl}
            className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            title={!signedDataUrl ? "請先完成簽名" : "簽名並開始試駕"}
          >
            {isPending && (
              <span className="inline-block w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            )}
            {isPending ? "儲存中⋯" : "簽名並開始試駕"}
          </button>
        </footer>
      </div>
    </div>
  );
}
