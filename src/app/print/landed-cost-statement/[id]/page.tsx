import { redirect, notFound } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getLandedCostStatementForPrint } from "@/domain/import-shipments";

import { LandedCostStatementPrintable } from "./_components/landed-cost-statement-printable";

export const dynamic = "force-dynamic";

export default async function LandedCostStatementPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main style={{ padding: "32px", color: "#CC0000", fontSize: "14px" }}>
        沒有列印 Landed Cost 結算表的權限
      </main>
    );
  }
  const { id } = await params;
  const data = await getLandedCostStatementForPrint(id);
  if (!data) notFound();
  return <LandedCostStatementPrintable data={data} />;
}
