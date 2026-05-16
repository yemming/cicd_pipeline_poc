import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  listAllOfficialTags,
  listBrandPersonalTagsAggregated,
} from "@/domain/customer-tags";

import { ServiceManagerCustomerTagsBoard } from "./_components/service-manager-customer-tags-board";

export const dynamic = "force-dynamic";

/**
 * 售後主管模組 — 客戶標籤主管設定（C14）
 *
 * 規格：docs/DUCATI_v2_output/03_售後修護/02_售後主管設定/12_客戶標籤主管設定.html
 *
 * 設計：reuse 既有 `@/domain/customer-tags` helper（listAllOfficialTags / CRUD /
 * listBrandPersonalTagsAggregated），視角聚焦於：
 *   - 主管維護整個 brand 的「官方標籤字典」（4 色分類：red/yellow/green/blue）
 *   - 觀察全 brand 個人自訂標籤趨勢，輔助主管決定要不要把熱門 RS 自訂升為官方
 *
 * 跟 /sales/customers/tags（A6 銷售視角）共用同一份 helper + DB，
 * 但拆獨立路由：因為主管權限 + 視角焦點不同（A6 是 RS 維護個人標籤，
 * 此頁是主管維護字典）。
 */

export default async function ServiceManagerCustomerTagsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.CUSTOMER_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視客戶標籤主管設定的權限</p>
      </main>
    );
  }

  const [officialTags, brandAggregated, canEdit] = await Promise.all([
    listAllOfficialTags(),
    listBrandPersonalTagsAggregated(),
    hasPermission(PERMISSIONS.CUSTOMER_EDIT),
  ]);

  return (
    <ServiceManagerCustomerTagsBoard
      officialTags={officialTags}
      brandAggregated={brandAggregated}
      canEdit={canEdit}
    />
  );
}
