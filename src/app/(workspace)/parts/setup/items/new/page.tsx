/**
 * 商品主檔 新增入口
 * Thin re-export：ItemDetailView 的新增 modal 住在 list board，
 * 帶 ?new=1 回 list 頁時 board 會自動展開建立 modal。
 */

import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

export default async function ItemNewPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有新增商品的權限</p>
      </main>
    );
  }
  redirect("/parts/setup/items?new=1");
}
