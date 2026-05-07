import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge, ComingSoonNote } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: receipts }, { data: warehouses }] = await Promise.all([
    supabase
      .from("stock_receipts")
      .select("id, gr_no, receipt_date, warehouse_id, qty_received_total, amount_total, status, source_doc_id, notes, posted_at")
      .eq("type", "transfer_in")
      .order("receipt_date", { ascending: false })
      .limit(50),
    supabase.from("warehouses").select("id, name"),
  ]);

  const whMap = new Map((warehouses ?? []).map((w) => [w.id, w.name]));

  return (
    <PartsShell
      title="調撥入庫"
      chapter="5.2"
      description="目的倉收到調撥來的貨,確認後產生 stock_items"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "入庫管理" },
        { label: "調撥入庫" },
      ]}
      toolbarRight={<ComingSoonNote feature="開單介面" />}
    >
      <PartsTable
        rows={receipts ?? []}
        emptyText="尚無調撥入庫單。先到「6.2 調撥出庫」由源倉建單"
        columns={[
          { key: "gr_no", label: "GR 單號", render: (r) => <span className="font-mono text-[11px] text-[#185FA5]">{r.gr_no}</span> },
          { key: "receipt_date", label: "入庫日" },
          { key: "warehouse_id", label: "目的倉", render: (r) => whMap.get(r.warehouse_id) ?? "—" },
          { key: "qty_received_total", label: "件數", align: "right" },
          {
            key: "amount_total",
            label: "金額",
            align: "right",
            render: (r) => `NT$ ${Math.round(Number(r.amount_total ?? 0)).toLocaleString()}`,
          },
          {
            key: "status",
            label: "狀態",
            align: "center",
            render: (r) => <StatusBadge label={r.status === "posted" ? "已過帳" : r.status} color={r.status === "posted" ? "green" : "amber"} />,
          },
        ]}
      />
    </PartsShell>
  );
}
