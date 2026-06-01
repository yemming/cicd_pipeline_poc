import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getImportPOForPrint } from "@/domain/vehicle-purchase-orders";

import { ImportPoPrintable } from "./_components/import-po-printable";

export const dynamic = "force-dynamic";

export default async function ImportPoPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印進口採購單的權限
      </main>
    );
  }
  const { id } = await params;
  const data = await getImportPOForPrint(id);
  if (!data) notFound();
  return <ImportPoPrintable data={data} />;
}
