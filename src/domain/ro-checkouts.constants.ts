/**
 * Constants — 售後 結帳收款（RO Checkout）
 *
 * Spec：docs/DUCATI_售後工單模組_..._最新版/08_結帳收款.html
 * 4-step wizard：費用確認 → 車主二簽 → 收款方式+發票 → RO 關單
 * 一張 RO 一份 ro_checkouts（unique constraint repair_order_id）
 */

export const RO_CHECKOUT_STATUS = [
  "in_progress",
  "signed",
  "paid",
  "completed",
] as const;
export type RoCheckoutStatus = (typeof RO_CHECKOUT_STATUS)[number];

export const STATUS_LABEL: Record<RoCheckoutStatus, string> = {
  in_progress: "費用確認中",
  signed: "車主已簽名",
  paid: "已收款",
  completed: "已結案",
};

export const STATUS_CHIP: Record<RoCheckoutStatus, string> = {
  in_progress: "bg-[#FDF3E3] text-[#854F0B]",
  signed: "bg-[#EAF4FB] text-[#185FA5]",
  paid: "bg-[#E1F5EE] text-[#0F6E56]",
  completed: "bg-[#EAF3DE] text-[#3B6D11]",
};

export const STEP_LABELS = [
  "費用確認",
  "車主二簽",
  "收款方式・發票",
  "RO 關單",
] as const;

/* ──────────────── Step 1: 費用 ──────────────── */

export type FeeLine = {
  source: "line" | "addon";
  source_ref_id: string;
  no: number;
  label: string;
  labor_units: number;
  parts_amount: number;
  labor_amount: number;
  subtotal: number;
  is_addon?: boolean;
  is_warranty?: boolean;
};

export const DISCOUNT_OPTIONS = [
  { pct: 0, label: "無折扣" },
  { pct: 5, label: "VIP 九五折" },
  { pct: 10, label: "主管授權九折" },
] as const;

export type FeeSummary = {
  lines?: FeeLine[];
  parts_amount?: number;
  labor_amount?: number;
  subtotal?: number;          // 未稅小計
  tax_rate?: number;          // 0.05
  tax_amount?: number;
  total?: number;             // 含稅
  discount_pct?: number;      // 0 / 5 / 10
  discount_amount?: number;
  payable?: number;           // 折後實付
  customer_no_dispute?: boolean;
};

/* ──────────────── Step 2: 簽名 ──────────────── */

export type CustomerSignature = {
  signature_text?: string;    // 簽名文字（demo 用 / 當事人姓名存證）
  signed_at?: string;         // ISO
  customer_name?: string;
  screenshot_url?: string | null; // 包C：真手寫簽名圖（dataURL）
};

/* ──────────────── Step 3: 收款 + 發票 ──────────────── */

export const PAYMENT_METHODS = [
  { id: "credit_card", label: "信用卡", icon: "💳" },
  { id: "cash", label: "現金", icon: "💵" },
  { id: "line_pay", label: "LINE Pay", icon: "💚" },
  { id: "mobile", label: "其他行動支付", icon: "📱" },
  { id: "transfer", label: "銀行轉帳", icon: "🏦" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["id"];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  credit_card: "信用卡",
  cash: "現金",
  line_pay: "LINE Pay",
  mobile: "其他行動支付",
  transfer: "銀行轉帳",
};

export type Payment = {
  method?: PaymentMethod;
  paid_at?: string;
  amount?: number;
};

export const INVOICE_KINDS = [
  { id: "cloud", label: "電子發票（雲端）" },
  { id: "carrier", label: "載具歸戶" },
  { id: "company", label: "統一編號（公司戶）" },
  { id: "donate", label: "捐贈發票" },
] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number]["id"];

export const INVOICE_KIND_LABEL: Record<InvoiceKind, string> = {
  cloud: "電子發票（雲端）",
  carrier: "載具歸戶",
  company: "統一編號（公司戶）",
  donate: "捐贈發票",
};

export type Invoice = {
  kind?: InvoiceKind;
  tax_id?: string;            // 統編（kind=company 時填）
  carrier?: string;
  invoice_no?: string;
  issued_at?: string;
};

/* ──────────────── 純函式 ──────────────── */

export const TAX_RATE = 0.05;

/** 從 lines / addons 構造 fee summary */
export function buildFeeSummary(
  lines: Array<{
    id: string;
    line_no: number;
    kind: string;
    labor_name: string | null;
    part_name: string | null;
    labor_units: number | null;
    qty: number | null;
    unit_price: number | null;
    amount: number | null;
    is_warranty: boolean | null;
  }>,
  addons: Array<{
    id: string;
    addon_no: number;
    name: string;
    estimated_fee: number | null;
    customer_decision: string | null;
  }>,
  laborUnitPrice = 1000,
): FeeSummary {
  const feeLines: FeeLine[] = [];

  for (const l of lines) {
    if (l.is_warranty) continue;
    const labor = Number(l.labor_units ?? 0) * laborUnitPrice;
    const part = Number(l.amount ?? Number(l.qty ?? 0) * Number(l.unit_price ?? 0));
    feeLines.push({
      source: "line",
      source_ref_id: l.id,
      no: l.line_no,
      label: l.labor_name || l.part_name || `項目 #${l.line_no}`,
      labor_units: Number(l.labor_units ?? 0),
      parts_amount: round0(part),
      labor_amount: round0(labor),
      subtotal: round0(labor + part),
      is_warranty: false,
    });
  }

  // 已同意的追加納入；defer / reject / 未決不納入
  const acceptedAddons = addons.filter((a) => a.customer_decision === "accepted");
  for (const a of acceptedAddons) {
    feeLines.push({
      source: "addon",
      source_ref_id: a.id,
      no: 1000 + a.addon_no,
      label: `追加：${a.name}`,
      labor_units: 0,
      parts_amount: 0,
      labor_amount: 0,
      subtotal: round0(Number(a.estimated_fee ?? 0)),
      is_addon: true,
    });
  }

  const parts_amount = feeLines.reduce((s, x) => s + x.parts_amount, 0);
  const labor_amount = feeLines.reduce((s, x) => s + x.labor_amount, 0);
  const subtotal = feeLines.reduce((s, x) => s + x.subtotal, 0);
  const tax_amount = round0(subtotal * TAX_RATE);
  const total = subtotal + tax_amount;

  return {
    lines: feeLines,
    parts_amount: round0(parts_amount),
    labor_amount: round0(labor_amount),
    subtotal: round0(subtotal),
    tax_rate: TAX_RATE,
    tax_amount,
    total: round0(total),
    discount_pct: 0,
    discount_amount: 0,
    payable: round0(total),
  };
}

export function applyDiscount(summary: FeeSummary, pct: number): FeeSummary {
  const total = summary.total ?? 0;
  const discount_amount = round0((total * pct) / 100);
  const payable = round0(total - discount_amount);
  return { ...summary, discount_pct: pct, discount_amount, payable };
}

function round0(n: number): number {
  return Math.round(n);
}

/** 產生結帳編號 CK-yyMMdd-NNN */
export function buildCheckoutNo(yymmdd: string, sequence: number): string {
  return `CK-${yymmdd}-${String(sequence).padStart(3, "0")}`;
}
