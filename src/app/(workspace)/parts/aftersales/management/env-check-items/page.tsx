/**
 * 環檢項目設定 — 售後接待預檢 wizard Step 1 的項目清單來源
 *
 * 主管在此維護 8 項（或更多）環車檢查項目；wizard 開新預檢單時自動讀啟用中的清單。
 * Domain helper：@/domain/env-check-items
 */
import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getEnvCheckItemsRow,
  listEnvCheckItems,
} from "@/domain/env-check-items";

import { EnvCheckItemsBoard } from "./_components/env-check-items-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "環檢項目設定 | DealerOS" };

export default async function Page() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");

  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有檢視環檢項目設定的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const [items, row] = await Promise.all([
    listEnvCheckItems({ activeOnly: false }),
    getEnvCheckItemsRow(),
  ]);

  return (
    <EnvCheckItemsBoard
      initialItems={items}
      updatedAt={row.updated_at}
      canEdit={canEdit}
    />
  );
}
