import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

type Req = {
  id: string;
  req_no: string | null;
  warehouse_id: string | null;
  source: string | null;
  status: string | null;
  required_date: string | null;
  approved_at: string | null;
  notes: string | null;
};

type Line = {
  id: string;
  req_id: string;
  line_no: number | null;
  item_id: string;
  qty_required: number | null;
  uom: string | null;
  expected_date: string | null;
};

type Item = { id: string; code: string; name: string };

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-[#F0F0F0] text-[#444]",
  submitted: "bg-[#EBF3FF] text-[#1A3A5C]",
  approved: "bg-[#EAF3DE] text-[#3B6D11]",
  rejected: "bg-[#FDECEA] text-[#CC0000]",
  closed: "bg-[#F0F0F0] text-[#444]",
};

const SOURCE_LABEL: Record<string, string> = {
  manual: "手動",
  auto: "自動",
  workorder: "工單",
  replenishment: "補貨計畫",
};

async function loadData() {
  const supabase = await createClient();
  const brand = getBrandKey();
  const [rRes, lRes, iRes] = await Promise.all([
    supabase
      .from("purchase_requisitions")
      .select("id, req_no, warehouse_id, source, status, required_date, approved_at, notes")
      .eq("brand_id", brand)
      .order("required_date", { ascending: false }),
    supabase
      .from("purchase_requisition_lines")
      .select("id, req_id, line_no, item_id, qty_required, uom, expected_date")
      .eq("brand_id", brand),
    supabase
      .from("items")
      .select("id, code, name")
      .eq("brand_id", brand),
  ]);
  if (rRes.error) throw new Error(`reqs: ${rRes.error.message}`);
  if (lRes.error) throw new Error(`lines: ${lRes.error.message}`);
  if (iRes.error) throw new Error(`items: ${iRes.error.message}`);
  return {
    reqs: (rRes.data ?? []) as unknown as Req[],
    lines: (lRes.data ?? []) as unknown as Line[],
    items: (iRes.data ?? []) as unknown as Item[],
  };
}

export default async function RequisitionsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PR_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視需求處理的權限</p>
      </main>
    );
  }
  const { reqs, lines, items } = await loadData();
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const linesByReq = new Map<string, Line[]>();
  for (const l of lines) {
    if (!linesByReq.has(l.req_id)) linesByReq.set(l.req_id, []);
    linesByReq.get(l.req_id)!.push(l);
  }

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">需求處理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          4.1
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`採購申請單列表（共 ${reqs.length} 筆）`}
        </span>
      </header>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">申請單號</th>
                <th className="px-3 py-2 text-left">來源</th>
                <th className="px-3 py-2 text-left">需求日期</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-right">行數</th>
                <th className="px-3 py-2 text-right">總需求量</th>
                <th className="px-3 py-2 text-left">核准時間</th>
                <th className="px-3 py-2 text-left">備註</th>
              </tr>
            </thead>
            <tbody>
              {reqs.map((r) => {
                const ls = linesByReq.get(r.id) ?? [];
                const totalQty = ls.reduce((s, x) => s + Number(x.qty_required ?? 0), 0);
                return (
                  <tr key={r.id}>
                    <td className="px-3 py-2 font-mono">{r.req_no ?? r.id.slice(0, 8)}</td>
                    <td className="px-3 py-2">{SOURCE_LABEL[r.source ?? ""] ?? r.source ?? "—"}</td>
                    <td className="px-3 py-2">{r.required_date ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] ${
                          STATUS_BADGE[r.status ?? "draft"] ?? STATUS_BADGE.draft
                        }`}
                      >
                        {r.status ?? "draft"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{ls.length}</td>
                    <td className="px-3 py-2 text-right font-mono">
                      {totalQty.toLocaleString("en-US")}
                    </td>
                    <td className="px-3 py-2 text-[11.5px]">
                      {r.approved_at ? r.approved_at.slice(0, 16).replace("T", " ") : "—"}
                    </td>
                    <td className="px-3 py-2 text-[#666]">{r.notes ?? "—"}</td>
                  </tr>
                );
              })}
              {reqs.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#888]">
                    尚無採購申請單。需求單通常由系統自動建立（補貨計畫、工單）或人工建立。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {reqs.length > 0 ? (
        <section className="rounded-md border border-[#E1E1E1] bg-white">
          <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
            📋 申請單明細
          </header>
          <div className="divide-y divide-[#E1E1E1]">
            {reqs.slice(0, 10).map((r) => {
              const ls = linesByReq.get(r.id) ?? [];
              return (
                <div key={r.id} className="px-4 py-3">
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="font-mono text-[12.5px]">{r.req_no}</span>
                    <span className="text-[12px] text-[#666]">{r.required_date}</span>
                    <span className="ml-auto text-[11px] text-[#888]">
                      {`${ls.length} 行`}
                    </span>
                  </div>
                  {ls.length > 0 ? (
                    <table className="w-full text-[12px]">
                      <thead className="text-[#666] text-[11px]">
                        <tr>
                          <th className="px-2 py-1 text-left w-10">#</th>
                          <th className="px-2 py-1 text-left">料號</th>
                          <th className="px-2 py-1 text-left">商品</th>
                          <th className="px-2 py-1 text-right">需求量</th>
                          <th className="px-2 py-1 text-left">UOM</th>
                          <th className="px-2 py-1 text-left">期望日</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ls.map((l) => (
                          <tr key={l.id}>
                            <td className="px-2 py-1">{l.line_no}</td>
                            <td className="px-2 py-1 font-mono">
                              {itemMap.get(l.item_id)?.code ?? "—"}
                            </td>
                            <td className="px-2 py-1">
                              {itemMap.get(l.item_id)?.name ?? "—"}
                            </td>
                            <td className="px-2 py-1 text-right font-mono">
                              {Number(l.qty_required ?? 0).toLocaleString("en-US")}
                            </td>
                            <td className="px-2 py-1">{l.uom ?? "—"}</td>
                            <td className="px-2 py-1">{l.expected_date ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-[11.5px] text-[#888]">無明細行</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}
    </main>
  );
}
