import { LicensePlateApp } from "./_components/license-plate-app";
import { listRecentLicensePlateScans } from "@/domain/license-plate";

export const dynamic = "force-dynamic";

export default async function LicensePlatePage() {
  const recent = await listRecentLicensePlateScans(5);
  return <LicensePlateApp recent={recent} />;
}
