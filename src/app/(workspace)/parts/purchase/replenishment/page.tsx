import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

type Threshold = {
  item_id: string;
  warehouse_id: string;
  abc_class: string | null;
  min_stock: number | null;
  reorder_point: number | null;
  max_stock: number | null;
  alert_priority: string | null;
};

type Stock = {
  item_id: string;
  warehouse_id: string;
  qty: number;
  unit_cost: number | null;
};

type Item = {
  id: string;
  code: string;
  name: string;
  default_supplier_id: string | null;
  standard_cost: number | null;
};

type Supplier = { id: string; code: string; name: string };

type Suggestion = {
  item_id: string;
  code: string;
  name: string;
  abc_class: string | null;
  current_qty: number;
  reorder_point: number;
  suggested_qty: number;
  supplier_label: string;
  est_amount: number;
  priority: "urgent" | "normal" | "low";
};

const PRIORITY_BADGE: Record<string, string> = {
  urgent: "bg-[#FDECEA] text-[#CC0000]",
  normal: "bg-[#FDF3E3] text-[#854F0B]",
  low: "bg-[#F0F0F0] text-[#444]",
};

const PRIORITY_LABEL: Record<string, string> = {
  urgent: "緊急",
  normal: "一般",
  low: "低",
};

async function loadData(): Promise<{
  suggestions: Suggestion[];
  scheduledCount: number;
  estTotal: number;
}> {
  const supabase = await createClient();
  const brand = getBrandKey();
  const [thRes, stRes, itRes, supRes] = await Promise.all([
    supabase
      .from("stock_thresholds")
      .select(
        "item_id, warehouse_id, abc_class, min_stock, reorder_point, max_stock, alert_priority",
      )
      .eq("brand_id", brand),
    supabase
      .from("stock_items")
      .select("item_id, warehouse_id, qty, unit_cost")
      .eq("brand_id", brand),
    supabase
      .from("items")
      .select("id, code, name, default_supplier_id, standard_cost")
      .eq("brand_id", brand),
    supabase
      .from("suppliers")
      .select("id, code, name")
      .eq("brand_id", brand),
  ]);
  if (thRes.error) throw new Error(`thresholds: ${thRes.error.message}`);
  if (stRes.error) throw new Error(`stock: ${stRes.error.message}`);
  if (itRes.error) throw new Error(`items: ${itRes.error.message}`);
  if (supRes.error) throw new Error(`suppliers: ${supRes.error.message}`);

  const items = (itRes.data ?? []) as unknown as Item[];
  const itemMap = new Map(items.map((i) => [i.id, i]));
  const supMap = new Map(
    ((supRes.data ?? []) as unknown as Supplier[]).map((s) => [s.id, s]),
  );

  const stockAgg = new Map<string, number>();
  for (const s of (stRes.data ?? []) as unknown as Stock[]) {
    stockAgg.set(s.item_id, (stockAgg.get(s.item_id) ?? 0) + Number(s.qty ?? 0));
  }
  const tholdAgg = new Map<string, Threshold>();
  for (const t of (thRes.data ?? []) as unknown as Threshold[]) {
    const existing = tholdAgg.get(t.item_id);
    if (!existing || Number(t.reorder_point ?? 0) > Number(existing.reorder_point ?? 0)) {
      tholdAgg.set(t.item_id, t);
    }
  }

  const suggestions: Suggestion[] = [];
  for (const [itemId, th] of tholdAgg) {
    const cur = stockAgg.get(itemId) ?? 0;
    const rp = Number(th.reorder_point ?? 0);
    const maxS = Number(th.max_stock ?? 0) || rp * 2;
    if (cur >= rp || rp === 0) continue;
    const item = itemMap.get(itemId);
    if (!item) continue;
    const sugQty = Math.max(rp - cur, maxS - cur);
    const cost = Number(item.standard_cost ?? 0);
    const supplier = item.default_supplier_id
      ? supMap.get(item.default_supplier_id)
      : null;
    const minS = Number(th.min_stock ?? 0);
    const priority: Suggestion["priority"] =
      cur <= minS ? "urgent" : cur <= rp * 0.6 ? "normal" : "low";
    suggestions.push({
      item_id: itemId,
      code: item.code,
      name: item.name,
      abc_class: th.abc_class,
      current_qty: cur,
      reorder_point: rp,
      suggested_qty: sugQty,
      supplier_label: supplier ? supplier.name : "—",
      est_amount: Math.round(sugQty * cost),
      priority,
    });
  }
  suggestions.sort((a, b) => {
    const order = { urgent: 0, normal: 1, low: 2 } as const;
    return order[a.priority] - order[b.priority];
  });

  const estTotal = suggestions.reduce((s, x) => s + x.est_amount, 0);

  return {
    suggestions,
    scheduledCount: 0,
    estTotal,
  };
}

export default async function ReplenishmentPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PR_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視日常補貨計畫的權限</p>
      </main>
    );
  }
  const { suggestions, scheduledCount, estTotal } = await loadData();

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">日常補貨計畫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          4.2
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          依庫存水位自動產生採購建議清單（基於 stock_thresholds + 即時庫存）
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">本週補貨建議</div>
          <div className="text-[24px] font-bold text-[#854F0B] mt-1 font-mono">
            {suggestions.length}
          </div>
          <div className="text-[11px] text-[#888]">項備件待補貨</div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">已排程採購</div>
          <div className="text-[24px] font-bold text-[#1A3A5C] mt-1 font-mono">
            {scheduledCount}
          </div>
          <div className="text-[11px] text-[#888]">項已建立採購單</div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">本月預估採購金額</div>
          <div className="text-[20px] font-bold text-[#0F6E56] mt-1 font-mono">
            {`NT$${estTotal.toLocaleString("en-US")}`}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">計畫補貨頻率</div>
          <div className="text-[20px] font-bold text-[#1A3A5C] mt-1">每週一</div>
          <div className="text-[11px] text-[#888]">每週自動計算</div>
        </div>
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] flex items-center text-[13px]">
          <span className="font-semibold">📋 本週補貨建議清單</span>
          <span className="ml-auto text-[#666]">
            共 <b>{suggestions.length}</b> 項
          </span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">備件代碼</th>
                <th className="px-3 py-2 text-left">商品名稱</th>
                <th className="px-3 py-2 text-left">ABC</th>
                <th className="px-3 py-2 text-right">目前庫存</th>
                <th className="px-3 py-2 text-right">再訂購點</th>
                <th className="px-3 py-2 text-right">建議補貨量</th>
                <th className="px-3 py-2 text-left">建議供應商</th>
                <th className="px-3 py-2 text-right">預估金額</th>
                <th className="px-3 py-2 text-left">優先度</th>
              </tr>
            </thead>
            <tbody>
              {suggestions.map((s) => (
                <tr
                  key={s.item_id}
                  className={s.priority === "urgent" ? "bg-[#FFF9F0]" : ""}
                >
                  <td className="px-3 py-2 font-mono">{s.code}</td>
                  <td className="px-3 py-2">{s.name}</td>
                  <td className="px-3 py-2">{s.abc_class ?? "—"}</td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      s.current_qty <= s.reorder_point * 0.3
                        ? "text-[#CC0000]"
                        : "text-[#854F0B]"
                    }`}
                  >
                    {s.current_qty}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{s.reorder_point}</td>
                  <td className="px-3 py-2 text-right font-mono">{s.suggested_qty}</td>
                  <td className="px-3 py-2">{s.supplier_label}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {`NT$${s.est_amount.toLocaleString("en-US")}`}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] ${
                        PRIORITY_BADGE[s.priority]
                      }`}
                    >
                      {PRIORITY_LABEL[s.priority]}
                    </span>
                  </td>
                </tr>
              ))}
              {suggestions.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-[#888]">
                    目前沒有低於再訂購點的料號 — 庫存水位健康
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
