import Link from "next/link";
import { redirect } from "next/navigation";

import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getPoGrnNewPageData } from "@/domain/receipts";

import { ReceiveForm } from "./_components/receive-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  approved: { label: "已核准", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  partial: { label: "部分到貨", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  closed: { label: "已結案", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
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
  const data = await getPoGrnNewPageData(sp.po);

  // 沒帶 ?po= → 顯示 PO chooser
  if (data.mode === "chooser") {
    const candidates = data.candidates;
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
  if (!data.detail) {
    return (
      <main className="px-6 py-6 space-y-3">
        <p className="text-[14px] text-[#CC0000]">找不到該採購單</p>
        <Link href="/parts/receipt/po-grn/new" className="text-[12px] text-[#185FA5] underline">
          ← 回選擇採購單
        </Link>
      </main>
    );
  }

  return (
    <ReceiveForm
      po={data.detail.po}
      lines={data.detail.lines}
      bins={data.detail.bins}
    />
  );
}
