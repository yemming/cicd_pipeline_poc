import { DrivingLicenseApp } from "./_components/driving-license-app";
import { listRecentDrivingLicenseScans } from "@/domain/ai-driving-licenses";

export const dynamic = "force-dynamic";

export default async function DrivingLicensePage() {
  const recent = await listRecentDrivingLicenseScans(5);
  return <DrivingLicenseApp recent={recent} />;
}
