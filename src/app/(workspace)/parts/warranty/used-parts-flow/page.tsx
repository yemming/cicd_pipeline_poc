export const dynamic = "force-static";

const FLOW = [
  { num: 1, title: "拆下舊件", desc: "技師從車輛拆下故障件，掃碼登記" },
  { num: 2, title: "暫存倉入庫", desc: "舊件入「保固暫存倉」，狀態 = 待索賠" },
  { num: 3, title: "原廠審核", desc: "提交索賠申請給 Ducati 原廠" },
  { num: 4, title: "處置決議", desc: "原廠回覆：寄回 / 就地銷毀 / 留存樣本" },
  { num: 5, title: "暫存倉出庫", desc: "依處置決議出庫，更新庫存狀態" },
];

const RULES = [
  { label: "保固類別必須掃碼", desc: "A 類強制、B 類部分、C 類不適用（依管控類型定義）" },
  { label: "舊件保存期限", desc: "原廠保固 60 天 / TSB 45 天 / PDI 30 天，逾期未處理自動移轉「已銷毀」" },
  { label: "出庫需原廠憑證", desc: "原廠核准信 / 銷毀證明 / 寄回單號其一" },
  { label: "費用沖銷", desc: "舊件出庫時自動沖銷暫存倉成本、寫會計分錄" },
];

export default function UsedPartsFlowPage() {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">舊件出入庫邏輯設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          11.2
        </span>
        <span className="text-[12px] text-[#9A9890]">保固索賠舊件全生命週期 / 出入庫規則</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">📦 舊件流程（5 步驟）</h2>
        </header>
        <div className="px-4 py-3">
          {FLOW.map((s, idx) => (
            <div key={s.num} className={`flex items-start gap-2.5 py-2.5 ${idx < FLOW.length - 1 ? "border-b border-[#EEECE6]" : ""}`}>
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-[#1A3A5C] text-white text-[11px] font-bold flex items-center justify-center">
                {s.num}
              </div>
              <div>
                <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{s.title}</div>
                <div className="text-[11px] text-[#9A9890] mt-0.5">{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">📋 出入庫規則</h2>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          {RULES.map((r) => (
            <div key={r.label} className="px-3 py-2.5 rounded-md bg-[#F8F7F4] border border-[#EEECE6]">
              <div className="text-[12.5px] font-semibold text-[#2C2C2A]">{r.label}</div>
              <div className="text-[11.5px] text-[#5A5955] mt-0.5">{r.desc}</div>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
