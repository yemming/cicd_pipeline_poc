"use client";

import { useSetPageHeader } from "@/components/page-header-context";

/** 登入帳號未綁定 aftersales_technicians → 友善提示（非報錯頁） */
export function UnboundTechNotice() {
  useSetPageHeader({
    title: "技師工作台",
    breadcrumb: [{ label: "技師工作台" }],
    hideSearch: true,
  });

  return (
    <main className="px-6 py-5">
      <div className="bg-white border border-[#EEECE6] rounded-lg p-8 max-w-xl">
        <div className="flex items-start gap-3">
          <span className="material-symbols-outlined text-[#854F0B] text-[28px]">badge</span>
          <div>
            <h1 className="text-[16px] font-semibold text-[#2C2C2A]">您的帳號尚未綁定技師</h1>
            <p className="mt-2 text-[12.5px] text-[#5A5955] leading-relaxed">
              技師工作台需要把您的登入帳號對映到一位「售後技師」（aftersales_technicians）。
              目前查無對映，所以無法載入指派給您的工單。
            </p>
            <p className="mt-2 text-[12px] text-[#9A9890]">
              請聯絡服務廠管理員，在「技師主檔」把您的帳號（user_id）綁到對應技師資料。
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
