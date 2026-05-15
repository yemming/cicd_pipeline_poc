/**
 * Constants — 售後工單編號規則 (RO Numbering Rules)
 *
 * 設計稿：07_售後管理模組_v2.html → Tab B「工單編號設定」
 * 路由：/parts/aftersales/management/ro-numbering
 *
 * - 兩張前綴碼表：P1 業務類型（MN/RP/WC/AC/PD/OT…）+ P2 付款性質（CP/WR/IN/FR…）
 * - 完整工單編號格式：{P1}-{P2}-{YYMMDD}-{NNN}
 * - 規則存在 business_rules 表（rule_kind = 'ro_prefix_p1' / 'ro_prefix_p2'）
 *   雙 brand 各維護一份；POC 階段同一份 default seed
 * - 既有 src/domain/repair-orders.constants.ts 仍是 buildRoCode / validatePrefixCombo 的 source
 *   — 那份是寫入時的硬規則，這份是「使用者可維護的字典 + 註解 metadata」
 */

/** 財會性質（決定 P1 在會計分錄走哪個科目集合） */
export type AcctType = "income" | "internal" | "claim" | "gray";

export const ACCT_TYPE_LABELS: Record<AcctType, string> = {
  income: "客付收入",
  internal: "內部結算",
  claim: "廠商/代理商轉收入",
  gray: "主管設定",
};

export const ACCT_TYPE_OPTIONS: { value: AcctType; label: string }[] = [
  { value: "income", label: "客付收入" },
  { value: "internal", label: "內部結算（售後 / 銷售部門間）" },
  { value: "claim", label: "廠商 / 代理商轉收入" },
  { value: "gray", label: "未分類（待主管設定）" },
];

export function acctChipStyle(t: AcctType): { bg: string; fg: string } {
  switch (t) {
    case "income":
      return { bg: "#E1F5EE", fg: "#0F6E56" };
    case "internal":
      return { bg: "#E6F1FB", fg: "#185FA5" };
    case "claim":
      return { bg: "#EEEEFF", fg: "#534AB7" };
    case "gray":
    default:
      return { bg: "#F2F2F2", fg: "#6B6A68" };
  }
}

/** 套用組合預覽：{p1}-{p2}-YYMMDD-001（YYMMDD 用今天，無 hydration mismatch — 純 client） */
export function previewRoCode(p1Code: string, p2Code: string, today: Date): string {
  const yy = pad(today.getFullYear() % 100);
  const mm = pad(today.getMonth() + 1);
  const dd = pad(today.getDate());
  return `${p1Code || "??"}-${p2Code || "??"}-${yy}${mm}${dd}-001`;
}

function pad(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

/** 常用組合範例 — 純展示用，不寫進 DB */
export const COMMON_COMBOS: { p1: string; p2: string; desc: string; color: string }[] = [
  { p1: "MN", p2: "CP", desc: "定保客付　最常見", color: "#0F6E56" },
  { p1: "RP", p2: "CP", desc: "機修客付　一般維修", color: "#185FA5" },
  { p1: "RP", p2: "FR", desc: "機修免費　返工/賠償（不含WC）", color: "#854F0B" },
  { p1: "WC", p2: "WR", desc: "保固索賠　向原廠申請費用", color: "#534AB7" },
  { p1: "AC", p2: "CP", desc: "事故客付　保險理賠由客戶自行申請", color: "#CC7700" },
  { p1: "PD", p2: "IN", desc: "PDI內部工單　銷售/售後部門間結算", color: "#1A3A5C" },
  { p1: "OT", p2: "CP", desc: "其他業務客付　洗車/精品/延伸保固", color: "#0F6E56" },
];

/** P1 / P2 共用驗證 */
export function validatePrefixCode(code: string): string | null {
  const t = code.trim().toUpperCase();
  if (!t) return "代碼必填";
  if (t.length < 2 || t.length > 3) return "代碼長度需 2–3 碼";
  if (!/^[A-Z0-9]+$/.test(t)) return "代碼僅可使用大寫英數字";
  return null;
}
