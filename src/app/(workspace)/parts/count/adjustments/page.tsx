import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  submitted: "已送件",
  approved: "已核准",
  rejected: "拒絕",
  posted: "已 post",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-[#DFE1E6] text-[#42526E]",
  submitted: "bg-[#DEEBFF] text-[#0747A6]",
  approved: "bg-[#E3FCEF] text-[#006644]",
  rejected: "bg-[#FFEBE6] text-[#BF2600]",
  posted: "bg-[#E3FCEF] text-[#006644]",
  cancelled: "bg-[#DFE1E6] text-[#42526E]",
};

const TYPE_LABEL: Record<string, string> = {
  loss: "報損",
  gain: "報溢",
  manual: "手動",
};

const TYPE_COLOR: Record<string, string> = {
  loss: "bg-[#FFEBE6] text-[#BF2600]",
  gain: "bg-[#E3FCEF] text-[#006644]",
  manual: "bg-[#DEEBFF] text-[#0747A6]",
};

async function getAdjustments() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_adjustments")
    .select(
      "id, adj_no, ct_id, warehouse_id, type, reason, total_amount, status, posted_at, created_at",
    )
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`getAdjustments: ${error.message}`);
  return data ?? [];
}

async function getWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true);
  if (error) throw new Error(`getWarehouses: ${error.message}`);
  return data ?? [];
}

export default async function CountAdjustmentsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視盤點調整的權限</p>
      </main>
    );
  }

  const [adjustments, warehouses] = await Promise.all([getAdjustments(), getWarehouses()]);
  const whById = new Map(warehouses.map((w) => [w.id, w]));

  const totalGain = adjustments
    .filter((a) => a.type === "gain")
    .reduce((s, a) => s + Number(a.total_amount), 0);
  const totalLoss = adjustments
    .filter((a) => a.type === "loss")
    .reduce((s, a) => s + Number(a.total_amount), 0);

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">報損報溢</h1>
        <p className="text-[13px] text-[#6B778C]">
          共 {adjustments.length} 筆 ・ 報溢 NT$ {Math.round(totalGain).toLocaleString()} ・
          報損 NT$ {Math.round(Math.abs(totalLoss)).toLocaleString()} ・ 由
          <Link href="/parts/count/sessions" className="text-[#0052CC] hover:underline ml-1">
            盤點處理
          </Link>{" "}
          核准後自動產生
        </p>
      </header>

      <DataTable
        rows={adjustments}
        getKey={(a) => a.id}
        columns={[
          {
            key: "adj_no",
            header: "調整單",
            width: "150px",
            cell: (a) => <span className="font-mono text-[12px]">{a.adj_no}</span>,
          },
          {
            key: "type",
            header: "類型",
            width: "70px",
            cell: (a) => (
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${TYPE_COLOR[a.type] ?? ""}`}
              >
                {TYPE_LABEL[a.type] ?? a.type}
              </span>
            ),
          },
          {
            key: "warehouse",
            header: "倉庫",
            width: "150px",
            cell: (a) => (
              <span className="font-mono text-[12px]">
                {whById.get(a.warehouse_id)?.code ?? "—"}
              </span>
            ),
          },
          {
            key: "reason",
            header: "原因",
            cell: (a) => a.reason,
          },
          {
            key: "amount",
            header: "金額",
            align: "right",
            width: "130px",
            cell: (a) => {
              const amt = Number(a.total_amount);
              return (
                <span
                  className={`font-mono text-[12px] ${amt >= 0 ? "text-[#006644]" : "text-[#BF2600]"}`}
                >
                  NT$ {Math.round(amt).toLocaleString()}
                </span>
              );
            },
          },
          {
            key: "posted_at",
            header: "Post 時間",
            width: "150px",
            cell: (a) =>
              a.posted_at ? (
                new Date(a.posted_at).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" })
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "status",
            header: "狀態",
            width: "90px",
            cell: (a) => (
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLOR[a.status] ?? ""}`}
              >
                {STATUS_LABEL[a.status] ?? a.status}
              </span>
            ),
          },
        ]}
        empty="尚無盤點調整單"
      />
    </main>
  );
}
