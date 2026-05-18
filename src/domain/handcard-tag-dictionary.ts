/**
 * 接待手卡互動標籤字典（4 群 / 21 chip）。
 *
 * 對應老闆設計稿 RS01 v8（docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS01_電子手卡_v8.html）的
 * 「注意 / 偏好 / 服務 / 溝通」4 色 chip 池。
 *
 * 設計取捨：
 * - 字典放 code 裡（21 個固定選項、Ducati 業務領域穩定）
 * - 選中狀態存 handcards.metadata.tags = string[]（chip code 陣列）
 * - 想做 admin 可編輯時，再把字典 promote 到 business_rules（rule_kind='handcard_tag_dict'）
 */

export type HandcardTagGroup = "warning" | "preference" | "service" | "communication";

export type HandcardTagDef = {
  code: string;
  label: string;
  group: HandcardTagGroup;
};

export type HandcardTagGroupDef = {
  key: HandcardTagGroup;
  title: string;
  emoji: string;
  /** Tailwind class snippets for chip backgrounds / colors */
  classChip: string;
  classActive: string;
  classDot: string;
  tags: HandcardTagDef[];
};

export const HANDCARD_TAG_GROUPS: HandcardTagGroupDef[] = [
  {
    key: "warning",
    title: "注意事項",
    emoji: "🔴",
    classChip:
      "bg-white border border-[#F5AEAD] text-[#CC0000] hover:bg-[#FDECEA]",
    classActive: "bg-[#FDECEA] border-[#CC0000] text-[#CC0000] font-semibold",
    classDot: "bg-[#CC0000]",
    tags: [
      { code: "budget_low", label: "預算偏低", group: "warning" },
      { code: "not_decision_maker", label: "決策者非本人", group: "warning" },
      { code: "competitor_compare", label: "有競品比較", group: "warning" },
      { code: "attitude_cold", label: "態度冷淡", group: "warning" },
      { code: "insurance_concern", label: "擔心保險費高", group: "warning" },
    ],
  },
  {
    key: "preference",
    title: "偏好與特質",
    emoji: "🟡",
    classChip:
      "bg-white border border-[#E5C57B] text-[#854F0B] hover:bg-[#FDF3E3]",
    classActive: "bg-[#FDF3E3] border-[#854F0B] text-[#854F0B] font-semibold",
    classDot: "bg-[#E5A93B]",
    tags: [
      { code: "pref_panigale", label: "偏好 Panigale 系列", group: "preference" },
      { code: "pref_naked", label: "偏好輕巧街車", group: "preference" },
      { code: "focus_design", label: "著重外觀設計", group: "preference" },
      { code: "focus_handling", label: "重視操控性能", group: "preference" },
      { code: "track_day_fan", label: "Track Day 愛好者", group: "preference" },
      { code: "catalog_given", label: "已提供型錄", group: "preference" },
    ],
  },
  {
    key: "service",
    title: "服務備忘",
    emoji: "🟢",
    classChip:
      "bg-white border border-[#9FCFAA] text-[#3B6D11] hover:bg-[#EAF3DE]",
    classActive: "bg-[#EAF3DE] border-[#3B6D11] text-[#3B6D11] font-semibold",
    classDot: "bg-[#3B6D11]",
    tags: [
      { code: "schedule_test_ride", label: "需安排試駕", group: "service" },
      { code: "contact_dre", label: "需聯絡 DRE 學院", group: "service" },
      { code: "provide_used_car_info", label: "需提供中古車資訊", group: "service" },
      { code: "invited_event", label: "已邀請活動", group: "service" },
      { code: "female_rider", label: "女性騎士", group: "service" },
    ],
  },
  {
    key: "communication",
    title: "溝通與費用",
    emoji: "🔵",
    classChip:
      "bg-white border border-[#9DC4E4] text-[#185FA5] hover:bg-[#EAF4FB]",
    classActive: "bg-[#EAF4FB] border-[#185FA5] text-[#185FA5] font-semibold",
    classDot: "bg-[#185FA5]",
    tags: [
      { code: "want_installment", label: "希望分期", group: "communication" },
      { code: "ask_subsidy", label: "需了解補助方案", group: "communication" },
      { code: "tried_test_ride_once", label: "試過一次試駕", group: "communication" },
      { code: "need_script", label: "需要話術引導", group: "communication" },
      { code: "compare_three_dealers", label: "比較三家經銷商", group: "communication" },
    ],
  },
];

// ── Helper: code → def (for rendering selected chips outside of pool) ──
const TAG_BY_CODE: Record<string, HandcardTagDef & { groupDef: HandcardTagGroupDef }> =
  Object.fromEntries(
    HANDCARD_TAG_GROUPS.flatMap((g) =>
      g.tags.map((t) => [t.code, { ...t, groupDef: g }]),
    ),
  );

export function lookupHandcardTag(code: string) {
  return TAG_BY_CODE[code] ?? null;
}

// ── Identity 4 cards ──
export type HandcardIdentityDef = {
  key: "new" | "revisit" | "owner" | "switcher";
  label: string;
  hint: string;
  emoji: string;
  /** Border accent color when selected */
  accent: string;
};

// ── HABC 自動推薦邏輯 ──
// 對應 RS01 v8 樣板的 recalcHABC() — 根據購買時機 + 意向強度推算建議等級。
// RS 仍可手動覆蓋。
export type HabcSuggestion = {
  grade: "H" | "A" | "B" | "C";
  bg: string;
  fg: string;
  border: string;
  reason: string;
  followup: string;
};

export function recommendHabc(opts: {
  timing: "now" | "3m" | "6m" | "explore" | null;
  intentLevel: number | null;
  trialStatus: "none" | "done-today" | "done-before" | "refused" | null;
}): HabcSuggestion | null {
  const { timing, intentLevel, trialStatus } = opts;
  if (!timing && intentLevel == null && !trialStatus) return null;

  const hot = timing === "now" || (intentLevel ?? 0) >= 5;
  const warm = timing === "3m" || trialStatus === "done-today" || (intentLevel ?? 0) === 4;
  const cool = timing === "6m";
  const cold = timing === "explore" || (intentLevel != null && intentLevel <= 2);

  if (hot)
    return {
      grade: "H",
      bg: "#FDECEA",
      fg: "#CC0000",
      border: "#F5AEAD",
      reason: "立即決策意願 / 意向強度極高",
      followup: "最高優先：本週內完成報價並安排試駕，48 小時內主動聯繫",
    };
  if (warm)
    return {
      grade: "A",
      bg: "#FDF3E3",
      fg: "#854F0B",
      border: "#E5C57B",
      reason: "3 個月內購車意願 / 已完成試駕",
      followup: "積極跟進：D+3 / D+7 電訪追蹤、寄送車款資料與促銷方案",
    };
  if (cool)
    return {
      grade: "B",
      bg: "#EAF4FB",
      fg: "#185FA5",
      border: "#9DC4E4",
      reason: "半年內購車計畫",
      followup: "定期維持：兩週一次互動、邀請活動 / 試駕、保持聯繫熱度",
    };
  if (cold)
    return {
      grade: "C",
      bg: "#F2F2F2",
      fg: "#6B6A68",
      border: "#D5D3CB",
      reason: "純粹了解 / 意向偏低",
      followup: "長期維護：月度活動邀請、品牌資訊推播，待客戶主動接觸",
    };
  return null;
}

export const HANDCARD_IDENTITY_CARDS: HandcardIdentityDef[] = [
  {
    key: "new",
    label: "首次來訪",
    hint: "新客來訪、首次接觸",
    emoji: "🆕",
    accent: "#0F6E56",
  },
  {
    key: "revisit",
    label: "潛客再訪",
    hint: "曾經來過、本次再評估\n自動帶上次資料",
    emoji: "🔄",
    accent: "#185FA5",
  },
  {
    key: "owner",
    label: "現有車主",
    hint: "現有車主回廠或洽換新車\n自動帶出車輛資料",
    emoji: "🏍️",
    accent: "#854F0B",
  },
  {
    key: "switcher",
    label: "換購客",
    hint: "其他品牌車主考慮換購\n需記錄現有車輛與品牌",
    emoji: "🔀",
    accent: "#CC0000",
  },
];
