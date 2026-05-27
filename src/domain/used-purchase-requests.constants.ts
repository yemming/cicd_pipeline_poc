/**
 * 中古車收購申請常數 + Row 型別 — client-safe（無 server 相依）。
 *
 * 抽出來讓 client component（board / wizard / detail-view）可安全 import，
 * 不會把 server-only 的 used-purchase-requests.ts（內含 supabase / used-car-inventory）
 * 拉進 client bundle（server-only client value-import 陷阱）。
 */

import type { UsedCarConditionGrade } from "@/domain/used-car-inventory.constants";

/** 來源類型（直購）：拍賣場 / 個人 / 同業 / 其他 */
export type UsedPurchaseSourceType = "auction" | "personal" | "dealer" | "other";

/** 收購決策：approved（正常收購）/ conditional（條件收購）/ rejected（不收購） */
export type UsedPurchaseDecision = "approved" | "conditional" | "rejected";

export type UsedPurchaseRequestRow = {
  id: string;
  brand_id: string;
  application_no: string;
  source_type: UsedPurchaseSourceType | null;
  seller_name: string | null;
  seller_phone: string | null;
  seller_id_no: string | null;
  vin: string | null;
  vehicle_model_id: string | null;
  year: number | null;
  color: string | null;
  mileage_km: number | null;
  grade_ext: UsedCarConditionGrade | null; // A-D
  grade_mech: UsedCarConditionGrade | null; // A-D
  market_ref_price: number | null;
  recon_estimate: number | null;
  suggested_price: number | null;
  actual_price: number | null;
  decision: UsedPurchaseDecision | null;
  used_car_id: string | null;
  recon_workorder_id: string | null;
  images: unknown;
  metadata: Record<string, unknown>;
  created_at: string | null;
  updated_at: string | null;
  created_by: string | null;
};

export const SOURCE_TYPE_LABELS: Record<UsedPurchaseSourceType, string> = {
  auction: "拍賣場",
  personal: "個人出售",
  dealer: "同業",
  other: "其他",
};

export const DECISION_LABELS: Record<UsedPurchaseDecision, string> = {
  approved: "已收購",
  conditional: "條件收購",
  rejected: "不收購",
};
