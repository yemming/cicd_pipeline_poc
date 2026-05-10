import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { listItems } from "@/lib/master-data/queries";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

import { ThresholdForm } from "./_components/threshold-form";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

async function getThresholds() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_thresholds")
    .select("id, warehouse_id, item_id, min_stock, reorder_point, max_stock, abc_class, alert_priority, is_active")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw new Error(`getThresholds: ${error.message}`);
  return data ?? [];
}

async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses").select("*")
    .eq("brand_id", (await getActiveScope()).brand_id).eq("is_active", true).order("code");
  if (error) throw new Error(`getWarehouses: ${error.message}`);
  return data ?? [];
}

const PRIORITY_COLOR: Record<string, string> = {
  low: "bg-[#DFE1E6] text-[#42526E]",
  medium: "bg-[#DEEBFF] text-[#0747A6]",
  high: "bg-[#FFF7E6] text-[#974F00]",
  critical: "bg-[#FFEBE6] text-[#BF2600]",
};

export default async function ThresholdsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return <main className="px-6 py-6"><p className="text-[14px] text-[#BF2600]">沒權限</p></main>;
  }
  const canConfig = await hasPermission(PERMISSIONS.ALERT_CONFIG);

  const [thresholds, warehouses, items] = await Promise.all([
    getThresholds(), getWarehouses(), listItems({ limit: 1000 }),
  ]);
  const whById = new Map(warehouses.map((w) => [w.id, w]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">庫存水位設定</h1>
        <p className="text-[13px] text-[#6B778C]">
          每個 (倉庫, 料件) 一行；UPSERT — 重複設會更新。共 {thresholds.length} 條規則。
        </p>
      </header>

      {canConfig && <ThresholdForm warehouses={warehouses} items={items} />}

      <DataTable
        rows={thresholds}
        getKey={(t) => t.id}
        columns={[
          { key: "wh", header: "倉庫", width: "150px", cell: (t) => <span className="font-mono text-[12px]">{whById.get(t.warehouse_id)?.code ?? "—"}</span> },
          { key: "item", header: "料件", cell: (t) => {
            const it = itemById.get(t.item_id);
            return it ? <span><span className="font-mono text-[12px] text-[#6B778C] mr-2">{it.code}</span>{it.name}</span> : "—";
          }},
          { key: "min", header: "最低", align: "right", width: "80px", cell: (t) => Number(t.min_stock).toLocaleString() },
          { key: "reorder", header: "補貨點", align: "right", width: "80px", cell: (t) => Number(t.reorder_point).toLocaleString() },
          { key: "max", header: "最高", align: "right", width: "80px", cell: (t) => t.max_stock != null ? Number(t.max_stock).toLocaleString() : "—" },
          { key: "abc", header: "ABC", width: "60px", cell: (t) => t.abc_class ?? "—" },
          { key: "priority", header: "優先序", width: "80px", cell: (t) => (
            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${PRIORITY_COLOR[t.alert_priority] ?? ""}`}>{t.alert_priority}</span>
          )},
        ]}
        empty="尚無水位規則"
      />
    </main>
  );
}
