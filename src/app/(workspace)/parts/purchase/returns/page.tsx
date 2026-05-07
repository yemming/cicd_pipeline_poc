import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const STATUS_MAP: Record<string, { label: string; color: "gray" | "amber" | "blue" | "green" | "red" }> = {
  draft: { label: "草稿", color: "gray" },
  pending_approval: { label: "待核準", color: "amber" },
  approved: { label: "已核準", color: "blue" },
  shipped: { label: "已寄出", color: "amber" },
  completed: { label: "完成", color: "green" },
  rejected: { label: "退件", color: "red" },
};

export default async function Page() {
  const supabase = await createClient();
  const [{ data: returns }, { data: pos }] = await Promise.all([
    supabase
      .from("purchase_returns")
      .select("id, po_id, amount_total, logistics_provider, logistics_tracking_no, gl_posted, approved_at, posted_at, notes, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase.from("purchase_orders").select("id, po_no"),
  ]);

  const poMap = new Map((pos ?? []).map((p) => [p.id, p.po_no]));

  return (
    <PartsShell
      title="採購退貨"
      chapter="4.5"
      description="退貨給供應商 — 從 PO 開單,系統會反向扣 stock_items"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "採購管理" },
        { label: "採購退貨" },
      ]}
    >
      <PartsTable
        rows={returns ?? []}
        emptyText="尚無退貨單"
        columns={[
          { key: "id", label: "退貨單", render: (r) => <span className="font-mono text-[10px] text-[#185FA5]">{r.id?.slice(0, 12) ?? "—"}</span> },
          { key: "po_id", label: "原採購單", render: (r) => (r.po_id ? <span className="font-mono text-[10px]">{poMap.get(r.po_id) ?? r.po_id.slice(0, 8)}</span> : "—") },
          {
            key: "amount_total",
            label: "退貨金額",
            align: "right",
            render: (r) => <span className="font-semibold text-[#CC0000]">- NT$ {Math.round(Number(r.amount_total ?? 0)).toLocaleString()}</span>,
          },
          {
            key: "logistics",
            label: "物流",
            render: (r) =>
              r.logistics_provider ? (
                <div className="text-[11px]">
                  <div>{r.logistics_provider}</div>
                  <div className="font-mono text-[10px] text-[#9A9890]">{r.logistics_tracking_no ?? "—"}</div>
                </div>
              ) : (
                <span className="text-[#9A9890]">—</span>
              ),
          },
          {
            key: "gl_posted",
            label: "GL",
            align: "center",
            render: (r) => (r.gl_posted ? <StatusBadge label="✓ 已過帳" color="green" /> : <StatusBadge label="未過帳" color="gray" />),
          },
          { key: "created_at", label: "建立日", render: (r) => new Date(r.created_at).toISOString().slice(0, 10) },
        ]}
      />
    </PartsShell>
  );
}
