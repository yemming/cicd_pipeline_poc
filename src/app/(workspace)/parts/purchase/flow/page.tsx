import Link from "next/link";

export const dynamic = "force-static";

const FLOW_STEPS = [
  {
    icon: "⚡",
    label: "庫存告警觸發",
    sub: "水位低於再訂購點",
    href: "/parts/operations/balance",
    accent: { bg: "bg-[#FDECEA]", border: "border-[#CC0000]", text: "text-[#CC0000]" },
  },
  {
    icon: "📋",
    label: "需求處理 4.3",
    sub: "確認需求 / 建立申請",
    href: "/parts/purchase/requisitions",
    accent: { bg: "bg-[#FDF3E3]", border: "border-[#854F0B]", text: "text-[#854F0B]" },
  },
  {
    icon: "🛒",
    label: "商品採購 4.4",
    sub: "建立採購單 / 供應商確認",
    href: "/parts/purchase/orders",
    accent: { bg: "bg-[#EAF4FB]", border: "border-[#185FA5]", text: "text-[#185FA5]" },
  },
  {
    icon: "📥",
    label: "採購入庫 5.1",
    sub: "驗收到貨 / 庫存更新",
    href: "/parts/receipt/po-grn",
    accent: { bg: "bg-[#E8F5F0]", border: "border-[#0F6E56]", text: "text-[#0F6E56]" },
  },
  {
    icon: "✅",
    label: "庫存更新 / 告警解除",
    sub: "自動回補 / SA 通知",
    href: "/parts/operations/balance",
    accent: { bg: "bg-[#EAF3DE]", border: "border-[#3B6D11]", text: "text-[#3B6D11]" },
  },
];

const PURCHASE_TYPES = [
  {
    label: "計畫採購",
    border: "border-l-[#0F6E56]",
    title: "text-[#0F6E56]",
    bg: "bg-[#F8F7F4]",
    desc: "依補貨計畫定期採購，流程完整、金額可預測，需主管審核後送出。",
  },
  {
    label: "緊急採購",
    border: "border-l-[#854F0B]",
    title: "text-[#854F0B]",
    bg: "bg-[#FDF3E3]",
    desc: "工單缺料或庫存嚴重不足時觸發，流程加速，主管即時透過 LINE 審核。",
  },
  {
    label: "原廠到貨匯入",
    border: "border-l-[#185FA5]",
    title: "text-[#185FA5]",
    bg: "bg-[#EAF4FB]",
    desc: "Ducati DMS 系統直接傳送到貨單，無需先建採購單，直接匯入入庫流程。",
  },
];

const QUICK_LINKS = [
  { icon: "📋", label: "需求處理（4.3）", href: "/parts/purchase/requisitions" },
  { icon: "🛒", label: "商品採購（4.4）", href: "/parts/purchase/orders" },
  { icon: "📥", label: "採購入庫（5.1）", href: "/parts/receipt/po-grn" },
  { icon: "↩", label: "採購退貨（4.5）", href: "/parts/purchase/returns" },
];

export default function PurchaseFlowPage() {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">採購流程鏈路說明</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          4.1
        </span>
        <span className="text-[12px] text-[#9A9890]">
          從缺料觸發到入庫完成的完整採購作業流程說明
        </span>
      </header>

      {/* Flow */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-5 py-4">
        <div className="text-[13px] font-semibold text-[#2C2C2A] mb-3.5">📋 採購流程總覽（端對端）</div>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {FLOW_STEPS.map((step, idx) => (
            <div key={step.label} className="flex items-center">
              <Link
                href={step.href}
                className="flex flex-col items-center gap-1.5 min-w-[100px] hover:opacity-80"
              >
                <div
                  className={`w-11 h-11 rounded-[10px] border-2 flex items-center justify-center text-[20px] ${step.accent.bg} ${step.accent.border}`}
                >
                  {step.icon}
                </div>
                <div className={`text-[11.5px] font-semibold text-center ${step.accent.text}`}>
                  {step.label}
                </div>
                <div className="text-[10px] text-[#9A9890] text-center leading-tight">
                  {step.sub}
                </div>
              </Link>
              {idx < FLOW_STEPS.length - 1 && (
                <div className="text-[#D5D3CB] text-[22px] px-1 mb-[18px]">→</div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Two-column */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">採購類型說明</h2>
          </header>
          <div className="px-4 py-3 flex flex-col gap-2">
            {PURCHASE_TYPES.map((t) => (
              <div
                key={t.label}
                className={`px-3 py-2 rounded-md border-l-[3px] ${t.bg} ${t.border}`}
              >
                <div className={`text-[12.5px] font-semibold mb-0.5 ${t.title}`}>{t.label}</div>
                <div className="text-[12px] text-[#5A5955]">{t.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">快速進入各流程</h2>
          </header>
          <div className="px-3 py-3 flex flex-col gap-1.5">
            {QUICK_LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="h-[34px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] flex items-center gap-2 transition"
              >
                <span>{l.icon}</span>
                <span>{l.label}</span>
                <span className="ml-auto text-[#9A9890]">→</span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
