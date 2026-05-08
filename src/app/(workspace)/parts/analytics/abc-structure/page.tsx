import { redirect } from "next/navigation";

import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

export const dynamic = "force-dynamic";

type ResultRow = {
  item_id: string;
  abc_class: string | null;
  output_amount_12m: number | null;
  output_qty_12m: number | null;
  rank_in_brand: number | null;
  cum_pct: number | null;
  prev_class: string | null;
  recalc_at: string | null;
};

type ItemRow = { id: string; code: string; name: string };

const CLASS_BADGE: Record<string, string> = {
  A: "bg-[#FDECEA] text-[#CC0000] border-[#CC0000]",
  B: "bg-[#FDF3E3] text-[#854F0B] border-[#854F0B]",
  C: "bg-[#EAF3DE] text-[#3B6D11] border-[#3B6D11]",
};

async function loadData() {
  const supabase = await createClient();
  const brand = getBrandKey();
  const [resultsRes, itemsRes] = await Promise.all([
    supabase
      .from("abc_classification_results")
      .select(
        "item_id, abc_class, output_amount_12m, output_qty_12m, rank_in_brand, cum_pct, prev_class, recalc_at",
      )
      .eq("brand_id", brand)
      .order("rank_in_brand"),
    supabase
      .from("items")
      .select("id, code, name")
      .eq("brand_id", brand),
  ]);
  if (resultsRes.error) throw new Error(`results: ${resultsRes.error.message}`);
  if (itemsRes.error) throw new Error(`items: ${itemsRes.error.message}`);
  const itemMap = new Map(
    ((itemsRes.data ?? []) as unknown as ItemRow[]).map((i) => [i.id, i]),
  );
  return { results: (resultsRes.data ?? []) as unknown as ResultRow[], itemMap };
}

export default async function AbcStructurePage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視 ABC 結構圖的權限</p>
      </main>
    );
  }
  const { results, itemMap } = await loadData();

  const itemAgg = new Map<
    string,
    { class: string; amount: number; qty: number; rank: number | null; cum: number | null }
  >();
  for (const r of results) {
    const cls = (r.abc_class ?? "C").toUpperCase();
    const cur = itemAgg.get(r.item_id) ?? {
      class: cls,
      amount: 0,
      qty: 0,
      rank: r.rank_in_brand,
      cum: r.cum_pct,
    };
    cur.amount += Number(r.output_amount_12m ?? 0);
    cur.qty += Number(r.output_qty_12m ?? 0);
    if (cls > cur.class) cur.class = cls;
    itemAgg.set(r.item_id, cur);
  }

  const stats = { A: 0, B: 0, C: 0 };
  const valStats = { A: 0, B: 0, C: 0 };
  for (const v of itemAgg.values()) {
    const k = v.class as keyof typeof stats;
    if (stats[k] !== undefined) {
      stats[k]++;
      valStats[k] += v.amount;
    }
  }
  const total = stats.A + stats.B + stats.C;
  const totalVal = valStats.A + valStats.B + valStats.C;

  const rowList = Array.from(itemAgg.entries())
    .map(([id, v]) => ({ ...v, item_id: id, item: itemMap.get(id) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 80);

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">ABC 結構圖</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          12.1
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          以 12 個月出庫金額分類，A/B/C 結構視覺化
        </span>
      </header>

      <div className="grid grid-cols-3 gap-3">
        {(["A", "B", "C"] as const).map((cls) => {
          const pct = total > 0 ? Math.round((stats[cls] / total) * 100) : 0;
          const valPct = totalVal > 0 ? Math.round((valStats[cls] / totalVal) * 100) : 0;
          return (
            <div
              key={cls}
              className={`bg-white border-2 rounded-md p-4 ${CLASS_BADGE[cls]}`}
            >
              <div className="flex items-baseline justify-between">
                <span className="text-[36px] font-bold">{cls}</span>
                <span className="text-[12px]">{`${stats[cls]} 料號 · ${pct}%`}</span>
              </div>
              <div className="text-[11.5px] mt-2">
                {`12 個月出庫值：NT$${Math.round(valStats[cls]).toLocaleString("en-US")}`}
              </div>
              <div className="text-[11.5px]">
                {`占總出庫值 ${valPct}%`}
              </div>
            </div>
          );
        })}
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
          📊 ABC 結構明細（依出庫金額排序）
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead className="bg-[#F4F4F4] text-[#444]">
              <tr>
                <th className="px-3 py-2 text-left">排名</th>
                <th className="px-3 py-2 text-left">分類</th>
                <th className="px-3 py-2 text-left">料號</th>
                <th className="px-3 py-2 text-left">商品名稱</th>
                <th className="px-3 py-2 text-right">12M 出庫量</th>
                <th className="px-3 py-2 text-right">12M 出庫金額</th>
                <th className="px-3 py-2 text-right">累計占比</th>
              </tr>
            </thead>
            <tbody>
              {rowList.map((r) => (
                <tr key={r.item_id}>
                  <td className="px-3 py-2 font-mono">{r.rank ?? "—"}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] border ${
                        CLASS_BADGE[r.class] ?? CLASS_BADGE.C
                      }`}
                    >
                      {r.class}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono">{r.item?.code ?? "—"}</td>
                  <td className="px-3 py-2">{r.item?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.qty.toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {Math.round(r.amount).toLocaleString("en-US")}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">
                    {r.cum ? `${Number(r.cum).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
              {rowList.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-[#888]">
                    尚未執行 ABC 分類
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
