export type BrandKey = "ducati" | "indian";

export type BrandConfig = {
  key: BrandKey;

  /** 完整品牌名（出現在 footer、頁面標題） */
  displayName: string;

  /** 品牌副標（topbar logo 下方那行 small caps） */
  shortName: string;

  /** Login / metadata 用的長標題 */
  loginTitle: string;

  /** 主色 hex（#RRGGBB） */
  primaryColor: string;

  /** 主色 hover/active 較深版本（hex） */
  primaryColorDark: string;

  /** topbar 搜尋框 placeholder */
  searchPlaceholder: string;

  /** 跟總部 DMS 整合的顯示名稱（settings/api 頁面用） */
  hqDmsLabel: string;

  /** webhook 範例的 host（settings/api 頁面 mock 用） */
  webhookHost: string;

  /** ECPay 物流 / 發票寄件預設值；env var 仍可 override */
  ecpayDefaults: {
    senderName: string;
    senderPhone: string;
    senderZip: string;
    senderAddress: string;
    invoiceRemark: string;
  };
};
