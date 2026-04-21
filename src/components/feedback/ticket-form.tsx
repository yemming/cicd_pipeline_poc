"use client";

import Link from "next/link";
import { useFormStatus } from "react-dom";
import { createTicket } from "@/lib/feedback-actions";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 px-5 py-2 rounded text-[14px] font-semibold bg-[#0052CC] hover:bg-[#0747A6] active:bg-[#05389E] disabled:bg-[#0747A6]/70 disabled:cursor-wait text-white transition-colors"
    >
      {pending && (
        <span
          className="inline-block w-3.5 h-3.5 border-[2px] border-white/40 border-t-white rounded-full animate-spin"
          aria-hidden
        />
      )}
      {pending ? "建立中…" : "建立草稿"}
    </button>
  );
}

function CancelLink({ disabled }: { disabled?: boolean }) {
  return (
    <Link
      href="/feedback/tickets"
      aria-disabled={disabled}
      className={`px-4 py-2 rounded text-[14px] font-semibold transition-colors ${
        disabled
          ? "text-[#A5ADBA] pointer-events-none"
          : "text-[#42526E] hover:bg-[#DFE1E6]"
      }`}
    >
      取消
    </Link>
  );
}

function CancelWrapper() {
  const { pending } = useFormStatus();
  return <CancelLink disabled={pending} />;
}

export function TicketForm({ defaultUrl }: { defaultUrl?: string }) {
  return (
    <form action={createTicket} className="space-y-0">
      {/* Jira-style form card */}
      <div className="bg-white border border-[#DFE1E6] rounded-md overflow-hidden">

        {/* Title field */}
        <div className="px-6 pt-6 pb-4 border-b border-[#F4F5F7]">
          <label className="block text-[12px] font-bold text-[#172B4D] uppercase tracking-wide mb-2">
            發生什麼事？
            <span className="text-[#BF2600] ml-0.5">*</span>
          </label>
          <input
            name="title"
            required
            placeholder="一句話描述（例如：展廳看板的 KPI chip 在 iPhone 上重疊）"
            className="w-full px-3 py-2 bg-[#F4F5F7] hover:bg-[#EBECF0] border border-transparent rounded focus:bg-white focus:border-[#C9A84C] focus:shadow-[0_0_0_2px_rgba(201,168,76,0.2)] outline-none text-[14px] text-[#172B4D] placeholder:text-[#8993A4] transition-all"
          />
        </div>

        {/* URL field */}
        <div className="px-6 py-4 border-b border-[#F4F5F7]">
          <label className="block text-[12px] font-bold text-[#172B4D] uppercase tracking-wide mb-2">
            哪一個網址？
          </label>
          <input
            name="url"
            defaultValue={defaultUrl}
            placeholder="/sales/showroom 或 https://..."
            className="w-full px-3 py-2 bg-[#F4F5F7] hover:bg-[#EBECF0] border border-transparent rounded focus:bg-white focus:border-[#C9A84C] focus:shadow-[0_0_0_2px_rgba(201,168,76,0.2)] outline-none text-[13px] font-mono text-[#172B4D] placeholder:text-[#8993A4] transition-all"
          />
          <p className="mt-1.5 text-[12px] text-[#6B778C]">
            發現問題的那一頁，複製完整網址或 path 即可
          </p>
        </div>

        {/* Description field */}
        <div className="px-6 py-4">
          <label className="block text-[12px] font-bold text-[#172B4D] uppercase tracking-wide mb-2">
            問題是什麼？你想怎麼改？怎麼修復？
          </label>
          <textarea
            name="description"
            rows={7}
            placeholder={"1. 現況如何...\n2. 期望如何...\n3. 補充：..."}
            className="w-full px-3 py-2 bg-[#F4F5F7] hover:bg-[#EBECF0] border border-transparent rounded focus:bg-white focus:border-[#C9A84C] focus:shadow-[0_0_0_2px_rgba(201,168,76,0.2)] outline-none text-[14px] text-[#172B4D] leading-relaxed placeholder:text-[#8993A4] transition-all resize-none"
          />
          <p className="mt-1.5 text-[12px] text-[#6B778C]">
            越具體越好 — 之後可以在畫布上貼圖、畫流程補充
          </p>
        </div>
      </div>

      {/* Action row — Jira style */}
      <div className="flex items-center gap-3 pt-4">
        <SubmitButton />
        <CancelWrapper />
        <span className="text-[12px] text-[#6B778C] ml-1">
          建立後狀態為「草稿」；管理者檢視後再派工
        </span>
      </div>
    </form>
  );
}
