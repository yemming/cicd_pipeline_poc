import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getOrgStructure } from "@/domain/org-structure";
import { getOrgSettings } from "@/domain/org-settings";

import { OrgStructureBoard } from "./_components/org-structure-board";

export const dynamic = "force-dynamic";

/**
 * GRP20 組織架構設定（集團管理 · 系統設定層）
 *
 * 唯讀統一樹（round-22 拍板方案 A）：把 groups / subsidiaries / organizations /
 * departments 四張真表組成五層樹（集團 → 法人 → 門店(region→store) / 部門），
 * 右側顯示節點詳情 KV + 人員指派 + 頁面權限總覽，每區塊深連結回 /admin/* 編輯。
 *
 * 權限守門沿用 GRP12-18 pattern：getCurrentUserAndAdmin() → 未登入導 /login、
 * 非 admin 顯示紅字。helper 內部再 admin gate + service client（看完整集團）。
 *
 * 天條：page 不直連 supabase，資料只透過 @/domain/org-structure helper。
 */
export default async function OrgStructurePage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">組織架構設定僅限管理者使用</p>
      </main>
    );
  }

  const scope = await getActiveScope();
  const [data, orgSettings] = await Promise.all([
    getOrgStructure(),
    getOrgSettings(scope.brand_id),
  ]);
  return <OrgStructureBoard data={data} orgSettings={orgSettings} />;
}
