import { PartsShell } from "@/components/parts/parts-shell";
import { createClient } from "@/lib/supabase/server";

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  po_grn: { label: "採購入庫", color: "bg-[#EBF3FF] text-[#185FA5]" },
  transfer_in: { label: "調撥入庫", color: "bg-[#F0EEFF] text-[#7F77DD]" },
  internal_sale: { label: "內售入庫", color: "bg-[#FFF9F0] text-[#854F0B]" },
  return_in: { label: "退貨入庫", color: "bg-[#FDECEA] text-[#CC0000]" },
  exception_in: { label: "例外入庫", color: "bg-[#F5F5F4] text-[#6B6A68]" },
};

export default async function ReceiptsHistoryPage() {
  const supabase = await createClient();

  const { data: receipts } = await supabase
    .from("stock_receipts")
    .select(
      "id, gr_no, type, warehouse_id, vendor_id, receipt_date, qty_received_total, amount_total, status, source_doc_id, source_doc_type, notes, posted_at, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  const list = receipts ?? [];

  const grIds = list.map((r) => r.id);
  const linesPromise = grIds.length
    ? supabase
        .from("stock_receipt_lines")
        .select("gr_id, item_id, qty_received, unit_cost, line_amount")
        .in("gr_id", grIds)
        .then((r) => r.data ?? [])
    : Promise.resolve([] as Array<{ gr_id: string; item_id: string; qty_received: number; unit_cost: number; line_amount: number }>);

  const [lines, { data: warehouses }, { data: suppliers }, { data: items }, { data: pos }] =
    await Promise.all([
      linesPromise,
      supabase.from("warehouses").select("id, name").eq("is_active", true),
      supabase.from("suppliers").select("id, name"),
      supabase.from("items").select("id, code, name"),
      supabase.from("purchase_orders").select("id, po_no"),
    ]);

  const warehouseMap = new Map((warehouses ?? []).map((w) => [w.id, w.name]));
  const supplierMap = new Map((suppliers ?? []).map((s) => [s.id, s.name]));
  const itemMap = new Map((items ?? []).map((i) => [i.id, { code: i.code, name: i.name }]));
  const poMap = new Map((pos ?? []).map((p) => [p.id, p.po_no]));
  const linesByGr = new Map<string, typeof lines>();
  for (const line of lines) {
    if (!linesByGr.has(line.gr_id)) linesByGr.set(line.gr_id, []);
    linesByGr.get(line.gr_id)!.push(line);
  }

  return (
    <PartsShell
      title="入庫查詢"
      chapter="6.5"
      description="跨類型入庫單彙整(採購 / 調撥 / 退貨 / 例外)— 看 GR 全貌跟細部 lines"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "庫存作業" },
        { label: "入庫查詢" },
      ]}
    >
      {list.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#EEECE6] py-12 text-center text-[#9A9890] text-[13px]">
          尚無入庫單。
          <br />
          請先到 <a href="/parts/receipt/po-grn" className="text-[#185FA5] underline">採購入庫</a> 開單。
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((gr) => {
            const grLines = linesByGr.get(gr.id) ?? [];
            const meta = TYPE_LABELS[gr.type] ?? TYPE_LABELS.exception_in;
            return (
              <div key={gr.id} className="bg-white rounded-lg border border-[#EEECE6]">
                <div className="px-4 py-2.5 border-b border-[#F5F5F4] flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]">
                  <span className="font-mono font-semibold text-[#185FA5]">{gr.gr_no}</span>
                  <span
                    className={`inline-block text-[10px] font-semibold px-2 py-0.5 rounded ${meta.color}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[#9A9890]">·</span>
                  <span className="text-[#6B6A68]">{gr.receipt_date}</span>
                  <span className="text-[#9A9890]">·</span>
                  <span className="text-[#6B6A68]">{warehouseMap.get(gr.warehouse_id) ?? "—"}</span>
                  {gr.vendor_id && (
                    <>
                      <span className="text-[#9A9890]">·</span>
                      <span className="text-[#6B6A68]">{supplierMap.get(gr.vendor_id) ?? "—"}</span>
                    </>
                  )}
                  {gr.source_doc_type === "purchase_order" && gr.source_doc_id && (
                    <>
                      <span className="text-[#9A9890]">·</span>
                      <span className="text-[11px] text-[#9A9890]">
                        來源 <span className="font-mono">{poMap.get(gr.source_doc_id) ?? "—"}</span>
                      </span>
                    </>
                  )}
                  <span className="ml-auto text-[#0F6E56] font-semibold">
                    NT$ {Number(gr.amount_total).toLocaleString()}
                  </span>
                  <span className="text-[#6B6A68]">{gr.qty_received_total} 件</span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px]">
                    <thead className="text-[10px] text-[#9A9890] uppercase">
                      <tr>
                        <th className="text-left py-1.5 px-3 font-semibold">料件</th>
                        <th className="text-right py-1.5 px-3 font-semibold">數量</th>
                        <th className="text-right py-1.5 px-3 font-semibold">單價</th>
                        <th className="text-right py-1.5 px-3 font-semibold">小計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {grLines.map((line, idx) => {
                        const item = itemMap.get(line.item_id);
                        return (
                          <tr key={idx} className="border-t border-[#F5F5F4]">
                            <td className="py-1.5 px-3">
                              <span className="font-mono text-[10px] text-[#9A9890] mr-2">
                                {item?.code}
                              </span>
                              {item?.name}
                            </td>
                            <td className="py-1.5 px-3 text-right">{line.qty_received}</td>
                            <td className="py-1.5 px-3 text-right">
                              NT$ {Number(line.unit_cost).toLocaleString()}
                            </td>
                            <td className="py-1.5 px-3 text-right font-semibold">
                              NT$ {Number(line.line_amount).toLocaleString()}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {gr.notes && (
                  <div className="px-4 py-1.5 border-t border-[#F5F5F4] text-[11px] text-[#6B6A68] bg-[#FAFAF9]">
                    備註:{gr.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PartsShell>
  );
}
