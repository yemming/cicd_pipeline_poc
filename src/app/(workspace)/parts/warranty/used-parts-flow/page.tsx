import { getUsedPartsFlowPageData } from "@/domain/warranty";
import { getUsedPartsLifecyclePageData } from "@/domain/parts-warranty-used-parts";

import { UsedPartsFlowBoard } from "./_components/used-parts-flow-board";

export const dynamic = "force-dynamic";

export default async function UsedPartsFlowPage() {
  try {
    const [{ config, items, canEdit }, lifecycle] = await Promise.all([
      getUsedPartsFlowPageData(),
      getUsedPartsLifecyclePageData(),
    ]);
    return (
      <UsedPartsFlowBoard
        config={config}
        items={items}
        rules={lifecycle.rules}
        flowData={lifecycle.flowData}
        kpis={lifecycle.kpis}
        canEdit={canEdit && lifecycle.canEdit}
      />
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "未知錯誤";
    return (
      <main className="px-6 py-5">
        <header className="flex items-center gap-2.5 mb-3">
          <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
            舊件出入庫邏輯
          </h1>
        </header>
        <div className="px-4 py-3 rounded bg-[#FDECEA] border border-[#F5AEAD] text-[12.5px] text-[#CC0000]">
          載入失敗：{msg}
        </div>
      </main>
    );
  }
}
