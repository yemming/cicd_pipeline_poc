import { PartsShell } from "@/components/parts/parts-shell";
import { PartsTable, StatusBadge, ComingSoonNote } from "@/components/parts/parts-table";
import { createClient } from "@/lib/supabase/server";

export default async function Page() {
  const supabase = await createClient();
  const [{ data: receipts }, { data: warehouses }] = await Promise.all([
    supabase
      .from("stock_receipts")
      .select("id, gr_no, receipt_date, warehouse_id, customer_id, qty_received_total, amount_total, status, notes, posted_at")
      .eq("type", "internal_sale")
      .order("receipt_date", { ascending: false })
      .limit(50),
    supabase.from("warehouses").select("id, name"),
  ]);

  const whMap = new Map((warehouses ?? []).map((w) => [w.id, w.name]));

  return (
    <PartsShell
      title="內售入庫"
      chapter="5.3"
      description="POS 收銀後若有換貨 / 退貨,商品要回庫 — 此頁追蹤這類入庫"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "入庫管理" },
        { label: "內售入庫" },
      ]}
      toolbarRight={<ComingSoonNote feature="POS 退貨入庫整合" />}
    >
      <PartsTable
        rows={receipts ?? []}
        emptyText="尚無內售入庫單"
        columns={[
          { key: "gr_no", label: "GR 單號", render: (r) => <span className="font-mono text-[11px] text-[#185FA5]">{r.gr_no}</span> },
          { key: "receipt_date", label: "入庫日" },
          { key: "warehouse_id", label: "倉庫", render: (r) => whMap.get(r.warehouse_id) ?? "—" },
          { key: "customer_id", label: "客戶", render: (r) => (r.customer_id ? <span className="font-mono text-[10px]">{r.customer_id.slice(0, 8)}</span> : "—") },
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
