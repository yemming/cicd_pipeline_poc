import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { createServiceClient } from "@/lib/supabase/service";

import { OrgTabs } from "../_components/org-tabs";
import { BrandsBoard } from "./_components/brands-board";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) redirect("/dashboard");

  const sb = createServiceClient();
  const [{ data: brands }, { data: groups }, { data: gbAgg }, { data: orgsAgg }] = await Promise.all([
    sb.from("brands").select("id, name, manufacturer, created_at").order("id"),
    sb.from("groups").select("id, name").order("id"),
    sb.from("group_brands").select("brand_id, group_id"),
    sb.from("organizations").select("brand_id"),
  ]);

  const groupsForBrand = new Map<string, string[]>();
  for (const r of gbAgg ?? []) {
    const list = groupsForBrand.get(r.brand_id) ?? [];
    list.push(r.group_id);
    groupsForBrand.set(r.brand_id, list);
  }
  const storeCount = new Map<string, number>();
  for (const r of orgsAgg ?? []) {
    storeCount.set(r.brand_id, (storeCount.get(r.brand_id) ?? 0) + 1);
  }

  const rows = (brands ?? []).map((b) => ({
    ...b,
    group_ids: groupsForBrand.get(b.id) ?? [],
    store_count: storeCount.get(b.id) ?? 0,
  }));

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">組織架構</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          集團 / 品牌 / 門店
        </span>
        <span className="text-[12px] text-[#9A9890]">
          全域品牌字典；可勾選代理集團
        </span>
      </header>

      <OrgTabs />

      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        <BrandsBoard rows={rows} groups={groups ?? []} />
      </div>
    </main>
  );
}
