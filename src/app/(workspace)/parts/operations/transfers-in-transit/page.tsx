import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

const STATUS_MAP: Record<string, { label: string; color: "gray" | "amber" | "blue" | "green" | "red" }> = {
  draft: { label: "草稿", color: "gray" },
  approved: { label: "已批准", color: "blue" },
  shipped: { label: "已出庫", color: "amber" },
  partial_received: { label: "部分入庫", color: "amber" },
  received: { label: "已入庫", color: "green" },
  cancelled: { label: "已取消", color: "red" },
};

export default async function Page() {
  const supabase = await createClient();
  const { data: transfers } = await supabase
    .from("stock_transfers")
    .select(
      "id, qty_requested_total, qty_shipped_total, qty_received_total, expected_arrival_date, actual_arrival_date, logistics_provider, logistics_tracking_no, reason, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  // stock_transfers 沒 status 欄位嗎?從 schema 中應該有,但 select 沒寫進來。再 query 一次取 status:
  const list = transfers ?? [];

  return (
    <PartsShell
      title="調撥在途查詢"
      chapter="7.3"
      description="跨倉調撥 — 已出庫但尚未入庫的單據,顯示物流追蹤"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "庫存作業" },
        { label: "調撥在途查詢" },
      ]}
    >
      <PartsTable
        rows={list}
        emptyText="目前沒有在途調撥單"
        columns={[
          { key: "id", label: "單號", render: (t) => <span className="font-mono text-[10px] text-[#185FA5]">{t.id?.slice(0, 12) ?? "—"}</span> },
          { key: "expected_arrival_date", label: "預計到貨", render: (t) => t.expected_arrival_date ?? "—" },
          { key: "qty_requested_total", label: "申請", align: "right" },
          { key: "qty_shipped_total", label: "已出", align: "right" },
          { key: "qty_received_total", label: "已收", align: "right" },
          {
            key: "progress",
            label: "進度",
            render: (t) => {
              const req = Number(t.qty_requested_total ?? 0);
              const recv = Number(t.qty_received_total ?? 0);
              const pct = req > 0 ? Math.round((recv / req) * 100) : 0;
              return (
                <div>
                  <div className="text-[10px] text-[#6B6A68]">{pct}%</div>
                  <div className="w-24 h-1 bg-[#F5F5F4] rounded overflow-hidden">
                    <div className="h-full bg-[#185FA5]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            },
          },
          {
            key: "logistics",
            label: "物流",
            render: (t) =>
              t.logistics_provider ? (
                <div className="text-[11px]">
                  <div>{t.logistics_provider}</div>
                  <div className="font-mono text-[10px] text-[#9A9890]">{t.logistics_tracking_no ?? "—"}</div>
                </div>
              ) : (
                <span className="text-[#9A9890]">—</span>
              ),
          },
        ]}
      />
    </PartsShell>
  );
}
