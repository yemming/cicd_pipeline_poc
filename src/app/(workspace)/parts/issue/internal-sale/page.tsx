import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge, ComingSoonNote } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const STATUS_MAP: Record<string, { label: string; color: "gray" | "amber" | "green" | "red" }> = {
  draft: { label: "草稿", color: "gray" },
  pending: { label: "待出庫", color: "amber" },
  posted: { label: "已出庫", color: "green" },
  cancelled: { label: "已取消", color: "red" },
};

export default async function Page() {
  const supabase = await createClient();
  const { data: issues } = await supabase
    .from("stock_issues")
    .select("id, gi_no, issue_date, customer_id, status, amount_total, posted_at, notes")
    .eq("source_doc_type", "internal_sale")
    .order("issue_date", { ascending: false })
    .limit(50);

  return (
    <PartsShell
      title="內售出庫"
      chapter="6.3"
      description="客戶來店買零件 → POS 開單 → 庫存扣量 → 收款"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "出庫管理" },
        { label: "內售出庫" },
      ]}
      toolbarRight={<ComingSoonNote feature="內售開單(整合 POS)" />}
    >
      <PartsTable
        rows={issues ?? []}
        emptyText="尚無內售出庫單。零件販售可從 POS 開單後同步扣庫"
        columns={[
          { key: "gi_no", label: "出庫單號", render: (g) => <span className="font-mono text-[11px] text-[#185FA5]">{g.gi_no}</span> },
          { key: "issue_date", label: "出庫日" },
          { key: "customer_id", label: "客戶", render: (g) => (g.customer_id ? <span className="font-mono text-[10px]">{g.customer_id.slice(0, 8)}</span> : "—") },
          {
            key: "amount_total",
            label: "金額",
            align: "right",
            render: (g) => <span className="font-semibold text-[#0F6E56]">NT$ {Math.round(Number(g.amount_total ?? 0)).toLocaleString()}</span>,
          },
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (g) => {
              const meta = STATUS_MAP[g.status] ?? STATUS_MAP.draft;
              return <StatusBadge label={meta.label} color={meta.color} />;
            },
          },
          { key: "notes", label: "備註", render: (g) => <span className="text-[11px] text-[#6B6A68]">{g.notes ?? "—"}</span> },
        ]}
      />
    </PartsShell>
  );
}
