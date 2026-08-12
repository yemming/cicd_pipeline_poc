import type { BrandConfig } from "./types";

export const lambrettaHdsBrand: BrandConfig = {
  key: "lambretta-hds",
  displayName: "Lambretta（海德生總代理）",
  shortName: "Lambretta × 海德生",
  loginTitle: "Lambretta 台灣總代理智慧營運平台",
  primaryColor: "#0056A3",
  primaryColorDark: "#003D75",
  searchPlaceholder: "搜尋客戶、供應商、物料、單據...",
  hqDmsLabel: "海德生 HQ DMS",
  webhookHost: "api.dealeros.lambretta-hds.tw",
  ecpayDefaults: {
    senderName: "海德生貿易",
    senderPhone: "0227122211",
    senderZip: "10491",
    senderAddress: "台北市中山區中山北路二段100號",
    invoiceRemark: "Lambretta Taiwan (海德生)",
  },
};
