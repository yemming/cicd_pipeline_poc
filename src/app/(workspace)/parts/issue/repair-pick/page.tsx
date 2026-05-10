import Link from "next/link";
import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  pending: "待處理",
  partial: "部分完成",
  completed: "已出庫",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-[#DFE1E6] text-[#42526E]",
  pending: "bg-[#DEEBFF] text-[#0747A6]",
  partial: "bg-[#FFF7E6] text-[#974F00]",
  completed: "bg-[#E3FCEF] text-[#006644]",
  cancelled: "bg-[#DFE1E6] text-[#42526E]",
};

type IssueWithRo = {
  id: string;
  gi_no: string;
  status: string;
  qty_issued_total: number;
  amount_total: number;
  warehouse_id: string;
  ro_id: string | null;
  customer_id: string | null;
  issue_date: string;
  created_at: string;
};

async function getRoIssues(): Promise<IssueWithRo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_issues")
    .select(
      "id, gi_no, status, qty_issued_total, amount_total, warehouse_id, ro_id, customer_id, issue_date, created_at",
    )
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("type", "ro_picking")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(`getRoIssues: ${error.message}`);
  return data ?? [];
}

export default async function RepairPickPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ISSUE_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視出庫單的權限</p>
      </main>
    );
  }

  const issues = await getRoIssues();

  // Lookup tables
  const supabase = await createClient();
  const roIds = [...new Set(issues.map((i) => i.ro_id).filter((x): x is string => !!x))];
  const customerIds = [...new Set(issues.map((i) => i.customer_id).filter((x): x is string => !!x))];
  const warehouseIds = [...new Set(issues.map((i) => i.warehouse_id))];

  const [{ data: workOrders }, { data: customers }, { data: warehouses }] = await Promise.all([
    roIds.length > 0
      ? supabase.from("work_orders").select("id, ro_no").in("id", roIds)
      : Promise.resolve({ data: [] as { id: string; ro_no: string }[] }),
    customerIds.length > 0
      ? supabase.from("customers").select("id, code, name").in("id", customerIds)
      : Promise.resolve({ data: [] as { id: string; code: string; name: string }[] }),
    warehouseIds.length > 0
      ? supabase.from("warehouses").select("id, code").in("id", warehouseIds)
      : Promise.resolve({ data: [] as { id: string; code: string }[] }),
  ]);
  const woById = new Map((workOrders ?? []).map((w) => [w.id, w]));
  const customerById = new Map((customers ?? []).map((c) => [c.id, c]));
  const whById = new Map((warehouses ?? []).map((w) => [w.id, w]));

  const totalAmount = issues
    .filter((i) => i.status === "completed")
    .reduce((s, i) => s + Number(i.amount_total), 0);

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">維修領料</h1>
        <p className="text-[13px] text-[#6B778C]">
          共 {issues.length} 筆 RO 領料單 ・ 已出庫總額 NT${" "}
          {Math.round(totalAmount).toLocaleString()} ・
          建立 / 取消請至工單編輯頁
        </p>
      </header>

      <DataTable
        rows={issues}
        getKey={(i) => i.id}
        columns={[
          {
            key: "gi_no",
            header: "領料單",
            width: "160px",
            cell: (i) => <span className="font-mono text-[12px]">{i.gi_no}</span>,
          },
          {
            key: "ro",
            header: "對應工單",
            width: "180px",
            cell: (i) =>
              i.ro_id ? (
                <Link
                  href={`/admin/master-data/work-orders/${i.ro_id}`}
                  className="font-mono text-[12px] text-[#0052CC] hover:underline"
                >
                  {woById.get(i.ro_id)?.ro_no ?? "(已刪除)"}
                </Link>
              ) : (
                <span className="text-[#6B778C]">—</span>
              ),
          },
          {
            key: "customer",
            header: "客戶",
            cell: (i) => {
              if (!i.customer_id) return <span className="text-[#6B778C]">—</span>;
              const c = customerById.get(i.customer_id);
              if (!c) return <span className="text-[#BF2600]">客戶已刪除</span>;
              return (
                <span>
                  <span className="font-mono text-[12px] text-[#6B778C] mr-2">{c.code}</span>
                  {c.name}
                </span>
              );
            },
          },
          {
            key: "warehouse",
            header: "倉庫",
            width: "130px",
            cell: (i) => (
              <span className="font-mono text-[12px]">
                {whById.get(i.warehouse_id)?.code ?? "—"}
              </span>
            ),
          },
          {
            key: "issue_date",
            header: "日期",
            width: "100px",
            cell: (i) => i.issue_date,
          },
          {
            key: "qty",
            header: "數量",
            align: "right",
            width: "80px",
            cell: (i) => Number(i.qty_issued_total).toLocaleString(),
          },
          {
            key: "amount",
            header: "金額",
            align: "right",
            width: "120px",
            cell: (i) => `NT$ ${Math.round(Number(i.amount_total)).toLocaleString()}`,
          },
          {
            key: "status",
            header: "狀態",
            width: "90px",
            cell: (i) => (
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLOR[i.status] ?? ""}`}
              >
                {STATUS_LABEL[i.status] ?? i.status}
              </span>
            ),
          },
        ]}
        empty={
          <span>
            尚無 RO 領料單 — 請至{" "}
            <Link href="/admin/master-data/work-orders" className="text-[#0052CC] hover:underline">
              維修工單
            </Link>{" "}
            建立工單後使用「一鍵領料」
          </span>
        }
      />
    </main>
  );
}
