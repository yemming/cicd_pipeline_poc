import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

type CountRow = {
  id: string;
  ct_no: string | null;
  warehouse_id: string | null;
  count_date: string | null;
  status: string | null;
  total_lines: number | null;
  variance_lines: number | null;
  variance_amount: number | null;
  approved_at: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-[#F0F0F0] text-[#444]",
  in_progress: "bg-[#FDF3E3] text-[#854F0B]",
  reviewed: "bg-[#EBF3FF] text-[#1A3A5C]",
  approved: "bg-[#EAF3DE] text-[#3B6D11]",
  void: "bg-[#FDECEA] text-[#CC0000]",
};

async function loadData(): Promise<CountRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_counts")
    .select(
      "id, ct_no, warehouse_id, count_date, status, total_lines, variance_lines, variance_amount, approved_at",
    )
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("count_date", { ascending: false })
    .limit(50);
  if (error) throw new Error(`counts: ${error.message}`);
  return (data ?? []) as unknown as CountRow[];
}

export default async function CountOpsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視盤點作業的權限</p>
      </main>
    );
  }
  const rows = await loadData();
  const totalLines = rows.reduce((s, r) => s + Number(r.total_lines ?? 0), 0);
  const totalVar = rows.reduce((s, r) => s + Number(r.variance_lines ?? 0), 0);
  const totalAmount = rows.reduce((s, r) => s + Number(r.variance_amount ?? 0), 0);

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">庫存盤點作業</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          07.5
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          盤點計畫、初點覆點、差異核可整體 review
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">盤點單數</div>
          <div className="text-[20px] font-bold text-[#1A3A5C] mt-1">
            {rows.length}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">盤點明細數</div>
          <div className="text-[20px] font-bold text-[#3B6D11] mt-1 font-mono">
            {totalLines.toLocaleString("en-US")}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">差異筆數</div>
          <div className="text-[20px] font-bold text-[#854F0B] mt-1 font-mono">
            {totalVar.toLocaleString("en-US")}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">差異金額</div>
          <div className="text-[20px] font-bold text-[#CC0000] mt-1 font-mono">
            {`NT$${Math.round(totalAmount).toLocaleString("en-US")}`}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
          📋 盤點單列表
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">盤點單號</th>
                <th className="px-3 py-2 text-left">盤點日期</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-right">總明細</th>
                <th className="px-3 py-2 text-right">差異筆數</th>
                <th className="px-3 py-2 text-right">差異金額</th>
                <th className="px-3 py-2 text-left">核准時間</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono">{r.ct_no ?? r.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">{r.count_date ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        STATUS_BADGE[r.status ?? ""] ?? STATUS_BADGE.draft
                      }`}
                    >
                      {r.status ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.total_lines ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.variance_lines ?? 0}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.variance_amount
                      ? Math.round(Number(r.variance_amount)).toLocaleString("en-US")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-[11.5px] text-[#666]">
                    {r.approved_at ? r.approved_at.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[#888]">
                    尚無盤點單
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
