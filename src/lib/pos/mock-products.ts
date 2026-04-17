import type { Product } from "./types";

export const MOCK_PRODUCTS: Product[] = [
  // 精品
  { id: "p01", sku: "DC-HLM-V4",  name: "Ducati 原廠碳纖維安全帽 V4",  category: "精品", unitPrice: 32800, stockQty: 4,  lowStockAt: 2, barcode: "4710000000001" },
  { id: "p02", sku: "DC-JKT-RED", name: "Ducati Corse 皮衣（紅）",       category: "精品", unitPrice: 24500, stockQty: 6,  lowStockAt: 3, barcode: "4710000000002" },
  { id: "p03", sku: "DC-GLV-PRO", name: "Ducati 賽道皮手套",             category: "精品", unitPrice: 4800,  stockQty: 12, lowStockAt: 5, barcode: "4710000000003" },
  { id: "p04", sku: "DC-BAG-TRK", name: "Ducati 油箱包（磁吸）",          category: "精品", unitPrice: 6200,  stockQty: 8,  lowStockAt: 3, barcode: "4710000000004" },
  { id: "p05", sku: "DC-KEY-V4",  name: "Ducati 鑰匙圈 V4 紅",            category: "精品", unitPrice: 880,   stockQty: 40, lowStockAt: 10, barcode: "4710000000005" },

  // 零件
  { id: "p10", sku: "PT-BRK-PAD", name: "Brembo 煞車皮（M50 對應）",     category: "零件", unitPrice: 3200,  stockQty: 20, lowStockAt: 8, barcode: "4710000000010" },
  { id: "p11", sku: "PT-CHN-DID", name: "DID ZVM-X 鏈條 525/112L",        category: "零件", unitPrice: 5800,  stockQty: 10, lowStockAt: 4, barcode: "4710000000011" },
  { id: "p12", sku: "PT-SPG-OHL", name: "Öhlins 前叉彈簧（Panigale）",    category: "零件", unitPrice: 9500,  stockQty: 3,  lowStockAt: 2, barcode: "4710000000012" },
  { id: "p13", sku: "PT-FIL-AIR", name: "Sprint Filter 高流量空濾",       category: "零件", unitPrice: 2400,  stockQty: 18, lowStockAt: 6, barcode: "4710000000013" },
  { id: "p14", sku: "PT-EXH-SC",  name: "SC-Project 尾段排氣（短管）",    category: "零件", unitPrice: 48000, stockQty: 2,  lowStockAt: 1, barcode: "4710000000014" },

  // 耗材
  { id: "p20", sku: "CM-OIL-10W", name: "Shell Advance 4T 10W-60 1L",    category: "耗材", unitPrice: 680,   stockQty: 48, lowStockAt: 20, barcode: "4710000000020" },
  { id: "p21", sku: "CM-CLN-CHN", name: "Motul 鏈條清潔劑 400ml",         category: "耗材", unitPrice: 420,   stockQty: 30, lowStockAt: 10, barcode: "4710000000021" },
  { id: "p22", sku: "CM-LUB-CHN", name: "Motul 鏈條潤滑劑 400ml",         category: "耗材", unitPrice: 480,   stockQty: 28, lowStockAt: 10, barcode: "4710000000022" },
  { id: "p23", sku: "CM-CLN-TYR", name: "S100 白蓮花洗車劑",              category: "耗材", unitPrice: 680,   stockQty: 15, lowStockAt: 5, barcode: "4710000000023" },
  { id: "p24", sku: "CM-TWL-MCR", name: "超纖維擦車毛巾（5 入）",          category: "耗材", unitPrice: 320,   stockQty: 60, lowStockAt: 20, barcode: "4710000000024" },
];
