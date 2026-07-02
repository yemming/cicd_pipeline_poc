/**
 * Domain Helper — 電子手卡 v8 · HABC 自動建議（pure TS, no DB）
 *
 * 規格來源：docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS01_電子手卡_v8.html
 *   recalcHABC() / showHABC() 的純前端推算邏輯。
 *
 * 設計原則：
 *   - 純 function、不打 server / DB（業務尚未落地）
 *   - input 是 v8 spec 的 4 個維度，output 是 grade + reason
 *   - RS 可在 UI 上手動覆蓋；helper 只負責 default suggest
 */

export type HandcardTiming = "now" | "3m" | "6m" | "explore";
export type HandcardTrialStatus =
  | "none"
  | "done-today"
  | "done-before"
  | "refused";
export type HandcardIntent = 1 | 2 | 3 | 4 | 5;

export type HabcGrade = "H" | "A" | "B" | "C";

export type HabcSuggestion = {
  grade: HabcGrade;
  reason: string;
  /** 純 css 風格參考鍵（accent）— UI 自行對 token */
  accent: "red" | "amber" | "blue" | "slate";
};

const REASONS: Record<HabcGrade, string> = {
  H: "購買時機明確（立即決策）或意向強烈，屬最高優先潛客，建議本週內完成報價並跟進。",
  A: "購買時機明確（3 個月內）或已試駕，建議積極跟進，安排試駕或直接推進報價單。",
  B: "購買時機 3–6 個月，意向中等，定期維持接觸、邀請活動，培養購買意願。",
  C: "純粹了解或意向偏低，屬長期維護對象，每月保持一次接觸，勿過度打擾。",
};

const ACCENT: Record<HabcGrade, HabcSuggestion["accent"]> = {
  H: "red",
  A: "amber",
  B: "blue",
  C: "slate",
};

/**
 * 純前端推算建議級別。RS 可手動覆蓋。
 *
 * 規則（從 RS01 v8 spec recalcHABC()）：
 *   - timing="now" 或 intent>=4 → H
 *   - timing="3m" 或 trial 為 done-today/done-before → A
 *   - timing="6m" → B
 *   - 其他（explore / refused / 未試駕） → C
 */
export function suggestHabc(input: {
  timing: HandcardTiming | null;
  intent: HandcardIntent | null;
  trialStatus: HandcardTrialStatus;
}): HabcSuggestion | null {
  const { timing, intent, trialStatus } = input;
  if (!timing) return null;

  let grade: HabcGrade;
  if (timing === "now" || (intent ?? 0) >= 4) {
    grade = "H";
  } else if (
    timing === "3m" ||
    trialStatus === "done-today" ||
    trialStatus === "done-before"
  ) {
    grade = "A";
  } else if (timing === "6m") {
    grade = "B";
  } else {
    grade = "C";
  }

  return { grade, reason: REASONS[grade], accent: ACCENT[grade] };
}

/**
 * Timing display labels — UI / preview Modal 共用
 */
export const TIMING_OPTIONS: Array<{
  key: HandcardTiming;
  emoji: string;
  title: string;
  sub: string;
}> = [
  { key: "now", emoji: "🔥", title: "立即決策", sub: "本月內有意向，資金已備妥" },
  { key: "3m", emoji: "⏰", title: "3 個月內", sub: "有明確計畫，仍在比較方案" },
  { key: "6m", emoji: "📅", title: "半年左右", sub: "初步了解階段，預算待確認" },
  { key: "explore", emoji: "🔍", title: "純粹了解", sub: "無明確購買時機，探詢行情" },
];

export const INTENT_OPTIONS: Array<{
  key: HandcardIntent;
  emoji: string;
  label: string;
}> = [
  { key: 5, emoji: "🔥🔥", label: "極強" },
  { key: 4, emoji: "🔥", label: "強" },
  { key: 3, emoji: "✳️", label: "中等" },
  { key: 2, emoji: "❄️", label: "偏低" },
  { key: 1, emoji: "💤", label: "觀望" },
];

export const TRIAL_STATUS_OPTIONS: Array<{
  key: HandcardTrialStatus;
  label: string;
}> = [
  { key: "none", label: "尚未試駕" },
  { key: "done-today", label: "本次已試駕" },
  { key: "done-before", label: "之前已試駕" },
  { key: "refused", label: "明確拒絕試駕" },
];

export type HandcardIdentity = "new" | "revisit" | "owner" | "switcher";

export const IDENTITY_LABELS: Record<HandcardIdentity, string> = {
  new: "首次來訪",
  revisit: "潛客再訪",
  owner: "本品牌老車主",
  switcher: "他牌換購",
};
