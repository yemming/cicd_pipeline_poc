import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  // 結合 stock_thresholds + v_stock_balances 找出需要補貨的料件
  const [{ data: thresholds }, { data: balances }, { data: items }, { data: warehouses }] = await Promise.all([
    supabase
      .from("stock_thresholds")
      .select("id, item_id, warehouse_id, min_stock, max_stock, reorder_point, alert_priority")
      .eq("is_active", true),
    supabase.from("v_stock_balances").select("item_id, warehouse_id, qty_available, avg_unit_cost"),
    supabase.from("items").select("id, code, name, default_supplier_id"),
    supabase.from("warehouses").select("id, name"),
  ]);

  const balanceMap = new Map(
    (balances ?? []).map((b) => [`${b.item_id}-${b.warehouse_id}`, { qty: Number(b.qty_available ?? 0), cost: Number(b.avg_unit_cost ?? 0) }]),
  );
  const itemMap = new Map((items ?? []).map((i) => [i.id, i]));
  const whMap = new Map((warehouses ?? []).map((w) => [w.id, w.name]));

  // 計算需補貨清單
  type Row = {
    key: string;
    item_id: string;
    item_code: string;
    item_name: string;
    warehouse_id: string;
    warehouse_name: string;
    current: number;
    reorder_point: number;
    max_stock: number;
    suggest_qty: number;
    estimated_value: number;
    priority: string;
  };
  const rows: Row[] = [];
  for (const t of thresholds ?? []) {
    const cur = balanceMap.get(`${t.item_id}-${t.warehouse_id}`)?.qty ?? 0;
    const cost = balanceMap.get(`${t.item_id}-${t.warehouse_id}`)?.cost ?? 0;
    const reorderPoint = Number(t.reorder_point ?? 0);
    if (cur > reorderPoint) continue; // 不需補貨
    const item = itemMap.get(t.item_id);
    const suggest = Math.max(0, Number(t.max_stock ?? 0) - cur);
    rows.push({
      key: `${t.item_id}-${t.warehouse_id}`,
      item_id: t.item_id,
      item_code: item?.code ?? "—",
      item_name: item?.name ?? "—",
      warehouse_id: t.warehouse_id,
      warehouse_name: whMap.get(t.warehouse_id) ?? "—",
      current: cur,
      reorder_point: reorderPoint,
      max_stock: Number(t.max_stock ?? 0),
      suggest_qty: suggest,
      estimated_value: suggest * cost,
      priority: t.alert_priority ?? "medium",
    });
  }
  rows.sort((a, b) => a.current / a.reorder_point - b.current / b.reorder_point);

  const totalEstimate = rows.reduce((s, r) => s + r.estimated_value, 0);

  return (
    <PartsShell
      title="日常補貨計畫"
      chapter="4.3"
      description="根據庫存水位 + 即時可用量,自動列出今日 / 本週需要補貨的料件清單"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "採購管理" },
        { label: "日常補貨計畫" },
      ]}
    >
      <div className="grid md:grid-cols-3 gap-3 mb-4">
        <Stat label="待補貨品項" value={rows.length.toString()} unit="筆" color="#CC0000" />
        <Stat label="建議採購量" value={Math.round(rows.reduce((s, r) => s + r.suggest_qty, 0)).toLocaleString()} unit="件" color="#854F0B" />
        <Stat label="預估金額" value={`NT$ ${Math.round(totalEstimate).toLocaleString()}`} color="#185FA5" />
      </div>

      <PartsTable
        rows={rows}
        rowKey={(r) => r.key}
        emptyText="所有料件庫存皆高於 reorder_point — 暫不需補貨"
        columns={[
          {
            key: "item",
            label: "料件",
            render: (r) => (
              <div>
                <div className="font-mono text-[10px] text-[#185FA5]">{r.item_code}</div>
                <div className="text-[11px]">{r.item_name}</div>
              </div>
            ),
          },
          { key: "warehouse_name", label: "倉庫" },
          { key: "current", label: "當前", align: "right", render: (r) => <span className="font-semibold text-[#CC0000]">{r.current.toLocaleString()}</span> },
          { key: "reorder_point", label: "再訂購點", align: "right" },
          { key: "max_stock", label: "上限", align: "right" },
          { key: "suggest_qty", label: "建議", align: "right", render: (r) => <span className="font-semibold text-[#0F6E56]">+{r.suggest_qty}</span> },
          { key: "value", label: "預估金額", align: "right", render: (r) => `NT$ ${Math.round(r.estimated_value).toLocaleString()}` },
          {
            key: "priority",
            label: "優先級",
            align: "center",
            render: (r) => {
              const colorMap: Record<string, "red" | "amber" | "blue" | "gray"> = {
                critical: "red",
                high: "amber",
                medium: "blue",
                low: "gray",
              };
              return <StatusBadge label={r.priority} color={colorMap[r.priority] ?? "blue"} />;
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
