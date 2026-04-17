/**
 * POS v2 Types — 精簡版，對應 POS_SA_SD_Spec_v1.0.docx §3
 */

export type ProductCategory = "精品" | "零件" | "耗材";

export type Product = {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  unitPrice: number;
  stockQty: number;
  lowStockAt: number;
  barcode?: string;
};

export type CartLine = {
  product: Product;
  qty: number;
};

export type PaymentMethod = "cash" | "transfer" | "linepay";

export const PAYMENT_LABEL: Record<PaymentMethod, string> = {
  cash: "現金",
  transfer: "銀行轉帳",
  linepay: "LINE Pay",
};

export const PAYMENT_ICON: Record<PaymentMethod, string> = {
  cash: "payments",
  transfer: "account_balance",
  linepay: "qr_code_2",
};

export type Transaction = {
  id: string;
  date: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  lines: { productId: string; name: string; qty: number; unitPrice: number }[];
  staffName: string;
};

export type UsedVehicleStatus = "available" | "reserved" | "sold";

export type UsedVehicle = {
  id: string;
  brand: string;
  model: string;
  year: number;
  color: string;
  mileageKm: number;
  purchasePrice: number;
  refurbCost: number;
  listPrice: number;
  status: UsedVehicleStatus;
  photoHint?: string;
};

export type UsedVehicleSourceType = "sales-led" | "technician-rec";

export type SaleOrderPaymentStatus = "deposit" | "partial" | "paid";

export type SaleOrder = {
  id: string;
  vehicleId: string;
  customerName: string;
  customerPhone: string;
  salePrice: number;
  gp1: number;
  gpRatio: number;
  paymentStatus: SaleOrderPaymentStatus;
  depositAmount: number;
  deliveryDate: string | null;
  sourceType: UsedVehicleSourceType;
  salesperson: string;
  createdAt: string;
};

export type LedgerEntryType = "income" | "expense";

export type LedgerCategory =
  | "POS 銷售"
  | "中古車銷售"
  | "水電"
  | "薪資"
  | "雜費"
  | "整備費用"
  | "其他";

export type LedgerEntry = {
  id: string;
  date: string;
  type: LedgerEntryType;
  category: LedgerCategory;
  amount: number;
  paymentMethod?: PaymentMethod;
  description: string;
  refId?: string;
};
