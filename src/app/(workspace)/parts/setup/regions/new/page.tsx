import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { RegionDetailView } from "../[id]/_components/region-detail-view";

export const dynamic = "force-dynamic";

export default async function NewRegionPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ORG_EDIT))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有編輯組織的權限</p>
      </main>
    );
  }
  return <RegionDetailView region={null} stores={[]} canEdit={true} initialMode="create" />;
}
