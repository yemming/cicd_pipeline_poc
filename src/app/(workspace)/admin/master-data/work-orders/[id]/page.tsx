import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getBrandKey } from "@/lib/brands/current";
import {
  getWorkOrderById,
  listCustomers,
  listCustomerVehicles,
  listEmployees,
  listItems,
  listServiceAppointments,
} from "@/lib/master-data/queries";
import { updateWorkOrderAction } from "@/lib/master-data/workorder-actions";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse, WorkOrderItem } from "@/lib/parts/types";

import { IssuePickButton } from "../_components/issue-pick-button";
import { WorkOrderForm } from "../_components/work-order-form";

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

async function getIssuesForRo(roId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_issues")
    .select("id, gi_no, status, qty_issued_total, amount_total, warehouse_id, issue_date")
    .eq("brand_id", getBrandKey())
    .eq("ro_id", roId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getIssuesForRo: ${error.message}`);
  return data ?? [];
}

export const dynamic = "force-dynamic";

async function getItems(workOrderId: string): Promise<WorkOrderItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_order_items")
    .select("*")
    .eq("brand_id", getBrandKey())
    .eq("work_order_id", workOrderId)
    .order("line_no");
  if (error) throw new Error(`getItems: ${error.message}`);
  return data ?? [];
}

export default async function EditWorkOrderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RO_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視工單的權限</p>
      </main>
    );
  }

  const [workOrder, customers, vehicles, appointments, employees, parts] = await Promise.all([
    getWorkOrderById(id),
    listCustomers({ limit: 500 }),
    listCustomerVehicles({ activeOnly: false, limit: 500 }),
    listServiceAppointments({ limit: 100 }),
    listEmployees({ status: "active", limit: 200 }),
    listItems({ limit: 200 }),
  ]);
  if (!workOrder) notFound();

  const [initialItems, warehouses, issues] = await Promise.all([
    getItems(id),
    getWarehouses(),
    getIssuesForRo(id),
  ]);
  const canEdit = await hasPermission(PERMISSIONS.RO_CREATE);
  const canIssue = await hasPermission(PERMISSIONS.ISSUE_CREATE);

  return (
    <main className="px-6 py-6 max-w-[1280px] space-y-5">
      <nav className="text-[13px] text-[#6B778C]">
        <Link href="/admin/master-data/work-orders" className="hover:text-[#172B4D]">
          維修工單
        </Link>
        <span className="mx-2">/</span>
        <span className="text-[#172B4D]">{workOrder.ro_no}</span>
      </nav>

      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">
          編輯工單 ・ {workOrder.ro_no}
        </h1>
        <p className="text-[13px] text-[#6B778C]">
          開單於 {new Date(workOrder.opened_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })} ・
          最近更新 {new Date(workOrder.updated_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })}
        </p>
      </header>

      <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
        {canEdit ? (
          <WorkOrderForm
            mode="edit"
            action={updateWorkOrderAction}
            workOrder={workOrder}
            initialItems={initialItems}
            customers={customers}
            vehicles={vehicles}
            appointments={appointments}
            advisors={employees}
            technicians={employees}
            parts={parts}
          />
        ) : (
          <p className="text-[14px] text-[#6B778C]">僅可檢視；沒有編輯權限</p>
        )}
      </section>

      {canIssue && (
        <section className="bg-white border border-[#DFE1E6] rounded-md p-5">
          <IssuePickButton
            workOrderId={workOrder.id}
            warehouses={warehouses}
            existingIssues={issues}
          />
        </section>
      )}
    </main>
  );
}
