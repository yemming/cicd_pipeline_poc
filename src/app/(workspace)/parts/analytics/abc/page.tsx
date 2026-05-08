import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { getBrandKey } from "@/lib/brands/current";
import { listItems } from "@/lib/master-data/queries";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { RecalcButton } from "./_components/recalc-button";

export const dynamic = "force-dynamic";

const CLASS_COLOR: Record<string, string> = {
  A: "bg-[#FFEBE6] text-[#BF2600]",
  B: "bg-[#FFF7E6] text-[#974F00]",
  C: "bg-[#DFE1E6] text-[#42526E]",
};

async function getResults() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("abc_classification_results")
    .select("id, item_id, abc_class, output_amount_12m, output_qty_12m, rank_in_brand, cum_pct, prev_class, recalc_at")
    .eq("brand_id", getBrandKey())
    .is("warehouse_id", null)
    .order("rank_in_brand", { ascending: true });
  if (error) throw new Error(`getResults: ${error.message}`);
  return data ?? [];
}

async function getConfig() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("abc_classification_config")
    .select("threshold_a_pct, threshold_b_pct, rolling_period_months, last_recalc_at")
    .eq("brand_id", getBrandKey())
    .eq("is_active", true)
    .maybeSingle();
  return data;
}

export default async function AbcPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ITEM_VIEW))) {
    return <main className="px-6 py-6"><p className="text-[14px] text-[#BF2600]">沒權限</p></main>;
  }

  const [results, config, items] = await Promise.all([
    getResults(), getConfig(), listItems({ limit: 1000 }),
  ]);
  const itemById = new Map(items.map((i) => [i.id, i]));

  const aCount = results.filter((r) => r.abc_class === "A").length;
  const bCount = results.filter((r) => r.abc_class === "B").length;
  const cCount = results.filter((r) => r.abc_class === "C").length;

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">ABC 分類</h1>
          <p className="text-[13px] text-[#6B778C]">
            基於最近 {config?.rolling_period_months ?? 12} 個月出貨額排序（A ≤ {config?.threshold_a_pct ?? 80}% / B ≤{" "}
            {config?.threshold_b_pct ?? 95}%）・ A:{aCount} B:{bCount} C:{cCount} ・
            {config?.last_recalc_at
              ? ` 上次重跑 ${new Date(config.last_recalc_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}`
              : " 尚未跑過"}
          </p>
        </div>
        <RecalcButton />
      </header>

      <DataTable
        rows={results}
        getKey={(r) => r.id}
        columns={[
          { key: "rank", header: "排名", width: "70px", align: "right", cell: (r) => Number(r.rank_in_brand ?? 0).toLocaleString() },
          { key: "item", header: "料件", cell: (r) => {
            const it = itemById.get(r.item_id);
            return it ? <span><span className="font-mono text-[12px] text-[#6B778C] mr-2">{it.code}</span>{it.name}</span> : "—";
          }},
          { key: "class", header: "ABC", width: "80px", cell: (r) => (
            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${CLASS_COLOR[r.abc_class] ?? ""}`}>{r.abc_class}</span>
          )},
          { key: "prev", header: "上次", width: "70px", cell: (r) => r.prev_class ? (
            <span className={`text-[11px] ${r.prev_class !== r.abc_class ? "text-[#BF2600] font-bold" : "text-[#6B778C]"}`}>
              {r.prev_class}
            </span>
          ) : "—" },
          { key: "qty", header: "12m 數量", align: "right", width: "100px", cell: (r) => Number(r.output_qty_12m).toLocaleString() },
          { key: "amount", header: "12m 金額", align: "right", width: "150px", cell: (r) => `NT$ ${Math.round(Number(r.output_amount_12m)).toLocaleString()}` },
          { key: "cum", header: "累計 %", align: "right", width: "90px", cell: (r) => r.cum_pct != null ? `${Number(r.cum_pct).toFixed(2)}%` : "—" },
        ]}
        empty="尚無 ABC 結果 — 點右上「重跑 ABC」"
      />
    </main>
  );
}
