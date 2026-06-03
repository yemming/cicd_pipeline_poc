"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import type { IScannerControls } from "@zxing/browser";

/**
 * 純前端相機條碼掃描元件。
 * 用 ZXing BrowserMultiFormatReader 連續 decode（EAN-13 / QR / Code128…）。
 * 後鏡優先（facingMode: environment）。
 * 無相機 / 拒授權 → 顯示提示，呼叫端仍可走鍵盤輸入降級。
 *
 * ⚠️ 資源釋放：unmount / 關閉時呼叫 controls.stop() 停掉 video stream，相機燈才會熄。
 */
export function ScanInput({
  onScan,
  onClose,
}: {
  onScan: (code: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  // 避免同一碼短時間內重複觸發（ZXing 連續 decode 會每幀回 callback）
  const lastScanRef = useRef<{ code: string; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    // 相機相關全在 useEffect 內啟動，確保 hydration 安全（SSR 不碰 navigator）
    let cancelled = false;
    const reader = new BrowserMultiFormatReader();

    async function start() {
      if (
        typeof navigator === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        if (!cancelled) {
          setError("此裝置 / 瀏覽器不支援相機（需 HTTPS 或 localhost）");
          setStarting(false);
        }
        return;
      }
      try {
        const controls = await reader.decodeFromConstraints(
          { video: { facingMode: "environment" } },
          videoRef.current ?? undefined,
          (result) => {
            if (cancelled || !result) return;
            const code = result.getText().trim();
            if (!code) return;
            const now = Date.now();
            const last = lastScanRef.current;
            // 同一碼 1.2s 內視為重複、忽略
            if (last && last.code === code && now - last.at < 1200) return;
            lastScanRef.current = { code, at: now };
            onScan(code);
          },
        );
        if (cancelled) {
          controls.stop();
          return;
        }
        controlsRef.current = controls;
        setStarting(false);
      } catch (e) {
        if (cancelled) return;
        const name = e instanceof Error ? e.name : "";
        if (name === "NotAllowedError" || name === "SecurityError") {
          setError("相機權限被拒絕，請改用手動輸入或重新授權");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("找不到可用相機，請改用手動輸入");
        } else {
          setError(
            `相機啟動失敗：${e instanceof Error ? e.message : String(e)}`,
          );
        }
        setStarting(false);
      }
    }

    void start();

    return () => {
      cancelled = true;
      // 停掉 scan loop + 釋放 video stream（熄相機燈）
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
    // onScan 由呼叫端用 useCallback 穩定；這裡只在掛載時啟動一次相機
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative w-full overflow-hidden rounded-lg bg-black aspect-video">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted
          playsInline
        />
        {/* 掃描框輔助線 */}
        {!error && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-3/4 h-1/3 border-2 border-[#0F6E56]/80 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]" />
          </div>
        )}
        {starting && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-white text-[12.5px]">
            相機啟動中⋯
          </div>
        )}
      </div>

      {error ? (
        <div className="rounded border border-[#F5AEAD] bg-[#FDECEA] text-[#CC0000] text-[12px] px-3 py-2">
          {error}
        </div>
      ) : (
        <p className="text-[11px] text-[#9A9890]">
          把條碼 / QR 對準綠框，辨識成功會自動 +1。支援 EAN-13 / QR / Code128。
        </p>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onClose}
          className="h-[28px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          關閉相機
        </button>
      </div>
    </div>
  );
}
