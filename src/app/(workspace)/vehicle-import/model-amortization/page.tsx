import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { listModelAmortRules, listVehicleModelOptions } from "@/domain/model-amortization";

import { ModelAmortBoard } from "./_components/model-amort-board";

export const dynamic = "force-dynamic";

export default async function ModelAmortizationPage() {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!isAdmin) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">進口採購管理僅限管理者使用</p>
      </main>
    );
  }
  const [rules, modelOptions] = await Promise.all([listModelAmortRules(), listVehicleModelOptions()]);
  return <ModelAmortBoard rules={rules} modelOptions={modelOptions} />;
}
