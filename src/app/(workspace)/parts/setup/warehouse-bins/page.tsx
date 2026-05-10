import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

type Warehouse = {
  id: string;
  code: string;
  name: string;
  type: string | null;
  is_active: boolean | null;
};

type Zone = {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  control_level: string | null;
  is_active: boolean | null;
};

type Bin = {
  id: string;
  warehouse_id: string;
  zone_id: string | null;
  code: string;
  name: string | null;
  capacity: number | null;
  is_active: boolean | null;
};

type Slot = {
  id: string;
  warehouse_id: string;
  bin_id: string | null;
  code: string;
  position: string | null;
  abc_required: string | null;
  is_occupied: boolean | null;
};

async function loadData() {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const [whRes, zRes, bRes, sRes] = await Promise.all([
    supabase
      .from("warehouses")
      .select("id, code, name, type, is_active")
      .eq("brand_id", brand)
      .order("code"),
    supabase
      .from("warehouse_zones")
      .select("id, warehouse_id, code, name, control_level, is_active")
      .eq("brand_id", brand),
    supabase
      .from("warehouse_bins")
      .select("id, warehouse_id, zone_id, code, name, capacity, is_active")
      .eq("brand_id", brand),
    supabase
      .from("warehouse_slots")
      .select("id, warehouse_id, bin_id, code, position, abc_required, is_occupied")
      .eq("brand_id", brand),
  ]);
  if (whRes.error) throw new Error(`warehouses: ${whRes.error.message}`);
  if (zRes.error) throw new Error(`zones: ${zRes.error.message}`);
  if (bRes.error) throw new Error(`bins: ${bRes.error.message}`);
  if (sRes.error) throw new Error(`slots: ${sRes.error.message}`);
  return {
    warehouses: (whRes.data ?? []) as unknown as Warehouse[],
    zones: (zRes.data ?? []) as unknown as Zone[],
    bins: (bRes.data ?? []) as unknown as Bin[],
    slots: (sRes.data ?? []) as unknown as Slot[],
  };
}

export default async function WarehouseBinsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.WAREHOUSE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視倉庫設定的權限</p>
      </main>
    );
  }
  const { warehouses, zones, bins, slots } = await loadData();
  const zonesByWh = new Map<string, Zone[]>();
  for (const z of zones) {
    if (!zonesByWh.has(z.warehouse_id)) zonesByWh.set(z.warehouse_id, []);
    zonesByWh.get(z.warehouse_id)!.push(z);
  }
  const binsByZone = new Map<string, Bin[]>();
  for (const b of bins) {
    const k = b.zone_id ?? "_none";
    if (!binsByZone.has(k)) binsByZone.set(k, []);
    binsByZone.get(k)!.push(b);
  }
  const slotsByBin = new Map<string, Slot[]>();
  for (const s of slots) {
    if (!s.bin_id) continue;
    if (!slotsByBin.has(s.bin_id)) slotsByBin.set(s.bin_id, []);
    slotsByBin.get(s.bin_id)!.push(s);
  }

  return (
    <main className="px-6 py-6 space-y-4">
      <header className="flex items-center gap-3">
        <h1 className="text-[20px] font-semibold">倉庫庫區庫位</h1>
        <span className="px-2 py-0.5 text-[11px] rounded bg-[#1A3A5C] text-white">
          02.3
        </span>
        <span className="text-[12.5px] text-[#6B6B6B]">
          {`唯讀視圖（複雜層級暫不開放編輯）· 倉庫 ${warehouses.length} / 庫區 ${zones.length} / 庫位 ${bins.length} / 儲位 ${slots.length}`}
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">倉庫</div>
          <div className="text-[20px] font-bold text-[#1A3A5C] mt-1">
            {warehouses.length}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">庫區</div>
          <div className="text-[20px] font-bold text-[#854F0B] mt-1">
            {zones.length}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">庫位</div>
          <div className="text-[20px] font-bold text-[#3B6D11] mt-1">
            {bins.length}
          </div>
        </div>
        <div className="bg-white border border-[#E1E1E1] rounded-md px-4 py-3">
          <div className="text-[11px] text-[#888]">儲位</div>
          <div className="text-[20px] font-bold text-[#0F6E56] mt-1">
            {slots.length}
          </div>
        </div>
      </div>

      <section className="rounded-md border border-[#E1E1E1] bg-white">
        <header className="px-4 py-3 border-b border-[#E1E1E1] text-[13px] font-semibold">
          🏗 倉庫層級結構
        </header>
        <div className="divide-y divide-[#E1E1E1]">
          {warehouses.map((w) => {
            const zList = zonesByWh.get(w.id) ?? [];
            return (
              <div key={w.id} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[12.5px]">{w.code}</span>
                  <span className="font-semibold text-[14px]">{w.name}</span>
                  <span className="text-[11px] text-[#666]">
                    {w.type ?? "—"}
                  </span>
                  <span
                    className={`ml-auto px-2 py-0.5 rounded text-[11px] ${
                      w.is_active
                        ? "bg-[#EAF3DE] text-[#3B6D11]"
                        : "bg-[#F0F0F0] text-[#444]"
                    }`}
                  >
                    {w.is_active ? "啟用" : "停用"}
                  </span>
                </div>
                {zList.length > 0 ? (
                  <div className="mt-2 ml-4 space-y-1">
                    {zList.map((z) => {
                      const bList = binsByZone.get(z.id) ?? [];
                      return (
                        <div key={z.id} className="text-[12.5px]">
                          <div className="flex items-center gap-2 text-[#444]">
                            <span className="font-mono">{z.code}</span>
                            <span>{z.name}</span>
                            {z.control_level ? (
                              <span className="px-1.5 py-0.5 rounded bg-[#EBF3FF] text-[#1A3A5C] text-[10.5px]">
                                {z.control_level}
                              </span>
                            ) : null}
                            <span className="text-[#888] text-[11px]">
                              {`${bList.length} 庫位`}
                            </span>
                          </div>
                          {bList.length > 0 ? (
                            <div className="ml-4 mt-1 flex flex-wrap gap-1.5 text-[11.5px]">
                              {bList.map((b) => {
                                const sList = slotsByBin.get(b.id) ?? [];
                                return (
                                  <span
                                    key={b.id}
                                    className="px-2 py-0.5 rounded border border-[#E1E1E1] bg-[#FAFAFA]"
                                    title={b.name ?? ""}
                                  >
                                    {`${b.code}（${sList.length}）`}
                                  </span>
                                );
                              })}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-[11px] text-[#888] mt-1.5 ml-4">
                    尚未建立庫區
                  </div>
                )}
              </div>
            );
          })}
          {warehouses.length === 0 ? (
            <div className="px-4 py-6 text-center text-[#888]">尚無倉庫資料</div>
          ) : null}
        </div>
      </section>

      <div className="px-3 py-2 rounded bg-[#FDF3E3] border border-[#F59E0B] text-[12px] text-[#854F0B]">
        ⚠️ 此頁為唯讀視圖。倉庫層級涉及多表約束，CRUD 暫由「主檔資料」模組統一管理。
      </div>
    </main>
  );
}
