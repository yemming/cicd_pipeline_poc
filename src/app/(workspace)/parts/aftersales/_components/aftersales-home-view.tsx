"use client";

/**
 * /parts/aftersales 模組導覽 — client view
 *
 * 規格：第十輪 BDN M03-1（升 A 級）
 *   - 頂部 hero + 4 顆 KPI（動態，由 server 撈）
 *   - 「今日焦點」4 顆 quick-link 卡（KpiCard tone × icon × 點擊跳清單頁）
 *   - 5 大入口分區（panel）— 由 <ModuleHomeGallery> 統一渲染
 *
 * 邊界：本元件不直接 import supabase，所有數字都由 props 餵入；
 * 失敗時 caller 傳 errored=true，整個 KPI 列顯示 "—" + 重整提示。
 */

import Link from "next/link";

import { useSetPageHeader } from "@/components/page-header-context";
import { ModuleHomeGallery } from "@/components/module-home-gallery";

import {
  AFTERSALES_HERO,
  AFTERSALES_PANELS,
  buildAftersalesKpis,
  type AftersalesOverviewKpis,
  type AftersalesFocusItem,
} from "@/domain/aftersales-overview.constants";

export type AftersalesHomeViewProps = {
  kpis: AftersalesOverviewKpis | null;
  focusItems: AftersalesFocusItem[] | null;
  errored: boolean;
};

// 對映 tone → 邊框 / 數字色（吃 visualization/tone.ts 的 token 不重新發明）
const TONE_BORDER: Record<AftersalesFocusItem["tone"], string> = {
  blue: "border-tone-blue-100",
  teal: "border-tone-teal-100",
  amber: "border-tone-amber-100",
  red: "border-tone-red-100",
  purple: "border-tone-purple-100",
  green: "border-tone-green-100",
  gray: "border-tone-gray-100",
};

const TONE_BG: Record<AftersalesFocusItem["tone"], string> = {
  blue: "bg-tone-blue-50",
  teal: "bg-tone-teal-50",
  amber: "bg-tone-amber-50",
  red: "bg-tone-red-50",
  purple: "bg-tone-purple-50",
  green: "bg-tone-green-50",
  gray: "bg-tone-gray-50",
};

const TONE_TEXT: Record<AftersalesFocusItem["tone"], string> = {
  blue: "text-tone-blue-700",
  teal: "text-tone-teal-700",
  amber: "text-tone-amber-700",
  red: "text-tone-red-700",
  purple: "text-tone-purple-700",
  green: "text-tone-green-700",
  gray: "text-tone-gray-700",
};

export default function AftersalesHomeView({
  kpis,
  focusItems,
  errored,
}: AftersalesHomeViewProps) {
  useSetPageHeader({
    title: "售後修護模組",
    breadcrumb: [{ label: "售後修護" }],
  });

  // KPI placeholder 給 errored 狀態使用（顯示 "—"），保持版面不塌
  const safeKpis: AftersalesOverviewKpis = kpis ?? {
    today_appointments: 0,
    in_progress_ro: 0,
    awaiting_checkout: 0,
    pending_followups: 0,
  };
  const dynamicKpis = errored
    ? buildAftersalesKpis(safeKpis).map((k) => ({ ...k, value: "—" }))
    : buildAftersalesKpis(safeKpis);

  return (
    <div className="space-y-1">
      <ModuleHomeGallery
        hero={AFTERSALES_HERO}
        kpis={dynamicKpis}
        panels={AFTERSALES_PANELS}
      />

      {/* 今日焦點 — 4 顆 quick-link 卡，置於 hero / KPI 列下方、panel 上方 */}
      {focusItems && focusItems.length > 0 && (
        <section className="px-6 -mt-1" data-testid="aftersales-today-focus">
          <FocusBanner items={focusItems} errored={errored} />
        </section>
      )}

      {/* 錯誤 fallback banner（KPI 撈失敗時讓 user 知道哪邊壞了） */}
      {errored && (
        <section className="px-6 pt-2">
          <div className="bg-[#FDECEA] border border-[#F5AEAD] text-[#7A1010] rounded-lg px-4 py-2.5 text-[12px] flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">warning</span>
            <span className="flex-1">
              無法載入售後 KPI 數據（連線 / 權限問題）— 上方數字暫顯示「—」，下方分區入口仍可使用。
            </span>
          </div>
        </section>
      )}
    </div>
  );
}

function FocusBanner({
  items,
  errored,
}: {
  items: AftersalesFocusItem[];
  errored: boolean;
}) {
  return (
    <div className="bg-white border border-[#EEECE6] rounded-[10px] px-4 py-3">
      <div className="flex items-center justify-between mb-2.5">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-[#185FA5]">
            today
          </span>
          今日焦點
        </h2>
        <span className="text-[10.5px] text-[#9A9890]">
          點任一卡跳轉到對應清單頁
        </span>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        {items.map((it) => (
          <FocusCard key={it.label} item={it} errored={errored} />
        ))}
      </div>
    </div>
  );
}

function FocusCard({
  item,
  errored,
}: {
  item: AftersalesFocusItem;
  errored: boolean;
}) {
  // value=0 視為「empty 狀態」：保留卡片可點，但用灰字提示「無待處理」
  const isEmpty = !errored && item.value === 0;
  const displayValue = errored ? "—" : item.value;

  return (
    <Link
      href={item.href}
      className={`block rounded-lg border ${TONE_BORDER[item.tone]} bg-white px-3.5 py-2.5 transition-all hover:-translate-y-[1px] hover:shadow-[0_3px_12px_rgba(0,0,0,0.08)]`}
      data-testid={`focus-${item.label}`}
    >
      <div className="flex items-center gap-2">
        <div
          className={`w-[34px] h-[34px] rounded-md flex items-center justify-center shrink-0 ${TONE_BG[item.tone]} ${TONE_TEXT[item.tone]}`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {item.icon}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] text-[#9A9890] truncate">{item.label}</div>
          <div
            className={`text-[20px] font-bold font-mono leading-tight ${
              isEmpty ? "text-[#9A9890]" : TONE_TEXT[item.tone]
            }`}
          >
            {displayValue}
          </div>
        </div>
      </div>
      <div className="text-[10.5px] text-[#9A9890] mt-1 truncate">
        {isEmpty ? "暫無待處理項目 ✓" : item.hint}
      </div>
    </Link>
  );
}
