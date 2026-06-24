import { notFound } from "next/navigation";
import { getCurrentBrandId, getUsedCarById } from "@/domain/used-car-inventory";
import { getActiveLegalText } from "@/domain/legal-texts";
import UsedCarDetailView from "./_components/used-car-detail-view";

export const metadata = {
  title: "中古車詳情 | DealerOS",
};

export default async function UsedCarDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [brandId, car, disclaimerRow] = await Promise.all([
    getCurrentBrandId(),
    getUsedCarById(id),
    getActiveLegalText("condition_report_disclaimer"),
  ]);
  if (!car) notFound();

  return (
    <UsedCarDetailView
      car={car}
      brandId={brandId}
      initialMode="view"
      disclaimerText={disclaimerRow?.content ?? null}
    />
  );
}
