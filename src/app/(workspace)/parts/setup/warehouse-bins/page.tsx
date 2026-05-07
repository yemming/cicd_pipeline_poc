import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: bins }, { data: zones }, { data: warehouses }] = await Promise.all([
    supabase
      .from("warehouse_bins")
      .select("id, code, name, zone_id, capacity, is_active, warehouse_id")
      .order("code")
      .limit(500),
    supabase.from("warehouse_zones").select("id, code, name").eq("is_active", true),
    supabase.from("warehouses").select("id, code, name").eq("is_active", true),
  ]);

  const list = bins ?? [];
  const zoneMap = new Map((zones ?? []).map((z) => [z.id, { code: z.code, name: z.name }]));
  const whMap = new Map((warehouses ?? []).map((w) => [w.id, { code: w.code, name: w.name }]));

  return (
    <PartsShell
      title="倉庫庫區庫位"
      chapter="2.2"
      description={`明細列表(顯示前 ${list.length} 筆),所有庫位代碼必須唯一,作為 stock_items 的 bin_id`}
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "倉庫庫區庫位" },
      ]}
    >
      <PartsTable
        rows={list}
        columns={[
          {
            key: "code",
            label: "庫位代號",
            render: (b) => <span className="font-mono text-[11px] text-[#7F77DD]">{b.code}</span>,
          },
          { key: "name", label: "名稱", render: (b) => b.name ?? "—" },
          {
            key: "warehouse_id",
            label: "倉庫",
            render: (b) => {
              const w = whMap.get(b.warehouse_id);
              return w ? `${w.code} · ${w.name}` : "—";
            },
          },
          {
            key: "zone_id",
            label: "庫區",
            render: (b) => {
              if (!b.zone_id) return "—";
              const z = zoneMap.get(b.zone_id);
              return z ? `${z.code} · ${z.name}` : b.zone_id;
            },
          },
          { key: "capacity", label: "容量", align: "right", render: (b) => <span>{b.capacity ?? 0} 件</span> },
          {
            key: "is_active",
            label: "狀態",
            align: "center",
            render: (b) => <StatusBadge label={b.is_active ? "啟用" : "停用"} color={b.is_active ? "green" : "gray"} />,
          },
        ]}
      />
    </PartsShell>
  );
}
