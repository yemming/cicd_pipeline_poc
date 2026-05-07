import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge, ComingSoonNote } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const { data: transfers } = await supabase
    .from("stock_transfers")
    .select(
      "id, qty_requested_total, qty_shipped_total, qty_received_total, expected_arrival_date, actual_arrival_date, logistics_provider, logistics_tracking_no, reason, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const list = transfers ?? [];

  return (
    <PartsShell
      title="調撥出庫"
      chapter="6.2"
      description="跨倉調撥的出庫端 — 由源倉建立調撥單,出貨後變 in_transit 等候目的倉收貨"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "出庫管理" },
        { label: "調撥出庫" },
      ]}
      toolbarRight={<ComingSoonNote feature="調撥開單" />}
    >
      <PartsTable
        rows={list}
        emptyText="尚無調撥單"
        columns={[
          { key: "id", label: "調撥單", render: (t) => <span className="font-mono text-[10px] text-[#185FA5]">{t.id?.slice(0, 12) ?? "—"}</span> },
          { key: "qty_requested_total", label: "申請", align: "right" },
          { key: "qty_shipped_total", label: "已出", align: "right", render: (t) => <span className="font-semibold">{t.qty_shipped_total}</span> },
          { key: "qty_received_total", label: "已收", align: "right" },
          { key: "expected_arrival_date", label: "預計到貨", render: (t) => t.expected_arrival_date ?? "—" },
          { key: "actual_arrival_date", label: "實際到貨", render: (t) => t.actual_arrival_date ?? "—" },
          { key: "reason", label: "事由", render: (t) => t.reason ?? "—" },
          { key: "created_at", label: "建立日", render: (t) => new Date(t.created_at).toISOString().slice(0, 10) },
        ]}
      />
    </PartsShell>
  );
}
