import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const STATUS_LABELS: Record<string, { label: string; color: "red" | "amber" | "purple" | "gray" }> = {
  frozen: { label: "凍結", color: "red" },
  reserved: { label: "預留", color: "purple" },
  in_transit: { label: "在途", color: "amber" },
  scrapped: { label: "報廢", color: "gray" },
};

export default async function Page() {
  const supabase = await createClient();
  const [{ data: exceptions }, { data: items }, { data: warehouses }] = await Promise.all([
    supabase
      .from("stock_items")
      .select("id, item_id, warehouse_id, qty, unit_cost, status, serial_no, batch_no, reserved_for_doc_id, reserved_for_doc_type, last_movement_at, notes")
      .in("status", ["frozen", "reserved", "in_transit", "scrapped"])
      .gt("qty", 0)
      .order("last_movement_at", { ascending: false })
      .limit(200),
    supabase.from("items").select("id, code, name"),
    supabase.from("warehouses").select("id, name"),
  ]);

  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));
  const whMap = new Map((warehouses ?? []).map((w) => [w.id, w.name]));

  return (
    <PartsShell
      title="例外出入庫"
      chapter="7.4"
      description="非正常狀態庫存 — frozen / reserved / in_transit / scrapped,需人工介入處理"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "庫存作業" },
        { label: "例外出入庫" },
      ]}
    >
      <PartsTable
        rows={exceptions ?? []}
        emptyText="目前沒有例外狀態的庫存 — 系統運作正常"
        columns={[
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (s) => {
              const meta = STATUS_LABELS[s.status] ?? STATUS_LABELS.frozen;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
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
          { key: "serial_no", label: "序列 / 批次", render: (s) => <span className="font-mono text-[10px]">{s.serial_no ?? s.batch_no ?? "—"}</span> },
          { key: "warehouse_id", label: "倉庫", render: (s) => whMap.get(s.warehouse_id) ?? "—" },
          { key: "qty", label: "數量", align: "right", render: (s) => Number(s.qty).toLocaleString() },
          {
            key: "value",
            label: "庫值",
            align: "right",
            render: (s) => `NT$ ${Math.round(Number(s.qty) * Number(s.unit_cost ?? 0)).toLocaleString()}`,
          },
          {
            key: "reserved_for",
            label: "預留 / 凍結原因",
            render: (s) =>
              s.reserved_for_doc_type ? (
                <div className="text-[11px]">
                  <div>{s.reserved_for_doc_type}</div>
                  <div className="font-mono text-[9px] text-[#9A9890]">{s.reserved_for_doc_id?.slice(0, 8) ?? "—"}</div>
                </div>
              ) : (
                <span className="text-[#9A9890] text-[10px]">{s.notes ?? "—"}</span>
              ),
          },
          {
            key: "last_movement_at",
            label: "最後異動",
            render: (s) => new Date(s.last_movement_at).toISOString().slice(0, 10),
          },
        ]}
      />
    </PartsShell>
  );
}
