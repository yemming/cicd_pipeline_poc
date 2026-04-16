export { formatNTD } from "@/lib/ducati-models";

export function formatTaiwanDate(iso: string, withTime = false): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (!withTime) return `${y}/${m}/${day}`;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${y}/${m}/${day} ${hh}:${mm}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatRelative(iso: string, now = new Date()): string {
  const diffMs = now.getTime() - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return "剛剛";
  if (min < 60) return `${min} 分鐘前`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} 小時前`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day} 天前`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo} 個月前`;
  return `${Math.floor(mo / 12)} 年前`;
}

export function maskPhone(phone: string): string {
  return phone.replace(/(\d{4})(\d{3})(\d{3})/, "$1-$2-$3");
}

export function formatVatId(id: string): string {
  return id.replace(/(\d{4})(\d{4})/, "$1-$2");
}

export function formatInvoiceNo(no: string): string {
  if (no.length === 10) return `${no.slice(0, 2)}-${no.slice(2)}`;
  return no;
}

const tierMeta: Record<string, { label: string; color: string; bg: string }> = {
  None: { label: "一般", color: "#64748B", bg: "#F1F5F9" },
  Bronze: { label: "Bronze", color: "#B45309", bg: "#FEF3C7" },
  Silver: { label: "Silver", color: "#475569", bg: "#E2E8F0" },
  Gold: { label: "Gold", color: "#B45309", bg: "#FDE68A" },
  Platinum: { label: "Platinum", color: "#3730A3", bg: "#E0E7FF" },
};

export function vipTierMeta(tier: string) {
  return tierMeta[tier] ?? tierMeta.None;
}

export function generateInvoiceNo(seed: number): string {
  const prefix = ["AB", "CD", "EF", "GH"][seed % 4];
  const num = String(10000000 + seed * 37).padStart(8, "0");
  return `${prefix}${num}`;
}

export function generateReceiptNo(seed: number): string {
  return `R-${String(2026040000 + seed).padStart(10, "0")}`;
}

export function generateTxCode(date: Date, serial: number): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `POS-${y}${m}${d}-${String(serial).padStart(4, "0")}`;
}

let _idCounter = 1_000_000;
export function newId(prefix = "id"): string {
  _idCounter += 1;
  return `${prefix}-${_idCounter}`;
}
