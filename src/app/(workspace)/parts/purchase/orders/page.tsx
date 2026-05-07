import { PartsShell } from "@/components/parts/parts-shell";
import { createClient } from "@/lib/supabase/server";
import { getActiveItems, getActiveSuppliers, getActiveWarehouses } from "@/lib/parts/queries";
import { NewPOButton } from "./_components/new-po-button";
import { PORowActions } from "./_components/po-row-actions";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: "待審核", color: "bg-[#FDF3E3] text-[#854F0B]" },
  approved: { label: "待收貨", color: "bg-[#EBF3FF] text-[#185FA5]" },
  partial_received: { label: "部分入庫", color: "bg-[#F0EEFF] text-[#7F77DD]" },
  received: { label: "入庫完成", color: "bg-[#E8F5F0] text-[#0F6E56]" },
  cancelled: { label: "已取消", color: "bg-[#FDECEA] text-[#CC0000]" },
  draft: { label: "草稿", color: "bg-[#F5F5F4] text-[#6B6A68]" },
};

export default async function PurchaseOrdersPage() {
  const supabase = await createClient();

  // 撈 PO list + lines 數 + supplier 名 + warehouse 名(用 RLS 自動 brand 過濾)
  const [{ data: pos }, suppliers, warehouses, items] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id, po_no, vendor_id, warehouse_id, purchase_type, status, qty_ordered_total, qty_received_total, amount_total, eta_date, po_date, receipt_progress_pct, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    getActiveSuppliers(),
    getActiveWarehouses(),
    getActiveItems(),
  ]);

  const supplierMap = new Map(suppliers.map((s) => [s.id, s.name]));
  const warehouseMap = new Map(warehouses.map((w) => [w.id, w.name]));

  const list = pos ?? [];
  const counts = {
    all: list.length,
    pending: list.filter((p) => p.status === "pending").length,
    approved: list.filter((p) => p.status === "approved").length,
    partial: list.filter((p) => p.status === "partial_received").length,
    done: list.filter((p) => p.status === "received").length,
  };

  return (
    <PartsShell
      title="商品採購"
      chapter="4.3"
      description="建立與管理採購單,審核後進入入庫流程(5.1)"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "採購管理" },
        { label: "商品採購" },
      ]}
      flowSteps={[
        { label: "觸發 / 計畫", status: "done" },
        { label: "需求處理", status: "done" },
        { label: "商品採購 ★", status: "active" },
        { label: "採購入庫", status: "pending" },
        { label: "庫存更新", status: "pending" },
      ]}
      toolbarRight={
        <NewPOButton
          suppliers={suppliers.map((s) => ({ id: s.id, name: s.name, code: s.code }))}
          warehouses={warehouses.map((w) => ({ id: w.id, name: w.name, code: w.code }))}
          items={items.map((i) => ({ id: i.id, name: i.name, code: i.code, base_uom: i.base_uom }))}
        />
      }
    >
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <Pill label={`全部 ${counts.all}`} active />
        <Pill label={`📝 待審核 ${counts.pending}`} />
        <Pill label={`📤 待收貨 ${counts.approved}`} />
        <Pill label={`📦 部分入庫 ${counts.partial}`} />
        <Pill label={`✅ 入庫完成 ${counts.done}`} />
      </div>

      <div className="bg-white rounded-lg border border-[#EEECE6] overflow-hidden">
        <table className="w-full text-[12px]">
          <thead className="bg-[#FAFAF9] text-[11px] text-[#6B6A68] uppercase tracking-wide">
            <tr>
              <th className="text-left py-2.5 px-3 font-semibold">採購單號</th>
              <th className="text-left py-2.5 px-3 font-semibold">供應商</th>
              <th className="text-left py-2.5 px-3 font-semibold">收貨倉庫</th>
              <th className="text-left py-2.5 px-3 font-semibold">類型</th>
              <th className="text-right py-2.5 px-3 font-semibold">總數量</th>
              <th className="text-right py-2.5 px-3 font-semibold">含稅總額</th>
              <th className="text-left py-2.5 px-3 font-semibold">預計到貨</th>
              <th className="text-left py-2.5 px-3 font-semibold">入庫進度</th>
              <th className="text-left py-2.5 px-3 font-semibold">狀態</th>
              <th className="text-right py-2.5 px-3 font-semibold">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-12 text-center text-[#9A9890]">
                  目前沒有採購單,點右上角「+ 新增採購單」開單
                </td>
              </tr>
            ) : (
              list.map((po) => {
                const meta =
                  STATUS_LABELS[po.status] ?? STATUS_LABELS.draft;
                return (
                  <tr key={po.id} className="border-t border-[#F5F5F4] hover:bg-[#FAFAF9]">
                    <td className="py-2.5 px-3 font-mono text-[#185FA5]">{po.po_no}</td>
                    <td className="py-2.5 px-3">{supplierMap.get(po.vendor_id) ?? "—"}</td>
                    <td className="py-2.5 px-3 text-[11px]">{warehouseMap.get(po.warehouse_id) ?? "—"}</td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          po.purchase_type === "ad_hoc"
                            ? "bg-[#FDF3E3] text-[#854F0B]"
                            : "bg-[#F5F5F4] text-[#6B6A68]"
                        }`}
                      >
                        {po.purchase_type === "ad_hoc" ? "臨時採購" : "計畫採購"}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">{po.qty_ordered_total}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-[#0F6E56]">
                      NT$ {Number(po.amount_total).toLocaleString()}
                    </td>
                    <td className="py-2.5 px-3 text-[11px]">
                      {po.eta_date ?? "—"}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="text-[10px] text-[#6B6A68]">
                        {po.qty_received_total} / {po.qty_ordered_total} 件
                      </div>
                      <div className="w-24 h-1 bg-[#F5F5F4] rounded mt-1 overflow-hidden">
                        <div
                          className="h-full bg-[#185FA5]"
                          style={{ width: `${po.receipt_progress_pct}%` }}
                        />
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <PORowActions poId={po.id} status={po.status} />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </PartsShell>
  );
}

function Pill({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 h-7 px-3 rounded-[14px] text-[12px] font-medium border ${
        active
          ? "bg-[#185FA5] text-white border-[#185FA5]"
          : "bg-white text-[#6B6A68] border-[#EEECE6]"
      }`}
    >
      {label}
    </span>
  );
}
