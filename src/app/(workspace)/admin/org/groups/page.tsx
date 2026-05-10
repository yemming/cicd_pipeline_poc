import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { createServiceClient } from "@/lib/supabase/service";

import { OrgTabs } from "../_components/org-tabs";
import { GroupsBoard } from "./_components/groups-board";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) redirect("/dashboard");

  const sb = createServiceClient();
  const [{ data: groups }, { data: orgsAgg }, { data: gbAgg }] = await Promise.all([
    sb.from("groups").select("id, name, short_name, created_at").order("id"),
    sb.from("organizations").select("group_id"),
    sb.from("group_brands").select("group_id"),
  ]);

  const orgCount = new Map<string, number>();
  for (const o of orgsAgg ?? []) {
    if (o.group_id) orgCount.set(o.group_id, (orgCount.get(o.group_id) ?? 0) + 1);
  }
  const brandCount = new Map<string, number>();
  for (const g of gbAgg ?? []) {
    brandCount.set(g.group_id, (brandCount.get(g.group_id) ?? 0) + 1);
  }

  const rows = (groups ?? []).map((g) => ({
    ...g,
    org_count: orgCount.get(g.id) ?? 0,
    brand_count: brandCount.get(g.id) ?? 0,
  }));

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">組織架構</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          集團 / 品牌 / 門店
        </span>
        <span className="text-[12px] text-[#9A9890]">
          NetSuite-style 三層樹的最頂層
        </span>
      </header>

      <OrgTabs />

      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        <GroupsBoard rows={rows} />
      </div>
    </main>
  );
}
