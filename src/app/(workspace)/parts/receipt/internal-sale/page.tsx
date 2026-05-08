import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

type Doc = {
  id: string;
  doc_no: string;
  source_label: string | null;
  warehouse_label: string | null;
  receipt_date: string | null;
  status: string;
  qty_total: number;
  amount_total: number;
  notes: string | null;
};

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-[#F0F0F0] text-[#444]",
  posted: "bg-[#EAF3DE] text-[#3B6D11]",
  void: "bg-[#FDECEA] text-[#CC0000]",
};

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  posted: "已過帳",
  void: "已作廢",
};

async function loadData() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("parts_internal_sale_receipts")
    .select("id, doc_no, source_label, warehouse_label, receipt_date, status, qty_total, amount_total, notes")
    .eq("brand_id", getBrandKey())
    .order("sort_order");
  if (error) throw new Error(`isr: ${error.message}`);
  return ((data ?? []) as unknown as Doc[]).map((d) => ({
    ...d,
    qty_total: Number(d.qty_total),
    amount_total: Number(d.amount_total),
  }));
}

export default async function InternalSaleReceiptPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視內售入庫的權限</p>
      </main>
    );
  }
  const rows = await loadData();
  const totalQty = rows.reduce((s, r) => s + r.qty_total, 0);
  const totalAmount = rows.reduce((s, r) => s + r.amount_total, 0);

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">內售入庫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          5.2
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`內部調撥／集團內售入庫單（共 ${rows.length} 筆）`}
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">入庫單數</div>
          <div className="text-[20px] font-bold text-[#1A3A5C] mt-1">{rows.length}</div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">入庫總量</div>
          <div className="text-[20px] font-bold text-[#3B6D11] mt-1 font-mono">
            {totalQty.toLocaleString("en-US")}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">入庫總金額</div>
          <div className="text-[20px] font-bold text-[#0F6E56] mt-1 font-mono">
            {`NT$${Math.round(totalAmount).toLocaleString("en-US")}`}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
          📦 內售入庫單明細
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">入庫單號</th>
                <th className="px-3 py-2 text-left">來源</th>
                <th className="px-3 py-2 text-left">入庫倉</th>
                <th className="px-3 py-2 text-left">入庫日</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-right">數量</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2 text-left">備註</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono">{r.doc_no}</td>
                  <td className="px-3 py-2">{r.source_label ?? "—"}</td>
                  <td className="px-3 py-2">{r.warehouse_label ?? "—"}</td>
                  <td className="px-3 py-2">{r.receipt_date ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        STATUS_BADGE[r.status] ?? STATUS_BADGE.draft
                      }`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.qty_total.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {Math.round(r.amount_total).toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-[#666]">{r.notes ?? "—"}</td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#888]">
                    尚無內售入庫記錄
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
