import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getItemPermissionsPageData } from "@/domain/rules";

import { ItemPermissionsBoard } from "./_components/item-permissions-board";

export const dynamic = "force-dynamic";

export default async function ItemPermissionsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_ITEM_PERMISSION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視商品管理權限的權限</p>
      </main>
    );
  }

  const { rules, roles, canEdit } = await getItemPermissionsPageData();

  return (
    <ItemPermissionsBoard rules={rules} roles={roles} canEdit={canEdit} />
  );
}
