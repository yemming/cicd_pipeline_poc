import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const CONTROL_TYPE_LABELS: Record<string, { label: string; color: "red" | "amber" | "green" }> = {
  serial: { label: "序列號", color: "red" },
  lot: { label: "批號", color: "amber" },
  qty: { label: "數量", color: "green" },
};

export default async function Page() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("items")
    .select(
      "id, code, name, category, base_uom, control_type, batch_tracking_required, default_supplier_id, is_active",
    )
    .order("code")
    .limit(500);

  const supplierIds = Array.from(new Set((items ?? []).map((i) => i.default_supplier_id).filter(Boolean) as string[]));
  const { data: suppliers } = supplierIds.length
    ? await supabase.from("suppliers").select("id, name").in("id", supplierIds)
    : { data: [] };
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));

  return (
    <PartsShell
      title="商品基礎資料"
      chapter="3.1"
      description="所有交易單據的最小單元 — 料件主檔(SKU)"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "商品基礎資料" },
      ]}
    >
      <PartsTable
        rows={items ?? []}
        columns={[
          {
            key: "code",
            label: "料號",
            render: (i) => <span className="font-mono text-[11px] text-[#185FA5]">{i.code}</span>,
          },
          { key: "name", label: "品名" },
          { key: "category", label: "分類", render: (i) => i.category ?? "—" },
          { key: "base_uom", label: "單位", align: "center" },
          {
            key: "control_type",
            label: "管控",
            align: "center",
            render: (i) => {
              const meta = CONTROL_TYPE_LABELS[i.control_type] ?? CONTROL_TYPE_LABELS.qty;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
          {
            key: "default_supplier_id",
            label: "預設供應商",
            render: (i) => i.default_supplier_id ? supplierMap.get(i.default_supplier_id) ?? "—" : "—",
          },
          {
            key: "is_active",
            label: "狀態",
            align: "center",
            render: (i) => <StatusBadge label={i.is_active ? "啟用" : "停用"} color={i.is_active ? "green" : "gray"} />,
          },
        ]}
      />
    </PartsShell>
  );
}
