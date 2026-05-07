import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const PRIORITY_LABELS: Record<string, { label: string; color: "red" | "amber" | "blue" | "gray" }> = {
  critical: { label: "🔴 緊急", color: "red" },
  high: { label: "🟠 高", color: "amber" },
  medium: { label: "🔵 中", color: "blue" },
  low: { label: "⚪ 低", color: "gray" },
};

export default async function Page() {
  const supabase = await createClient();
  const [{ data: thresholds }, { data: items }, { data: warehouses }, balanceQuery] = await Promise.all([
    supabase
      .from("stock_thresholds")
      .select("id, item_id, warehouse_id, abc_class, min_stock, max_stock, reorder_point, alert_priority, is_active")
      .order("alert_priority", { ascending: false }),
    supabase.from("items").select("id, code, name"),
    supabase.from("warehouses").select("id, code, name").eq("is_active", true),
    supabase.from("v_stock_balances").select("item_id, warehouse_id, qty_available"),
  ]);

  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));
  const warehouseMap = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
  const balanceMap = new Map(
    (balanceQuery.data ?? []).map((b) => [`${b.item_id}-${b.warehouse_id}`, Number(b.qty_available ?? 0)]),
  );

  return (
    <PartsShell
      title="庫存水位設定"
      chapter="10.1"
      description="每料件每倉庫設 min / reorder / max 三道線,庫存跌破時觸發告警"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "預警告警" },
        { label: "庫存水位設定" },
      ]}
    >
      <PartsTable
        rows={thresholds ?? []}
        emptyText="尚未設定任何水位"
        columns={[
          {
            key: "item_id",
            label: "料件",
            render: (t) => {
              const item = itemMap.get(t.item_id);
              return item ? (
                <div>
                  <div className="font-mono text-[10px] text-[#185FA5]">{item.code}</div>
                  <div className="text-[11px]">{item.name}</div>
                </div>
              ) : (
                "—"
              );
            },
          },
          {
            key: "warehouse_id",
            label: "倉庫",
            render: (t) => warehouseMap.get(t.warehouse_id) ?? "—",
          },
          {
            key: "abc_class",
            label: "ABC",
            align: "center",
            render: (t) =>
              t.abc_class && (
                <span
                  className={`inline-block w-5 h-5 rounded-full text-[10px] font-bold leading-5 ${
                    t.abc_class === "A" ? "bg-[#FDECEA] text-[#CC0000]" : t.abc_class === "B" ? "bg-[#FDF3E3] text-[#854F0B]" : "bg-[#F5F5F4] text-[#6B6A68]"
                  }`}
                >
                  {t.abc_class}
                </span>
              ),
          },
          { key: "min_stock", label: "最低", align: "right", render: (t) => Number(t.min_stock).toLocaleString() },
          { key: "reorder_point", label: "再訂購", align: "right", render: (t) => <span className="text-[#854F0B] font-semibold">{Number(t.reorder_point).toLocaleString()}</span> },
          { key: "max_stock", label: "最高", align: "right", render: (t) => Number(t.max_stock).toLocaleString() },
          {
            key: "current",
            label: "當前",
            align: "right",
            render: (t) => {
              const cur = balanceMap.get(`${t.item_id}-${t.warehouse_id}`) ?? 0;
              const isLow = cur < Number(t.reorder_point);
              return (
                <span className={`font-semibold ${isLow ? "text-[#CC0000]" : "text-[#0F6E56]"}`}>
                  {cur.toLocaleString()}
                  {isLow && <span className="ml-1 text-[10px]">⚠️</span>}
                </span>
              );
            },
          },
          {
            key: "alert_priority",
            label: "優先級",
            align: "center",
            render: (t) => {
              const meta = PRIORITY_LABELS[t.alert_priority] ?? PRIORITY_LABELS.medium;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
        ]}
      />
    </PartsShell>
  );
}
