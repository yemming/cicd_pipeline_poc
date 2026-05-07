import { PartsShell } from "@/components/parts/parts-shell";
import { createClient } from "@/lib/supabase/server";

const REQ_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  draft: { label: "草稿", color: "bg-[#F5F5F4] text-[#6B6A68]" },
  submitted: { label: "已提交", color: "bg-[#FDF3E3] text-[#854F0B]" },
  approved: { label: "已批准", color: "bg-[#EBF3FF] text-[#185FA5]" },
  converted: { label: "已轉採購", color: "bg-[#E8F5F0] text-[#0F6E56]" },
  cancelled: { label: "已取消", color: "bg-[#FDECEA] text-[#CC0000]" },
};

const SOURCE_LABELS: Record<string, string> = {
  manual: "人工建單",
  work_order: "工單待料",
  low_stock: "低庫存補貨",
  replenishment: "補貨計畫",
  external: "外部系統",
};

export default async function RequisitionsPage() {
  const supabase = await createClient();

  const { data: reqs } = await supabase
    .from("purchase_requisitions")
    .select(
      "id, req_no, source, status, required_date, warehouse_id, notes, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  const list = reqs ?? [];

  return (
    <PartsShell
      title="需求處理"
      chapter="4.2"
      description="從工單 / 低庫存 / 補貨計畫產生需求,審核後可一鍵轉採購單"
      breadcrumb={[
        { label: "庫存管理", href: "/parts" },
        { label: "採購管理" },
        { label: "需求處理" },
      ]}
      flowSteps={[
        { label: "觸發 / 計畫", status: "done" },
        { label: "需求處理 ★", status: "active" },
        { label: "商品採購", status: "pending" },
        { label: "採購入庫", status: "pending" },
        { label: "庫存更新", status: "pending" },
      ]}
    >
      {list.length === 0 ? (
        <div className="bg-white rounded-lg border border-[#EEECE6] py-12 text-center">
          <div className="text-[#1A1917] text-[14px] font-semibold mb-2">目前沒有需求單</div>
          <p className="text-[12px] text-[#6B6A68] mb-4 max-w-md mx-auto">
            需求單通常從「工單缺料」、「低庫存補貨」、「日常補貨計畫」自動產生。
            <br />
            Demo 階段可跳過此步,直接到下一站建臨時採購單。
          </p>
          <a
            href="/parts/purchase/orders"
            className="inline-flex items-center h-8 px-4 bg-[#185FA5] hover:bg-[#1A3A5C] text-white text-[12px] font-medium rounded"
          >
            前往商品採購 →
          </a>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-[#EEECE6] overflow-hidden">
          <table className="w-full text-[12px]">
            <thead className="bg-[#FAFAF9] text-[10px] text-[#6B6A68] uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 px-3 font-semibold">需求單號</th>
                <th className="text-left py-2 px-3 font-semibold">來源</th>
                <th className="text-left py-2 px-3 font-semibold">需求日</th>
                <th className="text-left py-2 px-3 font-semibold">備註</th>
                <th className="text-left py-2 px-3 font-semibold">狀態</th>
              </tr>
            </thead>
            <tbody>
              {list.map((req) => {
                const meta =
                  REQ_STATUS_LABELS[req.status] ?? REQ_STATUS_LABELS.draft;
                return (
                  <tr key={req.id} className="border-t border-[#F5F5F4] hover:bg-[#FAFAF9]">
                    <td className="py-2 px-3 font-mono text-[#185FA5]">{req.req_no}</td>
                    <td className="py-2 px-3 text-[11px]">
                      {SOURCE_LABELS[req.source] ?? req.source}
                    </td>
                    <td className="py-2 px-3 text-[11px]">{req.required_date ?? "—"}</td>
                    <td className="py-2 px-3 text-[11px] text-[#6B6A68] truncate max-w-[300px]">
                      {req.notes ?? "—"}
                    </td>
                    <td className="py-2 px-3">
                      <span
                        className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${meta.color}`}
                      >
                        {meta.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PartsShell>
  );
}
