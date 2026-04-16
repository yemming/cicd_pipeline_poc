export type Money = number;
export type ID = string;

export type CustomerType = "B2C" | "B2B";
export type VipTier = "None" | "Bronze" | "Silver" | "Gold" | "Platinum";

export type Customer = {
  id: ID;
  type: CustomerType;
  name: string;
  phone: string;
  email?: string;
  vatId?: string;
  address?: string;
  tier: VipTier;
  points: number;
  totalSpent: Money;
  joinDate: string;
  lastPurchase?: string;
  favoriteFamily?: string;
  bikeOwned?: string[];
  birthday?: string;
  avatarHue?: number;
};

export type SkuCategory = "apparel" | "accessory" | "helmet" | "parts" | "lifestyle";

export type Sku = {
  id: ID;
  code: string;
  name: string;
  category: SkuCategory;
  price: Money;
  cost: Money;
  brand?: string;
  fitsFamilies?: string[];
  tags?: string[];
};

export type ServiceCategory = "labor" | "parts";

export type ServiceItem = {
  id: ID;
  code: string;
  name: string;
  category: ServiceCategory;
  unitPrice: Money;
  hours?: number;
  warrantyFree?: boolean;
  description?: string;
};

export type StoreCode = "tpe-flagship" | "tpe-neihu" | "nhs" | "txg" | "khh";

export type Store = {
  code: StoreCode;
  name: string;
  shortName: string;
  city: string;
  region: "north" | "central" | "south";
};

export type InventoryRow = {
  store: StoreCode;
  sku: ID;
  stock: number;
  reserved: number;
  avgDailySales: number;
  lastReceivedAt?: string;
};

export type FeeCategory = "license" | "tax" | "insurance" | "ticket" | "other";

export type Fee = {
  id: ID;
  name: string;
  category: FeeCategory;
  amount: Money;
  taxable: boolean;
  description?: string;
};

export type PaymentMethod = "card" | "linepay" | "applepay" | "cash" | "check";

export type Payment = {
  id: ID;
  method: PaymentMethod;
  amount: Money;
  timestamp: string;
  cardLast4?: string;
  cardBrand?: "VISA" | "MASTER" | "JCB" | "AMEX";
  linePayOrderNo?: string;
  checkNumber?: string;
  checkBank?: string;
  checkDate?: string;
  received?: Money;
  change?: Money;
};

export type LineType =
  | "vehicle"
  | "service-labor"
  | "service-parts"
  | "accessory"
  | "fee"
  | "package-card"
  | "package-use";

export type LineItem = {
  id: ID;
  type: LineType;
  refId?: ID;
  name: string;
  quantity: number;
  unitPrice: Money;
  discount?: Money;
  subtotal: Money;
  taxable: boolean;
  note?: string;
  meta?: Record<string, unknown>;
};

export type CheckoutMode = "vehicle" | "service" | "retail";

export type Cart = {
  mode: CheckoutMode;
  lines: LineItem[];
  customerId?: ID;
  fees: LineItem[];
  payments: Payment[];
  note?: string;
  warrantyApplied?: boolean;
};

export type TransactionStatus = "completed" | "refunded" | "partial-refunded" | "voided";

export type Transaction = {
  id: ID;
  code: string;
  mode: CheckoutMode;
  customerId?: ID;
  store: StoreCode;
  clerk: string;
  date: string;
  lines: LineItem[];
  fees: LineItem[];
  payments: Payment[];
  subtotal: Money;
  taxAmount: Money;
  feeTotal: Money;
  total: Money;
  invoiceNo?: string;
  receiptNo?: string;
  status: TransactionStatus;
  cost?: Money;
  margin?: Money;
};

export type PackageCardType = "maintenance-9" | "wash-20" | "tire-unlimited" | "inspection-5";

export type PackageCardTemplate = {
  type: PackageCardType;
  name: string;
  icon: string;
  totalUses: number | "unlimited";
  price: Money;
  retailEquivalent: Money;
  validMonths: number;
  description: string;
  tagline: string;
};

export type PackageCard = {
  id: ID;
  code: string;
  type: PackageCardType;
  customerId: ID;
  purchaseDate: string;
  expiryDate: string;
  remainingUses: number | "unlimited";
  usages: {
    date: string;
    technician: string;
    item: string;
    transactionId?: ID;
  }[];
};

export type TransferStatus = "draft" | "dispatched" | "in-transit" | "received" | "cancelled";

export type TransferOrder = {
  id: ID;
  code: string;
  from: StoreCode;
  to: StoreCode;
  createdAt: string;
  dispatchedAt?: string;
  receivedAt?: string;
  status: TransferStatus;
  lines: { sku: ID; quantity: number; skuName: string }[];
  requester: string;
  driver?: string;
  vehiclePlate?: string;
  reason?: string;
};

export type Shift = {
  id: ID;
  staff: string;
  store: StoreCode;
  startedAt: string;
  endedAt?: string;
  openingCash: Money;
  closingCash?: Money;
  transactionCount: number;
  cashIn: Money;
  cashOut: Money;
  expectedCash: Money;
  actualCash?: Money;
  discrepancy?: Money;
  note?: string;
};

export type CashDrawerEvent = {
  id: ID;
  store: StoreCode;
  staff: string;
  timestamp: string;
  reason: "sale" | "change" | "refund" | "manual" | "shift-open" | "shift-close";
  amountDelta: Money;
  transactionId?: ID;
  note?: string;
  suspicious?: boolean;
};

export type AiRecommendation = {
  id: ID;
  customerId: ID;
  kind: "accessory" | "service" | "finance" | "package-card" | "insurance";
  refId: ID;
  refName: string;
  refPrice: Money;
  reason: string;
  confidence: number;
  savings?: Money;
};
