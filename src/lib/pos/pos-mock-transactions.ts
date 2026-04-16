import type { Transaction, LineItem, Payment, StoreCode, CheckoutMode } from "./pos-types";
import { skus, getSku } from "./pos-mock-skus";
import { serviceItems } from "./pos-mock-services";
import { ducatiModels } from "@/lib/ducati-models";
import { customers } from "./pos-mock-customers";
import { generateInvoiceNo, generateReceiptNo, generateTxCode } from "./format";

const clerks = ["王雅雯", "張志豪", "李宛真", "陳美珊", "林俊宏", "黃柏翰", "鄭詩涵"];
const storeCodes: StoreCode[] = ["tpe-flagship", "tpe-neihu", "nhs", "txg", "khh"];

function pick<T>(arr: T[], i: number): T {
  return arr[i % arr.length];
}

function buildVehicleTx(seed: number, date: Date): Transaction {
  const model = pick(ducatiModels, seed);
  const customer = pick(customers, seed * 3);
  const lines: LineItem[] = [
    {
      id: `l${seed}-1`,
      type: "vehicle",
      refId: model.id,
      name: `${model.name} ${model.colors[0]}`,
      quantity: 1,
      unitPrice: model.priceNTD,
      subtotal: model.priceNTD,
      taxable: true,
    },
  ];
  const accessoryCount = seed % 3;
  for (let i = 0; i < accessoryCount; i++) {
    const sku = pick(
      skus.filter((s) => s.fitsFamilies?.includes(model.family) || s.category === "lifestyle"),
      seed + i,
    );
    if (sku) {
      lines.push({
        id: `l${seed}-acc${i}`,
        type: "accessory",
        refId: sku.id,
        name: sku.name,
        quantity: 1,
        unitPrice: sku.price,
        subtotal: sku.price,
        taxable: true,
      });
    }
  }
  const fees: LineItem[] = [
    { id: `f${seed}-1`, type: "fee", name: "新車牌照登記費", quantity: 1, unitPrice: 450, subtotal: 450, taxable: false },
    { id: `f${seed}-2`, type: "fee", name: "汽燃費 (1 年)", quantity: 1, unitPrice: 4800, subtotal: 4800, taxable: false },
    { id: `f${seed}-3`, type: "fee", name: "強制險 (1 年)", quantity: 1, unitPrice: 1420, subtotal: 1420, taxable: true },
    { id: `f${seed}-4`, type: "fee", name: "領牌代辦服務費", quantity: 1, unitPrice: 1500, subtotal: 1500, taxable: true },
  ];
  const subtotal = lines.reduce((a, b) => a + b.subtotal, 0);
  const feeTotal = fees.reduce((a, b) => a + b.subtotal, 0);
  const taxable = subtotal + fees.filter((f) => f.taxable).reduce((a, b) => a + b.subtotal, 0);
  const taxAmount = Math.round(taxable * 0.05);
  const total = subtotal + feeTotal + taxAmount;
  const payments: Payment[] = [
    {
      id: `p${seed}`,
      method: customer.type === "B2B" ? "check" : "card",
      amount: total,
      timestamp: date.toISOString(),
      cardLast4: customer.type === "B2B" ? undefined : "4567",
      cardBrand: customer.type === "B2B" ? undefined : "VISA",
      checkNumber: customer.type === "B2B" ? `CK-${seed * 17}` : undefined,
      checkBank: customer.type === "B2B" ? "玉山銀行" : undefined,
      checkDate: customer.type === "B2B" ? date.toISOString() : undefined,
    },
  ];
  const cost = Math.round(total * 0.78);
  return {
    id: `tx-v-${seed}`,
    code: generateTxCode(date, seed + 1),
    mode: "vehicle",
    customerId: customer.id,
    store: pick(storeCodes, seed),
    clerk: pick(clerks, seed),
    date: date.toISOString(),
    lines,
    fees,
    payments,
    subtotal,
    taxAmount,
    feeTotal,
    total,
    invoiceNo: generateInvoiceNo(seed),
    receiptNo: generateReceiptNo(seed),
    status: "completed",
    cost,
    margin: total - cost,
  };
}

function buildServiceTx(seed: number, date: Date): Transaction {
  const customer = pick(customers, seed * 5 + 1);
  const lines: LineItem[] = [];
  const labors = serviceItems.filter((s) => s.category === "labor");
  const parts = serviceItems.filter((s) => s.category === "parts");
  const laborCount = 1 + (seed % 2);
  const partsCount = 1 + (seed % 2);
  const warranty = seed % 5 === 0;
  for (let i = 0; i < laborCount; i++) {
    const item = pick(labors, seed + i);
    const price = warranty && item.warrantyFree ? 0 : item.unitPrice;
    lines.push({
      id: `l${seed}-lb${i}`,
      type: "service-labor",
      refId: item.id,
      name: item.name,
      quantity: 1,
      unitPrice: price,
      subtotal: price,
      taxable: true,
      note: warranty && item.warrantyFree ? "保固內免收" : undefined,
    });
  }
  for (let i = 0; i < partsCount; i++) {
    const item = pick(parts, seed + i);
    lines.push({
      id: `l${seed}-pt${i}`,
      type: "service-parts",
      refId: item.id,
      name: item.name,
      quantity: 1,
      unitPrice: item.unitPrice,
      subtotal: item.unitPrice,
      taxable: true,
    });
  }
  const subtotal = lines.reduce((a, b) => a + b.subtotal, 0);
  const taxAmount = Math.round(subtotal * 0.05);
  const total = subtotal + taxAmount;
  const payments: Payment[] = [
    {
      id: `p${seed}`,
      method: pick<"card" | "linepay" | "applepay" | "cash">(["card", "linepay", "applepay", "cash"], seed),
      amount: total,
      timestamp: date.toISOString(),
    },
  ];
  const cost = Math.round(total * 0.55);
  return {
    id: `tx-s-${seed}`,
    code: generateTxCode(date, seed + 100),
    mode: "service",
    customerId: customer.id,
    store: pick(storeCodes, seed + 1),
    clerk: pick(clerks, seed + 2),
    date: date.toISOString(),
    lines,
    fees: [],
    payments,
    subtotal,
    taxAmount,
    feeTotal: 0,
    total,
    invoiceNo: generateInvoiceNo(seed + 200),
    receiptNo: generateReceiptNo(seed + 200),
    status: "completed",
    cost,
    margin: total - cost,
  };
}

function buildRetailTx(seed: number, date: Date): Transaction {
  const customer = seed % 4 === 0 ? undefined : pick(customers, seed * 7 + 2);
  const lines: LineItem[] = [];
  const itemCount = 1 + (seed % 4);
  for (let i = 0; i < itemCount; i++) {
    const sku = pick(skus, seed * 11 + i);
    const qty = 1 + (i === 0 ? 0 : seed % 2);
    lines.push({
      id: `l${seed}-r${i}`,
      type: "accessory",
      refId: sku.id,
      name: sku.name,
      quantity: qty,
      unitPrice: sku.price,
      subtotal: sku.price * qty,
      taxable: true,
    });
  }
  const subtotal = lines.reduce((a, b) => a + b.subtotal, 0);
  const taxAmount = Math.round(subtotal * 0.05);
  const total = subtotal + taxAmount;
  const payments: Payment[] = [
    {
      id: `p${seed}`,
      method: pick<"card" | "linepay" | "applepay" | "cash">(["linepay", "applepay", "card", "cash"], seed),
      amount: total,
      timestamp: date.toISOString(),
    },
  ];
  const cost = lines.reduce((a, b) => {
    const sku = getSku(b.refId ?? "");
    return a + (sku?.cost ?? 0) * b.quantity;
  }, 0);
  return {
    id: `tx-r-${seed}`,
    code: generateTxCode(date, seed + 500),
    mode: "retail",
    customerId: customer?.id,
    store: pick(storeCodes, seed + 2),
    clerk: pick(clerks, seed + 3),
    date: date.toISOString(),
    lines,
    fees: [],
    payments,
    subtotal,
    taxAmount,
    feeTotal: 0,
    total,
    invoiceNo: generateInvoiceNo(seed + 500),
    status: seed % 17 === 0 ? "refunded" : "completed",
    cost,
    margin: total - cost,
  };
}

export const transactions: Transaction[] = (() => {
  const txs: Transaction[] = [];
  const today = new Date(2026, 3, 16, 18, 30);
  for (let day = 0; day < 30; day++) {
    const dayDate = new Date(today.getTime() - day * 86400000);
    const vehiclePerDay = day % 3 === 0 ? 1 : 0;
    const servicePerDay = 2 + (day % 2);
    const retailPerDay = 3 + (day % 4);
    for (let i = 0; i < vehiclePerDay; i++) {
      const d = new Date(dayDate);
      d.setHours(10 + i * 3, 15);
      txs.push(buildVehicleTx(day * 10 + i, d));
    }
    for (let i = 0; i < servicePerDay; i++) {
      const d = new Date(dayDate);
      d.setHours(11 + i * 2, 30 + i * 5);
      txs.push(buildServiceTx(day * 10 + i + 100, d));
    }
    for (let i = 0; i < retailPerDay; i++) {
      const d = new Date(dayDate);
      d.setHours(13 + i, 5 + i * 7);
      txs.push(buildRetailTx(day * 10 + i + 500, d));
    }
  }
  return txs.sort((a, b) => b.date.localeCompare(a.date));
})();

export function getTransaction(id: string): Transaction | undefined {
  return transactions.find((t) => t.id === id);
}

export function transactionsByCustomer(customerId: string): Transaction[] {
  return transactions.filter((t) => t.customerId === customerId);
}

export function transactionsByStore(store: StoreCode): Transaction[] {
  return transactions.filter((t) => t.store === store);
}

export function transactionsByMode(mode: CheckoutMode): Transaction[] {
  return transactions.filter((t) => t.mode === mode);
}

export function todayTransactions(now = new Date(2026, 3, 16)): Transaction[] {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const end = start + 86400000;
  return transactions.filter((t) => {
    const d = new Date(t.date).getTime();
    return d >= start && d < end;
  });
}
