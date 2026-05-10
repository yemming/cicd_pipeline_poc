import { redirect } from "next/navigation";

import { DataTable } from "@/components/forms/data-table";
import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

import { RuleForm } from "./_components/rule-form";

import { getActiveScope } from "@/lib/scope/active-scope";
export const dynamic = "force-dynamic";

const SEVERITY_COLOR: Record<string, string> = {
  low: "bg-[#DFE1E6] text-[#42526E]",
  medium: "bg-[#DEEBFF] text-[#0747A6]",
  high: "bg-[#FFF7E6] text-[#974F00]",
  critical: "bg-[#FFEBE6] text-[#BF2600]",
};

async function getRules() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("alert_rules")
    .select("id, code, name, alert_type, severity, auto_action, cooldown_minutes, is_enabled, created_at")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`getRules: ${error.message}`);
  return data ?? [];
}

export default async function RulesPage() {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.ALERT_VIEW))) {
    return <main className="px-6 py-6"><p className="text-[14px] text-[#BF2600]">沒權限</p></main>;
  }
  const canConfig = await hasPermission(PERMISSIONS.ALERT_CONFIG);

  const rules = await getRules();

  return (
    <main className="px-6 py-6 space-y-5">
      <header className="space-y-1">
        <h1 className="text-[20px] font-bold text-[#172B4D]">告警類型與規則</h1>
        <p className="text-[13px] text-[#6B778C]">
          共 {rules.length} 條規則 ・ 觸發 DSL 在 trigger_dsl JSONB（暫由後端 worker 解讀）
        </p>
      </header>

      {canConfig && <RuleForm />}

      <DataTable
        rows={rules}
        getKey={(r) => r.id}
        columns={[
          { key: "code", header: "code", width: "180px", cell: (r) => <span className="font-mono text-[12px]">{r.code}</span> },
          { key: "name", header: "名稱", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "type", header: "類型", width: "150px", cell: (r) => <span className="font-mono text-[12px]">{r.alert_type}</span> },
          { key: "severity", header: "嚴重度", width: "80px", cell: (r) => (
            <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-medium ${SEVERITY_COLOR[r.severity] ?? ""}`}>{r.severity}</span>
          )},
          { key: "auto", header: "自動動作", width: "150px", cell: (r) => <span className="font-mono text-[12px]">{r.auto_action ?? "none"}</span> },
          { key: "cooldown", header: "冷卻 (分)", align: "right", width: "90px", cell: (r) => Number(r.cooldown_minutes).toLocaleString() },
          { key: "enabled", header: "狀態", width: "70px", cell: (r) => r.is_enabled ? (
            <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-[#E3FCEF] text-[#006644]">啟用</span>
          ) : (
            <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-[#DFE1E6] text-[#42526E]">停用</span>
          )},
        ]}
        empty="尚無告警規則"
      />
    </main>
  );
}
