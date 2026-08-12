import type { BrandConfig } from "./types";

export const polarisHdsBrand: BrandConfig = {
  key: "polaris-hds",
  displayName: "Polaris（海德生總代理）",
  shortName: "Polaris × 海德生",
  loginTitle: "Polaris 台灣總代理智慧營運平台",
  primaryColor: "#E4002B",
  primaryColorDark: "#B10021",
  searchPlaceholder: "搜尋客戶、供應商、物料、單據...",
  hqDmsLabel: "海德生 HQ DMS",
  webhookHost: "api.dealeros.polaris-hds.tw",
  ecpayDefaults: {
    senderName: "海德生貿易",
    senderPhone: "0227122211",
    senderZip: "10491",
    senderAddress: "台北市中山區中山北路二段100號",
    invoiceRemark: "Polaris Taiwan (海德生)",
  },
};
