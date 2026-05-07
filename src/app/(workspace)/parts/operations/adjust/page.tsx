import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge, ComingSoonNote } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  // 顯示最近異動的 stock_items(視為調整候選)
  const [{ data: stocks }, { data: items }, { data: warehouses }] = await Promise.all([
    supabase
      .from("stock_items")
      .select("id, item_id, warehouse_id, qty, unit_cost, status, serial_no, batch_no, last_movement_at")
      .order("last_movement_at", { ascending: false })
      .limit(50),
    supabase.from("items").select("id, code, name"),
    supabase.from("warehouses").select("id, name"),
  ]);

  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));
  const whMap = new Map((warehouses ?? []).map((w) => [w.id, w.name]));

  return (
    <PartsShell
      title="備件庫存調整"
      chapter="7.6"
      description="人工微調庫存(冷藏 / 解凍 / 預留 / 解除預留 / 變更庫位等)"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "庫存作業" },
        { label: "備件庫存調整" },
      ]}
      toolbarRight={<ComingSoonNote feature="調整介面" />}
    >
      <h2 className="text-[13px] font-bold mb-2">最近 50 筆庫存異動(可作為調整候選)</h2>
      <PartsTable
        rows={stocks ?? []}
        emptyText="目前沒有任何庫存"
        columns={[
          {
            key: "item_id",
            label: "料件",
            render: (s) => {
              const item = itemMap.get(s.item_id);
              return item ? (
                <div>
                  <div className="font-mono text-[10px] text-[#185FA5]">{item.code}</div>
                  <div className="text-[11px]">{item.name}</div>
                </div>
              ) : "—";
            },
          },
          { key: "serial_no", label: "序列/批次", render: (s) => <span className="font-mono text-[10px]">{s.serial_no ?? s.batch_no ?? "—"}</span> },
          { key: "warehouse_id", label: "倉庫", render: (s) => whMap.get(s.warehouse_id) ?? "—" },
          { key: "qty", label: "數量", align: "right" },
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (s) => {
              const colorMap: Record<string, "green" | "amber" | "red" | "purple" | "gray"> = {
                available: "green",
                reserved: "purple",
                frozen: "red",
                in_transit: "amber",
                consigned: "amber",
                scrapped: "gray",
              };
              return <StatusBadge label={s.status} color={colorMap[s.status] ?? "gray"} />;
            },
          },
          {
            key: "last_movement_at",
            label: "最後異動",
            render: (s) => new Date(s.last_movement_at).toLocaleString("zh-TW", { hour12: false }),
          },
        ]}
      />
    </PartsShell>
  );
}
