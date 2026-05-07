import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: serialItems }, { data: serialStocks }] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, name, category, control_type, is_active")
      .eq("control_type", "serial")
      .order("code"),
    supabase
      .from("stock_items")
      .select("id, item_id, serial_no, warehouse_id, status, warranty_start, warranty_end, last_movement_at")
      .not("serial_no", "is", null)
      .order("last_movement_at", { ascending: false })
      .limit(50),
  ]);

  const itemMap = new Map((serialItems ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));

  return (
    <PartsShell
      title="序列號追蹤"
      chapter="3.3"
      description="序列號管控料件 + 已入庫的序列號明細(可追溯保固、發貨流向)"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "序列號追蹤" },
      ]}
    >
      <h2 className="text-[13px] font-bold mb-2 text-[#1A1917]">
        序列號管控料件 ({(serialItems ?? []).length} 種)
      </h2>
      <PartsTable
        rows={serialItems ?? []}
        emptyText="目前沒有 serial 管控料件"
        columns={[
          {
            key: "code",
            label: "料號",
            render: (i) => <span className="font-mono text-[11px] text-[#CC0000]">{i.code}</span>,
          },
          { key: "name", label: "品名" },
          { key: "category", label: "分類", render: (i) => i.category ?? "—" },
          {
            key: "is_active",
            label: "狀態",
            align: "center",
            render: (i) => <StatusBadge label={i.is_active ? "啟用" : "停用"} color={i.is_active ? "green" : "gray"} />,
          },
        ]}
      />

      <h2 className="text-[13px] font-bold mt-6 mb-2 text-[#1A1917]">
        最近 50 筆已入庫序列號
      </h2>
      <PartsTable
        rows={serialStocks ?? []}
        emptyText="尚未有任何序列號庫存"
        columns={[
          {
            key: "serial_no",
            label: "序列號",
            render: (s) => <span className="font-mono text-[11px] text-[#185FA5]">{s.serial_no}</span>,
          },
          {
            key: "item_id",
            label: "料件",
            render: (s) => {
              const item = itemMap.get(s.item_id);
              return item ? `${item.code} · ${item.name}` : s.item_id;
            },
          },
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
          { key: "warranty_start", label: "保固起", render: (s) => s.warranty_start ?? "—" },
          { key: "warranty_end", label: "保固止", render: (s) => s.warranty_end ?? "—" },
          {
            key: "last_movement_at",
            label: "最後異動",
            render: (s) => (s.last_movement_at ? new Date(s.last_movement_at).toISOString().slice(0, 10) : "—"),
          },
        ]}
      />
    </PartsShell>
  );
}
