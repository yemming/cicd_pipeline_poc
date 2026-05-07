import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const SEVERITY_LABELS: Record<string, { label: string; color: "red" | "amber" | "blue" | "gray" }> = {
  critical: { label: "🔴 緊急", color: "red" },
  high: { label: "🟠 高", color: "amber" },
  medium: { label: "🔵 中", color: "blue" },
  low: { label: "⚪ 低", color: "gray" },
};

export default async function Page() {
  const supabase = await createClient();
  const [{ data: rules }, { data: events }] = await Promise.all([
    supabase
      .from("alert_rules")
      .select("id, code, name, alert_type, severity, is_enabled, cooldown_minutes, notify_channels, auto_action, notes")
      .order("severity", { ascending: false }),
    supabase
      .from("alert_events")
      .select("id, rule_id, severity, ref_type, ref_id, acked_at, resolved_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  return (
    <PartsShell
      title="告警類型與規則"
      chapter="10.2"
      description="定義何種事件 → 觸發何種告警 → 通知哪些頻道,降低人工巡邏"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "預警告警" },
        { label: "告警類型與規則" },
      ]}
    >
      <h2 className="text-[13px] font-bold mb-2">告警規則 ({(rules ?? []).length})</h2>
      <PartsTable
        rows={rules ?? []}
        emptyText="尚未設定任何告警規則"
        columns={[
          { key: "code", label: "規則代號", render: (r) => <span className="font-mono text-[11px] text-[#185FA5]">{r.code}</span> },
          { key: "name", label: "名稱" },
          { key: "alert_type", label: "類型", render: (r) => r.alert_type },
          {
            key: "severity",
            label: "嚴重度",
            align: "center",
            render: (r) => {
              const meta = SEVERITY_LABELS[r.severity] ?? SEVERITY_LABELS.medium;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
          {
            key: "notify_channels",
            label: "通知頻道",
            render: (r) => (
              <div className="flex flex-wrap gap-1">
                {(r.notify_channels ?? []).map((ch: string, idx: number) => (
                  <span key={idx} className="text-[10px] bg-[#F0EEFF] text-[#7F77DD] px-1.5 py-0.5 rounded">{ch}</span>
                ))}
                {(!r.notify_channels || r.notify_channels.length === 0) && <span className="text-[#9A9890] text-[10px]">—</span>}
              </div>
            ),
          },
          {
            key: "cooldown_minutes",
            label: "冷卻",
            align: "right",
            render: (r) => `${r.cooldown_minutes ?? 0} 分`,
          },
          {
            key: "is_enabled",
            label: "狀態",
            align: "center",
            render: (r) => <StatusBadge label={r.is_enabled ? "啟用" : "停用"} color={r.is_enabled ? "green" : "gray"} />,
          },
        ]}
      />

      <h2 className="text-[13px] font-bold mt-6 mb-2">最近 20 筆告警事件</h2>
      <PartsTable
        rows={events ?? []}
        emptyText="尚無告警事件 — 系統運作正常"
        columns={[
          { key: "created_at", label: "時間", render: (e) => new Date(e.created_at).toLocaleString("zh-TW", { hour12: false }) },
          {
            key: "severity",
            label: "嚴重度",
            align: "center",
            render: (e) => {
              const meta = SEVERITY_LABELS[e.severity] ?? SEVERITY_LABELS.medium;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
          { key: "ref_type", label: "對象類型" },
          { key: "ref_id", label: "對象 ID", render: (e) => <span className="font-mono text-[10px] text-[#6B6A68]">{e.ref_id?.slice(0, 8) ?? "—"}</span> },
          {
            key: "ack_status",
            label: "處理狀態",
            align: "center",
            render: (e) => {
              if (e.resolved_at) return <StatusBadge label="✓ 已解決" color="green" />;
              if (e.acked_at) return <StatusBadge label="處理中" color="amber" />;
              return <StatusBadge label="未處理" color="red" />;
            },
          },
        ]}
      />
    </PartsShell>
  );
}
