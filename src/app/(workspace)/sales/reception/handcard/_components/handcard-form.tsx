"use client";

import { useMemo, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";

type IdentityType = "new" | "revisit" | "owner" | "switcher";
type IntentLevel = 1 | 2 | 3 | 4 | 5;
type HABCGrade = "H" | "A" | "B" | "C";
type TagColor = "t-red" | "t-yellow" | "t-green" | "t-blue";

type Tag = { label: string; color: TagColor; custom?: boolean };

const IDENTITY_OPTIONS: Array<{
  key: IdentityType;
  icon: string;
  label: string;
  hint: string;
  bannerTitle: string;
  bannerDesc: string;
  ring: string;
  bg: string;
  textColor: string;
}> = [
  {
    key: "new",
    icon: "🆕",
    label: "新訪客",
    hint: "首次到店、無資料",
    bannerTitle: "新訪客 — 首次到店接待",
    bannerDesc: "請完整收集基本資料、線索來源、意向車款。預設貼上「新訪客」官方標籤。",
    ring: "border-[#185FA5]",
    bg: "bg-[#EAF4FB]",
    textColor: "text-[#0C3E70]",
  },
  {
    key: "revisit",
    icon: "🔁",
    label: "再訪客",
    hint: "有歷史接待記錄",
    bannerTitle: "再訪客 — 已有歷史接待記錄",
    bannerDesc: "系統將自動帶入既有客戶資料與上次接待重點，請重點補充本次新增需求。",
    ring: "border-[#534AB7]",
    bg: "bg-[#EEEDFE]",
    textColor: "text-[#26215C]",
  },
  {
    key: "owner",
    icon: "🏁",
    label: "現有車主",
    hint: "曾於本店購車",
    bannerTitle: "現有車主 — 維繫關係優先",
    bannerDesc: "車主回訪重點：保養、加購、升級。可推薦 DRE 學院、Track Day 活動、配件升級。",
    ring: "border-[#0F6E56]",
    bg: "bg-[#E1F5EE]",
    textColor: "text-[#085041]",
  },
  {
    key: "switcher",
    icon: "🔄",
    label: "換購客",
    hint: "想以舊換新",
    bannerTitle: "換購客 — 評估舊車優先",
    bannerDesc: "請優先啟動 RS06 中古車鑑價流程，了解舊車殘值後再進入意向車款討論。",
    ring: "border-[#854F0B]",
    bg: "bg-[#FDF3E3]",
    textColor: "text-[#6B3A00]",
  },
];

const INTENT_LEVELS: Array<{ level: IntentLevel; emoji: string; label: string }> = [
  { level: 5, emoji: "🔥🔥", label: "極強" },
  { level: 4, emoji: "🔥", label: "強" },
  { level: 3, emoji: "✳️", label: "中等" },
  { level: 2, emoji: "❄️", label: "偏低" },
  { level: 1, emoji: "💤", label: "觀望" },
];

const HABC_GRADES: HABCGrade[] = ["H", "A", "B", "C"];

const HABC_GRADE_COLORS: Record<HABCGrade, { bg: string; text: string; border: string }> = {
  H: { bg: "bg-[#FDECEA]", text: "text-[#C8001A]", border: "border-[#F0B0B0]" },
  A: { bg: "bg-[#FDF3E3]", text: "text-[#854F0B]", border: "border-[#F0C97E]" },
  B: { bg: "bg-[#EAF4FB]", text: "text-[#0C3E70]", border: "border-[#85B7EB]" },
  C: { bg: "bg-[#F2F2F2]", text: "text-[#6B6A68]", border: "border-[#D5D3CB]" },
};

const TAG_LIBRARY: Record<TagColor, { title: string; emoji: string; tags: string[] }> = {
  "t-red": {
    title: "注意事項",
    emoji: "🔴",
    tags: ["🔴 預算偏低", "🔴 決策者非本人", "🔴 有競品比較", "🔴 態度冷淡", "🔴 擔心保險費高"],
  },
  "t-yellow": {
    title: "偏好與特質",
    emoji: "🟡",
    tags: [
      "🟡 偏好 Panigale 系列",
      "🟡 偏好輕巧街車",
      "🟡 著重外觀設計",
      "🟡 重視操控性能",
      "🟡 Track Day 愛好者",
      "🟡 已提供型錄",
    ],
  },
  "t-green": {
    title: "服務備忘",
    emoji: "🟢",
    tags: ["🟢 需安排試駕", "🟢 需聯絡 DRE 學院", "🟢 需提供中古車資訊", "🟢 已邀請活動", "🟢 女性騎士"],
  },
  "t-blue": {
    title: "溝通與費用",
    emoji: "🔵",
    tags: ["🔵 希望分期", "🔵 需了解補助方案", "🔵 試過一次試駕", "🔵 需要話術引導", "🔵 比較三家經銷商"],
  },
};

const TAG_CHIP_CLASS: Record<TagColor, string> = {
  "t-red": "bg-[#FDECEA] text-[#C8001A] border-[#F0B0B0]",
  "t-yellow": "bg-[#FDF3E3] text-[#854F0B] border-[#F0C97E]",
  "t-green": "bg-[#E1F5EE] text-[#0F6E56] border-[#5DCAA5]",
  "t-blue": "bg-[#EAF4FB] text-[#0C3E70] border-[#85B7EB]",
};

function inputCls(extra = "") {
  return `w-full px-3 h-[34px] border border-[#D5D3CB] rounded-md text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] focus:outline-none focus:ring-2 focus:ring-[#85B7EB]/30 bg-white ${extra}`;
}

function textareaCls(extra = "") {
  return `w-full px-3 py-2 border border-[#D5D3CB] rounded-md text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] focus:outline-none focus:ring-2 focus:ring-[#85B7EB]/30 resize-y bg-white ${extra}`;
}

function selectCls(extra = "") {
  return `w-full px-3 h-[34px] border border-[#D5D3CB] rounded-md text-[12.5px] text-[#2C2C2A] focus:border-[#185FA5] focus:outline-none focus:ring-2 focus:ring-[#85B7EB]/30 bg-white ${extra}`;
}

function labelCls(extra = "") {
  return `block text-[11.5px] font-semibold text-[#4A4A48] mb-1 ${extra}`;
}

function calcHABC(timing: string, trialStatus: string): { grade: HABCGrade; reason: string } {
  // 簡易推算：購買時機 × 試駕狀態 → HABC
  if (timing === "3m" && (trialStatus === "done-today" || trialStatus === "done-before")) {
    return { grade: "H", reason: "購買時機明確（3 個月內）且已試駕，建議列入 H 級熱客優先追蹤。" };
  }
  if (timing === "3m") {
    return { grade: "A", reason: "購買時機明確（3 個月內），尚未試駕，建議定為 A 級積極追蹤、優先安排試駕。" };
  }
  if (timing === "6m") {
    return { grade: "B", reason: "購買時機在半年內，建議 B 級持續維繫、月度跟進。" };
  }
  if (timing === "1y") {
    return { grade: "C", reason: "購買時機在一年內，建議 C 級維持資料、定期推送活動。" };
  }
  return { grade: "C", reason: "尚未確認購買時機，先列入 C 級維護名單。" };
}

export default function HandcardForm() {
  useSetPageHeader({
    title: "RS01 電子手卡",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/overview" },
      { label: "展廳接待", href: "/sales/showroom/new-cars" },
      { label: "接待手卡" },
    ],
    hideSearch: true,
  });

  // 1. 來客身份
  const [identity, setIdentity] = useState<IdentityType | null>(null);

  // 2. 基本接待資訊
  const [visitTime, setVisitTime] = useState("");
  const [rsName, setRsName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [leadSource, setLeadSource] = useState("");

  // 3. 意向車款
  const [intentModel, setIntentModel] = useState("");
  const [intentYear, setIntentYear] = useState("");
  const [intentColor, setIntentColor] = useState("");

  // 4. 購買時機 + HABC
  const [buyTiming, setBuyTiming] = useState("");
  const [trialStatus, setTrialStatus] = useState("none");
  const [intentLevel, setIntentLevel] = useState<IntentLevel | null>(null);
  const [habcOverride, setHabcOverride] = useState<HABCGrade | null>(null);

  const habcSuggest = useMemo(() => calcHABC(buyTiming, trialStatus), [buyTiming, trialStatus]);
  const habcCurrent = habcOverride ?? habcSuggest.grade;

  // 7. 報價追蹤
  const [quoteStatus, setQuoteStatus] = useState("none");
  const [quoteAmount, setQuoteAmount] = useState("");
  const [followDate, setFollowDate] = useState("");
  const [followMethod, setFollowMethod] = useState("LINE 訊息");

  // 8. 客戶標籤
  const [selectedTags, setSelectedTags] = useState<Tag[]>([]);
  const [customTagText, setCustomTagText] = useState("");
  const [customTagColor, setCustomTagColor] = useState<TagColor>("t-red");

  const toggleTag = (label: string, color: TagColor) => {
    setSelectedTags((prev) => {
      const exists = prev.find((t) => t.label === label);
      if (exists) return prev.filter((t) => t.label !== label);
      return [...prev, { label, color }];
    });
  };

  const addCustomTag = () => {
    const text = customTagText.trim();
    if (!text) return;
    if (selectedTags.find((t) => t.label === text)) return;
    setSelectedTags((prev) => [...prev, { label: text, color: customTagColor, custom: true }]);
    setCustomTagText("");
  };

  // 9. 備註競品
  const [visitNote, setVisitNote] = useState("");
  const [needNote, setNeedNote] = useState("");
  const [competitor1, setCompetitor1] = useState("");
  const [competitor2, setCompetitor2] = useState("");
  const [visitResult, setVisitResult] = useState("");
  const [lostReason, setLostReason] = useState("");

  const identitySelected = IDENTITY_OPTIONS.find((o) => o.key === identity);

  return (
    <main className="px-6 py-5 space-y-3 max-w-[1100px] mx-auto">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">RS01 電子手卡</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">v8</span>
        <span className="text-[12px] text-[#9A9890]">展廳接待主表單 · 8 個 step · 跨頁串接 RS02 / RS06 / CRM03A</span>
        <div className="ml-auto flex items-center gap-1.5">
          <button className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">
            暫存草稿
          </button>
          <button className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]">
            儲存並送出
          </button>
        </div>
      </header>

      {/* Identity Banner（已選） */}
      {identitySelected && (
        <div className={`rounded-lg px-4 py-3 border ${identitySelected.bg} ${identitySelected.ring}`}>
          <div className="flex items-center gap-3">
            <div className="text-[22px]">{identitySelected.icon}</div>
            <div className="flex-1">
              <div className={`text-[13px] font-bold ${identitySelected.textColor}`}>
                {identitySelected.bannerTitle}
              </div>
              <div className={`text-[11.5px] leading-relaxed ${identitySelected.textColor} opacity-80`}>
                {identitySelected.bannerDesc}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Step 1：來客身份 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#EAF4FB] flex items-center justify-center text-[14px]">👤</div>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">Step 1 · 來客身份確認</span>
          <span className="ml-auto text-[11px] text-[#9A9890]">必選</span>
        </header>
        <div className="px-4 py-3">
          <div className="text-[11px] font-bold tracking-wider text-[#9A9890] mb-2">請選擇來客身份類型</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {IDENTITY_OPTIONS.map((o) => {
              const selected = identity === o.key;
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setIdentity(o.key)}
                  className={`rounded-lg px-3 py-3 border-2 text-center transition-colors ${
                    selected
                      ? `${o.ring} ${o.bg}`
                      : "border-[#EEECE6] bg-[#FAFAF8] hover:border-[#B4B2A9] hover:bg-[#F4F3F0]"
                  }`}
                >
                  <div className="text-[22px] mb-1.5">{o.icon}</div>
                  <div className={`text-[12px] font-semibold ${selected ? o.textColor : "text-[#2C2C2A]"}`}>
                    {o.label}
                  </div>
                  <div className="text-[10.5px] text-[#9A9890] leading-tight">{o.hint}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Step 2：基本接待資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#E1F5EE] flex items-center justify-center text-[14px]">📋</div>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">Step 2 · 基本接待資訊</span>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <label className={labelCls()}>
              接待時間 <span className="text-[#C8001A]">*</span>
            </label>
            <input
              type="datetime-local"
              value={visitTime}
              onChange={(e) => setVisitTime(e.target.value)}
              className={inputCls()}
            />
          </div>
          <div>
            <label className={labelCls()}>接待 RS</label>
            <input
              type="text"
              value={rsName}
              onChange={(e) => setRsName(e.target.value)}
              placeholder="銷售人員姓名"
              className={inputCls()}
            />
          </div>
          <div>
            <label className={labelCls()}>
              客戶姓名 <span className="text-[#C8001A]">*</span>
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="王先生 / 林小姐"
              className={inputCls()}
            />
          </div>
          <div>
            <label className={labelCls()}>聯絡電話</label>
            <input
              type="tel"
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="09xx-xxx-xxx"
              className={inputCls()}
            />
          </div>
          <div className="md:col-span-2">
            <label className={labelCls()}>線索來源</label>
            <select value={leadSource} onChange={(e) => setLeadSource(e.target.value)} className={selectCls()}>
              <option value="">— 請選擇（讀取 RS_SET）—</option>
              <option>路過進店</option>
              <option>LINE 官方帳號</option>
              <option>FB / IG 廣告</option>
              <option>朋友介紹</option>
              <option>官網填單</option>
              <option>展演活動</option>
              <option>DRE 學院</option>
              <option>其他</option>
            </select>
          </div>
        </div>
      </section>

      {/* Step 3：意向車款 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#FDF3E3] flex items-center justify-center text-[14px]">🏍️</div>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">Step 3 · 意向車款</span>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
          <div>
            <label className={labelCls()}>車型</label>
            <select value={intentModel} onChange={(e) => setIntentModel(e.target.value)} className={selectCls()}>
              <option value="">— 請選擇 —</option>
              <option>Panigale V4</option>
              <option>Panigale V2</option>
              <option>Streetfighter V4</option>
              <option>Monster</option>
              <option>Diavel V4</option>
              <option>Multistrada V4</option>
              <option>Scrambler</option>
            </select>
          </div>
          <div>
            <label className={labelCls()}>年式</label>
            <select value={intentYear} onChange={(e) => setIntentYear(e.target.value)} className={selectCls()}>
              <option value="">— 請選擇 —</option>
              <option>2026</option>
              <option>2025</option>
              <option>2024</option>
            </select>
          </div>
          <div>
            <label className={labelCls()}>意向顏色</label>
            <input
              type="text"
              value={intentColor}
              onChange={(e) => setIntentColor(e.target.value)}
              placeholder="Ducati Red / 黑色 / 灰色"
              className={inputCls()}
            />
          </div>
        </div>
      </section>

      {/* Step 4：購買時機 × HABC */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#FDECEA] flex items-center justify-center text-[14px]">🎯</div>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">Step 4 · 購買時機評估 × HABC 系統輔助</span>
        </header>
        <div className="px-4 py-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <label className={labelCls()}>購買時機</label>
              <select value={buyTiming} onChange={(e) => setBuyTiming(e.target.value)} className={selectCls()}>
                <option value="">— 請選擇 —</option>
                <option value="3m">3 個月內</option>
                <option value="6m">半年內</option>
                <option value="1y">一年內</option>
                <option value="long">長期觀望</option>
              </select>
            </div>
            <div>
              <label className={labelCls()}>試駕狀態</label>
              <select value={trialStatus} onChange={(e) => setTrialStatus(e.target.value)} className={selectCls()}>
                <option value="none">尚未試駕</option>
                <option value="done-today">本次已試駕</option>
                <option value="done-before">之前已試駕</option>
                <option value="refused">明確拒絕試駕</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls()}>意向強度評估</label>
            <div className="grid grid-cols-5 gap-2">
              {INTENT_LEVELS.map((it) => {
                const active = intentLevel === it.level;
                return (
                  <button
                    key={it.level}
                    type="button"
                    onClick={() => setIntentLevel(it.level)}
                    className={`rounded-md py-2 border-2 transition-colors ${
                      active
                        ? "border-[#1A3A5C] bg-[#EAF4FB]"
                        : "border-[#EEECE6] bg-[#FAFAF8] hover:border-[#B4B2A9]"
                    }`}
                  >
                    <div className="text-[18px] leading-none">{it.emoji}</div>
                    <div className="text-[11px] text-[#5A5955] mt-1">{it.label}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* HABC 建議塊 */}
          {buyTiming ? (
            <div
              className={`rounded-lg p-3 border ${HABC_GRADE_COLORS[habcCurrent].bg} ${HABC_GRADE_COLORS[habcCurrent].border}`}
            >
              <div className="flex items-start gap-3">
                <div className="text-[22px]">🤖</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div
                      className={`w-9 h-9 rounded-md flex items-center justify-center text-[18px] font-bold border ${HABC_GRADE_COLORS[habcCurrent].border} ${HABC_GRADE_COLORS[habcCurrent].text} bg-white`}
                    >
                      {habcCurrent}
                    </div>
                    <span className={`text-[11.5px] font-semibold ${HABC_GRADE_COLORS[habcCurrent].text}`}>
                      系統建議 — 依購買時機 × 試駕狀態
                    </span>
                  </div>
                  <div className={`text-[12px] leading-relaxed ${HABC_GRADE_COLORS[habcCurrent].text} opacity-90 mb-2`}>
                    {habcSuggest.reason}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-[#5A5955]">RS 確認或手動覆蓋：</span>
                    {HABC_GRADES.map((g) => {
                      const active = habcCurrent === g;
                      return (
                        <button
                          key={g}
                          type="button"
                          onClick={() => setHabcOverride(g)}
                          className={`w-8 h-8 rounded-md text-[13px] font-bold border-2 ${
                            active
                              ? `${HABC_GRADE_COLORS[g].border} ${HABC_GRADE_COLORS[g].bg} ${HABC_GRADE_COLORS[g].text}`
                              : "border-[#EEECE6] bg-white text-[#9A9890] hover:border-[#B4B2A9]"
                          }`}
                        >
                          {g}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="border border-dashed border-[#D5D3CB] bg-[#F8F7F4] rounded-md py-3 text-center text-[12px] text-[#9A9890]">
              ↑ 選擇購買時機後，系統將自動推算 HABC 建議級別
            </div>
          )}
        </div>
      </section>

      {/* Step 5：試乘試駕跳轉 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#E1F5EE] flex items-center justify-center text-[14px]">🏁</div>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">Step 5 · 試乘試駕</span>
          <span className="ml-auto text-[11px] text-[#9A9890]">跳轉 RS02 · 完成後唯讀回寫</span>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            className="rounded-lg border-2 border-[#0F6E56] bg-[#E1F5EE] hover:bg-[#D2EEDF] p-3 flex items-center gap-3 text-left transition-colors"
          >
            <div className="text-[22px]">🏁</div>
            <div className="flex-1">
              <div className="text-[12.5px] font-semibold text-[#085041]">前往試乘試駕 RS02</div>
              <div className="text-[11px] text-[#0F6E56] opacity-80">記錄試駕車款、時間、里程、客戶反應</div>
            </div>
            <span className="px-2 py-0.5 text-[10.5px] rounded-full bg-white border border-[#5DCAA5] text-[#0F6E56]">
              待執行
            </span>
            <div className="text-[#5DCAA5]">›</div>
          </button>
          <div className="text-[11.5px] text-[#9A9890] leading-relaxed py-2">
            ⚡ <b className="text-[#2C2C2A]">黃金時刻提示</b>：試駕結束後立即開立報價單，把握客戶熱情最高峰。完成後系統將自動顯示「立即報價」提示。
          </div>
        </div>
      </section>

      {/* Step 6：中古車鑑價跳轉（換購客優先） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#FDF3E3] flex items-center justify-center text-[14px]">🔧</div>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">Step 6 · 中古車評估鑑價</span>
          <span className="ml-auto text-[11px] text-[#9A9890]">跳轉 RS06 · 選填</span>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            className="rounded-lg border-2 border-[#854F0B] bg-[#FDF3E3] hover:bg-[#F8EAC5] p-3 flex items-center gap-3 text-left transition-colors"
          >
            <div className="text-[22px]">🔧</div>
            <div className="flex-1">
              <div className="text-[12.5px] font-semibold text-[#6B3A00]">前往中古車鑑價 RS06</div>
              <div className="text-[11px] text-[#854F0B] opacity-80">評估價格、Desmo 保養、認證等級</div>
            </div>
            <span className="px-2 py-0.5 text-[10.5px] rounded-full bg-white border border-[#F0C97E] text-[#854F0B]">
              待執行
            </span>
            <div className="text-[#F0C97E]">›</div>
          </button>
          <div className="text-[11.5px] text-[#9A9890] leading-relaxed py-2">
            適用情況：客戶有舊車折抵需求，或有意購買本店中古車。完成後評估價格與認證等級自動回寫。
          </div>
        </div>
      </section>

      {/* Step 7：報價與追蹤 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#FDECEA] flex items-center justify-center text-[14px]">💰</div>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">Step 7 · 報價與追蹤</span>
          <span className="ml-auto text-[11px] text-[#9A9890]">3 個觸發時機</span>
        </header>
        <div className="px-4 py-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div className="rounded-md border border-[#F0C97E] bg-[#FDF7EC] px-3 py-2">
              <div className="text-[11.5px] font-semibold text-[#854F0B]">⭐ 黃金時刻：試駕結束</div>
              <div className="text-[11px] text-[#854F0B] opacity-80 leading-relaxed">
                試駕後客戶熱情最高，必須在離店前開立報價單。
              </div>
            </div>
            <div className="rounded-md border border-[#EEECE6] bg-[#FAFAF8] px-3 py-2">
              <div className="text-[11.5px] font-semibold text-[#2C2C2A]">📋 客戶當天表明意願</div>
              <div className="text-[11px] text-[#5A5955] leading-relaxed">
                即使未試駕，客戶明確表達意願即可開單。
              </div>
            </div>
            <div className="rounded-md border border-[#EEECE6] bg-[#FAFAF8] px-3 py-2">
              <div className="text-[11.5px] font-semibold text-[#2C2C2A]">📞 潛客再訪（CRM03A）</div>
              <div className="text-[11px] text-[#5A5955] leading-relaxed">D+3 / D+7 電訪工作台提示跟進。</div>
            </div>
          </div>

          <div className="border-t border-[#EEECE6] -mx-4" />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
            <div>
              <label className={labelCls()}>報價單狀態</label>
              <select value={quoteStatus} onChange={(e) => setQuoteStatus(e.target.value)} className={selectCls()}>
                <option value="none">尚未開立</option>
                <option value="draft">草稿中</option>
                <option value="issued">已開立（已給客戶）</option>
                <option value="revised">已修訂</option>
              </select>
            </div>
            <div>
              <label className={labelCls()}>報價金額</label>
              <div className="flex items-stretch">
                <span className="inline-flex items-center px-2.5 h-[34px] border border-r-0 border-[#D5D3CB] rounded-l-md bg-[#F8F7F4] text-[11.5px] text-[#5A5955]">
                  NT$
                </span>
                <input
                  type="number"
                  value={quoteAmount}
                  onChange={(e) => setQuoteAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1 h-[34px] border border-[#D5D3CB] rounded-r-md px-3 text-[12.5px] text-right focus:outline-none focus:border-[#185FA5] bg-white"
                />
              </div>
            </div>
            <div>
              <label className={labelCls()}>下次追蹤日期</label>
              <input
                type="date"
                value={followDate}
                onChange={(e) => setFollowDate(e.target.value)}
                className={inputCls()}
              />
              <div className="text-[10.5px] text-[#9A9890] mt-1">儲存後自動同步至 CRM03A 電訪工作台</div>
            </div>
            <div>
              <label className={labelCls()}>追蹤方式</label>
              <select
                value={followMethod}
                onChange={(e) => setFollowMethod(e.target.value)}
                className={selectCls()}
              >
                <option>LINE 訊息</option>
                <option>電話</option>
                <option>邀請再訪</option>
                <option>邀請活動（DRE / Track Day）</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* Step 8：客戶標籤 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#EEEDFE] flex items-center justify-center text-[14px]">🏷️</div>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">Step 8 · 客戶標籤</span>
          <span className="ml-auto text-[11px] text-[#9A9890]">四色標籤 · RS_M3 Tab3 管理</span>
        </header>
        <div className="px-4 py-3 space-y-3">
          {/* 已選標籤 */}
          <div>
            <div className={labelCls()}>已貼標籤</div>
            <div className="min-h-[36px] flex flex-wrap gap-1.5 p-2 rounded-md bg-[#FAFAF8] border border-dashed border-[#D5D3CB]">
              {selectedTags.length === 0 ? (
                <span className="text-[11.5px] text-[#9A9890]">尚未貼標 — 從下方選擇</span>
              ) : (
                selectedTags.map((t) => (
                  <button
                    key={t.label}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) => prev.filter((x) => x.label !== t.label))
                    }
                    className={`text-[11px] px-2 py-0.5 rounded-md border ${TAG_CHIP_CLASS[t.color]} hover:opacity-80`}
                    title="點擊移除"
                  >
                    {t.label}
                    {t.custom && <span className="ml-1 opacity-60">·自訂</span>}
                    <span className="ml-1 opacity-60">×</span>
                  </button>
                ))
              )}
            </div>
          </div>

          {(Object.keys(TAG_LIBRARY) as TagColor[]).map((color) => {
            const lib = TAG_LIBRARY[color];
            return (
              <div key={color}>
                <div className={`text-[11.5px] font-semibold mb-1.5 ${TAG_CHIP_CLASS[color].split(" ")[1]}`}>
                  {lib.emoji} {lib.title}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {lib.tags.map((label) => {
                    const active = selectedTags.some((t) => t.label === label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleTag(label, color)}
                        className={`text-[11px] px-2 py-0.5 rounded-md border ${TAG_CHIP_CLASS[color]} transition-opacity ${
                          active ? "" : "opacity-60 hover:opacity-100"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* 自訂標籤 */}
          <div className="border-t border-dashed border-[#EEECE6] pt-3">
            <div className={labelCls()}>新增自訂標籤</div>
            <div className="flex items-stretch gap-2">
              <input
                type="text"
                value={customTagText}
                onChange={(e) => setCustomTagText(e.target.value)}
                placeholder="輸入自訂標籤名稱..."
                className={inputCls("flex-1")}
              />
              <select
                value={customTagColor}
                onChange={(e) => setCustomTagColor(e.target.value as TagColor)}
                className={selectCls("w-[130px]")}
              >
                <option value="t-red">🔴 注意</option>
                <option value="t-yellow">🟡 偏好</option>
                <option value="t-green">🟢 備忘</option>
                <option value="t-blue">🔵 費用</option>
              </select>
              <button
                type="button"
                onClick={addCustomTag}
                className="h-[34px] px-3 rounded-md bg-white border border-[#D5D3CB] text-[12px] text-[#5A5955] hover:border-[#9A9890]"
              >
                ＋ 新增
              </button>
            </div>
            <div className="text-[10.5px] text-[#9A9890] mt-1">
              自訂標籤將標示「自訂」，主管可於 RS_M3 Tab3 升為官方標籤
            </div>
          </div>
        </div>
      </section>

      {/* Step 9：備註與競品 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-[#E8EDF2] flex items-center justify-center text-[14px]">📝</div>
          <span className="text-[13px] font-semibold text-[#2C2C2A]">Step 9 · 備註與競品記錄</span>
        </header>
        <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
          <div>
            <label className={labelCls()}>接待備註</label>
            <textarea
              value={visitNote}
              onChange={(e) => setVisitNote(e.target.value)}
              placeholder="記錄本次接待重點、客戶提問、特殊需求..."
              className={textareaCls("min-h-[72px]")}
            />
          </div>
          <div>
            <label className={labelCls()}>主要需求摘要</label>
            <textarea
              value={needNote}
              onChange={(e) => setNeedNote(e.target.value)}
              placeholder="客戶最在意的 1–3 個需求點..."
              className={textareaCls("min-h-[72px]")}
            />
          </div>
          <div>
            <label className={labelCls()}>競品 1（客戶提及）</label>
            <select value={competitor1} onChange={(e) => setCompetitor1(e.target.value)} className={selectCls()}>
              <option value="">— 請選擇（讀取 RS_SET）—</option>
              <option>BMW Motorrad</option>
              <option>Triumph</option>
              <option>MV Agusta</option>
              <option>KAWASAKI（大型）</option>
              <option>YAMAHA（大型）</option>
              <option>中古車行</option>
              <option>個人買賣（臉書）</option>
            </select>
          </div>
          <div>
            <label className={labelCls()}>競品 2（可不填）</label>
            <select value={competitor2} onChange={(e) => setCompetitor2(e.target.value)} className={selectCls()}>
              <option value="">— 請選擇 —</option>
              <option>BMW Motorrad</option>
              <option>Triumph</option>
              <option>MV Agusta</option>
              <option>KAWASAKI（大型）</option>
              <option>YAMAHA（大型）</option>
            </select>
          </div>
          <div>
            <label className={labelCls()}>本次接待結果</label>
            <select value={visitResult} onChange={(e) => setVisitResult(e.target.value)} className={selectCls()}>
              <option value="">— 請選擇 —</option>
              <option value="signed">✅ 當場成交</option>
              <option value="trial-done">🏁 已試駕，待報價</option>
              <option value="quoted">📋 已報價，待決定</option>
              <option value="follow">📞 需後續追蹤跟進</option>
              <option value="lost">❌ 未成交（戰敗）</option>
              <option value="explore">🔍 純粹了解，長期維護</option>
            </select>
          </div>
          {visitResult === "lost" && (
            <div>
              <label className={labelCls()}>未成交原因</label>
              <select value={lostReason} onChange={(e) => setLostReason(e.target.value)} className={selectCls()}>
                <option value="">— 請選擇 —</option>
                <option>預算不足</option>
                <option>選擇競品</option>
                <option>決策者另有他人</option>
                <option>暫緩購買計畫</option>
                <option>購買中古車</option>
                <option>其他原因</option>
              </select>
            </div>
          )}
        </div>
      </section>

      {/* 底部 CRM 同步提示 */}
      <div className="rounded-lg px-4 py-3 bg-[#EAF4FB] border border-[#85B7EB] flex items-center gap-3">
        <div className="text-[20px]">🔗</div>
        <div className="flex-1 text-[12px] text-[#0C3E70] leading-relaxed">
          儲存後此卡將自動同步至客戶 360 視圖、HABC 漏斗、CRM03A 電訪工作台。下次追蹤日期、報價狀態變動會即時推送提醒給對應 RS。
        </div>
      </div>

      {/* 浮動底部 action bar */}
      <div className="sticky bottom-4 mt-2 z-30">
        <div className="bg-white border border-[#D5D3CB] shadow-lg rounded-lg px-4 py-2.5 flex items-center gap-2">
          <span className="text-[11.5px] text-[#9A9890]">
            {identity ? `身份：${identitySelected?.label}` : "尚未選擇身份"}
            {customerName ? ` · ${customerName}` : ""}
            {habcCurrent && buyTiming ? ` · HABC ${habcCurrent} 級` : ""}
          </span>
          <button
            type="button"
            className="ml-auto h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            暫存草稿
          </button>
          <button
            type="button"
            disabled={!identity || !customerName}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            儲存並送出
          </button>
        </div>
      </div>
    </main>
  );
}
