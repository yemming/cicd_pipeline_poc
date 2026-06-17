"use client";

// ─────────────────────────────────────────────────────────────
// 借料未還 chip（TL 工單）— 列表層級 / 細節頁共用單一渲染來源
//
// Russell 6/17 裁示：「借料未還」是稽核機制（帳目對不對、零件有沒有流失），
// 必須能在「總覽 / 列表層級」被直接看到，不能只藏在點進去才看得到的細節頁。
// 三階著色與細節頁完全一致：共用 domain/work-orders 的 TlLoanStatus + 同一套
// loanOutstandingTier 門檻（≤3 天藍 / 4-7 天 amber / >7 天紅 ⚠）。
// ─────────────────────────────────────────────────────────────

import { LOAN_OUTSTANDING_CHIP } from "@/domain/repair-orders.constants";
import type { TlLoanStatus } from "@/domain/work-orders";

export function TlLoanChip({
  status,
  className = "",
}: {
  status?: TlLoanStatus | null;
  className?: string;
}) {
  if (!status?.outstanding) return null;
  const warning = status.worst_tier === "warning";
  const label = `借料未還 ${status.unreturned_item_count} 項（最久 ${status.max_days} 天）${
    warning ? " ⚠" : ""
  }`;
  return (
    <span
      data-testid="tl-loan-outstanding-badge"
      className={`inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded-md text-[11px] font-medium ${LOAN_OUTSTANDING_CHIP[status.worst_tier]} ${className}`}
      title={`仍有 ${status.unreturned_item_count} 項借料未還（最久 ${status.max_days} 天）${
        status.in_transit_count > 0 ? `，另有 ${status.in_transit_count} 筆退料在途待倉管點收` : ""
      }`}
    >
      {label}
    </span>
  );
}
