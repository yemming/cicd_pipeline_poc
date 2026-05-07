import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data: items } = await supabase
    .from("items")
    .select(
      "id, code, name, category, base_uom, control_type, batch_tracking_required, gl_inventory_account_id, gl_cogs_account_id, gl_revenue_account_id, is_active",
    )
    .order("code")
    .limit(500);

  return (
    <PartsShell
      title="商品資訊(多維度料號)"
      chapter="3.2"
      description="同一商品在不同維度的呈現:GL 帳科、批次追蹤、單位轉換等"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "商品資訊" },
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
          { key: "base_uom", label: "基本單位", align: "center" },
          {
            key: "batch_tracking_required",
            label: "需批號",
            align: "center",
            render: (i) =>
              i.batch_tracking_required ? <StatusBadge label="是" color="amber" /> : <span className="text-[#9A9890]">—</span>,
          },
          {
            key: "gl_inventory_account_id",
            label: "存貨科目",
            render: (i) => <span className="text-[10px] font-mono text-[#6B6A68]">{i.gl_inventory_account_id?.slice(0, 8) ?? "—"}</span>,
          },
          {
            key: "gl_cogs_account_id",
            label: "成本科目",
            render: (i) => <span className="text-[10px] font-mono text-[#6B6A68]">{i.gl_cogs_account_id?.slice(0, 8) ?? "—"}</span>,
          },
        ]}
      />
    </PartsShell>
  );
}
