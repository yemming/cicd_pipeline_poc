import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

type Ret = {
  id: string;
  rt_no: string | null;
  po_id: string | null;
  vendor_id: string | null;
  return_reason: string | null;
  return_date: string | null;
  status: string | null;
  qty_return_total: number | null;
  amount_total: number | null;
  refund_amount: number | null;
  logistics_provider: string | null;
  logistics_tracking_no: string | null;
};

type Supplier = { id: string; code: string; name: string };

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-[#F0F0F0] text-[#444]",
  pending: "bg-[#FDF3E3] text-[#854F0B]",
  approved: "bg-[#EBF3FF] text-[#1A3A5C]",
  shipped: "bg-[#FDF3E3] text-[#854F0B]",
  completed: "bg-[#EAF3DE] text-[#3B6D11]",
};

async function loadData() {
  const supabase = await createClient();
  const brand = getBrandKey();
  const [rRes, sRes] = await Promise.all([
    supabase
      .from("purchase_returns")
      .select(
        "id, rt_no, po_id, vendor_id, return_reason, return_date, status, qty_return_total, amount_total, refund_amount, logistics_provider, logistics_tracking_no",
      )
      .eq("brand_id", brand)
      .order("return_date", { ascending: false })
      .limit(80),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand),
  ]);
  if (rRes.error) throw new Error(`returns: ${rRes.error.message}`);
  if (sRes.error) throw new Error(`suppliers: ${sRes.error.message}`);
  return {
    rows: (rRes.data ?? []) as unknown as Ret[],
    suppliers: (sRes.data ?? []) as unknown as Supplier[],
  };
}

export default async function ReturnsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視採購退貨的權限</p>
      </main>
    );
  }
  const { rows, suppliers } = await loadData();
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  const totalRefund = rows.reduce((s, r) => s + Number(r.refund_amount ?? 0), 0);

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">採購退貨</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          4.4
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`退貨單列表（共 ${rows.length} 筆）`}
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">退貨單數</div>
          <div className="text-[20px] font-bold text-[#1A3A5C] mt-1">{rows.length}</div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">處理中</div>
          <div className="text-[20px] font-bold text-[#854F0B] mt-1">
            {rows.filter((r) => r.status === "pending" || r.status === "shipped").length}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">退款總額</div>
          <div className="text-[20px] font-bold text-[#CC0000] mt-1 font-mono">
            {`NT$${Math.round(totalRefund).toLocaleString("en-US")}`}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
          ↩️ 退貨單明細
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">退貨單號</th>
                <th className="px-3 py-2 text-left">供應商</th>
                <th className="px-3 py-2 text-left">退貨日</th>
                <th className="px-3 py-2 text-left">原因</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-right">退貨數量</th>
                <th className="px-3 py-2 text-right">退款金額</th>
                <th className="px-3 py-2 text-left">物流追蹤</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono">{r.rt_no ?? r.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    {r.vendor_id ? supMap.get(r.vendor_id)?.name ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2">{r.return_date ?? "—"}</td>
                  <td className="px-3 py-2">{r.return_reason ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        STATUS_BADGE[r.status ?? "draft"] ?? STATUS_BADGE.draft
                      }`}
                    >
                      {r.status ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {Number(r.qty_return_total ?? 0).toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.refund_amount
                      ? Math.round(Number(r.refund_amount)).toLocaleString("en-US")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-[11.5px]">
                    {r.logistics_provider
                      ? `${r.logistics_provider} ${r.logistics_tracking_no ?? ""}`
                      : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#888]">
                    尚無退貨單
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
