import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

type ReceiptRow = {
  id: string;
  gr_no: string | null;
  type: string | null;
  source_doc_type: string | null;
  warehouse_id: string | null;
  vendor_id: string | null;
  receipt_date: string | null;
  status: string | null;
  qty_received_total: number | null;
  amount_total: number | null;
  posted_at: string | null;
};

const TYPE_LABEL: Record<string, string> = {
  po: "採購入庫",
  return: "退貨入庫",
  internal: "內售入庫",
  transfer: "調撥入庫",
  warranty: "保固入庫",
};

const STATUS_BADGE: Record<string, string> = {
  posted: "bg-[#EAF3DE] text-[#3B6D11]",
  draft: "bg-[#F0F0F0] text-[#444]",
  pending: "bg-[#FDF3E3] text-[#854F0B]",
  void: "bg-[#FDECEA] text-[#CC0000]",
};

async function loadData() {
  const supabase = await createClient();
  const brand = getBrandKey();
  const { data, error } = await supabase
    .from("stock_receipts")
    .select(
      "id, gr_no, type, source_doc_type, warehouse_id, vendor_id, receipt_date, status, qty_received_total, amount_total, posted_at",
    )
    .eq("brand_id", brand)
    .order("receipt_date", { ascending: false })
    .limit(50);
  if (error) throw new Error(`receipts: ${error.message}`);
  return (data ?? []) as unknown as ReceiptRow[];
}

export default async function ReceiptsHistoryPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視入庫查詢的權限</p>
      </main>
    );
  }
  const rows = await loadData();
  const totalQty = rows.reduce((s, r) => s + Number(r.qty_received_total ?? 0), 0);
  const totalAmount = rows.reduce((s, r) => s + Number(r.amount_total ?? 0), 0);

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">入庫查詢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          07.2
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          採購入庫、退貨入庫、保固入庫等所有入庫單據明細
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">查詢筆數</div>
          <div className="text-[20px] font-bold text-[#1A3A5C] mt-1">
            {rows.length}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">入庫總數量</div>
          <div className="text-[20px] font-bold text-[#3B6D11] mt-1 font-mono">
            {totalQty.toLocaleString("en-US")}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">入庫總金額</div>
          <div className="text-[20px] font-bold text-[#854F0B] mt-1 font-mono">
            {`NT$${Math.round(totalAmount).toLocaleString("en-US")}`}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
          📥 入庫單據明細
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">入庫單號</th>
                <th className="px-3 py-2 text-left">類型</th>
                <th className="px-3 py-2 text-left">來源</th>
                <th className="px-3 py-2 text-left">入庫日</th>
                <th className="px-3 py-2 text-left">狀態</th>
                <th className="px-3 py-2 text-right">數量</th>
                <th className="px-3 py-2 text-right">金額</th>
                <th className="px-3 py-2 text-left">過帳時間</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2 font-mono">{r.gr_no ?? r.id.slice(0, 8)}</td>
                  <td className="px-3 py-2">{TYPE_LABEL[r.type ?? ""] ?? r.type ?? "—"}</td>
                  <td className="px-3 py-2 text-[#666]">{r.source_doc_type ?? "—"}</td>
                  <td className="px-3 py-2">{r.receipt_date ?? "—"}</td>
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
                    {r.qty_received_total
                      ? Number(r.qty_received_total).toLocaleString("en-US")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.amount_total
                      ? Math.round(Number(r.amount_total)).toLocaleString("en-US")
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-[11.5px] text-[#666]">
                    {r.posted_at ? r.posted_at.slice(0, 16).replace("T", " ") : "—"}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#888]">
                    尚無入庫記錄
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
