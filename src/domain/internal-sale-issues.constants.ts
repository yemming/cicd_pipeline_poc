/**
 * Internal Sale Issue（內售出庫）— constants & formatters
 *
 * 規格來源：Notion BDN §Phase 2 · Batch M04U · M04U-20
 *  - UI Detail 加門店選擇 placeholder map + 配送 ETA 變量 + 頂 KpiCard
 *  - 對應 stock_issues.type='internal_sale'
 *
 * 這支是 plain constants（非 "use server"），可被 client component 直接 import。
 */

import type { ToneKey } from "@/components/visualization/tone";

// ─────────────────────────────────────────────────────────────
// 單據主狀態（沿用 stock_issues.status：completed / cancelled / draft）
// ─────────────────────────────────────────────────────────────
export type InternalSaleIssueStatus = "draft" | "completed" | "cancelled";

export const ISSUE_STATUS_OPTIONS: ReadonlyArray<{
  value: InternalSaleIssueStatus | "all";
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "completed", label: "已過帳" },
  { value: "cancelled", label: "已作廢" },
];

export function issueStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "draft":
      return "草稿";
    case "completed":
      return "已過帳";
    case "cancelled":
      return "已作廢";
    default:
      return s ?? "—";
  }
}

export function issueStatusChipClass(s: string | null | undefined): string {
  switch (s) {
    case "draft":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "completed":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "cancelled":
      return "bg-[#FDECEA] text-[#CC0000]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

// ─────────────────────────────────────────────────────────────
// 配送狀態（M04U-20 新增）
// ─────────────────────────────────────────────────────────────
export type DeliveryStatus = "pending" | "in_transit" | "delivered" | "cancelled";

export const DELIVERY_STATUS_OPTIONS: ReadonlyArray<{
  value: DeliveryStatus | "all";
  label: string;
}> = [
  { value: "all", label: "全部" },
  { value: "pending", label: "待出貨" },
  { value: "in_transit", label: "查收中" },
  { value: "delivered", label: "已送達" },
  { value: "cancelled", label: "已取消" },
];

export function deliveryStatusLabel(s: string | null | undefined): string {
  switch (s) {
    case "pending":
      return "待出貨";
    case "in_transit":
      return "查收中";
    case "delivered":
      return "已送達";
    case "cancelled":
      return "已取消";
    default:
      return "未指定";
  }
}

export function deliveryStatusChipClass(s: string | null | undefined): string {
  switch (s) {
    case "pending":
      return "bg-tone-amber-50 text-tone-amber-700 border border-tone-amber-100";
    case "in_transit":
      return "bg-tone-blue-50 text-tone-blue-700 border border-tone-blue-100";
    case "delivered":
      return "bg-tone-green-50 text-tone-green-700 border border-tone-green-100";
    case "cancelled":
      return "bg-tone-red-50 text-tone-red-700 border border-tone-red-100";
    default:
      return "bg-tone-gray-50 text-tone-gray-500 border border-tone-gray-100";
  }
}

export function deliveryStatusTone(s: string | null | undefined): ToneKey {
  switch (s) {
    case "pending":
      return "amber";
    case "in_transit":
      return "blue";
    case "delivered":
      return "green";
    case "cancelled":
      return "red";
    default:
      return "gray";
  }
}

// ─────────────────────────────────────────────────────────────
// Formatters
// ─────────────────────────────────────────────────────────────
export function fmtMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${Math.round(Number(n)).toLocaleString("en-US")}`;
}

export function fmtMoneyShort(n: number | null | undefined): string {
  if (n === null || n === undefined) return "—";
  const v = Number(n);
  if (Math.abs(v) >= 10000) return `${(v / 1000).toFixed(0)}K`;
  return v.toLocaleString("en-US");
}

export function fmtDate(d: string | null | undefined): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function fmtDateTime(d: string | null | undefined): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return "—";
  return `${dt.getFullYear()}/${String(dt.getMonth() + 1).padStart(2, "0")}/${String(dt.getDate()).padStart(2, "0")} ${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

/**
 * ETA 距離當前時間的人類可讀差值
 *  - 過去 → "已超時 Xh"
 *  - 未來 < 1h → "Xmin 內"
 *  - 未來 < 24h → "Xh 後"
 *  - 否則 → "Xd 後"
 */
export function fmtEtaDelta(eta: string | null | undefined): string {
  if (!eta) return "未排定";
  const dt = new Date(eta).getTime();
  if (Number.isNaN(dt)) return "—";
  const diffMs = dt - Date.now();
  const absMin = Math.round(Math.abs(diffMs) / 60000);
  if (diffMs < 0) {
    if (absMin < 60) return `已超時 ${absMin} 分`;
    if (absMin < 24 * 60) return `已超時 ${Math.round(absMin / 60)} 小時`;
    return `已超時 ${Math.round(absMin / 60 / 24)} 天`;
  }
  if (absMin < 60) return `${absMin} 分內`;
  if (absMin < 24 * 60) return `${Math.round(absMin / 60)} 小時後`;
  return `${Math.round(absMin / 60 / 24)} 天後`;
}

// ─────────────────────────────────────────────────────────────
// estimateDeliveryEta — 配送 ETA 估算（POC 版：常數規則）
// 真實版會接 Google Maps Distance Matrix；POC 用「同店 4h、跨市 +8h」常數
// ─────────────────────────────────────────────────────────────
export type EtaEstimateInput = {
  warehouse_code?: string | null;
  destination_store_code?: string | null;
  /** 預設 now()；測試可注入固定時間 */
  base_time?: Date;
};

export function estimateDeliveryEta(input: EtaEstimateInput): {
  eta_at: string; // ISO
  hours: number;
  rule: string;
} {
  const base = input.base_time ?? new Date();
  const wh = (input.warehouse_code ?? "").toUpperCase();
  const dest = (input.destination_store_code ?? "").toUpperCase();

  // POC 規則：
  //  1. 沒指定 dest → 4h（同倉自取）
  //  2. dest 包含相同城市 token（TAIPEI / KH / NEIHU / XINYI）→ 6h（市內配送）
  //  3. 跨市 → 24h
  let hours = 4;
  let rule = "default";
  if (dest) {
    const tokens = ["TAIPEI", "NEIHU", "XINYI", "KH", "TAIWAN"];
    const matchedToken = tokens.find((t) => dest.includes(t) && wh.includes(t));
    if (matchedToken) {
      hours = 6;
      rule = `同城配送（${matchedToken}）`;
    } else {
      hours = 24;
      rule = "跨城配送";
    }
  } else {
    rule = "同倉自取";
  }
  const etaDate = new Date(base.getTime() + hours * 3600 * 1000);
  return {
    eta_at: etaDate.toISOString(),
    hours,
    rule,
  };
}
