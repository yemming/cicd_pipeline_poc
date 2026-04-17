import type { SaleOrder } from "./types";

const today = new Date();
function daysAgo(n: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const MOCK_SALE_ORDERS: SaleOrder[] = [
  {
    id: "UC-SO-0012",
    vehicleId: "uv06",
    customerName: "陳建宏",
    customerPhone: "0912-345-678",
    salePrice: 988000,
    gp1: 140000, // 988000 - 820000 - 28000
    gpRatio: 140000 / 988000,
    paymentStatus: "paid",
    depositAmount: 988000,
    deliveryDate: new Date(today.getTime() - 3 * 86400000).toISOString(),
    sourceType: "sales-led",
    salesperson: "Amy",
    createdAt: daysAgo(5),
  },
  {
    id: "UC-SO-0014",
    vehicleId: "uv03",
    customerName: "林志鴻",
    customerPhone: "0922-111-222",
    salePrice: 828000,
    gp1: 116000, // 828000 - 680000 - 32000
    gpRatio: 116000 / 828000,
    paymentStatus: "deposit",
    depositAmount: 150000,
    deliveryDate: null,
    sourceType: "technician-rec",
    salesperson: "Amy",
    createdAt: daysAgo(11),
  },
];
