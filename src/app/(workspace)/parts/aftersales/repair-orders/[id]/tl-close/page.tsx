import { notFound } from "next/navigation";

import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getRepairOrderById } from "@/domain/repair-orders";
import { getRepairOrderLinesPageData } from "@/domain/repair-order-lines";

import { TlCloseView } from "./_components/tl-close-view";

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
        <div className="text-[#CC0000] text-[13px]">無權檢視此頁。</div>
      </main>
    );
  }

  const canClose = await hasPermission(PERMISSIONS.RO_CREATE);

  const [ro, linesData] = await Promise.all([
    getRepairOrderById(id),
    getRepairOrderLinesPageData(id),
  ]);

  if (!ro || !linesData) notFound();

  /* 非 TL 工單顯示提示，不 notFound（讓使用者看到明確訊息） */
  if (ro.prefix_p1 !== "TL") {
    return (
      <main className="px-6 py-5">
        <div className="bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] rounded-lg px-4 py-3 text-[13px]">
          此工單非借用測試工單（prefix_p1 ≠ TL），無法使用 TL 結案流程。
        </div>
      </main>
    );
  }

  return (
    <TlCloseView
      ro={ro}
      partLines={linesData.partLines}
      laborLines={linesData.laborLines}
      canClose={canClose}
    />
  );
}
