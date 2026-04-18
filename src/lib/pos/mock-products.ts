import type { Product } from "./types";

export const MOCK_PRODUCTS: Product[] = [
  // ────────────────────────────────
  // 新車（現車銷售）
  // ────────────────────────────────
  { id: "n01", sku: "DC-MC-PANV4S",   name: "Ducati Panigale V4 S",            category: "新車", unitPrice: 1828000, stockQty: 2, lowStockAt: 1, barcode: "4710000001001" },
  { id: "n02", sku: "DC-MC-PANV2S",   name: "Ducati Panigale V2 S",            category: "新車", unitPrice: 1128000, stockQty: 3, lowStockAt: 1, barcode: "4710000001002" },
  { id: "n03", sku: "DC-MC-SFV4S",    name: "Ducati Streetfighter V4 S",       category: "新車", unitPrice: 1468000, stockQty: 2, lowStockAt: 1, barcode: "4710000001003" },
  { id: "n04", sku: "DC-MC-SFV2",     name: "Ducati Streetfighter V2",         category: "新車", unitPrice: 1098000, stockQty: 4, lowStockAt: 1, barcode: "4710000001004" },
  { id: "n05", sku: "DC-MC-MTS-V4S",  name: "Ducati Multistrada V4 S",         category: "新車", unitPrice: 1658000, stockQty: 3, lowStockAt: 1, barcode: "4710000001005" },
  { id: "n06", sku: "DC-MC-MTS-V2S",  name: "Ducati Multistrada V2 S",         category: "新車", unitPrice: 1038000, stockQty: 4, lowStockAt: 2, barcode: "4710000001006" },
  { id: "n07", sku: "DC-MC-MON",      name: "Ducati Monster",                  category: "新車", unitPrice: 748000,  stockQty: 5, lowStockAt: 2, barcode: "4710000001007" },
  { id: "n08", sku: "DC-MC-MON-SP",   name: "Ducati Monster SP",               category: "新車", unitPrice: 898000,  stockQty: 2, lowStockAt: 1, barcode: "4710000001008" },
  { id: "n09", sku: "DC-MC-HYP950",   name: "Ducati Hypermotard 950",          category: "新車", unitPrice: 888000,  stockQty: 3, lowStockAt: 1, barcode: "4710000001009" },
  { id: "n10", sku: "DC-MC-HYP698",   name: "Ducati Hypermotard 698 Mono RVE", category: "新車", unitPrice: 818000,  stockQty: 2, lowStockAt: 1, barcode: "4710000001010" },
  { id: "n11", sku: "DC-MC-SS950S",   name: "Ducati SuperSport 950 S",         category: "新車", unitPrice: 1058000, stockQty: 2, lowStockAt: 1, barcode: "4710000001011" },
  { id: "n12", sku: "DC-MC-DSX",      name: "Ducati DesertX",                  category: "新車", unitPrice: 1078000, stockQty: 3, lowStockAt: 1, barcode: "4710000001012" },

  // ────────────────────────────────
  // 精品
  // ────────────────────────────────
  { id: "p01", sku: "DC-HLM-V4",  name: "Ducati 原廠碳纖維安全帽 V4",  category: "精品", unitPrice: 32800, stockQty: 4,  lowStockAt: 2, barcode: "4710000000001" },
  { id: "p02", sku: "DC-JKT-RED", name: "Ducati Corse 皮衣（紅）",       category: "精品", unitPrice: 24500, stockQty: 6,  lowStockAt: 3, barcode: "4710000000002" },
  { id: "p03", sku: "DC-GLV-PRO", name: "Ducati 賽道皮手套",             category: "精品", unitPrice: 4800,  stockQty: 12, lowStockAt: 5, barcode: "4710000000003" },
  { id: "p04", sku: "DC-BAG-TRK", name: "Ducati 油箱包（磁吸）",          category: "精品", unitPrice: 6200,  stockQty: 8,  lowStockAt: 3, barcode: "4710000000004" },
  { id: "p05", sku: "DC-KEY-V4",  name: "Ducati 鑰匙圈 V4 紅",            category: "精品", unitPrice: 880,   stockQty: 40, lowStockAt: 10, barcode: "4710000000005" },

  // ────────────────────────────────
  // 零件
  // ────────────────────────────────
  { id: "p10", sku: "PT-BRK-PAD", name: "Brembo 煞車皮（M50 對應）",     category: "零件", unitPrice: 3200,  stockQty: 20, lowStockAt: 8, barcode: "4710000000010" },
  { id: "p11", sku: "PT-CHN-DID", name: "DID ZVM-X 鏈條 525/112L",        category: "零件", unitPrice: 5800,  stockQty: 10, lowStockAt: 4, barcode: "4710000000011" },
  { id: "p12", sku: "PT-SPG-OHL", name: "Öhlins 前叉彈簧（Panigale）",    category: "零件", unitPrice: 9500,  stockQty: 3,  lowStockAt: 2, barcode: "4710000000012" },
  { id: "p13", sku: "PT-FIL-AIR", name: "Sprint Filter 高流量空濾",       category: "零件", unitPrice: 2400,  stockQty: 18, lowStockAt: 6, barcode: "4710000000013" },
  { id: "p14", sku: "PT-EXH-SC",  name: "SC-Project 尾段排氣（短管）",    category: "零件", unitPrice: 48000, stockQty: 2,  lowStockAt: 1, barcode: "4710000000014" },

  // ────────────────────────────────
  // 耗材
  // ────────────────────────────────
  { id: "p20", sku: "CM-OIL-10W", name: "Shell Advance 4T 10W-60 1L",    category: "耗材", unitPrice: 680,   stockQty: 48, lowStockAt: 20, barcode: "4710000000020" },
  { id: "p21", sku: "CM-CLN-CHN", name: "Motul 鏈條清潔劑 400ml",         category: "耗材", unitPrice: 420,   stockQty: 30, lowStockAt: 10, barcode: "4710000000021" },
  { id: "p22", sku: "CM-LUB-CHN", name: "Motul 鏈條潤滑劑 400ml",         category: "耗材", unitPrice: 480,   stockQty: 28, lowStockAt: 10, barcode: "4710000000022" },
  { id: "p23", sku: "CM-CLN-TYR", name: "S100 白蓮花洗車劑",              category: "耗材", unitPrice: 680,   stockQty: 15, lowStockAt: 5, barcode: "4710000000023" },
  { id: "p24", sku: "CM-TWL-MCR", name: "超纖維擦車毛巾（5 入）",          category: "耗材", unitPrice: 320,   stockQty: 60, lowStockAt: 20, barcode: "4710000000024" },

  // ────────────────────────────────
  // 服務（維修・美容，工資/工時單）
  // ────────────────────────────────
  // 定期保養
  { id: "sv01", sku: "MN-BASIC",    name: "基礎保養（換機油 + 機油芯）",      category: "服務", unitPrice: 2800,  stockQty: 999, lowStockAt: 0 },
  { id: "sv02", sku: "MN-FULL",     name: "大保養（5,000 km）",               category: "服務", unitPrice: 8800,  stockQty: 999, lowStockAt: 0 },
  { id: "sv03", sku: "MN-VALVE",    name: "汽門間隙調整（Desmo 服務）",       category: "服務", unitPrice: 28000, stockQty: 999, lowStockAt: 0 },
  // 煞車/鏈條/輪胎
  { id: "sv10", sku: "RP-BRK-OIL",  name: "煞車油更換（前後）",                category: "服務", unitPrice: 1600,  stockQty: 999, lowStockAt: 0 },
  { id: "sv11", sku: "RP-BRK-PAD",  name: "煞車皮更換工資（前後）",            category: "服務", unitPrice: 1200,  stockQty: 999, lowStockAt: 0 },
  { id: "sv12", sku: "RP-CHN-ADJ",  name: "鏈條清潔調整",                      category: "服務", unitPrice: 800,   stockQty: 999, lowStockAt: 0 },
  { id: "sv13", sku: "RP-TIRE",     name: "輪胎更換工資（一條）",              category: "服務", unitPrice: 800,   stockQty: 999, lowStockAt: 0 },
  { id: "sv14", sku: "RP-WHL-BAL",  name: "輪框動平衡（一條）",                category: "服務", unitPrice: 500,   stockQty: 999, lowStockAt: 0 },
  // 電系/ECU
  { id: "sv20", sku: "RP-BAT-CHK",  name: "電瓶檢測",                          category: "服務", unitPrice: 300,   stockQty: 999, lowStockAt: 0 },
  { id: "sv21", sku: "RP-ECU-DIAG", name: "ECU 原廠電腦診斷",                  category: "服務", unitPrice: 1500,  stockQty: 999, lowStockAt: 0 },
  { id: "sv22", sku: "RP-ECU-MAP",  name: "ECU 重新寫碼（賽道 / 街道）",       category: "服務", unitPrice: 6800,  stockQty: 999, lowStockAt: 0 },
  { id: "sv23", sku: "RP-SPARK",    name: "火星塞更換工資（一缸）",            category: "服務", unitPrice: 600,   stockQty: 999, lowStockAt: 0 },
  // 懸吊/調校
  { id: "sv30", sku: "RP-SUS-SET",  name: "懸吊基礎調校（前後）",              category: "服務", unitPrice: 2500,  stockQty: 999, lowStockAt: 0 },
  { id: "sv31", sku: "RP-SUS-PRO",  name: "賽道級懸吊調校（騎士體重客製）",    category: "服務", unitPrice: 6800,  stockQty: 999, lowStockAt: 0 },
  { id: "sv32", sku: "RP-GEO",      name: "車架幾何檢測",                      category: "服務", unitPrice: 2200,  stockQty: 999, lowStockAt: 0 },
  // 美容
  { id: "sv40", sku: "BT-WASH",     name: "精緻手工洗車",                      category: "服務", unitPrice: 600,   stockQty: 999, lowStockAt: 0 },
  { id: "sv41", sku: "BT-WAX",      name: "打蠟拋光",                          category: "服務", unitPrice: 1800,  stockQty: 999, lowStockAt: 0 },
  { id: "sv42", sku: "BT-COAT",     name: "鍍膜（9H 陶瓷鍍膜）",               category: "服務", unitPrice: 9800,  stockQty: 999, lowStockAt: 0 },
  { id: "sv43", sku: "BT-ENGINE",   name: "引擎外觀深層清潔",                  category: "服務", unitPrice: 1200,  stockQty: 999, lowStockAt: 0 },
  { id: "sv44", sku: "BT-LEATHER",  name: "皮革座椅保養",                      category: "服務", unitPrice: 800,   stockQty: 999, lowStockAt: 0 },
  // 道路救援/其他
  { id: "sv50", sku: "SV-ROAD",     name: "道路救援拖吊（雙北）",              category: "服務", unitPrice: 1800,  stockQty: 999, lowStockAt: 0 },
  { id: "sv51", sku: "SV-INSPECT",  name: "購前 / 購後全車檢查",               category: "服務", unitPrice: 1500,  stockQty: 999, lowStockAt: 0 },
  { id: "sv52", sku: "SV-STORAGE",  name: "愛車寄存（每月）",                  category: "服務", unitPrice: 2500,  stockQty: 999, lowStockAt: 0 },

  // ────────────────────────────────
  // 代辦費用（服務項目，無庫存上限）
  // ────────────────────────────────
  { id: "s01", sku: "SV-REG-NEW",  name: "新車領牌代辦（含規費）",        category: "代辦費用", unitPrice: 4500,  stockQty: 999, lowStockAt: 0 },
  { id: "s02", sku: "SV-INS-CTPL", name: "強制險代辦（1 年）",             category: "代辦費用", unitPrice: 1900,  stockQty: 999, lowStockAt: 0 },
  { id: "s03", sku: "SV-INS-OPT",  name: "任意險代辦（第三責任 300 萬）", category: "代辦費用", unitPrice: 8800,  stockQty: 999, lowStockAt: 0 },
  { id: "s04", sku: "SV-TRN-OWN",  name: "過戶代辦服務",                    category: "代辦費用", unitPrice: 2500,  stockQty: 999, lowStockAt: 0 },
  { id: "s05", sku: "SV-INS-ANN",  name: "定期驗車代辦",                    category: "代辦費用", unitPrice: 800,   stockQty: 999, lowStockAt: 0 },
  { id: "s06", sku: "SV-ARTC-OS",  name: "ARTC 外匯車驗證代辦",             category: "代辦費用", unitPrice: 35000, stockQty: 999, lowStockAt: 0 },
  { id: "s07", sku: "SV-ETC-INS",  name: "ETC 申裝代辦",                    category: "代辦費用", unitPrice: 500,   stockQty: 999, lowStockAt: 0 },
  { id: "s08", sku: "SV-LIC-REP",  name: "行照/車牌補發代辦",               category: "代辦費用", unitPrice: 600,   stockQty: 999, lowStockAt: 0 },
  { id: "s09", sku: "SV-TAX-FUEL", name: "牌照稅 / 燃料費代繳",             category: "代辦費用", unitPrice: 300,   stockQty: 999, lowStockAt: 0 },
  { id: "s10", sku: "SV-PDI-DLV",  name: "交車整備與配送服務",              category: "代辦費用", unitPrice: 3500,  stockQty: 999, lowStockAt: 0 },
];
