import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { getBrandKey } from "@/lib/brands/current";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import type { Warehouse } from "@/lib/parts/types";

import {
  ApproveCountButton,
  SessionLineEditor,
} from "./_components/session-actions";
import { StartSessionForm } from "./_components/start-session-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  planned: "排程中",
  counting: "盤點中",
  first_done: "一盤完",
  second_done: "二盤完",
  pending_approval: "待核准",
  completed: "已結案",
  cancelled: "已取消",
};

const STATUS_COLOR: Record<string, string> = {
  planned: "bg-[#DFE1E6] text-[#42526E]",
  counting: "bg-[#FFF7E6] text-[#974F00]",
  first_done: "bg-[#FFF7E6] text-[#974F00]",
  second_done: "bg-[#FFF7E6] text-[#974F00]",
  pending_approval: "bg-[#DEEBFF] text-[#0747A6]",
  completed: "bg-[#E3FCEF] text-[#006644]",
  cancelled: "bg-[#DFE1E6] text-[#42526E]",
};

async function getSessions() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_counts")
    .select(
      "id, ct_no, plan_id, warehouse_id, count_date, status, total_lines, variance_lines, variance_amount, created_at",
    )
    .eq("brand_id", getBrandKey())
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`getSessions: ${error.message}`);
  return data ?? [];
}

async function getLinesForSessions(ctIds: string[]) {
  if (ctIds.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_count_lines")
    .select("id, ct_id, item_id, qty_system, qty_final")
    .eq("brand_id", getBrandKey())
    .in("ct_id", ctIds);
  if (error) throw new Error(`getLinesForSessions: ${error.message}`);
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

async function getPlans() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_count_plans")
    .select("id, plan_name, warehouse_id")
    .eq("brand_id", getBrandKey())
    .eq("is_active", true);
  if (error) throw new Error(`getPlans: ${error.message}`);
  return data ?? [];
}

export default async function CountSessionsPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.COUNT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#BF2600]">沒有檢視盤點的權限</p>
      </main>
    );
  }
  const canExecute = await hasPermission(PERMISSIONS.COUNT_EXECUTE);
  const canAdjust = await hasPermission(PERMISSIONS.COUNT_ADJUST);

  const [sessions, warehouses, plans] = await Promise.all([
    getSessions(),
    getWarehouses(),
    getPlans(),
  ]);

  const editableSessionIds = sessions
    .filter((s) => ["counting", "first_done", "second_done", "pending_approval"].includes(s.status))
    .map((s) => s.id);
  const lines = await getLinesForSessions(editableSessionIds);

  const supabase = await createClient();
  const itemIds = [...new Set(lines.map((l) => l.item_id))];
  const { data: items } = itemIds.length > 0
    ? await supabase.from("items").select("id, code, name").in("id", itemIds)
    : { data: [] as { id: string; code: string; name: string }[] };
  const itemById = new Map((items ?? []).map((i) => [i.id, i]));

  const linesByCt = new Map<string, typeof lines>();
  for (const l of lines) {
    if (!linesByCt.has(l.ct_id)) linesByCt.set(l.ct_id, []);
    linesByCt.get(l.ct_id)!.push(l);
  }

  const whById = new Map(warehouses.map((w) => [w.id, w]));

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">盤點處理</h1>
        <p className="text-[13px] text-[#6B778C]">
          共 {sessions.length} 筆 session ・ counting → 填實盤 → pending_approval → 核准 post 成調整單
        </p>
      </header>

      {canExecute && <StartSessionForm warehouses={warehouses} plans={plans} />}

      <DataTable
        rows={sessions}
        getKey={(s) => s.id}
        columns={[
          {
            key: "ct_no",
            header: "盤點單",
            width: "150px",
            cell: (s) => <span className="font-mono text-[12px]">{s.ct_no}</span>,
          },
          {
            key: "warehouse",
            header: "倉庫",
            width: "150px",
            cell: (s) => (
              <span className="font-mono text-[12px]">
                {whById.get(s.warehouse_id)?.code ?? "—"}
              </span>
            ),
          },
          {
            key: "count_date",
            header: "盤點日",
            width: "100px",
            cell: (s) => s.count_date,
          },
          {
            key: "lines",
            header: "行數",
            align: "right",
            width: "70px",
            cell: (s) => Number(s.total_lines).toLocaleString(),
          },
          {
            key: "variance",
            header: "差異",
            align: "right",
            width: "150px",
            cell: (s) => {
              const amt = Number(s.variance_amount);
              if (s.variance_lines === 0) return <span className="text-[#6B778C]">—</span>;
              return (
                <span
                  className={`font-mono text-[12px] ${amt > 0 ? "text-[#006644]" : "text-[#BF2600]"}`}
                >
                  {s.variance_lines} 行 ・ NT$ {Math.round(amt).toLocaleString()}
                </span>
              );
            },
          },
          {
            key: "status",
            header: "狀態",
            width: "90px",
            cell: (s) => (
              <span
                className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${STATUS_COLOR[s.status] ?? ""}`}
              >
                {STATUS_LABEL[s.status] ?? s.status}
              </span>
            ),
          },
          {
            key: "actions",
            header: "操作",
            width: "260px",
            cell: (s) => {
              if (!canExecute) return <span className="text-[#6B778C] text-[12px]">—</span>;
              if (["counting", "first_done", "second_done"].includes(s.status)) {
                const ll = linesByCt.get(s.id) ?? [];
                const dialogLines = ll.map((l) => ({
                  id: l.id,
                  item_label: itemById.get(l.item_id)?.code ?? l.item_id.slice(0, 8) + "…",
                  qty_system: Number(l.qty_system),
                  qty_final: l.qty_final != null ? Number(l.qty_final) : null,
                }));
                return <SessionLineEditor ctId={s.id} ctNo={s.ct_no} lines={dialogLines} />;
              }
              if (s.status === "pending_approval" && canAdjust) {
                return <ApproveCountButton ctId={s.id} ctNo={s.ct_no} />;
              }
              return <span className="text-[#6B778C] text-[12px]">—</span>;
            },
          },
        ]}
        empty="尚無盤點 session — 點上方「啟動新盤點」開始"
      />
    </main>
  );
}
