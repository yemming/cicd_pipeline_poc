import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { ReturnIssueDialog } from "./_components/return-issue-dialog";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

type IssueRow = {
  id: string;
  gi_no: string;
  status: string;
  warehouse_id: string;
  ro_id: string | null;
  qty_issued_total: number;
  amount_total: number;
  issue_date: string;
};

async function getCompletedIssues(): Promise<IssueRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_issues")
    .select("id, gi_no, status, warehouse_id, ro_id, qty_issued_total, amount_total, issue_date")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`getCompletedIssues: ${error.message}`);
  return data ?? [];
}

async function getIssueLines(issueIds: string[]) {
  if (issueIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_issue_lines")
    .select("id, gi_id, item_id, qty_issued, unit_cost")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .in("gi_id", issueIds);
  if (error) throw new Error(`getIssueLines: ${error.message}`);
  return data ?? [];
}

export default async function ReturnInPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視收貨的權限</p>
      </main>
    );
  }
  const canReturn = await hasPermission(PERMISSIONS.RECEIPT_CREATE);

  const issues = await getCompletedIssues();
  const issueLines = await getIssueLines(issues.map((i) => i.id));
  const linesByIssue = new Map<string, typeof issueLines>();
  for (const l of issueLines) {
    if (!linesByIssue.has(l.gi_id)) linesByIssue.set(l.gi_id, []);
    linesByIssue.get(l.gi_id)!.push(l);
  }

  const supabase = await createClient();
  const itemIds = [...new Set(issueLines.map((l) => l.item_id))];
  const { data: items } = itemIds.length > 0
    ? await supabase.from("items").select("id, code, name").in("id", itemIds)
    : { data: [] as { id: string; code: string; name: string }[] };
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));

  const warehouseIds = [...new Set(issues.map((i) => i.warehouse_id))];
  const { data: warehouses } = warehouseIds.length > 0
    ? await supabase.from("warehouses").select("id, code").in("id", warehouseIds)
    : { data: [] as { id: string; code: string }[] };
  const whById = new Map((warehouses ?? []).map((w) => [w.id, w]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">領料退貨入庫</h1>
        <p className="text-[13px] text-[#6B778C]">
          已出庫的領料單可部分退貨入庫（如師傅領 4 件用 3 件退 1 件）。共 {issues.length} 筆可退領料單。
        </p>
      </header>

      <DataTable
        rows={issues}
        getKey={(r) => r.id}
        columns={[
          {
            key: "gi_no",
            header: "領料單",
            width: "150px",
            cell: (r) => <span className="font-mono text-[12px]">{r.gi_no}</span>,
          },
          {
            key: "warehouse",
            header: "倉庫",
            width: "150px",
            cell: (r) => (
              <span className="font-mono text-[12px]">
                {whById.get(r.warehouse_id)?.code ?? "—"}
              </span>
            ),
          },
          {
            key: "issue_date",
            header: "領料日",
            width: "100px",
            cell: (r) => r.issue_date,
          },
          {
            key: "qty",
            header: "件數",
            align: "right",
            width: "80px",
            cell: (r) => Number(r.qty_issued_total).toLocaleString(),
          },
          {
            key: "amount",
            header: "金額",
            align: "right",
            width: "110px",
            cell: (r) => `NT$ ${Math.round(Number(r.amount_total)).toLocaleString()}`,
          },
          {
            key: "actions",
            header: "操作",
            width: "260px",
            cell: (r) => {
              if (!canReturn) return <span className="text-[#6B778C] text-[12px]">—</span>;
              const lines = linesByIssue.get(r.id) ?? [];
              const dialogLines = lines.map((l) => ({
                id: l.id,
                item_label:
                  itemById.get(l.item_id)?.code ?? l.item_id.slice(0, 8) + "…",
                qty_issued: Number(l.qty_issued),
                unit_cost: Number(l.unit_cost ?? 0),
              }));
              return (
                <ReturnIssueDialog
                  issueId={r.id}
                  giNo={r.gi_no}
                  lines={dialogLines}
                />
              );
            },
          },
        ]}
        empty="目前沒有可退貨的領料單（需 status=completed）"
      />
    </main>
  );
}
