import type { Sku } from "./pos-types";

export const skus: Sku[] = [
  { id: "s001", code: "DU-APP-001", name: "Ducati Corse 18 車隊 T 恤", category: "apparel", price: 2280, cost: 980, brand: "Ducati Corse", tags: ["賽車", "經典"] },
  { id: "s002", code: "DU-APP-002", name: "Ducati Redline 衝刺帽 T", category: "apparel", price: 2680, cost: 1120, brand: "Ducati", tags: ["T恤", "休閒"] },
  { id: "s003", code: "DU-APP-003", name: "Ducati Urban 風衣外套", category: "apparel", price: 9800, cost: 4900, brand: "Ducati", tags: ["外套", "街頭"] },
  { id: "s004", code: "DU-APP-004", name: "Ducati Scrambler 復古牛仔夾克", category: "apparel", price: 12800, cost: 6200, brand: "Scrambler Ducati", tags: ["夾克", "復古"] },
  { id: "s005", code: "DU-APP-005", name: "Ducati Corse 賽車棒球帽", category: "apparel", price: 1480, cost: 620, brand: "Ducati Corse", tags: ["帽子"] },

  { id: "s006", code: "DU-HEL-001", name: "AGV Pista GP RR — Ducati Corse", category: "helmet", price: 58000, cost: 32000, brand: "AGV", tags: ["全罩", "旗艦"] },
  { id: "s007", code: "DU-HEL-002", name: "AGV K6 Ducati 復刻版", category: "helmet", price: 18800, cost: 10200, brand: "AGV", tags: ["全罩"] },
  { id: "s008", code: "DU-HEL-003", name: "Shoei X-Fifteen Ducati Racing", category: "helmet", price: 42000, cost: 24500, brand: "Shoei", tags: ["全罩"] },
  { id: "s009", code: "DU-HEL-004", name: "Dainese D-Air 全罩式", category: "helmet", price: 36000, cost: 21500, brand: "Dainese", tags: ["全罩", "智慧"] },
  { id: "s010", code: "DU-HEL-005", name: "HJC RPHA 11 Ducati 版", category: "helmet", price: 22800, cost: 12800, brand: "HJC", tags: ["全罩"] },

  { id: "s011", code: "DU-ACC-001", name: "Panigale V4 碳纖維搖臂護蓋", category: "accessory", price: 18500, cost: 9200, brand: "Ducati Performance", fitsFamilies: ["Panigale"], tags: ["碳纖維", "防護"] },
  { id: "s012", code: "DU-ACC-002", name: "Termignoni 全段排氣系統 V4", category: "accessory", price: 128000, cost: 68000, brand: "Termignoni", fitsFamilies: ["Panigale", "Streetfighter"], tags: ["排氣", "改裝"] },
  { id: "s013", code: "DU-ACC-003", name: "Öhlins TTX GP 後避震", category: "accessory", price: 88000, cost: 48000, brand: "Öhlins", fitsFamilies: ["Panigale", "Streetfighter"], tags: ["懸吊"] },
  { id: "s014", code: "DU-ACC-004", name: "Rizoma CNC 手把平衡端子", category: "accessory", price: 4800, cost: 2100, brand: "Rizoma", fitsFamilies: ["Panigale", "Streetfighter", "Monster"], tags: ["手把"] },
  { id: "s015", code: "DU-ACC-005", name: "Brembo GP4-RS 前煞車卡鉗", category: "accessory", price: 156000, cost: 89000, brand: "Brembo", fitsFamilies: ["Panigale", "Streetfighter"], tags: ["煞車", "賽車級"] },
  { id: "s016", code: "DU-ACC-006", name: "Multistrada 三箱套組", category: "accessory", price: 68000, cost: 36000, brand: "Ducati Performance", fitsFamilies: ["Multistrada"], tags: ["行李箱", "長途"] },
  { id: "s017", code: "DU-ACC-007", name: "Rizoma 導流尾翼", category: "accessory", price: 16800, cost: 8200, brand: "Rizoma", fitsFamilies: ["Panigale", "Streetfighter"], tags: ["空力"] },
  { id: "s018", code: "DU-ACC-008", name: "DesertX 越野保險桿", category: "accessory", price: 22500, cost: 11200, brand: "Ducati Performance", fitsFamilies: ["DesertX"], tags: ["越野", "防護"] },
  { id: "s019", code: "DU-ACC-009", name: "LED 方向燈組 (前後一套)", category: "accessory", price: 8200, cost: 3900, brand: "Ducati Performance", fitsFamilies: ["Panigale", "Streetfighter", "Monster", "Multistrada", "Hypermotard"], tags: ["LED"] },
  { id: "s020", code: "DU-ACC-010", name: "碳纖維前土除", category: "accessory", price: 28500, cost: 14200, brand: "Ducati Performance", fitsFamilies: ["Panigale", "Streetfighter"], tags: ["碳纖維"] },
  { id: "s021", code: "DU-ACC-011", name: "手機架 + USB-C 充電座", category: "accessory", price: 3800, cost: 1600, brand: "SP Connect", tags: ["手機"] },
  { id: "s022", code: "DU-ACC-012", name: "Monster 座墊訂製升級", category: "accessory", price: 12800, cost: 6400, brand: "Sargent", fitsFamilies: ["Monster"], tags: ["座墊"] },

  { id: "s023", code: "DU-PRT-001", name: "Ducati 原廠機油 10W-60 (1L)", category: "parts", price: 880, cost: 420, brand: "Shell Advance", tags: ["機油", "耗材"] },
  { id: "s024", code: "DU-PRT-002", name: "K&N 空氣濾芯 - Panigale V4", category: "parts", price: 3800, cost: 1800, brand: "K&N", fitsFamilies: ["Panigale"], tags: ["濾芯"] },
  { id: "s025", code: "DU-PRT-003", name: "Brembo Z04 賽道煞車來令", category: "parts", price: 6800, cost: 3400, brand: "Brembo", tags: ["煞車", "耗材"] },
  { id: "s026", code: "DU-PRT-004", name: "Pirelli Diablo Supercorsa V4 後胎", category: "parts", price: 12800, cost: 7200, brand: "Pirelli", tags: ["輪胎"] },
  { id: "s027", code: "DU-PRT-005", name: "Pirelli Diablo Supercorsa V4 前胎", category: "parts", price: 8800, cost: 4900, brand: "Pirelli", tags: ["輪胎"] },
  { id: "s028", code: "DU-PRT-006", name: "NGK 賽車級火星塞 (4 支組)", category: "parts", price: 2400, cost: 1080, brand: "NGK", tags: ["火星塞", "耗材"] },
  { id: "s029", code: "DU-PRT-007", name: "DID 525 ZVM-X 金色鏈條", category: "parts", price: 6200, cost: 2900, brand: "DID", tags: ["鏈條"] },
  { id: "s030", code: "DU-PRT-008", name: "Ducati 冷卻液 (2L)", category: "parts", price: 680, cost: 280, brand: "Ducati", tags: ["冷卻液", "耗材"] },

  { id: "s031", code: "DU-LIF-001", name: "Ducati 1926 限量金屬鑰匙圈", category: "lifestyle", price: 1680, cost: 620, brand: "Ducati Heritage", tags: ["紀念品"] },
  { id: "s032", code: "DU-LIF-002", name: "Ducati Museum 1/12 Panigale V4 模型", category: "lifestyle", price: 12800, cost: 6200, brand: "Minichamps", tags: ["模型", "收藏"] },
  { id: "s033", code: "DU-LIF-003", name: "Bagnaia 2024 冠軍紀念腕錶", category: "lifestyle", price: 28800, cost: 14200, brand: "Locman", tags: ["腕錶"] },
  { id: "s034", code: "DU-LIF-004", name: "Scrambler 復古咖啡隨行杯", category: "lifestyle", price: 980, cost: 380, brand: "Scrambler Ducati", tags: ["生活"] },
  { id: "s035", code: "DU-LIF-005", name: "Ducati Corse 真皮背包", category: "lifestyle", price: 8800, cost: 4200, brand: "Ducati Corse", tags: ["背包"] },
  { id: "s036", code: "DU-LIF-006", name: "Dainese Smart Jacket 充氣背心", category: "lifestyle", price: 24800, cost: 13200, brand: "Dainese", tags: ["安全", "智慧"] },

  { id: "s037", code: "DU-APP-006", name: "Dainese Super Speed D-Dry 皮衣", category: "apparel", price: 38800, cost: 21500, brand: "Dainese", tags: ["皮衣", "防摔"] },
  { id: "s038", code: "DU-APP-007", name: "Alpinestars SMX-6 V2 Gore-Tex 賽車靴", category: "apparel", price: 18800, cost: 10800, brand: "Alpinestars", tags: ["車靴"] },
  { id: "s039", code: "DU-APP-008", name: "Dainese Carbon 3 短手套", category: "apparel", price: 8800, cost: 4800, brand: "Dainese", tags: ["手套"] },
  { id: "s040", code: "DU-APP-009", name: "Ducati 通勤摩托雨衣", category: "apparel", price: 3200, cost: 1480, brand: "Ducati", tags: ["雨衣"] },
];

export const skuCategoryMeta: Record<string, { label: string; icon: string; color: string }> = {
  apparel: { label: "服飾", icon: "checkroom", color: "#EC4899" },
  accessory: { label: "車用配件", icon: "tune", color: "#4F46E5" },
  helmet: { label: "安全帽", icon: "sports_motorsports", color: "#F97316" },
  parts: { label: "零件耗材", icon: "settings", color: "#64748B" },
  lifestyle: { label: "生活精品", icon: "interests", color: "#8B5CF6" },
};

export function getSku(id: string): Sku | undefined {
  return skus.find((s) => s.id === id);
}

export function searchSkus(q: string): Sku[] {
  const lower = q.toLowerCase();
  return skus.filter(
    (s) =>
      s.name.toLowerCase().includes(lower) ||
      s.code.toLowerCase().includes(lower) ||
      s.brand?.toLowerCase().includes(lower) ||
      s.tags?.some((t) => t.toLowerCase().includes(lower))
  );
}
