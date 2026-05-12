import type { BrandConfig } from "./types";

export const indianBrand: BrandConfig = {
  key: "indian",
  displayName: "Indian Motorcycle Taiwan",
  shortName: "Indian Edition",
  loginTitle: "Indian Motorcycle 經銷商智慧營運平台",
  primaryColor: "#C8102E",
  primaryColorDark: "#9C0C24",
  searchPlaceholder: "搜尋客戶、供應商、物料、單據...",
  hqDmsLabel: "Indian HQ DMS",
  webhookHost: "api.dealeros.indian.tw",
  ecpayDefaults: {
    senderName: "印第安機車台北",
    senderPhone: "0227122211",
    senderZip: "10491",
    senderAddress: "台北市中山區中山北路二段100號",
    invoiceRemark: "Indian Motorcycle Taipei POS",
  },
};
