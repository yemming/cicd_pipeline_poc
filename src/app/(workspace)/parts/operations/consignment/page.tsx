import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { getBrandKey } from "@/lib/brands/current";
import { listItems, listSuppliers } from "@/lib/master-data/queries";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

import { RegisterConsignmentForm } from "./_components/register-consignment-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  active: "進行中",
  partial_converted: "部分轉購",
  fully_converted: "已轉購",
  returned: "已退回",
  expired: "已過期",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  active: "bg-[#E3FCEF] text-[#006644]",
  partial_converted: "bg-[#FFF7E6] text-[#974F00]",
  fully_converted: "bg-[#DEEBFF] text-[#0747A6]",
  returned: "bg-[#DFE1E6] text-[#42526E]",
  expired: "bg-[#FFEBE6] text-[#BF2600]",
  cancelled: "bg-[#DFE1E6] text-[#42526E]",
};

async function getConsignments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("consignment_stocks")
    .select("id, con_no, supplier_id, item_id, warehouse_id, initial_qty, remaining_qty, transferred_qty, start_date, end_date, status")
    .eq("brand_id", getBrandKey())
    .order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(`getConsignments: ${error.message}`);
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

export default async function ConsignmentPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.CONSIGNMENT_OPS))) {
    return <main className="px-6 py-6"><p className="text-[14px] text-[#BF2600]">沒權限</p></main>;
  }

  const [consignments, warehouses, suppliers, items] = await Promise.all([
    getConsignments(),
    getWarehouses(),
    listSuppliers({ activeOnly: true }),
    listItems({ limit: 500 }),
  ]);
  const whById = new Map(warehouses.map((w) => [w.id, w]));
  const supplierById = new Map(suppliers.map((s) => [s.id, s]));
  const itemById = new Map(items.map((i) => [i.id, i]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">寄存管理</h1>
        <p className="text-[13px] text-[#6B778C]">
          供應商寄存的料件 — 建單時自動寫 stock_items status=&apos;consignment&apos;。共 {consignments.length} 筆。
        </p>
      </header>

      <RegisterConsignmentForm warehouses={warehouses} suppliers={suppliers} items={items} />

      <DataTable
        rows={consignments}
        getKey={(c) => c.id}
        columns={[
          { key: "con_no", header: "寄存單", width: "150px", cell: (c) => <span className="font-mono text-[12px]">{c.con_no}</span> },
          { key: "supplier", header: "供應商", cell: (c) => supplierById.get(c.supplier_id)?.name ?? "—" },
          { key: "item", header: "料件", cell: (c) => itemById.get(c.item_id)?.code ?? "—" },
          { key: "warehouse", header: "倉庫", width: "150px", cell: (c) => <span className="font-mono text-[12px]">{whById.get(c.warehouse_id)?.code ?? "—"}</span> },
          { key: "qty", header: "剩 / 初", align: "right", width: "100px", cell: (c) => `${Number(c.remaining_qty)} / ${Number(c.initial_qty)}` },
          { key: "period", header: "起迄", width: "180px", cell: (c) => `${c.start_date} ~ ${c.end_date}` },
          { key: "status", header: "狀態", width: "90px", cell: (c) => (
            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLOR[c.status] ?? ""}`}>
              {STATUS_LABEL[c.status] ?? c.status}
            </span>
          )},
        ]}
        empty="尚無寄存紀錄"
      />
    </main>
  );
}
