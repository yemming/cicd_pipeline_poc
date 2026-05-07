import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const PLAN_TYPE_LABELS: Record<string, { label: string; color: "blue" | "amber" | "purple" | "green" }> = {
  cycle: { label: "循環盤點", color: "blue" },
  full: { label: "全盤", color: "amber" },
  abc: { label: "ABC 分級盤", color: "purple" },
  random: { label: "抽盤", color: "green" },
};

export default async function Page() {
  const supabase = await createClient();
  const [{ data: plans }, { data: warehouses }] = await Promise.all([
    supabase
      .from("inventory_count_plans")
      .select("id, plan_name, plan_type, warehouse_id, abc_filter, schedule_cron, last_run_at, next_run_at, is_active, notes")
      .order("plan_name"),
    supabase.from("warehouses").select("id, name"),
  ]);

  const whMap = new Map((warehouses ?? []).map((w) => [w.id, w.name]));

  return (
    <PartsShell
      title="盤點計畫"
      chapter="8.1"
      description="排程觸發盤點作業 — 可按 ABC 分級或循環式盤點各倉"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "盤點管理" },
        { label: "盤點計畫" },
      ]}
    >
      <PartsTable
        rows={plans ?? []}
        emptyText="尚未建立任何盤點計畫"
        columns={[
          { key: "plan_name", label: "計畫名稱" },
          {
            key: "plan_type",
            label: "類型",
            align: "center",
            render: (p) => {
              const meta = PLAN_TYPE_LABELS[p.plan_type] ?? PLAN_TYPE_LABELS.cycle;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
          { key: "warehouse_id", label: "倉庫", render: (p) => (p.warehouse_id ? whMap.get(p.warehouse_id) ?? "—" : "全倉") },
          { key: "abc_filter", label: "ABC 篩選", align: "center", render: (p) => p.abc_filter ?? "—" },
          { key: "schedule_cron", label: "排程", render: (p) => <span className="font-mono text-[10px]">{p.schedule_cron ?? "—"}</span> },
          { key: "last_run_at", label: "上次執行", render: (p) => (p.last_run_at ? new Date(p.last_run_at).toISOString().slice(0, 10) : "—") },
          { key: "next_run_at", label: "下次執行", render: (p) => (p.next_run_at ? new Date(p.next_run_at).toISOString().slice(0, 10) : "—") },
          {
            key: "is_active",
            label: "狀態",
            align: "center",
            render: (p) => <StatusBadge label={p.is_active ? "啟用" : "停用"} color={p.is_active ? "green" : "gray"} />,
          },
        ]}
      />
    </PartsShell>
  );
}
