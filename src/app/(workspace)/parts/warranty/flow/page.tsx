import Link from "next/link";

export const dynamic = "force-static";

const STEPS = [
  { num: 1, title: "RO 工單建立 + 保固確認", desc: "服務人員在 RO 工單上標記保固類型，系統自動比對序列號 + 保固到期日", color: "bg-[#1A3A5C]" },
  { num: 2, title: "領取新品零件出庫", desc: "保固零件從主倉出庫，連結 RO 工單；舊件同步預排「暫存倉入庫」", color: "bg-[#1A3A5C]" },
  { num: 3, title: "舊件回收入暫存倉", desc: "拆下舊件掃碼登記，存放至「保固暫存倉」，並上傳照片 / 損壞說明", color: "bg-[#1A3A5C]" },
  { num: 4, title: "建立索賠申請單", desc: "彙整序列號、故障描述、工時、零件成本，提交原廠系統 (DMS)", color: "bg-[#1A3A5C]" },
  { num: 5, title: "原廠審核 + 舊件寄回", desc: "原廠核准後，依指示寄回舊件或就地銷毀；系統更新暫存倉庫存狀態", color: "bg-[#1A3A5C]" },
  { num: 6, title: "費用回收結案", desc: "收到原廠信用額度後，標記已結案；庫存成本沖銷", color: "bg-[#0F6E56]" },
];

const TYPES = [
  { icon: "🛡", label: "原廠保固 (Warranty)", desc: "出廠 2 年或 20,000km（以先到者為準）。零件 + 工時全額由原廠承擔。", bg: "bg-[#EAF4FB]", border: "border-[#B5D4F4]", text: "text-[#1A3A5C]" },
  { icon: "🔄", label: "延伸保固 (Extended)", desc: "客戶加購延長保固，最多延伸至 4 年 / 40,000km。由台灣總代理審核。", bg: "bg-[#E8F5F0]", border: "border-[#9FD4C4]", text: "text-[#0F6E56]" },
  { icon: "⚡", label: "技術公告 (TSB)", desc: "原廠主動召回或預防性修繕，無里程 / 年限限制。需提供 TSB 編號。", bg: "bg-[#FDF3E3]", border: "border-[#F0C97E]", text: "text-[#854F0B]" },
  { icon: "🔁", label: "零件品質索賠 (PDI)", desc: "交車前 PDI 發現零件瑕疵，或交車後 3 個月內首次回廠發現。", bg: "bg-[#FDECEA]", border: "border-[#F5AEAD]", text: "text-[#CC0000]" },
];

const TIMING = [
  { kind: "原廠保固", apply: "維修完成後 30 天", store: "核准前不得處置", goal: "60 天", goalChip: "bg-[#FDF3E3] text-[#854F0B]" },
  { kind: "延伸保固", apply: "維修完成後 30 天", store: "核准前不得處置", goal: "90 天", goalChip: "bg-[#FDF3E3] text-[#854F0B]" },
  { kind: "技術公告 TSB", apply: "公告有效期內", store: "依 TSB 指示", goal: "45 天", goalChip: "bg-[#EAF3DE] text-[#3B6D11]" },
  { kind: "PDI 零件品質", apply: "發現後 14 天", store: "寄回原廠", goal: "30 天", goalChip: "bg-[#EAF3DE] text-[#3B6D11]" },
];

const QUICK_LINKS = [
  { label: "→ 舊件出入庫邏輯設定", href: "/parts/warranty/used-parts-flow" },
  { label: "→ 暫存倉設定", href: "/parts/warranty/staging-warehouse" },
  { label: "→ RO 工單串接設定", href: "/parts/warranty/ro-link" },
  { label: "→ 索賠費用回收追蹤", href: "/parts/warranty/cost-recovery" },
  { label: "→ 舊件管理介面", href: "/parts/warranty/used-parts" },
];

export default function WarrantyFlowPage() {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">索賠流程說明</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          11.1
        </span>
        <span className="text-[12px] text-[#9A9890]">保固零件索賠端對端流程 / 類型定義 / 時效規定</span>
      </header>

      <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded-md px-4 py-2.5 text-[12px] text-[#854F0B]">
        ⚠️ 本流程說明僅適用 Ducati 原廠授權保固（台灣總代理）。非保固零件索賠請走「採購退貨」流程。
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">📋 索賠流程總覽（6 步驟）</h2>
          </header>
          <div className="px-4 py-3">
            {STEPS.map((s, idx) => (
              <div key={s.num} className={`flex items-start gap-2.5 py-2.5 ${idx < STEPS.length - 1 ? "border-b border-[#EEECE6]" : ""}`}>
                <div className={`flex-shrink-0 w-6 h-6 rounded-full ${s.color} text-white text-[11px] font-bold flex items-center justify-center`}>
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

        <div className="space-y-3">
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">🔑 索賠類型定義</h2>
            </header>
            <div className="px-4 py-3 flex flex-col gap-2">
              {TYPES.map((t) => (
                <div key={t.label} className={`px-3 py-2 rounded-md border ${t.bg} ${t.border}`}>
                  <div className={`text-[12px] font-semibold ${t.text}`}>{t.icon} {t.label}</div>
                  <div className="text-[11px] text-[#5A5955] mt-0.5">{t.desc}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <h2 className="text-[13px] font-semibold text-[#2C2C2A]">⏱ 時效規定</h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-[#F8F7F4]">
                    <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">索賠類型</th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">申請期限</th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">舊件保存</th>
                    <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">結案目標</th>
                  </tr>
                </thead>
                <tbody>
                  {TIMING.map((t) => (
                    <tr key={t.kind} className="border-t border-[#EEECE6]">
                      <td className="px-3 py-2 text-[12px]">{t.kind}</td>
                      <td className="px-3 py-2 text-[12px]">{t.apply}</td>
                      <td className="px-3 py-2 text-[12px] text-[#5A5955]">{t.store}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${t.goalChip}`}>
                          {t.goal}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">🔗 相關頁面快速跳轉</h2>
        </header>
        <div className="px-3 py-3 flex gap-2 flex-wrap">
          {QUICK_LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="h-[28px] px-3 inline-flex items-center rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              {l.label}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
