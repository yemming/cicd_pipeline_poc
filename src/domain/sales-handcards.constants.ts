/**
 * Client-safe constants — 接待手卡（sales_handcards）
 *
 * 純展示常數 / type，client component 從這裡 import；
 * server-only 的 query / shape 留在 sales-handcards.ts。
 */

export type HandcardStatus = 'open' | 'closed' | 'converted_to_lead' | 'no_show';
export type HandcardLeadGrade = 'H' | 'A' | 'B' | 'C';
export type HandcardIdentity = 'new' | 'revisit' | 'owner' | 'switcher';
export type HandcardPurchaseTiming = 'now' | '3m' | '6m' | 'explore';
export type HandcardTrialStatus = 'none' | 'done-today' | 'done-before' | 'refused';
export type HandcardReceptionPeriod = 'morning' | 'afternoon' | 'evening' | 'full_day';

// 輪1-5：戰敗分類（8 類，對齊 DB CHECK constraint）
export type HandcardDefeatCategory =
  | 'price'
  | 'stock_shortage'
  | 'competitor'
  | 'timing'
  | 'family_objection'
  | 'model_change'
  | 'no_need'
  | 'other';

export const DEFEAT_CATEGORY_LABEL: Record<HandcardDefeatCategory, string> = {
  price:            '價格因素',
  stock_shortage:   '缺貨等車',
  competitor:       '選擇競品',
  timing:           '時機未到',
  family_objection: '家人反對',
  model_change:     '等新款車型',
  no_need:          '暫無需求',
  other:            '其他',
};

// ── 狀態 ──────────────────────────────────────────────────────────────────
export const HANDCARD_STATUS_LABEL: Record<HandcardStatus, string> = {
  open: '接待中',
  closed: '已結束',
  converted_to_lead: '已轉 Lead',
  no_show: '未到場',
};

export const HANDCARD_STATUS_BADGE: Record<HandcardStatus, { bg: string; fg: string }> = {
  open:              { bg: '#EAF3DE', fg: '#3B6D11' },
  closed:            { bg: '#F2F2F2', fg: '#6B6A68' },
  converted_to_lead: { bg: '#EAF4FB', fg: '#185FA5' },
  no_show:           { bg: '#FDECEA', fg: '#CC0000' },
};

// ── HABC 等級 ─────────────────────────────────────────────────────────────
export const LEAD_GRADE_LABEL: Record<HandcardLeadGrade, string> = {
  H: 'H — 立即',
  A: 'A — 3 個月',
  B: 'B — 半年',
  C: 'C — 觀望',
};

export const LEAD_GRADE_BADGE: Record<HandcardLeadGrade, { bg: string; fg: string }> = {
  H: { bg: '#FDECEA', fg: '#CC0000' },
  A: { bg: '#FDF3E3', fg: '#854F0B' },
  B: { bg: '#EAF4FB', fg: '#185FA5' },
  C: { bg: '#F2F2F2', fg: '#6B6A68' },
};

// ── 客戶身份 ──────────────────────────────────────────────────────────────
export const IDENTITY_LABEL: Record<HandcardIdentity, string> = {
  new:      '首次來訪',
  revisit:  '潛客再訪',
  owner:    '現有車主',
  switcher: '換購客',
};

// ── 購車時機 ──────────────────────────────────────────────────────────────
export const PURCHASE_TIMING_LABEL: Record<HandcardPurchaseTiming, string> = {
  now:     '立即決策',
  '3m':    '3 個月內',
  '6m':    '半年左右',
  explore: '純粹了解',
};

// ── 試乘狀態 ──────────────────────────────────────────────────────────────
export const TRIAL_STATUS_LABEL: Record<HandcardTrialStatus, string> = {
  none:          '尚未試駕',
  'done-today':  '本次已試駕',
  'done-before': '之前已試駕',
  refused:       '明確拒絕',
};

// ── 接待時段 ──────────────────────────────────────────────────────────────
export const RECEPTION_PERIOD_LABEL: Record<HandcardReceptionPeriod, string> = {
  morning:   '上午',
  afternoon: '下午',
  evening:   '傍晚',
  full_day:  '全天',
};
