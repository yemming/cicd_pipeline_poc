import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const ACTION_LABELS: Record<string, { label: string; color: "green" | "amber" | "red" | "gray" }> = {
  return_to_factory: { label: "回原廠", color: "green" },
  scrap: { label: "報廢", color: "red" },
  retain: { label: "庫存保留", color: "amber" },
  pending: { label: "待處理", color: "gray" },
};

export default async function Page() {
  const supabase = await createClient();
  const [{ data: oldParts }, { data: items }, { data: bins }] = await Promise.all([
    supabase
      .from("old_parts")
      .select("id, item_id, ro_id, cl_id, serial_no, bin_id, entry_date, expiry_date, disposal_action, disposed_at, notes")
      .order("entry_date", { ascending: false })
      .limit(200),
    supabase.from("items").select("id, code, name"),
    supabase.from("warehouse_bins").select("id, code"),
  ]);

  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));
  const binMap = new Map((bins ?? []).map((b) => [b.id, b.code]));

  return (
    <PartsShell
      title="舊件管理"
      chapter="11.3"
      description="保固索賠取下的舊件 → 暫存倉等待處置(回原廠 / 報廢 / 留存)"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "保固索賠" },
        { label: "舊件管理" },
      ]}
    >
      <PartsTable
        rows={oldParts ?? []}
        emptyText="尚無舊件 — 還沒接過保固索賠"
        columns={[
          {
            key: "item_id",
            label: "料件",
            render: (p) => {
              const item = itemMap.get(p.item_id);
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
          { key: "serial_no", label: "序列號", render: (p) => <span className="font-mono text-[11px]">{p.serial_no ?? "—"}</span> },
          { key: "bin_id", label: "暫存位置", render: (p) => (p.bin_id ? binMap.get(p.bin_id) ?? "—" : "—") },
          { key: "entry_date", label: "入暫存日" },
          { key: "expiry_date", label: "處置期限", render: (p) => p.expiry_date ?? "—" },
          {
            key: "disposal_action",
            label: "處置方式",
            align: "center",
            render: (p) => {
              const meta = ACTION_LABELS[p.disposal_action ?? "pending"] ?? ACTION_LABELS.pending;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
          {
            key: "disposed_at",
            label: "處置時間",
            render: (p) => (p.disposed_at ? new Date(p.disposed_at).toISOString().slice(0, 10) : "—"),
          },
        ]}
      />
    </PartsShell>
  );
}
