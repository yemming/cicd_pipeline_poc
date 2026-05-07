import { PartsShell } from "@/components/parts/parts-shell";
import { createClient } from "@/lib/supabase/server";
import { ReceiveButton } from "./_components/receive-button";

export default async function POGRNPage() {
  const supabase = await createClient();

  // 撈待收貨 / 部分入庫的 PO + 每張的 lines
  const { data: pos } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_no, vendor_id, warehouse_id, status, qty_ordered_total, qty_received_total, amount_total, eta_date, receipt_progress_pct",
    )
    .in("status", ["approved", "partial_received"])
    .order("approved_at", { ascending: true });

  const list = pos ?? [];

  // 一次撈所有相關的 lines / suppliers / warehouses / items / bins
  const poIds = list.map((p) => p.id);
  const [lines, suppliers, warehouses, items, bins] = await Promise.all([
    poIds.length
      ? supabase
          .from("purchase_order_lines")
          .select("id, po_id, line_no, item_id, qty_ordered, qty_received, unit_price, uom")
          .in("po_id", poIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    supabase.from("suppliers").select("id, name").eq("is_active", true).then((r) => r.data ?? []),
    supabase.from("warehouses").select("id, name").eq("is_active", true).then((r) => r.data ?? []),
    supabase.from("items").select("id, name, code").eq("is_active", true).then((r) => r.data ?? []),
    supabase.from("warehouse_bins").select("id, code, warehouse_id").eq("is_active", true).then((r) => r.data ?? []),
  ]);

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name]));
  const itemMap = new Map(items.map((i) => [i.id, { name: i.name, code: i.code }]));
  const linesByPo = new Map<string, typeof lines>();
  for (const line of lines) {
    if (!linesByPo.has(line.po_id)) linesByPo.set(line.po_id, []);
    linesByPo.get(line.po_id)!.push(line);
  }

  return (
    <PartsShell
      title="採購入庫(GRN)"
      chapter="5.1"
      description="勾選 PO 明細執行收貨,系統會自動產生 stock_items 並更新庫存"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "入庫管理" },
        { label: "採購入庫" },
      ]}
      flowSteps={[
        { label: "觸發 / 計畫", status: "done" },
        { label: "需求處理", status: "done" },
        { label: "商品採購", status: "done" },
        { label: "採購入庫 ★", status: "active" },
        { label: "庫存更新", status: "pending" },
      ]}
    >
      {list.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#EEECE6] py-12 text-center text-[#9A9890] text-[13px]">
          目前沒有已審核 / 部分入庫的採購單。
          <br />
          請先到 <a href="/parts/purchase/orders" className="text-[#185FA5] underline">商品採購</a> 建立並審核。
        </div>
      ) : (
        <div className="space-y-3">
          {list.map((po) => {
            const poLines = linesByPo.get(po.id) ?? [];
            const poBins = bins.filter((b) => b.warehouse_id === po.warehouse_id);
            return (
              <div key={po.id} className="bg-white rounded-lg border border-[#EEECE6] overflow-hidden">
                <div className="px-4 py-2.5 bg-[#FAFAF9] border-b border-[#EEECE6] flex items-center gap-3 text-[12px]">
                  <span className="font-mono font-semibold text-[#185FA5]">{po.po_no}</span>
                  <span className="text-[#6B6A68]">·</span>
                  <span>{supplierMap.get(po.vendor_id) ?? "—"}</span>
                  <span className="text-[#6B6A68]">·</span>
                  <span className="text-[#6B6A68]">{warehouseMap.get(po.warehouse_id) ?? "—"}</span>
                  <span className="text-[#6B6A68]">·</span>
                  <span className="text-[#6B6A68]">
                    {po.qty_received_total} / {po.qty_ordered_total} 件 ({po.receipt_progress_pct}%)
                  </span>
                  <span
                    className={`ml-auto inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${
                      po.status === "approved"
                        ? "bg-[#EBF3FF] text-[#185FA5]"
                        : "bg-[#F0EEFF] text-[#7F77DD]"
                    }`}
                  >
                    {po.status === "approved" ? "待收貨" : "部分入庫"}
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead className="text-[10px] text-[#9A9890] uppercase">
                      <tr className="border-b border-[#F5F5F4]">
                        <th className="text-left py-2 px-3 font-semibold">#</th>
                        <th className="text-left py-2 px-3 font-semibold">料件</th>
                        <th className="text-right py-2 px-3 font-semibold">已訂</th>
                        <th className="text-right py-2 px-3 font-semibold">已收</th>
                        <th className="text-right py-2 px-3 font-semibold">未收</th>
                        <th className="text-right py-2 px-3 font-semibold">單價</th>
                      </tr>
                    </thead>
                    <tbody>
                      {poLines.map((line) => {
                        const item = itemMap.get(line.item_id);
                        const remaining = line.qty_ordered - (line.qty_received ?? 0);
                        return (
                          <tr key={line.id} className="border-b border-[#F5F5F4] last:border-b-0">
                            <td className="py-1.5 px-3 text-[#9A9890]">{line.line_no}</td>
                            <td className="py-1.5 px-3">
                              <div className="font-medium">{item?.name ?? line.item_id}</div>
                              <div className="text-[10px] text-[#9A9890] font-mono">{item?.code}</div>
                            </td>
                            <td className="py-1.5 px-3 text-right">{line.qty_ordered}</td>
                            <td className="py-1.5 px-3 text-right">{line.qty_received ?? 0}</td>
                            <td className="py-1.5 px-3 text-right font-semibold text-[#854F0B]">{remaining}</td>
                            <td className="py-1.5 px-3 text-right">NT$ {Number(line.unit_price).toLocaleString()}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-4 py-2 border-t border-[#EEECE6] flex items-center justify-end">
                  <ReceiveButton
                    po={{
                      id: po.id,
                      po_no: po.po_no,
                      warehouse_id: po.warehouse_id,
                    }}
                    lines={poLines.map((l) => ({
                      id: l.id,
                      line_no: l.line_no,
                      item_id: l.item_id,
                      item_name: itemMap.get(l.item_id)?.name ?? "",
                      item_code: itemMap.get(l.item_id)?.code ?? "",
                      qty_ordered: l.qty_ordered,
                      qty_received: l.qty_received ?? 0,
                      unit_price: Number(l.unit_price),
                    }))}
                    bins={poBins.map((b) => ({ id: b.id, code: b.code }))}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PartsShell>
  );
}
