// 金流 Provider 抽象介面（P2 骨架）
//
// 設計目的：未來把多個金流通路（ECPay AIO / 站內付 2.0 / 信用卡幕後 / POS 刷卡機 / 現金 / 銀行轉帳）
// 都包成同一個 interface，caller（POS / 維修工單 / 線上訂單）只認 PaymentProvider，
// 切換通路或新增 provider 不需要改 caller。
//
// 目前狀態：interface 定義完成，**尚無 provider 實作**。
// 既有 `src/lib/pos/ecpay-aio.ts`（LINE Pay）仍直接被 POS 使用，
// 等 P2 把 ecpayAioProvider 包出來後才會切到 registry。

export type PaymentProviderCode =
  | "ecpay_aio"          // 全方位金流（信用卡 / LINE Pay / TWQR / ATM / 超商代碼/條碼）
  | "ecpay_ecpg"         // 站內付 2.0（前後端分離適用）
  | "ecpay_backend"      // 信用卡幕後授權 / 非信用卡幕後取號
  | "ecpay_pos_terminal" // 實體 POS 刷卡機
  | "cash"               // 現金（無 provider，純記帳）
  | "bank_transfer";     // 銀行轉帳（無 provider，需人工對帳）

export type PaymentMethodCode =
  | "credit"             // 信用卡一次付清
  | "credit_3"           // 信用卡 3 期
  | "credit_6"
  | "credit_12"
  | "credit_24"
  | "line_pay"
  | "twqr"
  | "atm"
  | "cvs_code"           // 超商代碼
  | "barcode"            // 超商條碼
  | "apple_pay"
  | "bnpl"               // 先買後付
  | "wechat"
  | "cash"
  | "bank_transfer";

export type PaymentOrderInput = {
  tradeNo: string;                       // 唯一訂單編號（業務系統生）
  totalAmount: number;                   // TWD 整數
  itemName: string;                      // 商品摘要（< 200 chars）
  paymentMethod: PaymentMethodCode;
  customerEmail?: string;
  returnUrl?: string;                    // server callback (S2S)
  clientReturnUrl?: string;              // 消費者付完跳回頁
  remark?: string;
  // 信用卡分期（method=credit_3/6/12/24 時 ChoosePayment 自動帶）
  installments?: 3 | 6 | 12 | 24;
  // 物流關聯（金流成功後觸發物流；optional）
  shipmentRef?: string;
};

export type PaymentOrderResult =
  | {
      ok: true;
      // 付款方式不同回傳結構不同：
      // - 跳轉付款（信用卡 / LINE Pay / TWQR）：redirectUrl + formParams
      // - 取號付款（ATM / 超商）：tradeNo + paymentInfo（虛擬帳號 / 超商代碼）
      // - 同步完成（現金）：fully completed
      kind: "redirect" | "form_post" | "payment_info" | "completed";
      redirectUrl?: string;
      formParams?: Record<string, string>;
      paymentInfo?: {
        bankCode?: string;
        virtualAccount?: string;
        cvsCode?: string;
        barcode1?: string;
        barcode2?: string;
        barcode3?: string;
        expireAt?: string;
      };
    }
  | { ok: false; error: string };

export type PaymentStatus = {
  tradeNo: string;
  status: "pending" | "paid" | "failed" | "expired" | "cancelled" | "refunded";
  paidAt?: string;
  paidAmount?: number;
  ecpayTradeNo?: string;
  paymentMethod?: PaymentMethodCode;
  raw?: Record<string, unknown>;
};

export type RefundInput = {
  tradeNo: string;
  amount: number;
  reason?: string;
  // 信用卡 DoAction：R=退款（已請款）/ N=取消授權（未請款）/ E=請款 / C=取消請款
  action?: "R" | "N" | "E" | "C";
};

export type RefundResult =
  | { ok: true; refundedAmount: number; refundedAt: string }
  | { ok: false; error: string };

export interface PaymentProvider {
  readonly code: PaymentProviderCode;
  readonly displayName: string;
  /** 此 provider 支援的付款方式 */
  readonly supportedMethods: PaymentMethodCode[];

  /** 建立金流訂單。觸發路徑依 method 不同：跳轉、表單、取號、或直接完成 */
  createOrder(input: PaymentOrderInput): Promise<PaymentOrderResult>;
  /** 主動查詢交易狀態（也可等 callback；callback 不可靠時用） */
  queryStatus(tradeNo: string): Promise<PaymentStatus>;
  /** 退款 / 取消授權（僅信用卡類；ATM / 超商不支援 API 退款） */
  refund?(input: RefundInput): Promise<RefundResult>;
}
