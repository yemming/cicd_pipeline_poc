import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

type StockRow = {
  item_id: string;
  qty: number;
  unit_cost: number | null;
  last_movement_at: string | null;
};

type ItemRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  control_type: string | null;
};

type StaleRow = {
  item_id: string;
  code: string;
  name: string;
  category: string | null;
  control_type: string | null;
  total_qty: number;
  total_value: number;
  last_move: string | null;
  days_idle: number | null;
};

const NOW = Date.now();

async function loadData(): Promise<{
  rows: StaleRow[];
  bucketCounts: { b30: number; b60: number; b90: number; b180: number; bnever: number };
  totalValue: number;
}> {
  const supabase = await createClient();
  const brand = getBrandKey();
  const [stockRes, itemsRes] = await Promise.all([
    supabase
      .from("stock_items")
      .select("item_id, qty, unit_cost, last_movement_at")
      .eq("brand_id", brand)
      .gt("qty", 0),
    supabase
      .from("items")
      .select("id, code, name, category, control_type")
      .eq("brand_id", brand),
  ]);
  if (stockRes.error) throw new Error(`stock: ${stockRes.error.message}`);
  if (itemsRes.error) throw new Error(`items: ${itemsRes.error.message}`);

  const items = (itemsRes.data ?? []) as unknown as ItemRow[];
  const stock = (stockRes.data ?? []) as unknown as StockRow[];
  const itemMap = new Map(items.map((i) => [i.id, i]));

  const agg = new Map<
    string,
    { qty: number; value: number; latest: string | null }
  >();
  for (const s of stock) {
    const cur = agg.get(s.item_id) ?? { qty: 0, value: 0, latest: null };
    cur.qty += Number(s.qty ?? 0);
    cur.value += Number(s.qty ?? 0) * Number(s.unit_cost ?? 0);
    if (s.last_movement_at && (!cur.latest || s.last_movement_at > cur.latest)) {
      cur.latest = s.last_movement_at;
    }
    agg.set(s.item_id, cur);
  }

  const rows: StaleRow[] = [];
  for (const [itemId, a] of agg) {
    const it = itemMap.get(itemId);
    if (!it) continue;
    const days =
      a.latest !== null
        ? Math.floor((NOW - new Date(a.latest).getTime()) / 86400000)
        : null;
    if (days !== null && days < 30) continue;
    rows.push({
      item_id: itemId,
      code: it.code,
      name: it.name,
      category: it.category,
      control_type: it.control_type,
      total_qty: a.qty,
      total_value: Math.round(a.value),
      last_move: a.latest,
      days_idle: days,
    });
  }

  rows.sort((a, b) => {
    const ad = a.days_idle ?? 9999;
    const bd = b.days_idle ?? 9999;
    return bd - ad;
  });

  const bucketCounts = { b30: 0, b60: 0, b90: 0, b180: 0, bnever: 0 };
  let totalValue = 0;
  for (const r of rows) {
    totalValue += r.total_value;
    if (r.days_idle === null) bucketCounts.bnever++;
    else if (r.days_idle >= 180) bucketCounts.b180++;
    else if (r.days_idle >= 90) bucketCounts.b90++;
    else if (r.days_idle >= 60) bucketCounts.b60++;
    else bucketCounts.b30++;
  }

  return { rows: rows.slice(0, 60), bucketCounts, totalValue };
}

const BUCKETS = [
  { key: "b30", label: "30-60 天", color: "border-t-[#F59E0B]" },
  { key: "b60", label: "60-90 天", color: "border-t-[#854F0B]" },
  { key: "b90", label: "90-180 天", color: "border-t-[#CC0000]" },
  { key: "b180", label: "180 天以上", color: "border-t-[#7A0000]" },
  { key: "bnever", label: "從未異動", color: "border-t-[#666]" },
] as const;

export default async function StaleAnalyticsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視呆滯庫存的權限</p>
      </main>
    );
  }
  const { rows, bucketCounts, totalValue } = await loadData();
  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">呆滯庫存分析</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          12.3
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`超過 30 天未異動之庫存料號（共 ${rows.length} 筆 · 占用成本 NT$${totalValue.toLocaleString("en-US")}）`}
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {BUCKETS.map((b) => (
          <div
            key={b.key}
            className={`bg-white border border-[#E1E1E1] border-t-[3px] rounded-md px-3 py-2.5 ${b.color}`}
          >
            <div className="text-[11px] text-[#888]">{b.label}</div>
            <div className="text-[22px] font-bold font-mono mt-1">
              {bucketCounts[b.key as keyof typeof bucketCounts]}
            </div>
            <div className="text-[10.5px] text-[#888]">料號數</div>
          </div>
        ))}
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
          🐌 呆滯料明細（依閒置天數排序）
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">料號</th>
                <th className="px-3 py-2 text-left">商品名稱</th>
                <th className="px-3 py-2 text-left">類別</th>
                <th className="px-3 py-2 text-left">管控</th>
                <th className="px-3 py-2 text-right">庫存量</th>
                <th className="px-3 py-2 text-right">占用成本</th>
                <th className="px-3 py-2 text-left">最近異動</th>
                <th className="px-3 py-2 text-right">閒置天數</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.item_id}>
                  <td className="px-3 py-2 font-mono">{r.code}</td>
                  <td className="px-3 py-2">{r.name}</td>
                  <td className="px-3 py-2">{r.category ?? "—"}</td>
                  <td className="px-3 py-2">{r.control_type ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.total_qty.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[#854F0B]">
                    {r.total_value.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-[11.5px]">
                    {r.last_move ? r.last_move.slice(0, 10) : "（從未）"}
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-mono ${
                      (r.days_idle ?? 999) >= 90 ? "text-[#CC0000]" : "text-[#854F0B]"
                    }`}
                  >
                    {r.days_idle === null ? "∞" : r.days_idle}
                  </td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-6 text-center text-[#888]">
                    目前沒有超過 30 天未異動的料號 — 庫存周轉良好
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
