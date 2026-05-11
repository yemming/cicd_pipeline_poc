import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import { ReceiveForm } from "./_components/receive-form";

export const dynamic = "force-dynamic";

type PoCandidate = {
  id: string;
  po_no: string;
  status: string;
  vendor_name: string | null;
  warehouse_name: string | null;
  qty_ordered_total: number;
  qty_received_total: number;
};

async function loadPoCandidates(): Promise<PoCandidate[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_no, status, vendor_id, warehouse_id, qty_ordered_total, qty_received_total, suppliers ( name ), warehouses ( name )",
    )
    .eq("brand_id", brand)
    .in("status", ["approved", "partial_received"])
    .order("po_date", { ascending: false })
    .limit(50);
  if (error) throw new Error(`po candidates: ${error.message}`);
  return ((data ?? []) as unknown as Array<{
    id: string;
    po_no: string;
    status: string;
    qty_ordered_total: number;
    qty_received_total: number;
    suppliers: { name: string | null } | null;
    warehouses: { name: string | null } | null;
  }>).map((r) => ({
    id: r.id,
    po_no: r.po_no,
    status: r.status,
    qty_ordered_total: Number(r.qty_ordered_total ?? 0),
    qty_received_total: Number(r.qty_received_total ?? 0),
    vendor_name: r.suppliers?.name ?? null,
    warehouse_name: r.warehouses?.name ?? null,
  }));
}

async function loadPoDetail(poId: string) {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data: po, error: poErr } = await supabase
    .from("purchase_orders")
    .select(
      "id, po_no, status, vendor_id, warehouse_id, suppliers ( name ), warehouses ( name )",
    )
    .eq("brand_id", brand)
    .eq("id", poId)
    .single();
  if (poErr || !po) return null;

  const [linesRes, binsRes] = await Promise.all([
    supabase
      .from("purchase_order_lines")
      .select("id, line_no, item_id, qty_ordered, qty_received, unit_price, items ( code, name )")
      .eq("brand_id", brand)
      .eq("po_id", poId)
      .order("line_no"),
    supabase
      .from("warehouse_bins")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("warehouse_id", (po as unknown as { warehouse_id: string }).warehouse_id)
      .order("code"),
  ]);
  if (linesRes.error) throw new Error(`lines: ${linesRes.error.message}`);

  const lines = (linesRes.data ?? []).map((l) => {
    const meta = l as unknown as {
      id: string;
      line_no: number;
      item_id: string;
      qty_ordered: number;
      qty_received: number;
      unit_price: number;
      items: { code: string | null; name: string | null } | null;
    };
    return {
      id: meta.id,
      line_no: meta.line_no,
      item_id: meta.item_id,
      qty_ordered: Number(meta.qty_ordered),
      qty_received: Number(meta.qty_received),
      unit_price: Number(meta.unit_price),
      item_code: meta.items?.code ?? "",
      item_name: meta.items?.name ?? "",
    };
  });

  const headerRow = po as unknown as {
    id: string;
    po_no: string;
    warehouse_id: string;
    suppliers: { name: string | null } | null;
    warehouses: { name: string | null } | null;
  };

  return {
    po: {
      id: headerRow.id,
      po_no: headerRow.po_no,
      warehouse_id: headerRow.warehouse_id,
      vendor_name: headerRow.suppliers?.name ?? null,
      warehouse_name: headerRow.warehouses?.name ?? null,
    },
    lines,
    bins: (binsRes.data ?? []) as Array<{ id: string; code: string; name: string | null }>,
  };
}

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  approved: { label: "已核准", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  partial_received: { label: "部分到貨", chip: "bg-[#EAF4FB] text-[#185FA5]" },
};

export default async function NewReceiptPage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  const { userId } = await getCurrentUserAndAdmin();
  if (!userId) redirect("/login");
  if (!(await hasPermission(PERMISSIONS.RECEIPT_VIEW))) {
    return (
      <main className="px-6 py-6">
        <p className="text-[14px] text-[#CC0000]">沒有執行入庫的權限</p>
      </main>
    );
  }
  const sp = await searchParams;

  // 沒帶 ?po= → 顯示 PO chooser
  if (!sp.po) {
    const candidates = await loadPoCandidates();
    return (
      <main className="px-6 py-5 space-y-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
            <Link href="/parts/receipt/po-grn" className="hover:text-[#185FA5]">
              採購入庫
            </Link>
            <span>›</span>
            <span className="text-[#5A5955]">選擇採購單</span>
          </div>
        </div>

        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ 待入庫的採購單（{candidates.length} 筆）
            </h2>
            <p className="text-[11px] text-[#9A9890] mt-0.5">
              只列出狀態為「已核准」或「部分到貨」的 PO；點任一列進入收貨
            </p>
          </header>
          {candidates.length === 0 ? (
            <div className="px-4 py-10 text-center text-[12.5px] text-[#9A9890]">
              目前沒有待入庫的採購單。請先到{" "}
              <Link href="/parts/purchase/orders" className="text-[#185FA5] underline">
                商品採購
              </Link>{" "}
              建立並核准 PO。
            </div>
          ) : (
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-[11px] text-[#9A9890] border-b border-[#EEECE6]">
                  <th className="px-4 py-2 text-left font-medium">PO 編號</th>
                  <th className="px-4 py-2 text-left font-medium">供應商</th>
                  <th className="px-4 py-2 text-left font-medium">收貨倉</th>
                  <th className="px-4 py-2 text-right font-medium">已收 / 訂購</th>
                  <th className="px-4 py-2 text-left font-medium">狀態</th>
                  <th className="px-4 py-2 text-right font-medium w-[100px]">操作</th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((p) => {
                  const def = STATUS_LABEL[p.status] ?? STATUS_LABEL.approved;
                  return (
                    <tr key={p.id} className="border-t border-[#F8F7F4] hover:bg-[#F8F7F4]">
                      <td className="px-4 py-2 font-mono font-semibold text-[#1A3A5C]">
                        {p.po_no}
                      </td>
                      <td className="px-4 py-2">{p.vendor_name ?? "—"}</td>
                      <td className="px-4 py-2">{p.warehouse_name ?? "—"}</td>
                      <td className="px-4 py-2 text-right font-mono">
                        {p.qty_received_total} / {p.qty_ordered_total}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}
                        >
                          {def.label}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Link
                          href={`/parts/receipt/po-grn/new?po=${p.id}`}
                          className="inline-flex items-center h-[26px] px-2.5 rounded bg-[#1A3A5C] hover:bg-[#0F2A45] text-white text-[11.5px] font-medium"
                        >
                          收貨 →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </main>
    );
  }

  // 有 ?po= → 載入 PO 細節、render ReceiveForm
  const detail = await loadPoDetail(sp.po);
  if (!detail) {
    return (
      <main className="px-6 py-6 space-y-3">
        <p className="text-[14px] text-[#CC0000]">找不到該採購單</p>
        <Link href="/parts/receipt/po-grn/new" className="text-[12px] text-[#185FA5] underline">
          ← 回選擇採購單
        </Link>
      </main>
    );
  }

  return <ReceiveForm po={detail.po} lines={detail.lines} bins={detail.bins} />;
}
