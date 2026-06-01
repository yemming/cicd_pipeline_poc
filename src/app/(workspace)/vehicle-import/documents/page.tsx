import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import {
  listDocuments,
  listShipmentOptions,
  listVehiclesForDocuments,
  type DocumentFilters,
} from "@/domain/import-documents";

import { DocumentsBoard } from "./_components/documents-board";

export const dynamic = "force-dynamic";

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">進口採購管理僅限管理者使用</p>
      </main>
    );
  }
  const sp = await searchParams;
  const filters: DocumentFilters = {
    q: sp.q ?? "",
    doc_type: sp.doc_type ?? "all",
    stage: sp.stage ?? "all",
    shipment_id: sp.shipment_id ?? undefined,
  };
  const [rows, shipmentOptions, vehicleOptions] = await Promise.all([
    listDocuments(filters),
    listShipmentOptions(),
    listVehiclesForDocuments(),
  ]);
  return (
    <DocumentsBoard
      rows={rows}
      filters={filters}
      shipmentOptions={shipmentOptions}
      vehicleOptions={vehicleOptions}
    />
  );
}
