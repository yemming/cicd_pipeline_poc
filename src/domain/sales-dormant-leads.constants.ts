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

export type LostReason =
  | "price"
  | "competitor"
  | "no_response"
  | "wrong_target"
  | "financial"
  | "postponed"
  | "family_objection"
  | "model_preference_changed"
  | "other";

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
  competitor: "流失至競品",
  no_response: "失聯／無回應",
  wrong_target: "TA 不符",
  financial: "貸款／財務",
  postponed: "購車計畫延後",
  family_objection: "家人反對",
  model_preference_changed: "喜好改變（轉車型）",
  other: "其他",
};

/** 售後脈絡下的流失原因 label（共用同一組 enum，僅換顯示用字串） */
export const AFTERSALES_LOST_REASON_LABEL: Record<LostReason, string> = {
  price: "工資 / 料件價格",
  competitor: "流失至他廠（自家或外廠）",
  no_response: "失聯 / 無回應",
  wrong_target: "地點不便 / 搬家",
  financial: "車輛閒置 / 暫停保養",
  postponed: "保養計畫延後",
  family_objection: "車輛轉手",
  model_preference_changed: "換車（不再保養此車）",
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
