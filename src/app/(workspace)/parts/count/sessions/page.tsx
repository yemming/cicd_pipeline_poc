import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const STATUS_MAP: Record<string, { label: string; color: "gray" | "amber" | "blue" | "green" | "red" }> = {
  draft: { label: "草稿", color: "gray" },
  in_progress: { label: "盤點中", color: "blue" },
  pending_review: { label: "待覆核", color: "amber" },
  approved: { label: "已核準", color: "green" },
  cancelled: { label: "取消", color: "red" },
};

export default async function Page() {
  const supabase = await createClient();
  const { data: sessions } = await supabase
    .from("inventory_counts")
    .select("id, ct_no, count_date, plan_id, freeze_warehouse, status, total_lines, first_counter_id, second_counter_id, approver_id, approved_at, notes, created_at")
    .order("count_date", { ascending: false })
    .limit(50);

  return (
    <PartsShell
      title="盤點處理"
      chapter="8.2"
      description="實地盤點作業 — 兩階盤點 + 覆核核準後產生 inventory_adjustment"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "盤點管理" },
        { label: "盤點處理" },
      ]}
    >
      <PartsTable
        rows={sessions ?? []}
        emptyText="尚未啟動任何盤點作業"
        columns={[
          { key: "ct_no", label: "盤點單號", render: (s) => <span className="font-mono text-[11px] text-[#185FA5]">{s.ct_no}</span> },
          { key: "count_date", label: "盤點日" },
          {
            key: "freeze_warehouse",
            label: "凍倉",
            align: "center",
            render: (s) => (s.freeze_warehouse ? <span className="text-[#CC0000] text-[14px]">❄️</span> : "—"),
          },
          { key: "total_lines", label: "明細數", align: "right" },
          {
            key: "stage",
            label: "盤點階段",
            render: (s) => {
              const has1 = !!s.first_counter_id;
              const has2 = !!s.second_counter_id;
              const hasApprove = !!s.approver_id;
              return (
                <div className="flex gap-1 text-[10px]">
                  <span className={`px-1.5 py-0.5 rounded ${has1 ? "bg-[#E8F5F0] text-[#0F6E56]" : "bg-[#F5F5F4] text-[#9A9890]"}`}>初盤</span>
                  <span className={`px-1.5 py-0.5 rounded ${has2 ? "bg-[#E8F5F0] text-[#0F6E56]" : "bg-[#F5F5F4] text-[#9A9890]"}`}>覆盤</span>
                  <span className={`px-1.5 py-0.5 rounded ${hasApprove ? "bg-[#E8F5F0] text-[#0F6E56]" : "bg-[#F5F5F4] text-[#9A9890]"}`}>核準</span>
                </div>
              );
            },
          },
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (s) => {
              const meta = STATUS_MAP[s.status] ?? STATUS_MAP.draft;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
        ]}
      />
    </PartsShell>
  );
}
