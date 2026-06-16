import { notFound } from "next/navigation";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getRepairOrderById } from "@/domain/repair-orders";
import { listAddons } from "@/domain/repair-order-addons";
import { getRepairOrderLinesPageData } from "@/domain/repair-order-lines";

import { AddonCancelView } from "./_components/addon-cancel-view";

export const dynamic = "force-dynamic";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const canView = await hasPermission(PERMISSIONS.RO_VIEW);
  if (!canView) {
    return (
      <main className="px-6 py-5">
        <div className="text-[#CC0000]">無權檢視此頁。</div>
      </main>
    );
  }
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);

  // 並行撈三份資料
  const [ro, { rows: allAddons }, linesData] = await Promise.all([
    getRepairOrderById(id),
    listAddons({ roId: id }),
    getRepairOrderLinesPageData(id),
  ]);

  if (!ro || !linesData) notFound();

  // 只顯示可取消的追加項目（pending / agreed）
  const cancelableAddons = allAddons.filter(
    (a) => a.customer_decision === "pending" || a.customer_decision === "agreed",
  );

  // 逐行取消只對 source='addon' 的明細行
  // repair_order_lines 的 source 欄位存在 DB 但未加入 RepairOrderLineRow 型別，需 cast
  type LineWithSource = (typeof linesData.laborLines)[number] & { source?: string | null };
  const allLines: LineWithSource[] = [
    ...(linesData.laborLines as LineWithSource[]),
    ...(linesData.partLines as LineWithSource[]),
  ];
  const addonLines = allLines.filter((l) => l.source === "addon");

  return (
    <AddonCancelView
      roId={id}
      roCode={ro.ro_code}
      cancelableAddons={cancelableAddons}
      addonLines={addonLines}
      canEdit={canEdit}
    />
  );
}
