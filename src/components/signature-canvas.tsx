"use client";

import { useRef, useState } from "react";

export function SignatureCanvas({ onSigned }: { onSigned: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPt = useRef<{ x: number; y: number } | null>(null);
  const [hasStrokes, setHasStrokes] = useState(false);

  function getCtx() {
    const cv = canvasRef.current;
    if (!cv) return null;
    const ctx = cv.getContext("2d");
    if (!ctx) return null;
    ctx.strokeStyle = "#1a1a1a";
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
    const cv = canvasRef.current;
    if (!cv) return;
    cv.getContext("2d")?.clearRect(0, 0, cv.width, cv.height);
    setHasStrokes(false);
  }

  function confirmSig() {
    if (!canvasRef.current || !hasStrokes) return;
    onSigned(canvasRef.current.toDataURL("image/png"));
  }

  return (
    <div className="space-y-3">
      <div className="relative border-2 border-dashed border-neutral-300 rounded-xl overflow-hidden bg-neutral-50 select-none touch-none">
        <div className="absolute bottom-8 left-6 right-6 border-b border-neutral-300/60 pointer-events-none" />
        <canvas
          ref={canvasRef}
          width={640}
          height={240}
          className="w-full h-60 cursor-crosshair block"
          onMouseDown={startDraw}
          onMouseMove={moveDraw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={moveDraw}
          onTouchEnd={endDraw}
        />
        {!hasStrokes && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-sm text-neutral-400">← 請在此處手寫簽名</span>
          </div>
        )}
      </div>
      <div className="flex items-center justify-between">
        <button
          onClick={clearCanvas}
          disabled={!hasStrokes}
          className="text-xs text-neutral-400 hover:text-neutral-600 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          清除重簽
        </button>
        <button
          onClick={confirmSig}
          disabled={!hasStrokes}
          className="px-4 py-1.5 rounded-lg text-sm font-medium transition-colors bg-[#185FA5] text-white hover:bg-[#1450a0] disabled:bg-neutral-200 disabled:text-neutral-400 disabled:cursor-not-allowed"
        >
          確認簽名
        </button>
      </div>
    </div>
  );
}
