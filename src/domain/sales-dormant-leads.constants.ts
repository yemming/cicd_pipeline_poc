/**
 * Client-safe constants for 休眠戰敗 / 流失管理（CRM04A · CSAT05A）
 *
 * 純展示常數 / type，client component 從這裡 import；
 * server-only 的 query / shape 留在 sales-dormant-leads.ts。
 *
 * sales 版 = 銷售前 lead（戰敗 / 競品 / 喚醒）
 * aftersales 版 = 已成交客戶 N 個月未回廠（流失到他廠 / 距離 / 換車）
 * 兩者 reuse 同一張 sales_leads 表 + kind 欄位區隔。
 */

export type DormantLeadKind = "sales" | "aftersales";

export type DormancyStatus =
  | "active"
  | "dormant"
  | "lost"
  | "revived"
  | "converted";

// DB lost_reason 自 2026-06-23 起改存「8 類」值（Russell 正式裁示完成 9→8 遷移，
// sales_leads_lost_reason_check 約束已改為 8 類）。LostReason 即 8 類，與 LostReasonB9 同集合。
export type LostReason =
  | "price"
  | "stock_shortage"
  | "competitor"
  | "timing"
  | "family_objection"
  | "model_change"
  | "no_need"
  | "other";

// ──────────────────────────────────────────────────────────────────────────
// 戰敗原因 8 類（Russell 2026-06-23 正式裁示）。DB 已遷移為直接存 8 類值，
// 映射函式保留為「identity + 舊 9 值相容 fallback」，以防殘留舊值（歷史資料 /
// 外部寫入）仍能正確歸位。舊 9 值 → 8 類 對照（裁示表）：
//   competitor→competitor · price→price · family_objection→family_objection
//   model_preference_changed→model_change · postponed→timing
//   financial→price（財務負擔歸價格類）· wrong_target→other · no_response→other
// ──────────────────────────────────────────────────────────────────────────

export type LostReasonB9 =
  | "price"
  | "stock_shortage"
  | "competitor"
  | "timing"
  | "family_objection"
  | "model_change"
  | "no_need"
  | "other";

export const LOST_REASON_B9_LABEL: Record<LostReasonB9, string> = {
  price: "價格",
  stock_shortage: "庫存不足 / 缺車",
  competitor: "流失至競品",
  timing: "購車時機未到",
  family_objection: "家人反對",
  model_change: "喜好改變（轉車型）",
  no_need: "不需要 / 已有車",
  other: "其他",
};

/** 8 類 UI → DB（遷移後 DB 直接存 8 類，identity）。 */
export function mapLostReasonB9ToDb(b9: LostReasonB9): LostReason {
  return b9;
}

const VALID_B9: readonly LostReasonB9[] = [
  "price", "stock_shortage", "competitor", "timing",
  "family_objection", "model_change", "no_need", "other",
];

/** 舊 9 值 → 8 類（Russell 2026-06-23 裁示表），用於相容殘留舊值。 */
const LEGACY_LOST_REASON_TO_B9: Record<string, LostReasonB9> = {
  no_response: "other",
  wrong_target: "other",
  financial: "price",
  postponed: "timing",
  model_preference_changed: "model_change",
};

/** DB → B9 UI。遷移後多為 identity；舊 9 值依裁示表相容對映，未知值 fallback other。 */
export function mapDbToLostReasonB9(db: string): LostReasonB9 {
  if (db in LEGACY_LOST_REASON_TO_B9) return LEGACY_LOST_REASON_TO_B9[db];
  return (VALID_B9 as readonly string[]).includes(db) ? (db as LostReasonB9) : "other";
}

// ──────────────────────────────────────────────────────────────────────────
// B9 輪11-2：戰敗後自動建立喚醒 call_task 的 next_due_days 規則
//
// 依 8 類分類計算「幾天後」再接觸：
//   price            → 90 天（促銷活動等觸發點）
//   competitor       → 180 天（等對手服務出問題）
//   timing           → 30 天（等客戶時機成熟）
//   no_need          → 365 天（長期存檔，季度店長評估）
//   stock_shortage   → 90 天（暫定，待 Russell 裁示）
//   family_objection → 90 天（暫定，待 Russell 裁示）
//   model_change     → 90 天（暫定，待 Russell 裁示）
//   other            → 90 天（預設）
// ──────────────────────────────────────────────────────────────────────────

export const REACTIVATION_DUE_DAYS: Record<LostReasonB9, number> = {
  price: 90,
  competitor: 180,
  timing: 30,
  no_need: 365,
  stock_shortage: 90,   // ⚠ 暫定 — 待 Russell 裁示
  family_objection: 90, // ⚠ 暫定 — 待 Russell 裁示
  model_change: 90,     // ⚠ 暫定 — 待 Russell 裁示
  other: 90,
};

export type LeadSource =
  | "test_drive"
  | "showroom"
  | "online"
  | "referral"
  | "event"
  | "phone_in"
  | "other";

export const DORMANCY_STATUS_LABEL: Record<DormancyStatus, string> = {
  active: "活躍中",
  dormant: "休眠",
  lost: "戰敗",
  revived: "已喚醒",
  converted: "已成交",
};

export const DORMANCY_STATUS_BADGE: Record<
  DormancyStatus,
  { bg: string; fg: string }
> = {
  active: { bg: "#EAF3DE", fg: "#3B6D11" },
  dormant: { bg: "#FDF3E3", fg: "#854F0B" },
  lost: { bg: "#FDECEA", fg: "#CC0000" },
  revived: { bg: "#EAF4FB", fg: "#185FA5" },
  converted: { bg: "#EBF3FF", fg: "#1A3A5C" },
};

export const LOST_REASON_LABEL: Record<LostReason, string> = {
  price: "價格",
  stock_shortage: "庫存不足 / 缺車",
  competitor: "流失至競品",
  timing: "購車時機未到",
  family_objection: "家人反對",
  model_change: "喜好改變（轉車型）",
  no_need: "無購買需求 / 已有車",
  other: "其他",
};

/** 售後脈絡下的流失原因 label（共用同一組 8 類 enum，僅換顯示用字串） */
export const AFTERSALES_LOST_REASON_LABEL: Record<LostReason, string> = {
  price: "工資 / 料件價格",
  stock_shortage: "缺料 / 無法保養",
  competitor: "流失至他廠（自家或外廠）",
  timing: "保養計畫延後",
  family_objection: "車輛轉手 / 他人使用",
  model_change: "換車（不再保養此車）",
  no_need: "車輛閒置 / 停用",
  other: "其他",
};

/** 依 kind 取 lost_reason label map */
export function lostReasonLabel(
  kind: DormantLeadKind,
): Record<LostReason, string> {
  return kind === "aftersales"
    ? AFTERSALES_LOST_REASON_LABEL
    : LOST_REASON_LABEL;
}

/** 依 kind 取 dormancy 標題 / sprint chip / caption / nouns */
export function dormancyCopy(kind: DormantLeadKind): {
  title: string;
  sprintChip: string;
  caption: string;
  /** 用在 "+ 新增 {noun}" / 「{noun} {name}」等地方 */
  noun: string;
  /** breadcrumb 上的列表名 */
  listLabel: string;
  /** title card 上方的小 caption */
  kindCaption: string;
  /** 競品 / 流失對象欄位 label */
  competitorLabel: string;
  /** 競品欄位 placeholder */
  competitorPlaceholder: string;
  /** 戰敗 / 流失日 label */
  lostDateLabel: string;
  /** 戰敗按鈕文字 */
  markLostButtonLabel: string;
  /** Stitch sprint id 對映用 */
  sprintCode: string;
} {
  if (kind === "aftersales") {
    return {
      title: "休眠流失管理",
      sprintChip: "CSAT05A",
      caption: "售後客戶流失集中管理・流失原因分析・喚回排程",
      noun: "流失客戶",
      listLabel: "休眠流失管理",
      kindCaption: "售後客戶",
      competitorLabel: "流失對象（他廠 / 品牌）",
      competitorPlaceholder: "例：原廠他店 / 巷口外廠 / 自行保養",
      lostDateLabel: "判定流失日",
      markLostButtonLabel: "標記為流失（沿用下方原因/對象）",
      sprintCode: "CSAT05A",
    };
  }
  return {
    title: "休眠戰敗管理",
    sprintChip: "CRM04A",
    caption: "銷售線索的休眠／戰敗集中管理・原因分析・再接觸排程",
    noun: "lead",
    listLabel: "休眠戰敗管理",
    kindCaption: "銷售線索",
    competitorLabel: "競品品牌",
    competitorPlaceholder: "例：Harley-Davidson / BMW Motorrad",
    lostDateLabel: "戰敗日",
    markLostButtonLabel: "標記為戰敗（沿用下方原因/競品）",
    sprintCode: "CRM04A",
  };
}

/** 休眠天數分箱（顯示用） */
export function dormancyBucket(days: number | null): {
  label: string;
  hint: string;
} {
  if (days == null) return { label: "—", hint: "" };
  if (days <= 30) return { label: "≤ 30 天", hint: "早期休眠，喚醒機率較高" };
  if (days <= 60) return { label: "31-60 天", hint: "需明確切入點" };
  if (days <= 90) return { label: "61-90 天", hint: "建議活動再邀" };
  return { label: "> 90 天", hint: "成本高，評估保留" };
}

/** 戰敗原因 / 流失原因 chip 色（CRM04A / CRM04B 6 色對齊 spec） */
export const LOST_REASON_BAR_COLOR: Record<LostReason, string> = {
  price: "#C8001A", // 紅
  stock_shortage: "#0F6E56", // 綠
  competitor: "#185FA5", // 藍
  timing: "#D4820A", // 橘
  family_objection: "#7A6500", // 橄欖
  model_change: "#888888", // 灰
  no_need: "#534AB7", // 紫
  other: "#AAAAAA", // 淺灰
};

/** 流失原因 tag（pill）色票 — 售後 spec 對齊 */
export const LOST_REASON_TAG_BADGE: Record<
  LostReason,
  { bg: string; fg: string }
> = {
  price: { bg: "#FDECEA", fg: "#C8001A" }, // 價格
  stock_shortage: { bg: "#E1F5EE", fg: "#0F6E56" }, // 缺車 / 缺料
  competitor: { bg: "#185FA5", fg: "#FFFFFF" }, // 流失至競品
  timing: { bg: "#FDF3E3", fg: "#854F0B" }, // 時機未到 / 延後
  family_objection: { bg: "#EAF4FB", fg: "#185FA5" }, // 家人反對
  model_change: { bg: "#F1EFE8", fg: "#5A5955" }, // 喜好改變 / 換車
  no_need: { bg: "#EEEDFE", fg: "#534AB7" }, // 無需求 / 閒置
  other: { bg: "#EEEDFE", fg: "#534AB7" }, // 其他
};

/** 競品 → 分析建議文案 map（Tab 2 callout 動態文字） */
export const COMPETITOR_INSIGHT: Record<string, string> = {
  "BMW Motorrad": "BMW 流失主因多為「騎乘姿勢舒適性」，可強化 Monster/Multistrada 試駕體驗對比",
  "BMW S1000R": "BMW S1000R 流失多因「騎乘姿勢舒適性」，可強化 Streetfighter 對比體驗",
  "KTM 890 Adventure": "KTM 流失多因「越野規格」訴求，建議補強 DesertX Rally 試駕場域",
  "Aprilia Tuono V4": "Aprilia 流失多因「動力反應」訴求，可凸顯 Streetfighter V4 規格優勢",
  Triumph: "Triumph 流失多因「品牌情感」訴求，建議引導參與 DRE 體驗活動",
};

export function competitorInsight(brand: string | null): string {
  if (!brand) return "";
  return (
    COMPETITOR_INSIGHT[brand] ??
    `${brand} 流失多因品牌偏好，可加強原廠車主社群活動曝光`
  );
}

/** 喚醒計畫 plan box（Tab 3，3 色 stage） */
export type WakeupPlanStage = {
  key: "early" | "mid" | "late";
  title: string;
  /** plan-box border / bg 色票 */
  color: { bg: string; bd: string; fg: string; stepBg: string };
  steps: string[];
};

export function wakeupPlanStages(kind: DormantLeadKind): WakeupPlanStage[] {
  if (kind === "aftersales") {
    return [
      {
        key: "early",
        title: "⏰ 30-60 天逾期：主動提醒階段",
        color: { bg: "#FDF3E3", bd: "#F0C97E", fg: "#854F0B", stepBg: "#D4820A" },
        steps: [
          "CRM03B 自動建立回廠提醒電訪任務，SA 依建議話術聯繫",
          "發送 LINE / SMS 保養提醒（由 CRM06B 推播通知管理設定）",
          "若客戶有回應 → 協助預約進廠時間，任務完成",
        ],
      },
      {
        key: "mid",
        title: "🔴 60-120 天逾期：積極介入階段",
        color: { bg: "#FDECEA", bd: "#F5AEAD", fg: "#C8001A", stepBg: "#C8001A" },
        steps: [
          "SA 電話主動關懷，詢問未回廠原因（時間 / 費用 / 不滿意）",
          "若有服務不滿 → 主管介入處理，提供補救方案",
          "若有費用顧慮 → 推薦保養套餐優惠或分期付款方案",
          "若有 Desmo / 保固到期 → 強調風險，協助緊急預約",
        ],
      },
      {
        key: "late",
        title: "⬜ 120 天以上：最後接觸 / 存檔",
        color: { bg: "#F4F3F0", bd: "#9A9890", fg: "#5A5955", stepBg: "#9A9890" },
        steps: [
          "主管確認後執行最後一次接觸",
          "若無回應 → 標記「長期休眠」存檔，停止主動推送",
          "每季由店長檢視長期休眠名單，評估是否重新啟動",
        ],
      },
    ];
  }
  return [
    {
      key: "early",
      title: "⏰ 30-60 天休眠：活動邀請階段",
      color: { bg: "#FDF3E3", bd: "#F0C97E", fg: "#854F0B", stepBg: "#D4820A" },
      steps: [
        "發送 Track Day / DRE 試駕活動邀請簡訊",
        "LINE 推播本月優惠 / 新車款資訊",
        "若客戶有回應 → 安排 RS 電訪深入交流",
      ],
    },
    {
      key: "mid",
      title: "🔴 60-90 天休眠：RS 電話關懷",
      color: { bg: "#FDECEA", bd: "#F5AEAD", fg: "#C8001A", stepBg: "#C8001A" },
      steps: [
        "RS 主動致電，詢問購車意願現況與顧慮",
        "若費用顧慮 → 提供分期 / 金融專案",
        "若意向改變 → 推薦其他車型試駕",
        "主管追蹤接觸結果",
      ],
    },
    {
      key: "late",
      title: "⬜ 90 天以上：最後接觸 / 存檔",
      color: { bg: "#F4F3F0", bd: "#9A9890", fg: "#5A5955", stepBg: "#9A9890" },
      steps: [
        "主管確認後執行最後一次接觸",
        "若無回應 → 標記長期休眠，存檔不再主動推送",
        "每季店長檢視評估重新啟動可能性",
      ],
    },
  ];
}
