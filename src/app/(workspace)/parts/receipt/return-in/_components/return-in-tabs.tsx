"use client";

/**
 * return-in-tabs.tsx
 *
 * 外層 Tab 切換容器。Tab A = 既有領料退入庫，Tab B = 售後退料確認。
 * Tab 切換用 client state（useState），不改 URL。
 */

import { useState } from "react";

import {
  type ReturnInRow,
  type ReturnInKpis,
  type ReturnReasonDatum,
  type WarehouseOption,
} from "@/domain/parts-return-in";
import { type ReturnRequestRow, type ReturnRequestsSummary } from "@/domain/parts-return-requests";
import { ReturnInBoard } from "./return-in-board";
import { ReturnConfirmationBoard } from "./return-confirmation-board";

type Tab = "tab_a" | "tab_b";

export function ReturnInTabs({
  // Tab A props
  rows,
  total,
  kpis,
  warehouses,
  reasonMix,
  filter,
  canEdit,
  loadError,
  // Tab B props
  returnRequests,
  returnSummary,
}: {
  rows: ReturnInRow[];
  total: number;
  kpis: ReturnInKpis;
  warehouses: WarehouseOption[];
  reasonMix: ReturnReasonDatum[];
  filter: {
    status: string;
    warehouse_id: string;
    reason: string;
    q: string;
    date_from: string;
    date_to: string;
  };
  canEdit: boolean;
  loadError: string | null;
  returnRequests: ReturnRequestRow[];
  returnSummary: ReturnRequestsSummary;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("tab_a");

  const pendingCount = returnSummary.pending + returnSummary.overdue;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header（統一在 tabs 外層） */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">退料入庫管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          M04U-19
        </span>
        <span className="text-[12px] text-[#9A9890]">
          領料退入庫・售後退料確認
        </span>
      </header>

      {/* Tab 列 */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          <button
            type="button"
            data-testid="tab-purchase-return"
            onClick={() => setActiveTab("tab_a")}
            className={`px-5 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] transition-colors ${
              activeTab === "tab_a"
                ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                : "text-[#5A5955] hover:bg-[#F8F7F4]"
            }`}
          >
            領料退入庫
          </button>
          <button
            type="button"
            data-testid="tab-return-confirmation"
            onClick={() => setActiveTab("tab_b")}
            className={`px-5 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] transition-colors inline-flex items-center gap-1.5 ${
              activeTab === "tab_b"
                ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                : "text-[#5A5955] hover:bg-[#F8F7F4]"
            }`}
          >
            售後退料確認
            {/* 待確認件數 badge */}
            {pendingCount > 0 && (
              <span className="inline-flex items-center justify-center h-[16px] min-w-[16px] px-1 rounded-full bg-[#CC0000] text-white text-[10px] font-semibold">
                {pendingCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Tab 內容區 */}
      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4">
        {activeTab === "tab_a" ? (
          // Tab A：直接 render 原有 ReturnInBoard（不帶外層 <main>，board 自帶）
          // ReturnInBoard 自帶 <main>，此處以 div 截掉外層避免巢狀
          <_TabAWrapper
            rows={rows}
            total={total}
            kpis={kpis}
            warehouses={warehouses}
            reasonMix={reasonMix}
            filter={filter}
            canEdit={canEdit}
            loadError={loadError}
          />
        ) : (
          <ReturnConfirmationBoard
            rows={returnRequests}
            summary={returnSummary}
            canEdit={canEdit}
          />
        )}
      </div>
    </main>
  );
}

/**
 * Tab A wrapper：ReturnInBoard 已帶 <main> wrapper，
 * 此處剝除外層 padding/spacing、讓它內嵌在 Tab 容器裡。
 * 透過 CSS 蓋掉 board 自己的 px-6 py-5 space-y-3 外距。
 */
function _TabAWrapper(props: {
  rows: ReturnInRow[];
  total: number;
  kpis: ReturnInKpis;
  warehouses: WarehouseOption[];
  reasonMix: ReturnReasonDatum[];
  filter: {
    status: string;
    warehouse_id: string;
    reason: string;
    q: string;
    date_from: string;
    date_to: string;
  };
  canEdit: boolean;
  loadError: string | null;
}) {
  return (
    // 用負 margin 抵掉 ReturnInBoard 自帶的 px-6 py-5，避免雙層 padding
    <div className="-mx-4 -my-4">
      <ReturnInBoard {...props} />
    </div>
  );
}
