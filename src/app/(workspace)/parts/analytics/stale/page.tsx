import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const DAYS_THRESHOLD = 90; // 超過 90 天無異動視為呆滯

export default async function Page() {
  const supabase = await createClient();
  const cutoff = new Date(Date.now() - DAYS_THRESHOLD * 86400000).toISOString();

  const [{ data: staleItems }, { data: items }, { data: warehouses }] = await Promise.all([
    supabase
      .from("stock_items")
      .select("id, item_id, warehouse_id, qty, unit_cost, status, last_movement_at, created_at")
      .lt("last_movement_at", cutoff)
      .gt("qty", 0)
      .order("last_movement_at", { ascending: true })
      .limit(200),
    supabase.from("items").select("id, code, name, category"),
    supabase.from("warehouses").select("id, name"),
  ]);

  const list = staleItems ?? [];
  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name, category: i.category }]));
  const whMap = new Map((warehouses ?? []).map((w) => [w.id, w.name]));

  const totalValue = list.reduce((s, r) => s + Number(r.qty) * Number(r.unit_cost ?? 0), 0);
  const totalQty = list.reduce((s, r) => s + Number(r.qty), 0);

  return (
    <PartsShell
      title="呆滯庫存"
      chapter="12.4"
      description={`超過 ${DAYS_THRESHOLD} 天無異動且仍有庫存的料件 — 通常需要做促銷 / 退貨 / 報廢決策`}
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "分析報表" },
        { label: "呆滯庫存" },
      ]}
    >
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <Stat label="呆滯品項" value={list.length.toString()} unit="筆" color="#CC0000" />
        <Stat label="呆滯數量" value={Math.round(totalQty).toLocaleString()} unit="件" color="#854F0B" />
        <Stat label="呆滯庫值" value={`NT$ ${Math.round(totalValue).toLocaleString()}`} color="#7F77DD" />
      </div>

      <PartsTable
        rows={list}
        emptyText={`太棒了 — ${DAYS_THRESHOLD} 天內所有庫存都有異動,沒有呆滯`}
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
                  {item.category && <div className="text-[9px] text-[#9A9890]">{item.category}</div>}
                </div>
              ) : (
                "—"
              );
            },
          },
          { key: "warehouse_id", label: "倉庫", render: (s) => whMap.get(s.warehouse_id) ?? "—" },
          { key: "qty", label: "庫存", align: "right", render: (s) => Number(s.qty).toLocaleString() },
          { key: "unit_cost", label: "單位成本", align: "right", render: (s) => `NT$ ${Math.round(Number(s.unit_cost ?? 0)).toLocaleString()}` },
          {
            key: "value",
            label: "庫值",
            align: "right",
            render: (s) => <span className="font-semibold text-[#854F0B]">NT$ {Math.round(Number(s.qty) * Number(s.unit_cost ?? 0)).toLocaleString()}</span>,
          },
          {
            key: "last_movement_at",
            label: "最後異動",
            render: (s) => {
              const d = new Date(s.last_movement_at);
              const days = Math.round((Date.now() - d.getTime()) / 86400000);
              return (
                <div>
                  <div className="text-[11px]">{d.toISOString().slice(0, 10)}</div>
                  <div className="text-[10px] text-[#CC0000] font-semibold">{days} 天前</div>
                </div>
              );
            },
          },
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (s) => <StatusBadge label={s.status} color={s.status === "available" ? "amber" : "gray"} />,
          },
        ]}
      />
    </PartsShell>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: string; unit?: string; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-[#EEECE6] px-3 py-2.5">
      <div className="text-[10px] text-[#9A9890] uppercase tracking-wide">{label}</div>
      <div className="text-[18px] font-bold mt-0.5" style={{ color }}>
        {value}
        {unit && <span className="text-[11px] text-[#9A9890] font-medium ml-1">{unit}</span>}
      </div>
    </div>
  );
}
