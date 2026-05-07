import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data: stagingWh } = await supabase
    .from("warehouses")
    .select("id, code, name, type, address, is_active")
    .or("type.eq.staging,type.eq.warranty,name.ilike.%暫存%,name.ilike.%保固%")
    .order("code");

  const { data: zones } = await supabase
    .from("warehouse_zones")
    .select("id, code, name, warehouse_id, control_level")
    .in("warehouse_id", (stagingWh ?? []).map((w) => w.id))
    .order("code");

  const zonesByWh = new Map<string, typeof zones>();
  for (const z of zones ?? []) {
    if (!zonesByWh.has(z.warehouse_id)) zonesByWh.set(z.warehouse_id, []);
    zonesByWh.get(z.warehouse_id)!.push(z);
  }

  return (
    <PartsShell
      title="暫存倉設定"
      chapter="11.5"
      description="保固索賠舊件入庫的目的地;每倉可有多庫區,對應不同處置流程"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "保固索賠" },
        { label: "暫存倉設定" },
      ]}
    >
      <PartsTable
        rows={stagingWh ?? []}
        emptyText="尚未配置任何暫存倉(可在「2.1 倉儲四層架構」新增 type=staging 的倉庫)"
        columns={[
          {
            key: "code",
            label: "倉庫代號",
            render: (w) => <span className="font-mono text-[11px] text-[#185FA5]">{w.code}</span>,
          },
          { key: "name", label: "名稱" },
          {
            key: "type",
            label: "類型",
            align: "center",
            render: (w) => <StatusBadge label={w.type ?? "general"} color={w.type === "staging" ? "amber" : w.type === "warranty" ? "purple" : "gray"} />,
          },
          {
            key: "zones",
            label: "庫區",
            render: (w) => {
              const zList = zonesByWh.get(w.id) ?? [];
              if (zList.length === 0) return <span className="text-[10px] text-[#9A9890]">未配置</span>;
              return (
                <div className="flex flex-wrap gap-1">
                  {zList.map((z) => (
                    <span key={z.id} className="text-[10px] bg-[#F0EEFF] text-[#7F77DD] px-1.5 py-0.5 rounded">
                      {z.code} · {z.name}
                    </span>
                  ))}
                </div>
              );
            },
          },
          { key: "address", label: "地址", render: (w) => <span className="text-[11px] text-[#6B6A68]">{w.address ?? "—"}</span> },
          {
            key: "is_active",
            label: "狀態",
            align: "center",
            render: (w) => <StatusBadge label={w.is_active ? "啟用" : "停用"} color={w.is_active ? "green" : "gray"} />,
          },
        ]}
      />
    </PartsShell>
  );
}
