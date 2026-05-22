"use client";

/**
 * 最近紀錄單筆 — 支援左滑刪除 + 桌機 ✕ 按鈕 fallback
 * 純 touch event、不依賴第三方 library
 */

import { useRef, useState, useTransition } from "react";
import {
  deleteAiCurveNote,
  type AiCurveNoteListItem,
} from "@/domain/ai-curve-notes";

function formatRelTime(iso: string): string {
  const d = new Date(iso);
  const now = Date.now();
  const diffMin = Math.floor((now - d.getTime()) / 60000);
  if (diffMin < 1) return "剛剛";
  if (diffMin < 60) return `${diffMin} 分鐘前`;
  if (diffMin < 60 * 24) return `${Math.floor(diffMin / 60)} 小時前`;
  return d.toLocaleDateString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (!seconds) return "—";
  if (seconds < 60) return `${seconds} 秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SWIPE_THRESHOLD = 80; // 拖過 80px 就觸發刪除
const ACTION_WIDTH = 80;    // 紅色刪除區寬度

export function HistoryItem({
  item,
  onLoad,
  onDeleted,
}: {
  item: AiCurveNoteListItem;
  onLoad: (item: AiCurveNoteListItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [isPending, startTransition] = useTransition();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const horizontalLock = useRef<boolean>(false);

  const summary =
    (item.ai_suggestions?.customer_summary?.value as string)?.slice(0, 50) ||
    "（沒抓到摘要）";

  function handleDelete() {
    setRemoving(true);
    setErrMsg("");
    startTransition(async () => {
      const r = await deleteAiCurveNote(item.id);
      if (r.ok) {
        onDeleted(item.id);
      } else {
        setErrMsg(r.error);
        setRemoving(false);
        setOffsetX(0);
      }
    });
  }

  function onTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    horizontalLock.current = false;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    // 第一次判斷主軸：橫向位移大才鎖滑動、否則放手讓 page scroll
    if (!horizontalLock.current) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        horizontalLock.current = true;
      } else if (Math.abs(dy) > 10) {
        // 垂直為主、放棄這次拖
        touchStartX.current = null;
        touchStartY.current = null;
        return;
      } else {
        return;
      }
    }

    // 只允許左拖（dx < 0）
    if (dx > 0) {
      setOffsetX(0);
      return;
    }
    setOffsetX(Math.max(dx, -ACTION_WIDTH * 1.5));
  }

  function onTouchEnd() {
    if (touchStartX.current === null) return;
    if (offsetX < -SWIPE_THRESHOLD) {
      // 觸發刪除
      setOffsetX(-ACTION_WIDTH);
      handleDelete();
    } else {
      // 不到 threshold、彈回
      setOffsetX(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    horizontalLock.current = false;
  }

  return (
    <div
      className={`relative overflow-hidden rounded-lg transition-all ${
        removing ? "max-h-0 opacity-0" : "max-h-32"
      }`}
      style={{
        marginBottom: removing ? 0 : undefined,
      }}
    >
      {/* 紅色刪除區（藏在卡片底下、左滑露出來） */}
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="absolute inset-y-0 right-0 w-[80px] flex items-center justify-center bg-[#CC0000] text-white text-[12px] font-medium disabled:opacity-50"
        aria-label="刪除"
      >
        <span className="flex flex-col items-center gap-0.5">
          <span className="material-symbols-outlined text-[20px]">delete</span>
          刪除
        </span>
      </button>

      {/* 主卡片 */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => {
          if (offsetX === 0) onLoad(item);
        }}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: touchStartX.current === null ? "transform 0.25s ease" : "none",
        }}
        className="relative bg-white border border-[#EEECE6] rounded-lg px-3 py-2.5 active:bg-[#F4F2FA] cursor-pointer touch-pan-y"
      >
        <div className="flex items-center justify-between text-[11px] text-[#9A9890] mb-1">
          <span>{formatRelTime(item.created_at)}</span>
          <div className="flex items-center gap-2">
            <span className="font-mono">
              {formatDuration(item.duration_seconds)}
            </span>
            {/* 桌機 fallback：右上角小 ✕ */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              disabled={isPending}
              className="hidden sm:block w-5 h-5 rounded-full text-[#9A9890] hover:text-[#CC0000] hover:bg-[#FDECEA] disabled:opacity-40"
              aria-label="刪除"
              title="刪除"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="text-[12.5px] text-[#2C2C2A] line-clamp-2 leading-snug">
          {summary}
          {summary.length >= 50 ? "⋯" : ""}
        </div>
        {errMsg && (
          <div className="text-[11px] text-[#CC0000] mt-1">{errMsg}</div>
        )}
      </div>
    </div>
  );
}
