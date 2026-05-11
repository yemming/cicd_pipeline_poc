import Link from "next/link";

export const dynamic = "force-static";

const FLOW_STEPS = [
  { icon: "🔧", label: "SA 領料", sub: "工單出庫 / 庫存不足", accent: { bg: "bg-[#FDECEA]", border: "border-[#CC0000]", text: "text-[#CC0000]" } },
  { icon: "⚡", label: "缺料告警", sub: "工單進入「待料」狀態", accent: { bg: "bg-[#FDECEA]", border: "border-[#CC0000]", text: "text-[#CC0000]" } },
  { icon: "📋", label: "自動建需求", sub: "系統自動建立緊急補貨需求", accent: { bg: "bg-[#FDF3E3]", border: "border-[#854F0B]", text: "text-[#854F0B]" } },
  { icon: "🛒", label: "採購審核", sub: "主管審核緊急採購單", accent: { bg: "bg-[#EAF4FB]", border: "border-[#185FA5]", text: "text-[#185FA5]" } },
  { icon: "📥", label: "備件到庫", sub: "採購入庫 / 庫存更新", accent: { bg: "bg-[#E8F5F0]", border: "border-[#0F6E56]", text: "text-[#0F6E56]" } },
  { icon: "✅", label: "自動解除", sub: "待料解除 / SA LINE 通知", accent: { bg: "bg-[#EAF3DE]", border: "border-[#3B6D11]", text: "text-[#3B6D11]" } },
];

export default function WorkOrderLoopPage() {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">工單增項閉環</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          10.4
        </span>
        <span className="text-[12px] text-[#9A9890]">維修工單缺料後的自動補貨觸發 / 待料解除 / SA 通知完整閉環</span>
      </header>

      <div className="bg-[#EEEDFE] border border-[#AFA9EC] rounded-md px-4 py-2.5 text-[12px] text-[#26215C] flex items-center justify-between gap-2.5 flex-wrap">
        <div>
          🔗 此頁面與售後工單模組「增項閉環子模組」串接 — 庫存缺料 → 自動推送至售後工單追蹤；車主同意回廠 → 庫存自動預留備料
        </div>
        <Link
          href="/parts/issue/repair-pick"
          className="h-[28px] px-3 inline-flex items-center rounded text-[11.5px] font-medium bg-[#534AB7] text-white hover:bg-[#3F379B]"
        >
          → 維修領料出庫
        </Link>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-5 py-4">
        <div className="text-[13px] font-semibold text-[#2C2C2A] mb-3.5">🔄 工單缺料完整閉環流程</div>
        <div className="flex items-center gap-0 overflow-x-auto pb-2">
          {FLOW_STEPS.map((step, idx) => (
            <div key={step.label} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5 min-w-[100px]">
                <div className={`w-10 h-10 rounded-full border-2 flex items-center justify-center text-[18px] ${step.accent.bg} ${step.accent.border}`}>
                  {step.icon}
                </div>
                <div className={`text-[11.5px] font-semibold text-center ${step.accent.text}`}>{step.label}</div>
                <div className="text-[10px] text-[#9A9890] text-center leading-tight">{step.sub}</div>
              </div>
              {idx < FLOW_STEPS.length - 1 && <div className="text-[#D5D3CB] text-[20px] px-1 mb-[16px]">→</div>}
            </div>
          ))}
        </div>
      </section>

      <div className="text-[11px] text-[#9A9890]">
        💡 待料工單列表將在 Phase 2 接通 RO 工單表 + stock_issues 後動態渲染
      </div>
    </main>
  );
}
