import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { getBrandKey } from "@/lib/brands/current";
import { listItems } from "@/lib/master-data/queries";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

import { AdjustForm } from "./_components/adjust-form";

export const dynamic = "force-dynamic";

async function getManualAdjustments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_adjustments")
    .select("id, adj_no, warehouse_id, type, reason, total_amount, status, posted_at")
    .eq("brand_id", getBrandKey())
    .is("ct_id", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`getManualAdjustments: ${error.message}`);
  return data ?? [];
}

async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("brand_id", getBrandKey())
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`getWarehouses: ${error.message}`);
  return data ?? [];
}

export default async function AdjustPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return <main className="px-6 py-6"><p className="text-[14px] text-[#BF2600]">沒權限</p></main>;
  }
  const canAdjust = await hasPermission(PERMISSIONS.COUNT_ADJUST);

  const [adjustments, warehouses, items] = await Promise.all([
    getManualAdjustments(),
    getWarehouses(),
    listItems({ limit: 500 }),
  ]);
  const whById = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">備件庫存調整</h1>
        <p className="text-[13px] text-[#6B778C]">
          手動增減 stock_items.qty + 寫 inventory_adjustments(type=manual) 紀錄。共 {adjustments.length} 筆手動調整。
        </p>
      </header>

      {canAdjust && <AdjustForm warehouses={warehouses} items={items} />}

      <DataTable
        rows={adjustments}
        getKey={(a) => a.id}
        columns={[
          { key: "adj_no", header: "單號", width: "150px", cell: (a) => <span className="font-mono text-[12px]">{a.adj_no}</span> },
          { key: "type", header: "類型", width: "70px", cell: (a) => a.type },
          { key: "warehouse", header: "倉庫", width: "150px", cell: (a) => <span className="font-mono text-[12px]">{whById.get(a.warehouse_id)?.code ?? "—"}</span> },
          { key: "reason", header: "原因", cell: (a) => a.reason },
          { key: "amount", header: "金額", align: "right", width: "130px", cell: (a) => {
            const amt = Number(a.total_amount);
            return <span className={`font-mono text-[12px] ${amt >= 0 ? "text-[#006644]" : "text-[#BF2600]"}`}>NT$ {Math.round(amt).toLocaleString()}</span>;
          }},
          { key: "posted", header: "Post 時間", width: "150px", cell: (a) => a.posted_at ? new Date(a.posted_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" }) : "—" },
        ]}
        empty="尚無手動調整紀錄"
      />
    </main>
  );
}
