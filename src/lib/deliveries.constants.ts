// 交車作業 — 狀態常數與標籤對應

export type DeliveryStatus =
  | 'scheduled'
  | 'pdi_in_progress'
  | 'pdi_complete'
  | 'accessories_complete'
  | 'delivery_confirmed'
  | 'warranty_signed'
  | 'ceremony_ready'
  | 'delivered'
  | 'cancelled';

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  scheduled: '已排程',
  pdi_in_progress: 'PDI 進行中',
  pdi_complete: 'PDI 完成',
  accessories_complete: '配件安裝完成',
  delivery_confirmed: '交車確認中',
  warranty_signed: '保固已簽署',
  ceremony_ready: '等待儀式',
  delivered: '已交車',
  cancelled: '已取消',
};

export const DELIVERY_STATUS_CHIP: Record<DeliveryStatus, { bg: string; text: string }> = {
  scheduled: { bg: 'bg-[#EAF4FB]', text: 'text-[#185FA5]' },
  pdi_in_progress: { bg: 'bg-[#FDF3E3]', text: 'text-[#854F0B]' },
  pdi_complete: { bg: 'bg-[#E8F5F0]', text: 'text-[#0F6E56]' },
  accessories_complete: { bg: 'bg-[#E8F5F0]', text: 'text-[#0F6E56]' },
  delivery_confirmed: { bg: 'bg-[#EAF4FB]', text: 'text-[#185FA5]' },
  warranty_signed: { bg: 'bg-[#EAF4FB]', text: 'text-[#1A3A5C]' },
  ceremony_ready: { bg: 'bg-[#EDF2FF]', text: 'text-[#534AB7]' },
  delivered: { bg: 'bg-[#EAF3DE]', text: 'text-[#3B6D11]' },
  cancelled: { bg: 'bg-[#F2F2F2]', text: 'text-[#6B6A68]' },
};

export const DELIVERY_STEP_NAMES = [
  'confirm1',
  'pdi',
  'accessories',
  'confirm2',
  'warranty',
  'ceremony',
] as const;

export type DeliveryStepName = (typeof DELIVERY_STEP_NAMES)[number];

export const DELIVERY_STEP_LABELS: Record<DeliveryStepName, string> = {
  confirm1: '訂單覆核',
  pdi: 'PDI 整備',
  accessories: '配件安裝',
  confirm2: '交車確認表',
  warranty: '保固條款',
  ceremony: '完成交車',
};
