import { getWarrantyFlowPageData } from "@/domain/warranty";

import { WarrantyFlowBoard } from "./_components/warranty-flow-board";

export const dynamic = "force-dynamic";

export default async function WarrantyFlowPage() {
  const { config, steps, claimTypes, timingRules, canEdit } =
    await getWarrantyFlowPageData();

  return (
    <WarrantyFlowBoard
      config={config}
      steps={steps}
      claimTypes={claimTypes}
      timingRules={timingRules}
      canEdit={canEdit}
    />
  );
}
