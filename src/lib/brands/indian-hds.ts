import type { BrandConfig } from "./types";

export const indianHdsBrand: BrandConfig = {
  key: "indian-hds",
  displayName: "Indian Motorcycle（海德生總代理）",
  shortName: "Indian × 海德生",
  loginTitle: "Indian Motorcycle 台灣總代理智慧營運平台",
  primaryColor: "#C8102E",
  primaryColorDark: "#9C0C24",
  searchPlaceholder: "搜尋客戶、供應商、物料、單據...",
  hqDmsLabel: "海德生 HQ DMS",
  webhookHost: "api.dealeros.indian-hds.tw",
  ecpayDefaults: {
    senderName: "海德生貿易",
    senderPhone: "0227122211",
    senderZip: "10491",
    senderAddress: "台北市中山區中山北路二段100號",
    invoiceRemark: "Indian Motorcycle Taiwan (海德生)",
  },
};
