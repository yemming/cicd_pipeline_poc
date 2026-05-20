/**
 * 客群標籤共用常數 — 由 src/domain/customer-tags.ts 與 UI 共用
 *
 * 這檔不是 "use server"，可 export 非 async 值（陣列 / 物件 / type）。
 */

export const TAG_COLORS = ["red", "yellow", "green", "blue"] as const;
export type TagColor = (typeof TAG_COLORS)[number];

export const TAG_COLOR_EMOJI: Record<TagColor, string> = {
  red: "🔴",
  yellow: "🟡",
  green: "🟢",
  blue: "🔵",
};

export const TAG_COLOR_LABEL: Record<TagColor, string> = {
  red: "注意事項",
  yellow: "偏好特質",
  green: "服務備忘",
  blue: "談判協商",
};

/** 每位 RS 個人自訂標籤「字典」條目上限 — 不是每客戶貼標數（assignments 表落地後另立常數） */
export const PERSONAL_TAG_LIMIT = 20;

/** 主管觀察視角的 trend 閾值 — total_use >= HOT_THRESHOLD 視為「高頻使用」、>= RISING 視為「上升中」 */
export const TREND_HOT_THRESHOLD = 10;
export const TREND_RISING_THRESHOLD = 6;

// ──────────────────────────────────────────────────────────────────────────
// M03-11：標籤分類（official / system_auto）
// ──────────────────────────────────────────────────────────────────────────

export const TAG_KINDS = ["official", "system_auto"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export const TAG_KIND_LABEL: Record<TagKind, string> = {
  official: "官方標籤",
  system_auto: "系統自動",
};

export const TAG_KIND_DESCRIPTION: Record<TagKind, string> = {
  official: "主管設定，SA 在預檢／接待時可選用",
  system_auto: "系統規則自動貼標，主管可設定規則但不可手動貼",
};

// ──────────────────────────────────────────────────────────────────────────
// M03-11：主管視角 KPI 型別 + 純函式（這檔不是 "use server"，可 export sync function）
// ──────────────────────────────────────────────────────────────────────────

export type TagPageKpi = {
  /** 全部標籤條目（含 inactive） */
  total: number;
  /** 啟用中 */
  active: number;
  /** 套用客戶總次數（sum of usage_count） */
  totalUsage: number;
  /** 各色標籤啟用數（official + system_auto 合計） */
  byColor: Record<TagColor, number>;
  /** 系統自動標籤數量（啟用） */
  systemAutoActive: number;
  /** 官方標籤數量（啟用） */
  officialActive: number;
  /** 7 天總體使用趨勢（每色加總 sparkline → 7 個值） */
  spark7d: number[];
};

type TagLike = {
  is_active: boolean;
  tag_kind: TagKind;
  color: TagColor;
  usage_count: number;
  sparkline_7d: number[];
};

export function computeTagKpi(tags: TagLike[]): TagPageKpi {
  const byColor: Record<TagColor, number> = { red: 0, yellow: 0, green: 0, blue: 0 };
  let active = 0;
  let officialActive = 0;
  let systemAutoActive = 0;
  let totalUsage = 0;
  const spark7d = [0, 0, 0, 0, 0, 0, 0];
  for (const t of tags) {
    if (t.is_active) {
      active += 1;
      if (t.tag_kind === "official") officialActive += 1;
      if (t.tag_kind === "system_auto") systemAutoActive += 1;
      byColor[t.color] = (byColor[t.color] ?? 0) + 1;
    }
    totalUsage += t.usage_count;
    for (let i = 0; i < 7; i += 1) {
      spark7d[i] += t.sparkline_7d[i] ?? 0;
    }
  }
  return {
    total: tags.length,
    active,
    totalUsage,
    byColor,
    systemAutoActive,
    officialActive,
    spark7d,
  };
}
