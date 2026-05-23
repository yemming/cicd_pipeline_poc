"use client";

/**
 * 最近紀錄單筆（名片版）— 左滑刪除 + 桌機 ✕ fallback
 * 跟 ai-curve/history-item 同樣的滑動互動模式
 */

import { useRef, useState, useTransition } from "react";
import {
  deleteBusinessCardScan,
  type BusinessCardScanListItem,
} from "@/domain/ai-business-cards";

function formatRelTime(iso: string): string {
  const d = new Date(iso);
  const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
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

const SWIPE_THRESHOLD = 80;
const ACTION_WIDTH = 80;

export function BusinessCardHistoryItem({
  item,
  onLoad,
  onDeleted,
}: {
  item: BusinessCardScanListItem;
  onLoad: (item: BusinessCardScanListItem) => void;
  onDeleted: (id: string) => void;
}) {
  const [offsetX, setOffsetX] = useState(0);
  const [removing, setRemoving] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const horizontalLock = useRef<boolean>(false);

  const aiName = item.ai_suggestions?.name?.value || "";
  const aiCompany = item.ai_suggestions?.company?.value || "";
  const reviewedName = item.reviewed_values?.name || "";
  const title = reviewedName || aiName || "（無姓名）";
  const subtitle =
    item.customer_name && item.customer_id
      ? `→ 已建客戶 ${item.customer_name}`
      : item.customer_name && item.duplicate_of_customer_id
        ? `→ 連結到 ${item.customer_name}`
        : aiCompany || "（未建客戶）";

  function handleDelete() {
    setRemoving(true);
    setErrMsg("");
    startTransition(async () => {
      const r = await deleteBusinessCardScan(item.id);
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
    setIsDragging(true);
  }

  function onTouchMove(e: React.TouchEvent) {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const dx = e.touches[0].clientX - touchStartX.current;
    const dy = e.touches[0].clientY - touchStartY.current;

    if (!horizontalLock.current) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        horizontalLock.current = true;
      } else if (Math.abs(dy) > 10) {
        touchStartX.current = null;
        touchStartY.current = null;
        return;
      } else {
        return;
      }
    }
    if (dx > 0) {
      setOffsetX(0);
      return;
    }
    setOffsetX(Math.max(dx, -ACTION_WIDTH * 1.5));
  }

  function onTouchEnd() {
    if (touchStartX.current === null) {
      setIsDragging(false);
      return;
    }
    if (offsetX < -SWIPE_THRESHOLD) {
      setOffsetX(-ACTION_WIDTH);
      handleDelete();
    } else {
      setOffsetX(0);
    }
    touchStartX.current = null;
    touchStartY.current = null;
    horizontalLock.current = false;
    setIsDragging(false);
  }

  return (
    <div
      className={`relative overflow-hidden rounded-lg transition-all ${
        removing ? "max-h-0 opacity-0" : "max-h-32"
      }`}
      style={{ marginBottom: removing ? 0 : undefined }}
    >
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

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => {
          if (offsetX === 0) onLoad(item);
        }}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isDragging ? "none" : "transform 0.25s ease",
        }}
        className="relative bg-white border border-[#EEECE6] rounded-lg px-3 py-2.5 active:bg-[#EAF4FB] cursor-pointer touch-pan-y flex items-center gap-3"
      >
        {/* 縮圖 */}
        {item.imageSignedUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.imageSignedUrl}
            alt=""
            className="w-12 h-12 rounded object-cover border border-[#EEECE6] shrink-0"
          />
        ) : (
          <div className="w-12 h-12 rounded bg-[#F2F2F2] flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[#9A9890] text-[20px]">
              badge
            </span>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between text-[11px] text-[#9A9890] mb-0.5">
            <span>{formatRelTime(item.created_at)}</span>
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
          <div className="text-[13px] text-[#2C2C2A] font-medium truncate">
            {title}
          </div>
          <div className="text-[11px] text-[#5A5955] truncate">{subtitle}</div>
          {errMsg && (
            <div className="text-[11px] text-[#CC0000] mt-1">{errMsg}</div>
          )}
        </div>
      </div>
    </div>
  );
}
