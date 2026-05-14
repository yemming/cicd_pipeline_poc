import { getUsedPartsFlowPageData } from "@/domain/warranty";

import { UsedPartsFlowBoard } from "./_components/used-parts-flow-board";

export const dynamic = "force-dynamic";

export default async function UsedPartsFlowPage() {
  const { config, items, canEdit } = await getUsedPartsFlowPageData();
  return (
    <UsedPartsFlowBoard config={config} items={items} canEdit={canEdit} />
  );
}
