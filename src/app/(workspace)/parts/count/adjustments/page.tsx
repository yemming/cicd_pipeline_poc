import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const STATUS_MAP: Record<string, { label: string; color: "gray" | "amber" | "green" | "red" }> = {
  draft: { label: "草稿", color: "gray" },
  pending_approval: { label: "待核準", color: "amber" },
  approved: { label: "已核準", color: "green" },
  posted: { label: "已過帳", color: "green" },
  rejected: { label: "退件", color: "red" },
};

export default async function Page() {
  const supabase = await createClient();
  const { data: adjs } = await supabase
    .from("inventory_adjustments")
    .select("id, adj_no, ct_id, total_amount, reason, status, gl_posted, posted_at, approved_at, notes, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <PartsShell
      title="報損報溢"
      chapter="8.3"
      description="盤點差異 → 產生 adjustment 進 GL;每筆都標明原因(damaged / lost / found / variance)"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "盤點管理" },
        { label: "報損報溢" },
      ]}
    >
      <PartsTable
        rows={adjs ?? []}
        emptyText="尚無報損報溢單"
        columns={[
          { key: "adj_no", label: "調整單號", render: (a) => <span className="font-mono text-[11px] text-[#185FA5]">{a.adj_no}</span> },
          { key: "created_at", label: "建立日", render: (a) => new Date(a.created_at).toISOString().slice(0, 10) },
          { key: "reason", label: "原因", render: (a) => a.reason ?? "—" },
          {
            key: "total_amount",
            label: "金額影響",
            align: "right",
            render: (a) => {
              const v = Number(a.total_amount ?? 0);
              const cls = v < 0 ? "text-[#CC0000]" : "text-[#0F6E56]";
              return <span className={`font-semibold ${cls}`}>{v >= 0 ? "+" : ""}NT$ {Math.round(v).toLocaleString()}</span>;
            },
          },
          {
            key: "gl_posted",
            label: "GL",
            align: "center",
            render: (a) => (a.gl_posted ? <StatusBadge label="✓ 已過帳" color="green" /> : <StatusBadge label="未過帳" color="gray" />),
          },
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (a) => {
              const meta = STATUS_MAP[a.status] ?? STATUS_MAP.draft;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
        ]}
      />
    </PartsShell>
  );
}
