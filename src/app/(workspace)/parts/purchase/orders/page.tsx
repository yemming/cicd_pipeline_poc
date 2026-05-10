import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

type PO = {
  id: string;
  po_no: string | null;
  vendor_id: string | null;
  warehouse_id: string | null;
  purchase_type: string | null;
  status: string | null;
  po_date: string | null;
  eta_date: string | null;
  currency: string | null;
  amount_total: number | null;
  qty_ordered_total: number | null;
  qty_received_total: number | null;
  receipt_progress_pct: number | null;
};

type Supplier = { id: string; code: string; name: string };

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-[#F0F0F0] text-[#444]",
  pending: "bg-[#FDF3E3] text-[#854F0B]",
  approved: "bg-[#EBF3FF] text-[#1A3A5C]",
  receiving: "bg-[#FDF3E3] text-[#854F0B]",
  completed: "bg-[#EAF3DE] text-[#3B6D11]",
  closed: "bg-[#F0F0F0] text-[#444]",
};

async function loadData() {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [pRes, sRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id, po_no, vendor_id, warehouse_id, purchase_type, status, po_date, eta_date, currency, amount_total, qty_ordered_total, qty_received_total, receipt_progress_pct",
      )
      .eq("brand_id", brand)
      .order("po_date", { ascending: false })
      .limit(80),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand),
  ]);
  if (pRes.error) throw new Error(`po: ${pRes.error.message}`);
  if (sRes.error) throw new Error(`suppliers: ${sRes.error.message}`);
  return {
    rows: (pRes.data ?? []) as unknown as PO[],
    suppliers: (sRes.data ?? []) as unknown as Supplier[],
  };
}

export default async function OrdersPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視商品採購的權限</p>
      </main>
    );
  }
  const { rows, suppliers } = await loadData();
  const supMap = new Map(suppliers.map((s) => [s.id, s]));
  const totalAmount = rows.reduce((s, r) => s + Number(r.amount_total ?? 0), 0);

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">商品採購</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          4.3
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`採購單列表（共 ${rows.length} 筆）`}
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">採購單數</div>
          <div className="text-[20px] font-bold text-[#1A3A5C] mt-1">{rows.length}</div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">在途中</div>
          <div className="text-[20px] font-bold text-[#854F0B] mt-1">
            {rows.filter((r) => r.status === "approved" || r.status === "receiving").length}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">採購總金額</div>
          <div className="text-[20px] font-bold text-[#0F6E56] mt-1 font-mono">
            {`NT$${Math.round(totalAmount).toLocaleString("en-US")}`}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
          🛒 採購單明細
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">採購單號</th>
                <th className="px-3 py-2 text-left">供應商</th>
                <th className="px-3 py-2 text-left">類型</th>
                <th className="px-3 py-2 text-left">採購日</th>
                <th className="px-3 py-2 text-left">預計到貨</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-right">已收/總量</th>
                <th className="px-3 py-2 text-right">進度</th>
                <th className="px-3 py-2 text-right">金額</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono">{r.po_no ?? r.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">
                    {r.vendor_id ? supMap.get(r.vendor_id)?.name ?? "—" : "—"}
                  </td>
                  <td className="px-3 py-2">{r.purchase_type ?? "—"}</td>
                  <td className="px-3 py-2">{r.po_date ?? "—"}</td>
                  <td className="px-3 py-2">{r.eta_date ?? "—"}</td>
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
                    {`${Number(r.qty_received_total ?? 0)} / ${Number(r.qty_ordered_total ?? 0)}`}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.receipt_progress_pct
                      ? `${Number(r.receipt_progress_pct).toFixed(0)}%`
                      : "0%"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.amount_total
                      ? Math.round(Number(r.amount_total)).toLocaleString("en-US")
                      : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[#888]">
                    尚無採購單
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
