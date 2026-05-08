import type { DocumentNumberRule } from "@/lib/parts/types";

/**
 * 顯示 document_number_rules 的下一筆預覽編號。
 *
 * Pattern 慣例（與 document_number_rules.pattern 對齊）：
 *   - {YYYY} {YY} {MM} {DD} → 取自當下日期
 *   - {SEQ:N} → 補零到 N 位 e.g. SEQ:5 → 00042
 *   - {PREFIX} → rule.prefix
 *
 * 給 setup 頁顯示「下一筆會是這樣」用，純 read-only 預覽。
 */

export function previewDocumentNumber(rule: DocumentNumberRule, atDate = new Date()): string {
  const next = (rule.current_seq ?? 0) + 1;
  const yyyy = String(atDate.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(atDate.getMonth() + 1).padStart(2, "0");
  const dd = String(atDate.getDate()).padStart(2, "0");

  let out = rule.pattern ?? `${rule.prefix ?? ""}{SEQ:5}`;
  out = out.replace(/\{PREFIX\}/g, rule.prefix ?? "");
  out = out.replace(/\{YYYY\}/g, yyyy);
  out = out.replace(/\{YY\}/g, yy);
  out = out.replace(/\{MM\}/g, mm);
  out = out.replace(/\{DD\}/g, dd);
  out = out.replace(/\{SEQ:(\d+)\}/g, (_m, n: string) => String(next).padStart(parseInt(n, 10), "0"));
  out = out.replace(/\{SEQ\}/g, String(next));
  return out;
}

export function DocumentNumberDisplay({ rule }: { rule: DocumentNumberRule }) {
  return (
    <div className="inline-flex flex-col gap-0.5 px-3 py-2 bg-[#F4F5F7] border border-[#DFE1E6] rounded font-mono text-[13px] text-[#172B4D]">
      <span>{previewDocumentNumber(rule)}</span>
      <span className="text-[10px] font-sans text-[#6B778C] uppercase tracking-wide">
        {rule.doc_type} · 下一筆預覽 (#{(rule.current_seq ?? 0) + 1})
      </span>
    </div>
  );
}
