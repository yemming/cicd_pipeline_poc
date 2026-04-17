import type { LedgerEntry } from "./types";

const today = new Date();
function daysAgo(n: number): string {
  const d = new Date(today);
  d.setDate(d.getDate() - n);
  return d.toISOString();
}

export const MOCK_LEDGER: LedgerEntry[] = [
  // 收入 — POS 銷售
  { id: "l01", date: daysAgo(0),  type: "income",  category: "POS 銷售",   amount: 32800, paymentMethod: "cash",     description: "Ducati 原廠碳纖維安全帽 V4", refId: "TX-20260417-001" },
  { id: "l02", date: daysAgo(0),  type: "income",  category: "POS 銷售",   amount: 4800,  paymentMethod: "linepay",  description: "Ducati 賽道皮手套 ×1",        refId: "TX-20260417-002" },
  { id: "l03", date: daysAgo(1),  type: "income",  category: "POS 銷售",   amount: 5800,  paymentMethod: "transfer", description: "DID 鏈條 + 鏈條油套組",      refId: "TX-20260416-015" },
  { id: "l04", date: daysAgo(1),  type: "income",  category: "POS 銷售",   amount: 48000, paymentMethod: "transfer", description: "SC-Project 尾段排氣",        refId: "TX-20260416-016" },
  { id: "l05", date: daysAgo(2),  type: "income",  category: "POS 銷售",   amount: 680,   paymentMethod: "cash",     description: "Shell 機油 10W-60 1L",        refId: "TX-20260415-007" },
  { id: "l06", date: daysAgo(3),  type: "income",  category: "POS 銷售",   amount: 9760,  paymentMethod: "linepay",  description: "鑰匙圈 ×2 + 油箱包 ×1",      refId: "TX-20260414-023" },

  // 收入 — 中古車銷售
  { id: "l20", date: daysAgo(5),  type: "income",  category: "中古車銷售", amount: 988000, paymentMethod: "transfer", description: "Streetfighter V4 SP 2022 售出", refId: "UC-SO-0012" },
  { id: "l21", date: daysAgo(11), type: "income",  category: "中古車銷售", amount: 150000, paymentMethod: "transfer", description: "Panigale V4 S 訂金",             refId: "UC-SO-0014" },

  // 費用傳票
  { id: "l30", date: daysAgo(0),  type: "expense", category: "雜費",       amount: 480,   description: "店內清潔用品" },
  { id: "l31", date: daysAgo(4),  type: "expense", category: "水電",       amount: 8200,  description: "三月水電費" },
  { id: "l32", date: daysAgo(7),  type: "expense", category: "薪資",       amount: 95000, description: "技師月薪（Tony）" },
  { id: "l33", date: daysAgo(7),  type: "expense", category: "薪資",       amount: 78000, description: "銷售月薪（Amy）" },
  { id: "l34", date: daysAgo(9),  type: "expense", category: "整備費用",   amount: 22000, description: "Multistrada V4 S 整備（輪胎+剎車）", refId: "UV-uv03" },
  { id: "l35", date: daysAgo(12), type: "expense", category: "雜費",       amount: 3500,  description: "展廳照明維修" },
];
