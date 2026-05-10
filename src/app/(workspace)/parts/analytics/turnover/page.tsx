import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

type ItemRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
};

type IssueLine = { item_id: string; qty_issued: number; line_amount: number | null };
type ReceiptLine = { item_id: string; qty_received: number; line_amount: number | null };
type StockRow = { item_id: string; qty: number; unit_cost: number | null };

type TurnoverRow = {
  item_id: string;
  code: string;
  name: string;
  category: string | null;
  in_qty: number;
  out_qty: number;
  current_qty: number;
  current_value: number;
  turnover_ratio: number;
};

async function loadData(): Promise<{
  rows: TurnoverRow[];
  totalIn: number;
  totalOut: number;
}> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [itemsRes, issuesRes, receiptsRes, stockRes] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, name, category")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .limit(120),
    supabase
      .from("stock_issue_lines")
      .select("item_id, qty_issued, line_amount")
      .eq("brand_id", brand),
    supabase
      .from("stock_receipt_lines")
      .select("item_id, qty_received, line_amount")
      .eq("brand_id", brand),
    supabase
      .from("stock_items")
      .select("item_id, qty, unit_cost")
      .eq("brand_id", brand),
  ]);
  if (itemsRes.error) throw new Error(`items: ${itemsRes.error.message}`);
  if (issuesRes.error) throw new Error(`issues: ${issuesRes.error.message}`);
  if (receiptsRes.error) throw new Error(`receipts: ${receiptsRes.error.message}`);
  if (stockRes.error) throw new Error(`stock: ${stockRes.error.message}`);

  const items = (itemsRes.data ?? []) as unknown as ItemRow[];
  const issues = (issuesRes.data ?? []) as unknown as IssueLine[];
  const receipts = (receiptsRes.data ?? []) as unknown as ReceiptLine[];
  const stock = (stockRes.data ?? []) as unknown as StockRow[];

  const inMap = new Map<string, number>();
  for (const r of receipts) {
    inMap.set(r.item_id, (inMap.get(r.item_id) ?? 0) + Number(r.qty_received ?? 0));
  }
  const outMap = new Map<string, number>();
  for (const r of issues) {
    outMap.set(r.item_id, (outMap.get(r.item_id) ?? 0) + Number(r.qty_issued ?? 0));
  }
  const stockMap = new Map<string, { qty: number; value: number }>();
  for (const r of stock) {
    const cur = stockMap.get(r.item_id) ?? { qty: 0, value: 0 };
    cur.qty += Number(r.qty ?? 0);
    cur.value += Number(r.qty ?? 0) * Number(r.unit_cost ?? 0);
    stockMap.set(r.item_id, cur);
  }

  const rows: TurnoverRow[] = [];
  for (const it of items) {
    const inQty = inMap.get(it.id) ?? 0;
    const outQty = outMap.get(it.id) ?? 0;
    const stk = stockMap.get(it.id) ?? { qty: 0, value: 0 };
    if (inQty + outQty + stk.qty === 0) continue;
    const ratio = stk.qty > 0 ? outQty / stk.qty : outQty > 0 ? Infinity : 0;
    rows.push({
      item_id: it.id,
      code: it.code,
      name: it.name,
      category: it.category,
      in_qty: inQty,
      out_qty: outQty,
      current_qty: stk.qty,
      current_value: Math.round(stk.value),
      turnover_ratio: Number.isFinite(ratio) ? ratio : 0,
    });
  }
  rows.sort((a, b) => b.turnover_ratio - a.turnover_ratio);

  const totalIn = rows.reduce((s, r) => s + r.in_qty, 0);
  const totalOut = rows.reduce((s, r) => s + r.out_qty, 0);

  return { rows: rows.slice(0, 50), totalIn, totalOut };
}

export default async function TurnoverAnalyticsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視周轉率的權限</p>
      </main>
    );
  }
  const { rows, totalIn, totalOut } = await loadData();
  const totalStock = rows.reduce((s, r) => s + r.current_qty, 0);
  const overall = totalStock > 0 ? totalOut / totalStock : 0;

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">庫存周轉率</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          12.4
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          以累計出庫量 ÷ 期末庫存計算每料周轉次數，識別熱銷與滯銷
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">累計入庫</div>
          <div className="text-[20px] font-bold text-[#3B6D11] mt-1 font-mono">
            {totalIn.toLocaleString("en-US")}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">累計出庫</div>
          <div className="text-[20px] font-bold text-[#854F0B] mt-1 font-mono">
            {totalOut.toLocaleString("en-US")}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">期末庫存</div>
          <div className="text-[20px] font-bold text-[#1A3A5C] mt-1 font-mono">
            {totalStock.toLocaleString("en-US")}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">總周轉率</div>
          <div className="text-[20px] font-bold text-[#CC0000] mt-1 font-mono">
            {overall.toFixed(2)}
          </div>
          <div className="text-[10.5px] text-[#888]">出/存</div>
        </div>
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
          ⚡ 料號周轉率（高至低）
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">料號</th>
                <th className="px-3 py-2 text-left">商品名稱</th>
                <th className="px-3 py-2 text-left">類別</th>
                <th className="px-3 py-2 text-right">入庫量</th>
                <th className="px-3 py-2 text-right">出庫量</th>
                <th className="px-3 py-2 text-right">期末庫存</th>
                <th className="px-3 py-2 text-right">占用成本</th>
                <th className="px-3 py-2 text-right">周轉率</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item_id}>
                  <td className="px-3 py-2 font-mono">{r.code}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.category ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.in_qty.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.out_qty.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.current_qty.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.current_value.toLocaleString("en-US")}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      r.turnover_ratio >= 1
                        ? "text-[#3B6D11]"
                        : r.turnover_ratio >= 0.3
                          ? "text-[#854F0B]"
                          : "text-[#CC0000]"
                    }`}
                  >
                    {r.turnover_ratio.toFixed(2)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#888]">
                    尚無進出庫資料
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
