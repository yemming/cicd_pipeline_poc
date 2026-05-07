import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  // 用 v_stock_balances + 12 個月出庫量(從 abc_classification_results 拿)估周轉率
  const [{ data: balances }, { data: abcRes }, { data: items }] = await Promise.all([
    supabase.from("v_stock_balances").select("item_id, item_code, item_name, qty_total, avg_unit_cost"),
    supabase.from("abc_classification_results").select("item_id, output_qty_12m, output_amount_12m"),
    supabase.from("items").select("id, code, name, category").eq("is_active", true),
  ]);

  // 聚合每料件的庫存與年出庫
  type Row = {
    itemId: string;
    code: string;
    name: string;
    category: string | null;
    avgStock: number;
    avgValue: number;
    annualOutQty: number;
    annualOutAmount: number;
    turnover: number; // 周轉次數 = 年出庫 / 平均庫存
  };

  const balanceByItem = new Map<string, { qty: number; value: number; code: string; name: string }>();
  for (const b of balances ?? []) {
    const cur = balanceByItem.get(b.item_id) ?? { qty: 0, value: 0, code: b.item_code, name: b.item_name };
    cur.qty += Number(b.qty_total ?? 0);
    cur.value += Number(b.qty_total ?? 0) * Number(b.avg_unit_cost ?? 0);
    balanceByItem.set(b.item_id, cur);
  }
  const abcByItem = new Map(
    (abcRes ?? []).map((a) => [a.item_id, { qty: Number(a.output_qty_12m ?? 0), amount: Number(a.output_amount_12m ?? 0) }]),
  );
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]));

  const rows: Row[] = [];
  for (const [itemId, bal] of balanceByItem) {
    const item = itemMap.get(itemId);
    const abc = abcByItem.get(itemId);
    const annualOutQty = abc?.qty ?? 0;
    const annualOutAmount = abc?.amount ?? 0;
    const turnover = bal.qty > 0 ? annualOutQty / bal.qty : 0;
    rows.push({
      itemId,
      code: bal.code,
      name: bal.name,
      category: item?.category ?? null,
      avgStock: bal.qty,
      avgValue: bal.value,
      annualOutQty,
      annualOutAmount,
      turnover,
    });
  }
  rows.sort((a, b) => b.turnover - a.turnover);

  const totalTurnover = rows.length > 0 ? rows.reduce((s, r) => s + r.turnover, 0) / rows.length : 0;

  return (
    <PartsShell
      title="庫存周轉率"
      chapter="12.5"
      description="周轉率 = 年出庫量 / 平均庫存;高 = 健康(資金活絡)、低 = 滯銷(壓資金)"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "分析報表" },
        { label: "庫存周轉率" },
      ]}
    >
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <Stat label="平均周轉率" value={totalTurnover.toFixed(2)} unit="次 / 年" color="#185FA5" />
        <Stat label="高周轉品項(≥4)" value={rows.filter((r) => r.turnover >= 4).length.toString()} unit="種" color="#0F6E56" />
        <Stat label="低周轉品項(<1)" value={rows.filter((r) => r.turnover < 1).length.toString()} unit="種" color="#CC0000" />
      </div>

      <PartsTable
        rows={rows}
        emptyText="尚無周轉資料(需先跑 ABC 分類取得年出庫量)"
        rowKey={(r) => r.itemId}
        columns={[
          { key: "code", label: "料號", render: (r) => <span className="font-mono text-[11px] text-[#185FA5]">{r.code}</span> },
          { key: "name", label: "品名" },
          { key: "category", label: "分類", render: (r) => r.category ?? "—" },
          { key: "avgStock", label: "目前庫存", align: "right", render: (r) => Math.round(r.avgStock).toLocaleString() },
          { key: "annualOutQty", label: "年出庫", align: "right", render: (r) => r.annualOutQty.toLocaleString() },
          {
            key: "turnover",
            label: "周轉率",
            align: "right",
            render: (r) => {
              const cls = r.turnover >= 4 ? "text-[#0F6E56]" : r.turnover >= 1 ? "text-[#854F0B]" : "text-[#CC0000]";
              return <span className={`font-semibold ${cls}`}>{r.turnover.toFixed(2)} x</span>;
            },
          },
        ]}
      />
    </PartsShell>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-[#EEECE6] px-3 py-2.5">
      <div className="text-[10px] text-[#9A9890] uppercase tracking-wide">{label}</div>
      <div className="text-[18px] font-bold mt-0.5" style={{ color }}>
        {value}
        {unit && <span className="text-[11px] text-[#9A9890] font-medium ml-1">{unit}</span>}
      </div>
    </div>
  );
}
