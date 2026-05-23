import { BusinessCardApp } from "./_components/business-card-app";
import { listRecentBusinessCardScans } from "@/domain/ai-business-cards";

export const dynamic = "force-dynamic";

export default async function BusinessCardPage() {
  const recent = await listRecentBusinessCardScans(5);
  return <BusinessCardApp recent={recent} />;
}
