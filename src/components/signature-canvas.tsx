"use client";

import { useRef, useState } from "react";

/**
 * RP2 規格：
 *   - Canvas 尺寸 500×200px（規格定案值）
 *   - 筆跡顏色 #1A3A5C（品牌深藍）
 *   - 輸出：JPEG 70%、最長邊 ≤ 1200px（事實上 canvas 500×200 遠低於此，但若未來改大仍自動壓縮）
 *   - 資料庫只存 Storage URL，base64 只在前端記憶體暫存到 server action 上傳
 */

const CANVAS_W = 500;
const CANVAS_H = 200;
const MAX_LONG_EDGE = 1200;
const JPEG_QUALITY = 0.7;
const STROKE_COLOR = "#1A3A5C";

export function SignatureCanvas({
  onSigned,
  submitting = false,
}: {
  onSigned: (dataUrl: string) => void;
  /**
   * 送出中（呼叫端 server action 尚未回應）。此時鎖住畫布 + 按鈕，
   * 「確認簽名」文字換成進行式，避免使用者以為沒反應而重複點擊
   * （signCustomerSuppliedWaiverAction 走 Storage 上傳 + DB 寫入，
   * 偶爾網路較慢時 UI 若無明確進行中提示容易誤觸重送）。
   */
  submitting?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  function getCtx() {
    const cv = canvasRef.current;
    if (!cv) return null;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.strokeStyle = STROKE_COLOR;
    ctx.lineWidth = 2.2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    return ctx;
  }

  function ptFrom(e: React.MouseEvent | React.TouchEvent) {
    const cv = canvasRef.current!;
    const rect = cv.getBoundingClientRect();
    const scaleX = cv.width / rect.width;
    const scaleY = cv.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
    }
    return {
      x: ((e as React.MouseEvent).clientX - rect.left) * scaleX,
      y: ((e as React.MouseEvent).clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    if (submitting) return;
    e.preventDefault();
    drawing.current = true;
    lastPt.current = ptFrom(e);
    const ctx = getCtx();
    if (!ctx || !lastPt.current) return;
    ctx.beginPath();
    ctx.arc(lastPt.current.x, lastPt.current.y, 0.5, 0, Math.PI * 2);
    ctx.fill();
    setHasStrokes(true);
  }

  function moveDraw(e: React.MouseEvent | React.TouchEvent) {
    if (submitting) return;
    e.preventDefault();
    if (!drawing.current || !lastPt.current) return;
    const pt = ptFrom(e);
    const ctx = getCtx();
    if (!ctx) return;
    ctx.beginPath();
    ctx.moveTo(lastPt.current.x, lastPt.current.y);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastPt.current = pt;
  }

  function endDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    if (!drawing.current) return;
    drawing.current = false;
    lastPt.current = null;
  }

  function clearCanvas() {
    if (submitting) return;
    const cv = canvasRef.current;
    if (!cv) return;
    cv.getContext("2d")?.clearRect(0, 0, cv.width, cv.height);
    setHasStrokes(false);
  }

  /** RP2：輸出 JPEG 70%、最長邊 ≤ 1200px */
  function confirmSig() {
    if (submitting) return;
    const cv = canvasRef.current;
    if (!cv || !hasStrokes) return;

    // 判斷是否需要縮放（規格 500×200 遠低於 1200，但保留安全壓縮路徑）
    const w = cv.width;
    const h = cv.height;
    const longestEdge = Math.max(w, h);
    if (longestEdge > MAX_LONG_EDGE) {
      // 縮放到 maxLongEdge
      const scale = MAX_LONG_EDGE / longestEdge;
      const offCanvas = document.createElement("canvas");
      offCanvas.width = Math.round(w * scale);
      offCanvas.height = Math.round(h * scale);
      const octx = offCanvas.getContext("2d")!;
      octx.fillStyle = "#ffffff";
      octx.fillRect(0, 0, offCanvas.width, offCanvas.height);
      octx.drawImage(cv, 0, 0, offCanvas.width, offCanvas.height);
      onSigned(offCanvas.toDataURL("image/jpeg", JPEG_QUALITY));
    } else {
      // 直接在 offscreen canvas 上加白底再轉 JPEG（透明背景轉 JPEG 會變黑）
      const offCanvas = document.createElement("canvas");
      offCanvas.width = w;
      offCanvas.height = h;
      const octx = offCanvas.getContext("2d")!;
      octx.fillStyle = "#ffffff";
      octx.fillRect(0, 0, w, h);
      octx.drawImage(cv, 0, 0);
      onSigned(offCanvas.toDataURL("image/jpeg", JPEG_QUALITY));
    }
  }

  return (
    <div className="space-y-3">
      <div
        className={`relative border-2 border-dashed border-neutral-300 rounded-xl overflow-hidden bg-neutral-50 select-none touch-none ${
          submitting ? "opacity-60" : ""
        }`}
      >
        <div className="absolute bottom-8 left-6 right-6 border-b border-neutral-300/60 pointer-events-none" />
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className={`w-full h-[160px] block ${submitting ? "cursor-wait" : "cursor-crosshair"}`}
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={moveDraw}
          onTouchEnd={endDraw}
        />
        {!hasStrokes && !submitting && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-neutral-400">← 請在此處手寫簽名</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={clearCanvas}
          disabled={!hasStrokes || submitting}
          className="text-xs text-neutral-400 hover:text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          清除重簽
        </button>
        <button
          onClick={confirmSig}
          disabled={!hasStrokes || submitting}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors bg-[#185FA5] text-white hover:bg-[#1450a0] disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
        >
          {submitting ? "簽署上傳中⋯" : "確認簽名"}
        </button>
      </div>
    </div>
  );
}
