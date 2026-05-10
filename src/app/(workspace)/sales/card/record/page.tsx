"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import { CardStepBar } from "@/components/card-step-bar";

// ── 彙整自手卡 1~3 的 Mock 資料 ──────────────────────────
const SUMMARY = {
  card: {
    cardNo: "DU-20260501-001",
    date: "2026-05-01",
    arrivalTime: "14:30",
    leaveTime: "16:45",
    duration: "2h 15m",
    sa: "林佳蓉",
    channel: "老客戶介紹（陳先生）",
  },
  customer: {
    name: "陳偉志",
    phone: "0912-345-678",
    gender: "男",
    isFirstVisit: true,
    purposes: ["購車諮詢", "詢價報價"],
    interestedModels: ["Panigale V4 S", "Streetfighter V4"],
  },
  needs: {
    ownedBike: "DUCATI Monster 821",
    ownedAge: "3 年",
    ownedMileage: "18,000 km",
    purchaseType: "換購",
    purchaseTiming: "本月",
    competitor: "BMW S 1000 RR",
    intendedModel: "Panigale V4 S",
    payment: "分期貸款",
    grade: "A",
  },
  closing: {
    testDrive: true,
    testDriveModel: "Panigale V4 S",
    testDriveRoute: "自由路線",
    testDriveDuration: "23 分鐘",
    quoteAmount: 1688000,
    accessories: "Akrapovič 全段鈦合金排氣管、碳纖維乾式離合器外蓋、Ducati Performance 端子鏡組",
    dealMade: true,
    dealNo: "DUC-20260501-012",
    dealAmount: 1588000,
    deposit: 100000,
    expectedDelivery: "2026-06-15",
    concerns: "引擎熱度問題、後勤保養週期是否縮短",
  },
};

const FOLLOW_UP_ITEMS = [
  { date: "2026-05-05", task: "確認義大利原廠船期，更新交車日期", done: false },
  { date: "2026-05-10", task: "傳送金融方案文件及首期試算表", done: false },
  { date: "2026-05-15", task: "二次追蹤確認訂金匯款到位", done: false },
  { date: "2026-06-01", task: "PDI 進廠通知，確認交車流程", done: false },
];

function GradeTag({ grade }: { grade: string }) {
  const color =
    grade === "H" ? "bg-red-700 text-white" :
    grade === "A" ? "bg-red-500 text-white" :
    grade === "B" ? "bg-orange-500 text-white" :
    grade === "C" ? "bg-yellow-400 text-[#1A1A2E]" :
                    "bg-gray-200 text-gray-600";
  return <span className={`${color} px-3 py-0.5 rounded-md text-sm font-extrabold`}>{grade}</span>;
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-[#1A1A2E]/5 last:border-0">
      <span className="text-xs font-bold text-[#47464C]/50 uppercase tracking-wider w-28 shrink-0 pt-0.5">{label}</span>
      <span className={`text-sm font-medium text-[#1A1A2E] ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export default function RecordPage() {
  const router = useRouter();
  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "手卡・第四階段" },
    ],
  });

  const [concerns, setConcerns] = useState(SUMMARY.closing.concerns);
  const [followUpNote, setFollowUpNote] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [followUps, setFollowUps] = useState(FOLLOW_UP_ITEMS);

  const toggleFollowUp = (i: number) =>
    setFollowUps(prev => prev.map((f, idx) => idx === i ? { ...f, done: !f.done } : f));

  const fmt = (n: number) => `NT$ ${n.toLocaleString()}`;

  return (
    <div className="-m-4 md:-m-8 bg-[#FCF8FF] min-h-[calc(100dvh-4rem)] flex flex-col">

      <CardStepBar currentStep={4} />

      <main className="flex-1 pb-8 px-6">
        <div className="max-w-5xl mx-auto pt-6">

          {/* ── 頁首 ── */}
          <div className="flex flex-col md:flex-row justify-between items-start mb-5 gap-3">
            <div>
              <h1 className="text-2xl font-display font-extrabold text-on-surface tracking-tight">
                客戶接待手卡 — 第四階段
              </h1>
              <p className="text-outline text-sm mt-0.5">接待三步法 ‧ 結案：彙整接待完整記錄</p>
            </div>
            <div className="flex gap-5 text-[0.75rem] font-medium bg-surface-container-low px-5 py-2.5 rounded-full shrink-0">
              <div className="flex gap-2 items-center">
                <span className="text-outline">手卡編號:</span>
                <span className="text-on-surface font-display">{SUMMARY.card.cardNo}</span>
              </div>
              <div className="w-px h-4 bg-outline-variant self-center" />
              <div className="flex gap-2 items-center">
                <span className="text-outline">接待人員:</span>
                <span className="text-on-surface font-bold">{SUMMARY.card.sa}</span>
              </div>
            </div>
          </div>

          {/* ── 成交狀態 Banner ── */}
          {SUMMARY.closing.dealMade && (
            <div className="mb-6 bg-gradient-to-r from-green-600 to-emerald-700 rounded-xl p-6 flex items-center justify-between shadow-lg">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-white text-4xl" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                <div>
                  <p className="text-white/70 text-xs font-bold uppercase tracking-widest">成交確認</p>
                  <p className="text-white text-2xl font-extrabold tracking-tight">恭喜！本次接待成功成交</p>
                  <p className="text-white/70 text-sm mt-0.5">成交單號：{SUMMARY.closing.dealNo} · {SUMMARY.card.date}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-white/70 text-xs font-bold uppercase tracking-widest">成交金額</p>
                <p className="text-white text-3xl font-extrabold">{fmt(SUMMARY.closing.dealAmount)}</p>
                <p className="text-white/60 text-sm">訂金 {fmt(SUMMARY.closing.deposit)} 已收</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-12 gap-5">

            {/* ── 左欄：彙整摘要 ── */}
            <div className="col-span-12 lg:col-span-8 space-y-5">

              {/* 接待摘要（手卡一） */}
              <section className="bg-white rounded-xl shadow-sm border border-[#1A1A2E]/5">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-[#EFECFF]">
                  <div className="w-8 h-8 rounded-lg bg-[#E2E0FC] flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#47464C] text-lg">storefront</span>
                  </div>
                  <div>
                    <h2 className="font-bold text-[#1A1A2E]">① 接待摘要</h2>
                    <p className="text-xs text-[#47464C]/50">來自手卡第一階段</p>
                  </div>
                </div>
                <div className="px-6 py-4 grid grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="手卡編號"  value={SUMMARY.card.cardNo} mono />
                    <InfoRow label="到店時間"  value={`${SUMMARY.card.date} ${SUMMARY.card.arrivalTime}`} />
                    <InfoRow label="離店時間"  value={SUMMARY.card.leaveTime} />
                    <InfoRow label="接待時長"  value={SUMMARY.card.duration} />
                  </div>
                  <div>
                    <InfoRow label="接待人員"  value={SUMMARY.card.sa} />
                    <InfoRow label="來店管道"  value={SUMMARY.card.channel} />
                    <InfoRow label="來訪目的"  value={SUMMARY.customer.purposes.join("、")} />
                    <InfoRow label="感興趣車系" value={SUMMARY.customer.interestedModels.join("、")} />
                  </div>
                </div>
              </section>

              {/* 客戶資料（手卡一） */}
              <section className="bg-white rounded-xl shadow-sm border border-[#1A1A2E]/5">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-[#EFECFF]">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-blue-600 text-lg">person</span>
                  </div>
                  <div>
                    <h2 className="font-bold text-[#1A1A2E]">客戶基本資料</h2>
                    <p className="text-xs text-[#47464C]/50">來自手卡第一階段</p>
                  </div>
                </div>
                <div className="px-6 py-4 grid grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="姓名"   value={SUMMARY.customer.name} />
                    <InfoRow label="電話"   value={SUMMARY.customer.phone} mono />
                    <InfoRow label="性別"   value={SUMMARY.customer.gender} />
                  </div>
                  <div>
                    <InfoRow label="來店類型" value={SUMMARY.customer.isFirstVisit ? "首次來店" : "再次來店"} />
                  </div>
                </div>
              </section>

              {/* 需求分析（手卡二） */}
              <section className="bg-white rounded-xl shadow-sm border border-[#1A1A2E]/5">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-[#EFECFF]">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-amber-600 text-lg">manage_search</span>
                  </div>
                  <div>
                    <h2 className="font-bold text-[#1A1A2E]">② 需求分析</h2>
                    <p className="text-xs text-[#47464C]/50">來自手卡第二階段</p>
                  </div>
                </div>
                <div className="px-6 py-4 grid grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="目前車型"  value={SUMMARY.needs.ownedBike} />
                    <InfoRow label="車齡／里程" value={`${SUMMARY.needs.ownedAge} · ${SUMMARY.needs.ownedMileage}`} />
                    <InfoRow label="購買類型"  value={SUMMARY.needs.purchaseType} />
                    <InfoRow label="購買時機"  value={SUMMARY.needs.purchaseTiming} />
                  </div>
                  <div>
                    <InfoRow label="意向車型"  value={SUMMARY.needs.intendedModel} />
                    <InfoRow label="付款方式"  value={SUMMARY.needs.payment} />
                    <InfoRow label="考慮競品"  value={SUMMARY.needs.competitor} />
                    <div className="flex items-start gap-3 py-2">
                      <span className="text-xs font-bold text-[#47464C]/50 uppercase tracking-wider w-28 shrink-0 pt-0.5">客戶級別</span>
                      <GradeTag grade={SUMMARY.needs.grade} />
                    </div>
                  </div>
                </div>
              </section>

              {/* 試駕與成交（手卡三） */}
              <section className="bg-white rounded-xl shadow-sm border border-[#1A1A2E]/5">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-[#EFECFF]">
                  <div className="w-8 h-8 rounded-lg bg-[#CC0000]/10 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[#CC0000] text-lg">sports_motorsports</span>
                  </div>
                  <div>
                    <h2 className="font-bold text-[#1A1A2E]">③ 試駕與成交</h2>
                    <p className="text-xs text-[#47464C]/50">來自手卡第三階段</p>
                  </div>
                </div>
                <div className="px-6 py-4 grid grid-cols-2 gap-x-8">
                  <div>
                    <InfoRow label="是否試駕"  value={SUMMARY.closing.testDrive ? "✓ 有試駕" : "未試駕"} />
                    <InfoRow label="試駕車型"  value={SUMMARY.closing.testDriveModel} />
                    <InfoRow label="試駕路線"  value={SUMMARY.closing.testDriveRoute} />
                    <InfoRow label="試駕時長"  value={SUMMARY.closing.testDriveDuration} />
                  </div>
                  <div>
                    <InfoRow label="試算報價"  value={fmt(SUMMARY.closing.quoteAmount)} />
                    <InfoRow label="改裝配件"  value={SUMMARY.closing.accessories} />
                    <InfoRow label="成交金額"  value={fmt(SUMMARY.closing.dealAmount)} />
                    <InfoRow label="預計交車"  value={SUMMARY.closing.expectedDelivery} />
                  </div>
                </div>
              </section>

              {/* 客戶顧慮（可編輯） */}
              <section className="bg-white rounded-xl shadow-sm border border-[#1A1A2E]/5">
                <div className="flex items-center gap-3 px-6 py-4 border-b border-[#EFECFF]">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center">
                    <span className="material-symbols-outlined text-purple-600 text-lg">psychology</span>
                  </div>
                  <h2 className="font-bold text-[#1A1A2E]">客戶關鍵顧慮</h2>
                </div>
                <div className="px-6 py-4">
                  <textarea
                    value={concerns}
                    onChange={e => setConcerns(e.target.value)}
                    className="w-full bg-[#F5F2FF] border-none rounded-lg p-4 text-sm text-[#1A1A2E] focus:ring-1 focus:ring-[#C9A84C]/40 resize-none outline-none leading-relaxed"
                    rows={3}
                  />
                  <p className="text-xs text-[#47464C]/40 mt-1.5">此欄位可修改補充，將一併存入結案記錄</p>
                </div>
              </section>
            </div>

            {/* ── 右欄：後續行動 ── */}
            <div className="col-span-12 lg:col-span-4 space-y-5">

              {/* 成交數據卡 */}
              <div className="bg-[#1A1A2E] rounded-xl p-6 space-y-4">
                <h3 className="text-white/70 text-xs font-bold uppercase tracking-widest">本次成交概覽</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">車型</span>
                    <span className="text-white font-bold text-sm">{SUMMARY.closing.testDriveModel}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">成交金額</span>
                    <span className="text-[#C9A84C] font-extrabold">{fmt(SUMMARY.closing.dealAmount)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">訂金</span>
                    <span className="text-white font-bold">{fmt(SUMMARY.closing.deposit)}</span>
                  </div>
                  <div className="h-px bg-white/10" />
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">尾款</span>
                    <span className="text-white font-extrabold text-lg">{fmt(SUMMARY.closing.dealAmount - SUMMARY.closing.deposit)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-white/60 text-sm">預計交車</span>
                    <span className="text-white font-bold">{SUMMARY.closing.expectedDelivery}</span>
                  </div>
                </div>
              </div>

              {/* 後續行動清單 */}
              <div className="bg-white rounded-xl shadow-sm border border-[#1A1A2E]/5">
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[#EFECFF]">
                  <span className="material-symbols-outlined text-[#CC0000]">checklist</span>
                  <h3 className="font-bold text-[#1A1A2E]">後續行動計畫</h3>
                </div>
                <div className="p-4 space-y-3">
                  {followUps.map((item, i) => (
                    <button
                      key={i}
                      onClick={() => toggleFollowUp(i)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all ${
                        item.done ? "bg-green-50 border border-green-200" : "bg-[#F5F2FF] hover:bg-[#EFECFF]"
                      }`}
                    >
                      <span className={`material-symbols-outlined text-lg mt-0.5 shrink-0 ${item.done ? "text-green-600" : "text-[#47464C]/30"}`}
                        style={{ fontVariationSettings: item.done ? "'FILL' 1" : "'FILL' 0" }}>
                        check_circle
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-bold mb-0.5 ${item.done ? "text-green-700" : "text-[#47464C]/50"}`}>{item.date}</p>
                        <p className={`text-sm ${item.done ? "line-through text-green-600/70" : "text-[#1A1A2E]"}`}>{item.task}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <div className="px-4 pb-4">
                  <textarea
                    value={followUpNote}
                    onChange={e => setFollowUpNote(e.target.value)}
                    placeholder="新增備忘事項..."
                    className="w-full bg-[#F5F2FF] border-none rounded-lg px-4 py-3 text-sm text-[#1A1A2E] focus:ring-1 focus:ring-[#C9A84C]/40 resize-none outline-none"
                    rows={2}
                  />
                </div>
              </div>

              {/* SA 備注 */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className="material-symbols-outlined text-amber-600 text-lg">edit_note</span>
                  <h3 className="font-bold text-amber-800 text-sm">SA 備注</h3>
                </div>
                <div className="space-y-2 text-xs text-amber-800 leading-relaxed">
                  <p>• 客戶對引擎熱度問題較敏感，交車時建議安排技師說明 Panigale 的散熱機制。</p>
                  <p>• 有意願加購 SCRAMBLER RIDE 騎士服，可在交車時順帶提案。</p>
                  <p>• 介紹人為陳先生（既有客戶），成交後記得通知感謝。</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="sticky bottom-0 bg-white/90 backdrop-blur-md border-t border-[#1A1A2E]/10 px-12 py-4 flex justify-between items-center mt-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[#47464C] font-bold hover:text-[#00000b] transition-colors"
        >
          <span className="material-symbols-outlined">arrow_back</span> 上一步
        </button>

        {submitted ? (
          <div className="flex items-center gap-3 text-green-700 font-bold">
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
            結案記錄已提交 · {new Date().toLocaleDateString("zh-TW")}
          </div>
        ) : (
          <div className="flex items-center gap-6">
            <div className="text-right hidden md:block">
              <p className="text-[10px] text-[#47464C] font-bold uppercase tracking-widest">接待完整紀錄</p>
              <p className="text-sm font-bold text-[#755b00] italic">Ready to Close — {SUMMARY.customer.name} · {SUMMARY.card.cardNo}</p>
            </div>
            <button
              onClick={() => setSubmitted(true)}
              className="bg-[#CC0000] text-white px-10 py-4 rounded-xl font-bold flex items-center gap-3 shadow-xl hover:bg-[#AA0000] hover:scale-[1.02] transition-all duration-300"
            >
              確認提交結案報告 <span className="material-symbols-outlined">task_alt</span>
            </button>
          </div>
        )}
      </footer>
    </div>
  );
}
