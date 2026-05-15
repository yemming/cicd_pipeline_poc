import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getAftersalesPermissionMatrix } from "@/domain/aftersales-permissions";

import { PermissionsBoard } from "./_components/permissions-board";

export const dynamic = "force-dynamic";

export default async function AftersalesPermissionsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.AFTERSALES_PERMISSION_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視售後職級權限對照的權限</p>
      </main>
    );
  }

  const data = await getAftersalesPermissionMatrix();

  return (
    <PermissionsBoard
      roles={data.roles}
      permissions={data.permissions}
      grants={data.grants}
      canEdit={data.canEdit}
    />
  );
}
