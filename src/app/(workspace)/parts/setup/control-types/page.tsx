import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getControlTypesPageData } from "@/domain/rules";

import { ControlTypesBoard } from "./_components/control-types-board";

export const dynamic = "force-dynamic";

export default async function ControlTypesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.PARTS_CONTROL_TYPE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視管控類型定義的權限</p>
      </main>
    );
  }

  const { controlTypes } = await getControlTypesPageData();

  return <ControlTypesBoard controlTypes={controlTypes} />;
}
