import { redirect } from "next/navigation";

import { getGroupsBoardData } from "@/domain/org-admin";

import { OrgTabs } from "../_components/org-tabs";
import { GroupsBoard } from "./_components/groups-board";

export const dynamic = "force-dynamic";

export default async function Page() {
  let data: Awaited<ReturnType<typeof getGroupsBoardData>>;
  try {
    data = await getGroupsBoardData();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === "UNAUTHENTICATED") redirect("/login");
    if (msg.startsWith("FORBIDDEN")) redirect("/dashboard");
    throw err;
  }
  const { rows } = data;

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
