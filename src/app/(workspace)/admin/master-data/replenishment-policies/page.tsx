import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import {
  listReplenishmentPolicies,
  listWarehouses,
} from "@/lib/master-data/queries";
import { FREQUENCY_LABEL } from "@/lib/master-data/replenishment-policy-form-types";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export const dynamic = "force-dynamic";

export default async function ReplenishmentPoliciesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.REPLENISHMENT_POLICY_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視補貨計畫設定的權限</p>
      </main>
    );
  }

  const canEdit = await hasPermission(PERMISSIONS.REPLENISHMENT_POLICY_EDIT);
  const [rows, warehouses] = await Promise.all([
    listReplenishmentPolicies(),
    listWarehouses(),
  ]);
  const whMap = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="flex items-end justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-[20px] font-bold text-[#172B4D]">補貨計畫設定</h1>
          <p className="text-[13px] text-[#6B778C]">
            共 {rows.length} 筆 ・ 控制 MRP 的執行頻率、需求視野、自動化規則
          </p>
        </div>
        {canEdit && (
          <Link
            href="/admin/master-data/replenishment-policies/new"
            className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[14px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            新增計畫
          </Link>
        )}
      </header>

      <DataTable
        rows={rows}
        getKey={(r) => r.id}
        rowHref={canEdit ? (r) => `/admin/master-data/replenishment-policies/${r.id}` : undefined}
        columns={[
          {
            key: "warehouse",
            header: "適用倉庫",
            cell: (r) =>
              r.warehouse_id ? (
                <span>
                  <span className="font-mono text-[12px] text-[#6B778C] mr-1">
                    {whMap.get(r.warehouse_id)?.code ?? "?"}
                  </span>
                  <span>{whMap.get(r.warehouse_id)?.name ?? "未知倉庫"}</span>
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#DEEBFF] text-[#0747A6]">
                  brand 全域預設
                </span>
              ),
          },
          {
            key: "frequency",
            header: "執行頻率",
            width: "110px",
            cell: (r) => FREQUENCY_LABEL[r.frequency] ?? r.frequency,
          },
          {
            key: "horizon",
            header: "需求視野",
            align: "right",
            width: "100px",
            cell: (r) => <span className="font-mono">{`${r.horizon_days} 天`}</span>,
          },
          {
            key: "auto_pr",
            header: "急件自動建 PR",
            align: "center",
            width: "130px",
            cell: (r) =>
              r.auto_create_pr_for_urgent ? (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#E3FCEF] text-[#006644]">
                  啟用
                </span>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "active",
            header: "狀態",
            width: "70px",
            cell: (r) =>
              r.is_active ? (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#E3FCEF] text-[#006644]">
                  啟用
                </span>
              ) : (
                <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-[#DFE1E6] text-[#42526E]">
                  停用
                </span>
              ),
          },
        ]}
        empty="尚無計畫設定 — 至少建一筆 brand 全域預設（warehouse 留空）"
      />
    </main>
  );
}
