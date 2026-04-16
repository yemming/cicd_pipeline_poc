import type { PackageCard, PackageCardTemplate } from "./pos-types";

export const packageTemplates: PackageCardTemplate[] = [
  {
    type: "maintenance-9",
    name: "9 次保養套餐卡",
    icon: "build_circle",
    totalUses: 9,
    price: 24000,
    retailEquivalent: 32400,
    validMonths: 36,
    tagline: "三年無憂保養",
    description: "含 9 次基礎保養（機油+濾芯+檢查），預付享 7.4 折",
  },
  {
    type: "wash-20",
    name: "20 次專業洗車卡",
    icon: "local_car_wash",
    totalUses: 20,
    price: 6000,
    retailEquivalent: 10000,
    validMonths: 12,
    tagline: "每月讓愛車閃亮",
    description: "含 20 次手工蠟洗，限本店使用",
  },
  {
    type: "tire-unlimited",
    name: "胎壓無限檢查卡",
    icon: "tire_repair",
    totalUses: "unlimited",
    price: 2000,
    retailEquivalent: 6000,
    validMonths: 12,
    tagline: "隨到隨檢",
    description: "一年內不限次胎壓檢查，含氮氣補充",
  },
  {
    type: "inspection-5",
    name: "5 次賽道前檢查",
    icon: "speed",
    totalUses: 5,
    price: 12000,
    retailEquivalent: 18000,
    validMonths: 24,
    tagline: "賽道前全車健檢",
    description: "含煞車、懸吊、胎壓、鏈條、電系 5 項檢查",
  },
];

export function getPackageTemplate(type: string): PackageCardTemplate | undefined {
  return packageTemplates.find((p) => p.type === type);
}

export const packageCards: PackageCard[] = [
  {
    id: "pkg001",
    code: "PKG-M-0001",
    type: "maintenance-9",
    customerId: "c001",
    purchaseDate: "2024-08-15",
    expiryDate: "2027-08-15",
    remainingUses: 4,
    usages: [
      { date: "2024-11-02", technician: "張志豪", item: "1000km 首次保養", transactionId: "tx-s-5" },
      { date: "2025-02-18", technician: "李宛真", item: "機油更換 + 濾芯", transactionId: "tx-s-12" },
      { date: "2025-06-10", technician: "張志豪", item: "機油更換 + 煞車檢查", transactionId: "tx-s-28" },
      { date: "2025-10-04", technician: "林俊宏", item: "大保養 (15,000km)", transactionId: "tx-s-45" },
      { date: "2026-02-21", technician: "張志豪", item: "機油更換 + 鏈條調整", transactionId: "tx-s-78" },
    ],
  },
  {
    id: "pkg002",
    code: "PKG-W-0004",
    type: "wash-20",
    customerId: "c001",
    purchaseDate: "2025-06-12",
    expiryDate: "2026-06-12",
    remainingUses: 8,
    usages: Array.from({ length: 12 }, (_, i) => ({
      date: new Date(2025, 5, 20 + i * 22).toISOString().slice(0, 10),
      technician: i % 2 === 0 ? "陳美珊" : "鄭詩涵",
      item: "手工蠟洗 + 內裝整理",
    })),
  },
  {
    id: "pkg003",
    code: "PKG-M-0002",
    type: "maintenance-9",
    customerId: "c006",
    purchaseDate: "2023-05-08",
    expiryDate: "2026-05-08",
    remainingUses: 1,
    usages: Array.from({ length: 8 }, (_, i) => ({
      date: new Date(2023, 7 + i * 3, 10).toISOString().slice(0, 10),
      technician: i % 3 === 0 ? "張志豪" : i % 3 === 1 ? "李宛真" : "林俊宏",
      item: i === 7 ? "大保養 (15,000km)" : "機油更換 + 濾芯",
    })),
  },
  {
    id: "pkg004",
    code: "PKG-T-0001",
    type: "tire-unlimited",
    customerId: "c012",
    purchaseDate: "2025-09-22",
    expiryDate: "2026-09-22",
    remainingUses: "unlimited",
    usages: Array.from({ length: 6 }, (_, i) => ({
      date: new Date(2025, 9 + i, 5).toISOString().slice(0, 10),
      technician: "張志豪",
      item: "胎壓檢查 + 氮氣補充",
    })),
  },
  {
    id: "pkg005",
    code: "PKG-I-0001",
    type: "inspection-5",
    customerId: "c025",
    purchaseDate: "2025-03-15",
    expiryDate: "2027-03-15",
    remainingUses: 2,
    usages: [
      { date: "2025-04-22", technician: "王雅雯", item: "賽道前全車健檢 (麗寶)" },
      { date: "2025-09-12", technician: "張志豪", item: "賽道前全車健檢 (大鵬灣)" },
      { date: "2026-03-08", technician: "李宛真", item: "賽道前全車健檢 (麗寶)" },
    ],
  },
  {
    id: "pkg006",
    code: "PKG-M-0003",
    type: "maintenance-9",
    customerId: "c002",
    purchaseDate: "2025-08-20",
    expiryDate: "2028-08-20",
    remainingUses: 7,
    usages: [
      { date: "2025-11-15", technician: "林俊宏", item: "1000km 首次保養" },
      { date: "2026-03-28", technician: "張志豪", item: "機油更換 + 濾芯" },
    ],
  },
  {
    id: "pkg007",
    code: "PKG-W-0008",
    type: "wash-20",
    customerId: "c004",
    purchaseDate: "2025-11-05",
    expiryDate: "2026-11-05",
    remainingUses: 15,
    usages: Array.from({ length: 5 }, (_, i) => ({
      date: new Date(2025, 10 + i, 12).toISOString().slice(0, 10),
      technician: "陳美珊",
      item: "手工蠟洗",
    })),
  },
  {
    id: "pkg008",
    code: "PKG-M-0004",
    type: "maintenance-9",
    customerId: "c018",
    purchaseDate: "2025-01-08",
    expiryDate: "2028-01-08",
    remainingUses: 5,
    usages: Array.from({ length: 4 }, (_, i) => ({
      date: new Date(2025, 2 + i * 3, 18).toISOString().slice(0, 10),
      technician: i % 2 === 0 ? "王雅雯" : "張志豪",
      item: i === 3 ? "大保養 (15,000km)" : "機油更換 + 煞車檢查",
    })),
  },
];

export function cardsByCustomer(customerId: string): PackageCard[] {
  return packageCards.filter((c) => c.customerId === customerId);
}
