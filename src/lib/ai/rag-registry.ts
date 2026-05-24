/**
 * RAG source registry (client-safe) — UI 顯示用的 source metadata
 *
 * 只放 icon / label / shortLabel / href 等純值/純函式、不 import server-only 模組，
 * 因此 client component (chat-message.tsx) 可直接 import。
 *
 * Server 端 serialize / ingestion 邏輯走 rag-registry.server.ts、include 這個檔
 * 並補上對應的 serialize fn。加新 source 兩邊都要 push 一筆。
 */

export type SourceMeta = {
  /** source_type 值（DB / URL / UI 內部 key） */
  type: string;
  /** UI emoji icon */
  icon: string;
  /** 中文 source label */
  label: string;
  /** citation pill 顯示的短文字，吃 chunk metadata 產 */
  shortLabel?: (metadata: Record<string, unknown>) => string;
  /** citation 點擊跳轉 URL，null 表示無對應頁面 */
  href: string | ((metadata: Record<string, unknown>) => string | null);
};

const m = (v: unknown, fallback: string): string =>
  v == null || v === '' ? fallback : String(v);

export const SOURCE_META: SourceMeta[] = [
  { type: 'manual', icon: '📘', label: '原廠手冊',
    shortLabel: (m_) => {
      const title = m_.title as string | undefined;
      const page = m_.page as number | undefined;
      const t = (title ?? '手冊').slice(0, 20);
      return page ? `${t} P.${page}` : t;
    },
    href: '/admin/manuals' },
  { type: 'repair_order', icon: '🔧', label: '維修工單',
    shortLabel: (m_) => m(m_.ro_code, '維修工單'),
    href: (m_) => `/admin/master-data/work-orders?q=${m_.ro_code ?? ''}` },
  { type: 'final_inspection', icon: '✓', label: '最終檢驗',
    shortLabel: (m_) => m(m_.inspection_no, '檢驗'),
    href: (m_) => `/admin/master-data/inspections?q=${m_.inspection_no ?? ''}` },
  { type: 'customer', icon: '👤', label: '客戶資料',
    shortLabel: (m_) => m(m_.customer_code, '客戶'),
    href: '/admin/master-data/customers' },
  { type: 'handcard_voice', icon: '🎤', label: '接待錄音', href: '/ai-curve' },
  { type: 'business_card', icon: '💳', label: '名片掃描', href: '/ai-curve/business-card' },
  { type: 'einvoice', icon: '🧾', label: '電子發票',
    shortLabel: (m_) => m(m_.invoice_no, '電子發票'),
    href: '/einvoice' },
  { type: 'sales_order', icon: '📝', label: '銷售訂單',
    shortLabel: (m_) => m(m_.order_no, '銷售訂單'),
    href: '/sales/orders' },
  { type: 'sales_lead', icon: '🎯', label: '銷售線索',
    shortLabel: (m_) => m(m_.code, '線索'),
    href: '/sales/leads' },
  { type: 'sales_handcard', icon: '📇', label: '接待手卡',
    shortLabel: (m_) => m(m_.code, '手卡'),
    href: '/sales/reception/handcard' },
  { type: 'appointment', icon: '📅', label: '預約',
    shortLabel: (m_) => m(m_.appt_no, '預約'),
    href: '/service/appointments' },
  { type: 'work_order', icon: '🛠️', label: '維修工單 (WO)',
    shortLabel: (m_) => m(m_.wo_no ?? m_.ro_code, 'WO'),
    href: '/service/workorders' },
  { type: 'pre_inspection', icon: '🔍', label: '預檢',
    shortLabel: (m_) => m(m_.inspection_no, '預檢'),
    href: '/service/pre-inspections' },
  { type: 'customer_vehicle', icon: '🏍️', label: '客戶車輛',
    shortLabel: (m_) => m(m_.license_plate, '車輛'),
    href: '/admin/master-data/vehicles' },
  { type: 'new_car_inventory', icon: '🆕', label: '新車庫存',
    shortLabel: (m_) => m(m_.vin ?? m_.code, '新車'),
    href: '/inventory/vehicles' },
  { type: 'used_car_inventory', icon: '🚲', label: '中古車庫存',
    shortLabel: (m_) => m(m_.code ?? m_.vin, '中古車'),
    href: '/usedcar/stock' },
  { type: 'sales_test_drive', icon: '🏁', label: '試駕紀錄',
    shortLabel: (m_) => m(m_.code, '試駕'),
    href: '/sales/test-drives' },
  { type: 'sales_quote', icon: '💰', label: '報價單',
    shortLabel: (m_) => m(m_.quote_no, '報價'),
    href: '/sales/quotes' },
  { type: 'delivery', icon: '🚚', label: '交車單',
    shortLabel: (m_) => m(m_.code, '交車'),
    href: '/delivery/list' },
  { type: 'warranty_claim', icon: '🛡️', label: '保固索賠',
    shortLabel: (m_) => m(m_.claim_no, '保固'),
    href: '/admin/master-data/warranty-claims' },
  { type: 'parts_warranty_claim', icon: '⚙️', label: '零件保固索賠',
    shortLabel: (m_) => m(m_.claim_no, '零件保固'),
    href: '/parts/warranty-claims' },
  { type: 'insurance_policy', icon: '📋', label: '保險單',
    shortLabel: (m_) => m(m_.policy_no, '保險'),
    href: '/sales/insurance' },
  { type: 'item', icon: '🔩', label: '零件主檔',
    shortLabel: (m_) => m(m_.code, '零件'),
    href: '/parts/setup/items' },
];

const BY_TYPE = new Map<string, SourceMeta>(SOURCE_META.map((s) => [s.type, s]));

export function getSourceMeta(type: string): SourceMeta | undefined {
  return BY_TYPE.get(type);
}

export function resolveIcon(type: string): string {
  return BY_TYPE.get(type)?.icon ?? '📄';
}

export function resolveLabel(type: string): string {
  return BY_TYPE.get(type)?.label ?? type;
}

export function resolveShortLabel(type: string, metadata: Record<string, unknown>): string {
  const src = BY_TYPE.get(type);
  if (!src) return type;
  return src.shortLabel ? src.shortLabel(metadata) : src.label;
}

export function resolveHref(type: string, metadata: Record<string, unknown>): string | null {
  const src = BY_TYPE.get(type);
  if (!src) return null;
  return typeof src.href === 'function' ? src.href(metadata) : src.href;
}

/** 給 client UI 用：列出所有可 reindex 的 source（排除 manual 自走 pipeline） */
export function listIngestableSourceMeta(): SourceMeta[] {
  return SOURCE_META.filter((s) => s.type !== 'manual');
}
