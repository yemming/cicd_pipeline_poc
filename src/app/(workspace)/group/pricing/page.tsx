import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import {
  listPricingPolicies,
  listPricingDeviations,
  getPricingOverview,
} from "@/domain/group-pricing";

import { PricingBoard } from "./_components/pricing-board";

export const dynamic = "force-dynamic";

/**
 * GRP14 定價折扣設定（集團管理 · 商務管理層）
 *
 * 集團總部對每個品項/車型設「建議售價 + 折扣授權上下限」的定價治理工具。真 CRUD +
 * 審核狀態機（draft → review → active）+ 異動稽核 log。資料落在 business_rules
 * （rule_kind='pricing_policy'，round-20 Q1 拍板）。
 *
 * 權限守門沿用集團頁 pattern：getCurrentUserAndAdmin() → 未登入導 /login、非 admin 紅字。
 * 寫入由 server actions 各自再檢 admin（Result 型別、不 redirect）。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/group-pricing helper。
 */
export default async function PricingPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">集團定價折扣設定僅限管理者使用</p>
      </main>
    );
  }

  const { brand_id } = await getActiveScope();

  const [policies, deviations, overview] = await Promise.all([
    listPricingPolicies(brand_id),
    listPricingDeviations(brand_id),
    getPricingOverview(brand_id),
  ]);

  return <PricingBoard policies={policies} deviations={deviations} overview={overview} />;
}
