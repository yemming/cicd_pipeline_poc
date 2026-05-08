import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

import { NewPlanForm } from "./_components/new-plan-form";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  cycle: "循環",
  full: "全盤",
  spot: "抽盤",
  abc_a: "A 類",
  abc_b: "B 類",
  abc_c: "C 類",
};

async function getPlans() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_count_plans")
    .select("id, plan_name, warehouse_id, plan_type, abc_filter, is_active, last_run_at, created_at")
    .eq("brand_id", getBrandKey())
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getPlans: ${error.message}`);
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

export default async function CountPlansPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視盤點計畫的權限</p>
      </main>
    );
  }
  const canPlan = await hasPermission(PERMISSIONS.COUNT_PLAN);

  const [plans, warehouses] = await Promise.all([getPlans(), getWarehouses()]);
  const whById = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">盤點計畫</h1>
        <p className="text-[13px] text-[#6B778C]">
          共 {plans.length} 筆 ・ 計畫只是排程模板；實際 session 在「盤點處理」啟動
        </p>
      </header>

      {canPlan && <NewPlanForm warehouses={warehouses} />}

      <DataTable
        rows={plans}
        getKey={(p) => p.id}
        columns={[
          {
            key: "name",
            header: "計畫名稱",
            cell: (p) => <span className="font-medium">{p.plan_name}</span>,
          },
          {
            key: "warehouse",
            header: "倉庫",
            width: "150px",
            cell: (p) => (
              <span className="font-mono text-[12px]">
                {whById.get(p.warehouse_id)?.code ?? "—"}
              </span>
            ),
          },
          {
            key: "type",
            header: "類型",
            width: "90px",
            cell: (p) => (
              <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#DEEBFF] text-[#0747A6]">
                {TYPE_LABEL[p.plan_type] ?? p.plan_type}
              </span>
            ),
          },
          {
            key: "abc",
            header: "ABC 過濾",
            width: "90px",
            cell: (p) => p.abc_filter ?? <span className="text-[#6B778C]">—</span>,
          },
          {
            key: "last_run",
            header: "上次執行",
            width: "150px",
            cell: (p) =>
              p.last_run_at ? (
                new Date(p.last_run_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "active",
            header: "狀態",
            width: "70px",
            cell: (p) =>
              p.is_active ? (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-[#E3FCEF] text-[#006644]">
                  啟用
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-[#DFE1E6] text-[#42526E]">
                  停用
                </span>
              ),
          },
        ]}
        empty="尚無盤點計畫 — 點上方「新增盤點計畫」開始"
      />
    </main>
  );
}
