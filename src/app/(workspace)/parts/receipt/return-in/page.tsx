import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge, ComingSoonNote } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: receipts }, { data: warehouses }] = await Promise.all([
    supabase
      .from("stock_receipts")
      .select("id, gr_no, receipt_date, warehouse_id, qty_received_total, amount_total, status, source_doc_id, source_doc_type, notes, posted_at")
      .eq("type", "return_in")
      .order("receipt_date", { ascending: false })
      .limit(50),
    supabase.from("warehouses").select("id, name"),
  ]);

  const whMap = new Map((warehouses ?? []).map((w) => [w.id, w.name]));

  return (
    <PartsShell
      title="領料退貨入庫"
      chapter="5.4"
      description="維修工單沒用完的料件回庫 → 從 stock_issue 反向產生 stock_items"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "入庫管理" },
        { label: "領料退貨入庫" },
      ]}
      toolbarRight={<ComingSoonNote feature="從工單退料" />}
    >
      <PartsTable
        rows={receipts ?? []}
        emptyText="尚無領料退貨單"
        columns={[
          { key: "gr_no", label: "GR 單號", render: (r) => <span className="font-mono text-[11px] text-[#185FA5]">{r.gr_no}</span> },
          { key: "receipt_date", label: "入庫日" },
          { key: "warehouse_id", label: "倉庫", render: (r) => whMap.get(r.warehouse_id) ?? "—" },
          { key: "source_doc_type", label: "來源單據" },
          { key: "qty_received_total", label: "件數", align: "right" },
          { key: "amount_total", label: "金額", align: "right", render: (r) => `NT$ ${Math.round(Number(r.amount_total ?? 0)).toLocaleString()}` },
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
