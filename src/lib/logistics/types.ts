// 物流 Provider 抽象介面（P3 骨架）
//
// 設計目的：未來把多個物流通路（黑貓宅配 / 7-11 / 全家 / 跨境 / 自取 / 自家車隊）
// 都包成同一個 interface，caller 只認 LogisticsProvider，
// 切換通路或新增 provider 不需要改 caller。
//
// 目前狀態：interface 定義完成，**尚無 provider 實作**。
// 既有 `src/lib/pos/ecpay-logistics.ts`（黑貓 HOME）仍直接被 POS 使用，
// 等 P3 包 ecpayHomeProvider 出來後才會切到 registry。

export type LogisticsProviderCode =
  | "ecpay_home"        // 黑貓宅急便（國內 HOME）
  | "ecpay_cvs"         // 超商取貨（7-11 / 全家 / 萊爾富 / OK）
  | "ecpay_crossborder" // 跨境物流
  | "self_pickup"       // 客戶自取（無實際物流，純記錄）
  | "internal_fleet";   // 自家車隊（重機交車到府）

export type LogisticsType =
  | "HOME"              // 宅配
  | "CVS"               // 超商取貨
  | "CVS_PAY"           // 超商取貨付款（COD）
  | "CROSSBORDER"
  | "PICKUP"
  | "FLEET";

export type LogisticsSubType =
  | "TCAT"              // 黑貓宅配
  | "ECAN"              // 宅配通
  | "POST"              // 中華郵政
  | "UNIMARTC2C"        // 7-11 C2C
  | "FAMIC2C"           // 全家 C2C
  | "HILIFEC2C"         // 萊爾富 C2C
  | "OKMARTC2C";        // OK C2C

export type ShipmentInput = {
  merchantTradeNo: string;            // 業務系統訂單編號
  logisticsType: LogisticsType;
  logisticsSubType?: LogisticsSubType;
  goodsAmount?: number;               // 商品總價（COD 時必填）
  goodsName: string;
  // 寄件人（從 brand.ecpayDefaults 預填）
  senderName: string;
  senderPhone: string;
  senderZipCode?: string;
  senderAddress?: string;
  // 收件人
  receiverName: string;
  receiverPhone: string;
  receiverEmail?: string;
  receiverZipCode?: string;
  receiverAddress?: string;
  // CVS 取貨用
  receiverStoreId?: string;           // 超商門市代號
  // 配送選項
  scheduledPickupTime?: "1" | "2" | "3" | "4"; // 1=不指定 2=13前 3=14-18 4=不限
  remark?: string;
  serverReplyURL?: string;
  // 關聯（哪一張發票 / 訂單）
  einvoiceId?: string;
};

export type ShipmentResult =
  | {
      ok: true;
      allPayLogisticsId: string;      // 綠界物流訂單編號
      paymentNo?: string;             // CVS 取貨付款用編碼
      validationNo?: string;          // 驗證碼
      tradeNo: string;
      cvsPaymentNo?: string;
      bookingNote?: string;           // 寄貨編號（拿去交給司機 / 投遞超商）
    }
  | { ok: false; error: string };

export type ShipmentStatus = {
  allPayLogisticsId: string;
  status: "pending" | "in_transit" | "delivered" | "returned" | "cancelled" | "exception";
  statusCode?: string;                // 綠界物流狀態碼（300+ 種）
  statusMsg?: string;
  updatedAt?: string;
  raw?: Record<string, unknown>;
};

export type CancelResult =
  | { ok: true; cancelledAt: string }
  | { ok: false; error: string };

export interface LogisticsProvider {
  readonly code: LogisticsProviderCode;
  readonly displayName: string;
  readonly supportedTypes: LogisticsType[];

  /** 建立物流訂單，回傳綠界 allPayLogisticsId（後續查詢 / 取消用） */
  createShipment(input: ShipmentInput): Promise<ShipmentResult>;
  /** 主動查詢物流狀態（也可等 webhook） */
  queryStatus(allPayLogisticsId: string): Promise<ShipmentStatus>;
  /** 取消物流（僅 pending 狀態可取消；in_transit 後需聯繫物流商） */
  cancel?(allPayLogisticsId: string): Promise<CancelResult>;
  /** 列印託運單（部分通路支援） */
  printLabel?(allPayLogisticsId: string): Promise<{ ok: true; pdfUrl: string } | { ok: false; error: string }>;
}
