"use client";

/**
 * Dashboard 右上 6 個 reminder slot grid。
 * - 滿 = StatBubble 樣式 + Link 整顆可點
 * - 空 = 「+ 訂閱提醒」placeholder（點開 modal）
 * - 右上角 ⚙ 按鈕也開同一個 modal
 */

import Link from "next/link";
import { useState } from "react";

import {
  ACCENT_HEX,
  MAX_REMINDER_SLOTS,
  type ReminderDefinition,
  type ReminderItem,
  type ReminderSlots,
} from "@/domain/reminders.constants";

import ReminderSubscriptionModal from "./reminder-subscription-modal";

export default function ReminderGrid({
  initialReminders,
  catalog,
}: {
  initialReminders: ReminderSlots;
  catalog: ReminderDefinition[];
}) {
  const [reminders, setReminders] = useState<ReminderSlots>(initialReminders);
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        title="自訂提醒"
        aria-label="自訂提醒"
        className="absolute -top-2 -right-1 z-10 h-7 w-7 rounded-full bg-white border border-slate-200 shadow-sm hover:border-slate-400 hover:shadow flex items-center justify-center text-slate-500"
      >
        <span className="material-symbols-outlined text-[16px]">tune</span>
      </button>

      <div className="grid grid-cols-3 grid-rows-2 gap-2.5 py-1 px-1">
        {Array.from({ length: MAX_REMINDER_SLOTS }).map((_, idx) => {
          const item = reminders[idx];
          if (item) return <ReminderBubble key={idx} item={item} />;
          return (
            <EmptySlot
              key={idx}
              onClick={() => setModalOpen(true)}
            />
          );
        })}
      </div>

      {modalOpen && (
        <ReminderSubscriptionModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          currentSlots={reminders}
          catalog={catalog}
          onSaved={(next) => {
            setReminders(next);
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

function ReminderBubble({ item }: { item: ReminderItem }) {
  const accent = ACCENT_HEX[item.accent];
  const value = item.count.toLocaleString("zh-Hant");
  const title = item.error
    ? `${item.label}（資料來源尚未落地：${item.error}）`
    : item.description ?? item.label;

  return (
    <Link
      href={item.targetHref}
      title={title}
      className="group relative bg-white rounded-full shadow-[0_4px_14px_-4px_rgba(15,23,42,0.12),0_2px_4px_-1px_rgba(15,23,42,0.06)] hover:shadow-[0_8px_22px_-6px_rgba(15,23,42,0.18),0_3px_6px_-2px_rgba(15,23,42,0.08)] hover:-translate-y-0.5 active:translate-y-0 transition-all px-3 py-2 flex items-center gap-2.5 min-w-0"
      style={{ boxShadow: `0 4px 14px -4px ${accent}33, 0 2px 4px -1px rgba(15,23,42,0.06)` }}
    >
      <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/60 pointer-events-none" aria-hidden />
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${accent}18`, color: accent }}
      >
        <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <div className="text-xl font-extrabold font-display leading-none tabular-nums" style={{ color: accent }}>
          {value}
        </div>
        <div className="text-[10px] text-slate-500 font-semibold tracking-wide whitespace-nowrap mt-0.5 truncate">
          {item.label}
        </div>
      </div>
    </Link>
  );
}

function EmptySlot({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative bg-white/60 border border-dashed border-slate-300 rounded-full hover:bg-white hover:border-slate-400 transition-all px-3 py-2 flex items-center gap-2.5 min-w-0 text-left"
    >
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 bg-slate-100 text-slate-400">
        <span className="material-symbols-outlined text-[20px]">add</span>
      </div>
      <div className="flex flex-col leading-tight min-w-0">
        <div className="text-[11px] text-slate-400 font-semibold whitespace-nowrap">空 slot</div>
        <div className="text-[10px] text-slate-400 whitespace-nowrap mt-0.5">+ 訂閱提醒</div>
      </div>
    </button>
  );
}
