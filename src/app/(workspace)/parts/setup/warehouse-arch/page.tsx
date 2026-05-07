import { PartsShell } from "@/components/parts/parts-shell";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: warehouses }, { data: zones }, { data: bins }] = await Promise.all([
    supabase.from("warehouses").select("id, code, name, type, org_id").eq("is_active", true).order("code"),
    supabase.from("warehouse_zones").select("id, code, name, warehouse_id, control_level").eq("is_active", true).order("code"),
    supabase.from("warehouse_bins").select("id, code, name, zone_id, capacity").eq("is_active", true).order("code"),
  ]);

  const wList = warehouses ?? [];
  const zList = zones ?? [];
  const bList = bins ?? [];

  const zonesByWh = new Map<string, typeof zList>();
  for (const z of zList) {
    if (!zonesByWh.has(z.warehouse_id)) zonesByWh.set(z.warehouse_id, []);
    zonesByWh.get(z.warehouse_id)!.push(z);
  }
  const binsByZone = new Map<string, typeof bList>();
  for (const b of bList) {
    if (!b.zone_id) continue;
    if (!binsByZone.has(b.zone_id)) binsByZone.set(b.zone_id, []);
    binsByZone.get(b.zone_id)!.push(b);
  }

  return (
    <PartsShell
      title="倉儲四層架構"
      chapter="2.1"
      description="倉庫 → 庫區 → 庫位 → 擺放(細粒度可選);所有庫存異動最終定位到一個 bin"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "基礎設定" },
        { label: "倉儲四層架構" },
      ]}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="倉庫" value={wList.length} unit="座" color="#185FA5" />
        <Stat label="庫區" value={zList.length} unit="個" color="#7F77DD" />
        <Stat label="庫位" value={bList.length} unit="格" color="#0F6E56" />
        <Stat label="平均容量" value={bList.length > 0 ? Math.round(bList.reduce((s, b) => s + (b.capacity ?? 0), 0) / bList.length) : 0} unit="件 / 庫位" color="#854F0B" />
      </div>

      <div className="space-y-3">
        {wList.map((wh) => {
          const zones = zonesByWh.get(wh.id) ?? [];
          return (
            <div key={wh.id} className="bg-white rounded-lg border border-[#EEECE6] overflow-hidden">
              <div className="px-4 py-2.5 bg-[#FAFAF9] border-b border-[#EEECE6] flex items-baseline gap-3">
                <span className="font-mono text-[12px] font-semibold text-[#185FA5]">{wh.code}</span>
                <span className="text-[14px] font-bold">{wh.name}</span>
                <span className="text-[10px] text-[#854F0B] bg-[#FDF3E3] px-1.5 py-0.5 rounded">
                  {wh.type ?? "general"}
                </span>
                <span className="ml-auto text-[11px] text-[#6B6A68]">
                  {zones.length} 庫區 · {zones.reduce((s, z) => s + (binsByZone.get(z.id)?.length ?? 0), 0)} 庫位
                </span>
              </div>
              <div className="p-3 grid md:grid-cols-2 lg:grid-cols-3 gap-2">
                {zones.length === 0 ? (
                  <div className="text-[11px] text-[#9A9890] py-3 px-2">尚未配置庫區</div>
                ) : (
                  zones.map((z) => {
                    const zBins = binsByZone.get(z.id) ?? [];
                    return (
                      <div key={z.id} className="border border-[#F5F5F4] rounded p-2.5">
                        <div className="flex items-baseline gap-2 mb-1.5">
                          <span className="font-mono text-[10px] text-[#7F77DD]">{z.code}</span>
                          <span className="text-[12px] font-medium">{z.name}</span>
                          <span className="ml-auto text-[10px] text-[#9A9890]">
                            管控:{z.control_level ?? "—"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {zBins.slice(0, 6).map((b) => (
                            <span
                              key={b.id}
                              className="font-mono text-[10px] bg-[#F0EEFF] text-[#7F77DD] px-1.5 py-0.5 rounded"
                            >
                              {b.code}
                            </span>
                          ))}
                          {zBins.length > 6 && (
                            <span className="font-mono text-[10px] text-[#9A9890] px-1">
                              +{zBins.length - 6}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PartsShell>
  );
}

function Stat({ label, value, unit, color }: { label: string; value: number; unit: string; color: string }) {
  return (
    <div className="bg-white rounded-lg border border-[#EEECE6] px-3 py-2.5">
      <div className="text-[10px] text-[#9A9890] uppercase tracking-wide">{label}</div>
      <div className="text-[20px] font-bold mt-0.5" style={{ color }}>
        {value.toLocaleString()}
        <span className="text-[11px] text-[#9A9890] font-medium ml-1">{unit}</span>
      </div>
    </div>
  );
}
