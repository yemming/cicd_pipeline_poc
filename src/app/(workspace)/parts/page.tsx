import { PartsShell } from "@/components/parts/parts-shell";
import { createClient } from "@/lib/supabase/server";

const GROUPS: Array<{
  title: string;
  color: string;
  pages: Array<{ no: string; name: string; href: string; status?: "ready" | "stub" }>;
}> = [
  {
    title: "1. 基礎設定",
    color: "#185FA5",
    pages: [
      { no: "1.1", name: "組織三層架構", href: "/parts/setup/org", status: "ready" },
      { no: "1.2", name: "採購權限規則", href: "/parts/setup/purchase-permissions" },
      { no: "1.3", name: "商品管理權限", href: "/parts/setup/item-permissions" },
      { no: "1.4", name: "盤點回傳規則", href: "/parts/setup/count-rules" },
      { no: "1.5", name: "管控類型定義", href: "/parts/setup/control-types", status: "ready" },
      { no: "2.1", name: "倉儲四層架構", href: "/parts/setup/warehouse-arch", status: "ready" },
      { no: "2.2", name: "倉庫庫區庫位", href: "/parts/setup/warehouse-bins", status: "ready" },
      { no: "2.3", name: "供應商資訊", href: "/parts/setup/suppliers", status: "ready" },
      { no: "2.4", name: "採購合約", href: "/parts/setup/contracts", status: "ready" },
      { no: "3.1", name: "商品基礎資料", href: "/parts/setup/items", status: "ready" },
      { no: "3.2", name: "商品資訊", href: "/parts/setup/items-info", status: "ready" },
      { no: "3.3", name: "序列號追蹤", href: "/parts/setup/serial", status: "ready" },
      { no: "3.4", name: "適配設定", href: "/parts/setup/compatibility", status: "ready" },
      { no: "3.5", name: "門市定價", href: "/parts/setup/pricing", status: "ready" },
    ],
  },
  {
    title: "4. 採購管理",
    color: "#7F77DD",
    pages: [
      { no: "4.1", name: "採購流程說明", href: "/parts/purchase/flow" },
      { no: "4.2", name: "需求處理", href: "/parts/purchase/requisitions", status: "ready" },
      { no: "4.3", name: "日常補貨計畫", href: "/parts/purchase/replenishment", status: "ready" },
      { no: "4.4", name: "商品採購", href: "/parts/purchase/orders", status: "ready" },
      { no: "4.5", name: "採購退貨", href: "/parts/purchase/returns", status: "ready" },
    ],
  },
  {
    title: "5. 入庫管理",
    color: "#0F6E56",
    pages: [
      { no: "5.1", name: "採購入庫(GRN)", href: "/parts/receipt/po-grn", status: "ready" },
      { no: "5.2", name: "調撥入庫", href: "/parts/receipt/transfer-in", status: "ready" },
      { no: "5.3", name: "內售入庫", href: "/parts/receipt/internal-sale", status: "ready" },
      { no: "5.4", name: "領料退貨入庫", href: "/parts/receipt/return-in", status: "ready" },
    ],
  },
  {
    title: "6. 出庫管理",
    color: "#EF9F27",
    pages: [
      { no: "6.1", name: "維修領料(RO 串接)", href: "/parts/issue/repair-pick", status: "ready" },
      { no: "6.2", name: "調撥出庫", href: "/parts/issue/transfer-out", status: "ready" },
      { no: "6.3", name: "內售出庫", href: "/parts/issue/internal-sale", status: "ready" },
    ],
  },
  {
    title: "7. 庫存作業",
    color: "#185FA5",
    pages: [
      { no: "7.1", name: "庫存查詢", href: "/parts/operations/balance", status: "ready" },
      { no: "7.2", name: "入庫查詢", href: "/parts/operations/receipts-history", status: "ready" },
      { no: "7.3", name: "調撥在途查詢", href: "/parts/operations/transfers-in-transit", status: "ready" },
      { no: "7.4", name: "例外出入庫", href: "/parts/operations/exceptions", status: "ready" },
      { no: "7.5", name: "寄存管理", href: "/parts/operations/consignment", status: "ready" },
      { no: "7.6", name: "備件庫存調整", href: "/parts/operations/adjust" },
      { no: "7.7", name: "庫存盤點作業", href: "/parts/operations/count-ops" },
    ],
  },
  {
    title: "8. 盤點管理",
    color: "#D85A30",
    pages: [
      { no: "8.1", name: "盤點計畫", href: "/parts/count/plans", status: "ready" },
      { no: "8.2", name: "盤點處理", href: "/parts/count/sessions", status: "ready" },
      { no: "8.3", name: "報損報溢", href: "/parts/count/adjustments", status: "ready" },
    ],
  },
  {
    title: "10. 預警告警",
    color: "#CC0000",
    pages: [
      { no: "10.1", name: "庫存水位設定", href: "/parts/alerts/thresholds", status: "ready" },
      { no: "10.2", name: "告警類型與規則", href: "/parts/alerts/rules", status: "ready" },
      { no: "10.3", name: "告警階層設定", href: "/parts/alerts/escalation" },
      { no: "10.4", name: "工單增項閉環", href: "/parts/alerts/work-order-loop" },
    ],
  },
  {
    title: "11. 保固索賠",
    color: "#0F6E56",
    pages: [
      { no: "11.1", name: "索賠流程說明", href: "/parts/warranty/flow" },
      { no: "11.2", name: "RO 工單串接", href: "/parts/warranty/ro-link" },
      { no: "11.3", name: "舊件管理", href: "/parts/warranty/used-parts", status: "ready" },
      { no: "11.4", name: "舊件出入庫邏輯", href: "/parts/warranty/used-parts-flow" },
      { no: "11.5", name: "暫存倉設定", href: "/parts/warranty/staging-warehouse", status: "ready" },
      { no: "11.6", name: "費用回收", href: "/parts/warranty/cost-recovery", status: "ready" },
    ],
  },
  {
    title: "12. 分析報表",
    color: "#7F77DD",
    pages: [
      { no: "12.1", name: "ABC 結構圖", href: "/parts/analytics/abc-structure" },
      { no: "12.2", name: "ABC 分類", href: "/parts/analytics/abc", status: "ready" },
      { no: "12.3", name: "ABC 分類設定", href: "/parts/analytics/abc-settings", status: "ready" },
      { no: "12.4", name: "呆滯庫存", href: "/parts/analytics/stale", status: "ready" },
      { no: "12.5", name: "庫存周轉率", href: "/parts/analytics/turnover", status: "ready" },
    ],
  },
];

export default async function PartsOverviewPage() {
  const supabase = await createClient();
  // 計幾個關鍵 stat 做總覽
  const [{ count: itemCount }, { count: warehouseCount }, { count: poCount }, { count: stockCount }] =
    await Promise.all([
      supabase.from("items").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("warehouses").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("purchase_orders").select("id", { count: "exact", head: true }),
      supabase.from("stock_items").select("id", { count: "exact", head: true }),
    ]);

  return (
    <PartsShell
      title="庫存管理模組"
      chapter="0.0"
      description="完整的庫存生命週期管理 — 從基礎設定到分析報表,共 53 個業務頁面"
      breadcrumb={[{ label: "庫存管理" }]}
    >
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        <Stat label="活躍料件" value={itemCount ?? 0} unit="種" />
        <Stat label="活躍倉庫" value={warehouseCount ?? 0} unit="座" />
        <Stat label="採購單" value={poCount ?? 0} unit="張" />
        <Stat label="庫位明細" value={stockCount ?? 0} unit="筆" />
      </div>

      <div className="space-y-5">
        {GROUPS.map((group) => (
          <section key={group.title}>
            <div className="flex items-center gap-2 mb-2">
              <span
                className="w-1.5 h-5 rounded-full"
                style={{ background: group.color }}
              />
              <h2 className="text-[14px] font-bold text-[#1A1917]">{group.title}</h2>
              <span className="text-[11px] text-[#9A9890]">({group.pages.length})</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {group.pages.map((page) => (
                <a
                  key={page.href}
                  href={page.href}
                  className="bg-white rounded-lg border border-[#EEECE6] p-3 hover:border-[#185FA5] hover:shadow-sm transition-all flex items-center gap-2 group"
                >
                  <span className="text-[10px] font-mono text-[#9A9890] group-hover:text-[#185FA5]">
                    {page.no}
                  </span>
                  <span className="text-[12px] font-medium text-[#1A1917] flex-1">
                    {page.name}
                  </span>
                  {page.status === "ready" ? (
                    <span className="text-[9px] font-semibold text-[#0F6E56] bg-[#E8F5F0] px-1.5 py-0.5 rounded">
                      接 DB
                    </span>
                  ) : (
                    <span className="text-[9px] text-[#854F0B] bg-[#FDF3E3] px-1.5 py-0.5 rounded">
                      設計稿
                    </span>
                  )}
                </a>
              ))}
            </div>
          </section>
        ))}
      </div>
    </PartsShell>
  );
}

function Stat({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="bg-white rounded-lg border border-[#EEECE6] px-3 py-2.5">
      <div className="text-[10px] text-[#9A9890] uppercase tracking-wide">{label}</div>
      <div className="text-[20px] font-bold mt-0.5 text-[#1A3A5C]">
        {value.toLocaleString()}
        <span className="text-[11px] text-[#9A9890] font-medium ml-1">{unit}</span>
      </div>
    </div>
  );
}
