import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { getBrandKey } from "@/lib/brands/current";
import { listItems } from "@/lib/master-data/queries";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

import { RegisterOldPartForm } from "./_components/register-old-part-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  in_storage: "存放中",
  warning_60d: "60d 警示",
  overdue_90d: "90d 逾期",
  returned_oem: "已退原廠",
  disposed: "已處置",
  retained: "已留存",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  in_storage: "bg-[#DEEBFF] text-[#0747A6]",
  warning_60d: "bg-[#FFF7E6] text-[#974F00]",
  overdue_90d: "bg-[#FFEBE6] text-[#BF2600]",
  returned_oem: "bg-[#E3FCEF] text-[#006644]",
  disposed: "bg-[#DFE1E6] text-[#42526E]",
  retained: "bg-[#DFE1E6] text-[#42526E]",
  cancelled: "bg-[#DFE1E6] text-[#42526E]",
};

async function getOldParts() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("old_parts")
    .select("id, wc_no, item_id, serial_no, vin, warehouse_id, entry_date, expiry_date, disposal_action, status")
    .eq("brand_id", getBrandKey())
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`getOldParts: ${error.message}`);
  return data ?? [];
}

async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses").select("*")
    .eq("brand_id", getBrandKey()).eq("is_active", true).order("code");
  if (error) throw new Error(`getWarehouses: ${error.message}`);
  return data ?? [];
}

export default async function UsedPartsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.USEDPART_OPS))) {
    return <main className="px-6 py-6"><p className="text-[14px] text-[#BF2600]">沒權限</p></main>;
  }

  const [parts, warehouses, items] = await Promise.all([
    getOldParts(), getWarehouses(), listItems({ limit: 1000 }),
  ]);
  const whById = new Map(warehouses.map((w) => [w.id, w]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">舊件管理</h1>
        <p className="text-[13px] text-[#6B778C]">
          保固索賠抽換的舊件需保留 60-90 天供原廠檢驗。共 {parts.length} 件。
        </p>
      </header>

      <RegisterOldPartForm warehouses={warehouses} items={items} />

      <DataTable
        rows={parts}
        getKey={(p) => p.id}
        columns={[
          { key: "wc_no", header: "舊件單號", width: "150px", cell: (p) => <span className="font-mono text-[12px]">{p.wc_no}</span> },
          { key: "item", header: "料件", cell: (p) => itemById.get(p.item_id)?.code ?? "—" },
          { key: "sn", header: "序號", cell: (p) => p.serial_no ?? "—" },
          { key: "vin", header: "VIN", cell: (p) => p.vin ?? "—" },
          { key: "wh", header: "倉", width: "130px", cell: (p) => p.warehouse_id ? <span className="font-mono text-[12px]">{whById.get(p.warehouse_id)?.code ?? "—"}</span> : "—" },
          { key: "entry", header: "入庫日", width: "100px", cell: (p) => p.entry_date },
          { key: "expiry", header: "處置截止", width: "100px", cell: (p) => p.expiry_date ?? "—" },
          { key: "action", header: "處置", width: "120px", cell: (p) => p.disposal_action ?? "—" },
          { key: "status", header: "狀態", width: "100px", cell: (p) => (
            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLOR[p.status] ?? ""}`}>
              {STATUS_LABEL[p.status] ?? p.status}
            </span>
          )},
        ]}
        empty="尚無舊件入庫紀錄"
      />
    </main>
  );
}
