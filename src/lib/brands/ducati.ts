import type { BrandConfig } from "./types";

export const ducatiBrand: BrandConfig = {
  key: "ducati",
  displayName: "Ducati Taipei",
  shortName: "Ducati Edition",
  loginTitle: "Ducati 重機經銷商智慧營運平台",
  primaryColor: "#CC0000",
  primaryColorDark: "#A80000",
  searchPlaceholder: "搜尋客戶、訂單、車輛...",
  hqDmsLabel: "Ducati HQ DMS",
  webhookHost: "api.dealeros.ducati.tw",
  ecpayDefaults: {
    senderName: "杜卡迪台北",
    senderPhone: "0227122211",
    senderZip: "10491",
    senderAddress: "台北市中山區中山北路二段100號",
    invoiceRemark: "Ducati Taipei POS",
  },
};
