import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import {
  getActiveReplenishmentPolicy,
  listWarehouses,
} from "@/lib/master-data/queries";

import { getActiveScope } from "@/lib/scope/active-scope";
import {
  ReplenishmentBoard,
  type ReplenishLine,
  type RunMeta,
} from "./_components/replenishment-board";

export const dynamic = "force-dynamic";

// 用 Intl.DateTimeFormat 帶明確 padding：Node small-icu 跟 Chrome full-icu
// 對 hour: "numeric" 的處理不同（6 vs 06）會造成 hydration mismatch。
const TPE_FMT = new Intl.DateTimeFormat("zh-TW", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
function formatTaipei(iso: string): string {
  return TPE_FMT.format(new Date(iso));
}

type RawLine = {
  id: string;
  status: "open" | "converted" | "ignored";
  abc_class: string | null;
  on_hand_qty: number;
  on_order_qty: number;
  gross_demand_qty: number;
  reorder_point: number;
  safety_stock: number;
  net_demand_qty: number;
  suggested_qty: number;
  unit_price: number;
  est_amount: number;
  supplier_id: string | null;
  lead_time_days: number | null;
  required_date: string | null;
  latest_order_date: string | null;
  priority: "urgent" | "normal" | "low";
  item_id: string;
};

export default async function ReplenishmentPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.PR_VIEW))) {
    return (
      <main className="px-6 py-5">
        <p className="text-[13px] text-[#CC0000]">沒有檢視日常補貨計畫的權限</p>
      </main>
    );
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [runRes, warehouses, policy] = await Promise.all([
    supabase
      .from("replenishment_runs")
      .select("id, created_at, horizon_days, total_lines, total_amount, status")
      .eq("brand_id", brand)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    listWarehouses(),
    getActiveReplenishmentPolicy(null),
  ]);
  if (runRes.error) throw new Error(runRes.error.message);

  const runRow = runRes.data as
    | (Omit<RunMeta, "created_label">)
    | null;
  const run: RunMeta | null = runRow
    ? { ...runRow, created_label: formatTaipei(runRow.created_at) }
    : null;

  let lines: ReplenishLine[] = [];
  if (run) {
    const [linesRes, itemsRes, supRes] = await Promise.all([
      supabase
        .from("replenishment_run_lines")
        .select(
          "id, status, abc_class, on_hand_qty, on_order_qty, gross_demand_qty, reorder_point, safety_stock, net_demand_qty, suggested_qty, unit_price, est_amount, supplier_id, lead_time_days, required_date, latest_order_date, priority, item_id",
        )
        .eq("brand_id", brand)
        .eq("run_id", run.id)
        .order("priority", { ascending: true })
        .order("est_amount", { ascending: false })
        .limit(500),
      supabase
        .from("items")
        .select("id, code, name")
        .eq("brand_id", brand),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("brand_id", brand),
    ]);
    if (linesRes.error) throw new Error(linesRes.error.message);
    if (itemsRes.error) throw new Error(itemsRes.error.message);
    if (supRes.error) throw new Error(supRes.error.message);

    const itemMap = new Map(
      ((itemsRes.data ?? []) as Array<{ id: string; code: string; name: string }>).map((i) => [
        i.id,
        i,
      ]),
    );
    const supMap = new Map(
      ((supRes.data ?? []) as Array<{ id: string; name: string }>).map((s) => [s.id, s.name]),
    );
    lines = ((linesRes.data ?? []) as unknown as RawLine[]).map((r) => {
      const item = itemMap.get(r.item_id);
      return {
        id: r.id,
        item_code: item?.code ?? "?",
        item_name: item?.name ?? "?",
        abc_class: r.abc_class,
        on_hand_qty: Number(r.on_hand_qty),
        on_order_qty: Number(r.on_order_qty),
        gross_demand_qty: Number(r.gross_demand_qty),
        reorder_point: Number(r.reorder_point),
        safety_stock: Number(r.safety_stock),
        net_demand_qty: Number(r.net_demand_qty),
        suggested_qty: Number(r.suggested_qty),
        unit_price: Number(r.unit_price),
        est_amount: Number(r.est_amount),
        supplier_id: r.supplier_id,
        supplier_name: r.supplier_id ? supMap.get(r.supplier_id) ?? null : null,
        lead_time_days: r.lead_time_days,
        required_date: r.required_date,
        latest_order_date: r.latest_order_date,
        priority: r.priority,
        status: r.status,
      };
    });
  }

  const openLines = lines.filter((l) => l.status === "open");
  const urgentCount = openLines.filter((l) => l.priority === "urgent").length;
  const totalAmt = openLines.reduce((s, l) => s + l.est_amount, 0);

  const canRun = await hasPermission(PERMISSIONS.REPLENISHMENT_RUN);
  const canCreatePR = await hasPermission(PERMISSIONS.PR_CREATE);

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">日常補貨計畫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          4.2
        </span>
        <span className="text-[12px] text-[#9A9890]">
          MRP 計算（WO 需求 + 安全庫存 + ROP）→ 一鍵建立採購申請
        </span>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">本批次建議</div>
          <div className="text-[24px] font-semibold text-[#854F0B] mt-1 font-mono">
            {openLines.length}
          </div>
          <div className="text-[11px] text-[#9A9890]">項待補貨</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">緊急項目</div>
          <div className="text-[24px] font-semibold text-[#CC0000] mt-1 font-mono">
            {urgentCount}
          </div>
          <div className="text-[11px] text-[#9A9890]">on_hand ≤ min_stock</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">預估採購金額</div>
          <div className="text-[20px] font-semibold text-[#0F6E56] mt-1 font-mono">
            {`NT$${Number(totalAmt).toLocaleString("en-US")}`}
          </div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">最近一次計算</div>
          <div className="text-[15px] font-semibold text-[#1A3A5C] mt-1">
            {run ? run.created_label : "尚未計算"}
          </div>
          <div className="text-[11px] text-[#9A9890]">
            {run ? `視野 ${run.horizon_days} 天 ・ 狀態 ${run.status}` : "點上方按鈕計算"}
          </div>
        </div>
      </div>

      <ReplenishmentBoard
        run={run}
        lines={lines}
        warehouses={warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name }))}
        policy={
          policy
            ? {
                horizon_days: policy.horizon_days,
                frequency: policy.frequency,
                auto_create_pr_for_urgent: policy.auto_create_pr_for_urgent,
              }
            : null
        }
        canRun={canRun}
        canCreatePR={canCreatePR}
      />
    </main>
  );
}
