import type { ServiceItem, Fee } from "./pos-types";

export const laborRate = 1800;

export const serviceItems: ServiceItem[] = [
  { id: "sv001", code: "L-OIL", name: "引擎機油更換工資", category: "labor", unitPrice: 1800, hours: 0.5, warrantyFree: true, description: "含廢油處理" },
  { id: "sv002", code: "L-CHAIN", name: "鏈條保養工資", category: "labor", unitPrice: 1800, hours: 0.5, warrantyFree: true },
  { id: "sv003", code: "L-BRAKE", name: "煞車來令更換工資", category: "labor", unitPrice: 2700, hours: 0.75, warrantyFree: true },
  { id: "sv004", code: "L-TIRE", name: "輪胎更換工資 (單輪)", category: "labor", unitPrice: 1800, hours: 0.5, warrantyFree: true },
  { id: "sv005", code: "L-SUSP", name: "避震設定調校", category: "labor", unitPrice: 4500, hours: 1.5, description: "賽道前建議" },
  { id: "sv006", code: "L-VALVE", name: "氣門間隙檢修", category: "labor", unitPrice: 18000, hours: 6, description: "30,000km 必做" },
  { id: "sv007", code: "L-INSP", name: "1000km 首次保養", category: "labor", unitPrice: 3600, hours: 1, warrantyFree: true, description: "含全車檢查" },
  { id: "sv008", code: "L-INSP-LG", name: "大保養 (15,000km)", category: "labor", unitPrice: 9000, hours: 3 },
  { id: "sv009", code: "L-ECU", name: "ECU 重新刷寫", category: "labor", unitPrice: 6000, hours: 1.5 },
  { id: "sv010", code: "L-DIAG", name: "故障診斷檢測", category: "labor", unitPrice: 1800, hours: 0.5, warrantyFree: true },

  { id: "sv011", code: "P-OIL-BASIC", name: "原廠機油 10W-60 套餐 (4L)", category: "parts", unitPrice: 3400 },
  { id: "sv012", code: "P-FILTER", name: "原廠機油濾芯", category: "parts", unitPrice: 680 },
  { id: "sv013", code: "P-AIR", name: "空氣濾芯", category: "parts", unitPrice: 1200 },
  { id: "sv014", code: "P-COOLANT", name: "冷卻液 (2L 套餐)", category: "parts", unitPrice: 680 },
  { id: "sv015", code: "P-BRAKE-OE", name: "原廠煞車來令 (前+後)", category: "parts", unitPrice: 5800 },
];

export const defaultFees: Fee[] = [
  {
    id: "f001",
    name: "新車牌照登記費",
    category: "license",
    amount: 450,
    taxable: false,
    description: "行照+牌照費用",
  },
  {
    id: "f002",
    name: "汽燃費 (1 年)",
    category: "tax",
    amount: 4800,
    taxable: false,
    description: "依排氣量計算",
  },
  {
    id: "f003",
    name: "強制險 (1 年)",
    category: "insurance",
    amount: 1420,
    taxable: true,
    description: "法定強制責任險",
  },
  {
    id: "f004",
    name: "任意險 (第三人+超額+駕乘)",
    category: "insurance",
    amount: 8800,
    taxable: true,
    description: "建議投保",
  },
  {
    id: "f005",
    name: "領牌代辦服務費",
    category: "other",
    amount: 1500,
    taxable: true,
    description: "代辦費用發票",
  },
  {
    id: "f006",
    name: "車主 APP 註冊費",
    category: "other",
    amount: 0,
    taxable: false,
    description: "免費贈送",
  },
  {
    id: "f007",
    name: "防竊險 (1 年)",
    category: "insurance",
    amount: 3600,
    taxable: true,
    description: "選配",
  },
  {
    id: "f008",
    name: "車貸手續費",
    category: "other",
    amount: 3000,
    taxable: true,
    description: "金融服務代辦",
  },
];

export function getServiceItem(id: string): ServiceItem | undefined {
  return serviceItems.find((s) => s.id === id);
}
