import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { createServiceClient } from "@/lib/supabase/service";

import { OrgTabs } from "../_components/org-tabs";
import { StoresBoard } from "./_components/stores-board";

export const dynamic = "force-dynamic";

export default async function Page() {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) redirect("/dashboard");

  const sb = createServiceClient();
  const [{ data: orgs }, { data: brands }, { data: groups }, { data: storeBrands }] =
    await Promise.all([
      sb
        .from("organizations")
        .select("id, brand_id, group_id, parent_id, type, level, code, name, short_name, is_active, created_at")
        .order("brand_id")
        .order("level")
        .order("code"),
      sb.from("brands").select("id, name").order("id"),
      sb.from("groups").select("id, name").order("id"),
      sb.from("store_brands").select("store_id, brand_id"),
    ]);

  const brandsForStore = new Map<string, string[]>();
  for (const r of storeBrands ?? []) {
    const list = brandsForStore.get(r.store_id) ?? [];
    list.push(r.brand_id);
    brandsForStore.set(r.store_id, list);
  }

  const rows = (orgs ?? []).map((o) => ({
    ...o,
    brand_ids: brandsForStore.get(o.id) ?? [],
  }));

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">組織架構</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          集團 / 品牌 / 門店
        </span>
        <span className="text-[12px] text-[#9A9890]">
          門店 = organizations 表（含 region/store 兩階）；複合店可掛多 brand
        </span>
      </header>

      <OrgTabs />

      <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
        <StoresBoard rows={rows} brands={brands ?? []} groups={groups ?? []} />
      </div>
    </main>
  );
}
