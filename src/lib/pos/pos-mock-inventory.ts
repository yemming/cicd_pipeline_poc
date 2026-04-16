import type { InventoryRow, StoreCode, TransferOrder } from "./pos-types";
import { skus } from "./pos-mock-skus";

function seeded(i: number, max: number): number {
  return (i * 9301 + 49297) % 233280 % max;
}

export const inventory: InventoryRow[] = (() => {
  const storeCodes: StoreCode[] = ["tpe-flagship", "tpe-neihu", "nhs", "txg", "khh"];
  const rows: InventoryRow[] = [];
  skus.forEach((sku, skuIdx) => {
    storeCodes.forEach((store, storeIdx) => {
      const seed = skuIdx * 7 + storeIdx * 13;
      const base = seeded(seed, 12);
      const stock = sku.category === "helmet" ? Math.max(0, base - 6) : sku.category === "accessory" ? base : base + 2;
      const reserved = stock > 3 ? seeded(seed + 3, 2) : 0;
      const avgDaily = sku.category === "parts" ? 0.8 + seeded(seed + 5, 4) / 2 : 0.2 + seeded(seed + 5, 3) / 3;
      rows.push({
        store,
        sku: sku.id,
        stock,
        reserved,
        avgDailySales: Number(avgDaily.toFixed(2)),
        lastReceivedAt: new Date(2026, 2, 1 + seeded(seed + 9, 40)).toISOString(),
      });
    });
  });
  return rows;
})();

export function getStock(store: StoreCode, skuId: string): InventoryRow | undefined {
  return inventory.find((r) => r.store === store && r.sku === skuId);
}

export function storeStockFor(skuId: string): InventoryRow[] {
  return inventory.filter((r) => r.sku === skuId);
}

export function crossStoreAvailable(skuId: string): number {
  return storeStockFor(skuId).reduce((sum, r) => sum + r.stock - r.reserved, 0);
}

export const transferOrders: TransferOrder[] = [
  {
    id: "tr001",
    code: "TR-20260412-001",
    from: "txg",
    to: "tpe-flagship",
    createdAt: "2026-04-12T09:30:00+08:00",
    dispatchedAt: "2026-04-12T14:00:00+08:00",
    receivedAt: "2026-04-13T11:20:00+08:00",
    status: "received",
    lines: [
      { sku: "s011", skuName: "Panigale V4 碳纖維搖臂護蓋", quantity: 1 },
      { sku: "s017", skuName: "Rizoma 導流尾翼", quantity: 2 },
    ],
    requester: "王雅雯",
    driver: "宅配通-林司機",
    vehiclePlate: "AEW-3821",
  },
  {
    id: "tr002",
    code: "TR-20260414-001",
    from: "khh",
    to: "nhs",
    createdAt: "2026-04-14T15:00:00+08:00",
    dispatchedAt: "2026-04-15T08:00:00+08:00",
    status: "in-transit",
    lines: [{ sku: "s006", skuName: "AGV Pista GP RR — Ducati Corse", quantity: 1 }],
    requester: "張志豪",
    driver: "黑貓-周司機",
    vehiclePlate: "RBG-2455",
    reason: "客戶指定色號 58cm",
  },
  {
    id: "tr003",
    code: "TR-20260415-001",
    from: "tpe-neihu",
    to: "tpe-flagship",
    createdAt: "2026-04-15T10:45:00+08:00",
    dispatchedAt: "2026-04-15T13:30:00+08:00",
    status: "dispatched",
    lines: [
      { sku: "s012", skuName: "Termignoni 全段排氣系統 V4", quantity: 1 },
      { sku: "s020", skuName: "碳纖維前土除", quantity: 1 },
    ],
    requester: "李宛真",
    driver: "門市自派",
    vehiclePlate: "BMQ-8891",
  },
  {
    id: "tr004",
    code: "TR-20260416-001",
    from: "txg",
    to: "khh",
    createdAt: "2026-04-16T09:00:00+08:00",
    status: "draft",
    lines: [{ sku: "s008", skuName: "Shoei X-Fifteen Ducati Racing", quantity: 1 }],
    requester: "陳美珊",
    reason: "高雄客戶指定尺寸 L",
  },
];
