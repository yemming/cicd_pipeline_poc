import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const STATUS_MAP: Record<string, { label: string; color: "blue" | "amber" | "green" | "red" | "gray" }> = {
  active: { label: "寄存中", color: "blue" },
  partial_converted: { label: "部分結算", color: "amber" },
  fully_converted: { label: "已結算", color: "green" },
  returned: { label: "已退回", color: "gray" },
  expired: { label: "已過期", color: "red" },
  cancelled: { label: "已取消", color: "gray" },
};

export default async function Page() {
  const supabase = await createClient();
  const [{ data: consigns }, { data: items }, { data: suppliers }, { data: bins }] = await Promise.all([
    supabase
      .from("consignment_stocks")
      .select("id, con_no, supplier_id, item_id, bin_id, initial_qty, remaining_qty, start_date, end_date, status, notes")
      .order("start_date", { ascending: false }),
    supabase.from("items").select("id, code, name"),
    supabase.from("suppliers").select("id, name"),
    supabase.from("warehouse_bins").select("id, code"),
  ]);

  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const binMap = new Map((bins ?? []).map((b) => [b.id, b.code]));

  return (
    <PartsShell
      title="寄存管理"
      chapter="7.5"
      description="供應商寄存品 — 用了才結算,可退回。系統追蹤每筆 con_no 的剩餘量與到期日"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "庫存作業" },
        { label: "寄存管理" },
      ]}
    >
      <PartsTable
        rows={consigns ?? []}
        emptyText="尚無寄存品"
        columns={[
          { key: "con_no", label: "寄存單號", render: (c) => <span className="font-mono text-[11px] text-[#185FA5]">{c.con_no}</span> },
          { key: "supplier_id", label: "供應商", render: (c) => supplierMap.get(c.supplier_id) ?? "—" },
          {
            key: "item_id",
            label: "料件",
            render: (c) => {
              const item = itemMap.get(c.item_id);
              return item ? (
                <div>
                  <div className="font-mono text-[10px] text-[#185FA5]">{item.code}</div>
                  <div className="text-[11px]">{item.name}</div>
                </div>
              ) : "—";
            },
          },
          { key: "bin_id", label: "庫位", render: (c) => (c.bin_id ? binMap.get(c.bin_id) ?? "—" : "—") },
          { key: "initial_qty", label: "原始", align: "right" },
          { key: "remaining_qty", label: "剩餘", align: "right", render: (c) => <span className="font-semibold">{Number(c.remaining_qty).toLocaleString()}</span> },
          { key: "start_date", label: "起" },
          { key: "end_date", label: "迄" },
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (c) => {
              const meta = STATUS_MAP[c.status] ?? STATUS_MAP.active;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
        ]}
      />
    </PartsShell>
  );
}
