"use client";

import { useState, useTransition } from "react";

import { updateItemLeadTime } from "@/lib/master-data/item-lead-time-actions";

export type LeadTimeRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  default_supplier_name: string | null;
  default_lead_time_days: number | null;
};

export function ItemLeadTimesBoard({ rows: initialRows, canEdit }: { rows: LeadTimeRow[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initialRows);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function setDraft(id: string, v: string) {
    setDrafts((d) => ({ ...d, [id]: v }));
    setErrors((e) => {
      if (!e[id]) return e;
      const next = { ...e };
      delete next[id];
      return next;
    });
  }

  function save(id: string) {
    const raw = drafts[id];
    if (raw === undefined) return;
    const trimmed = raw.trim();
    let next: number | null = null;
    if (trimmed.length > 0) {
      const n = parseInt(trimmed, 10);
      if (!Number.isFinite(n) || n < 0) {
        setErrors((e) => ({ ...e, [id]: "必須為 0 或正整數" }));
        return;
      }
      next = n;
    }
    setSavingId(id);
    startTransition(async () => {
      const res = await updateItemLeadTime(id, next);
      setSavingId(null);
      if (!res.ok) {
        setErrors((e) => ({ ...e, [id]: res.error }));
        return;
      }
      setRows((rs) =>
        rs.map((r) => (r.id === id ? { ...r, default_lead_time_days: next } : r)),
      );
      setDrafts((d) => {
        const nd = { ...d };
        delete nd[id];
        return nd;
      });
    });
  }

  return (
    <div className="bg-white border border-[#DFE1E6] rounded-md overflow-hidden">
      <table className="w-full text-[13px]">
        <thead className="bg-[#F4F5F7] text-[12px] text-[#42526E]">
          <tr>
            <th className="px-4 py-2.5 text-left font-semibold w-[140px]">料號</th>
            <th className="px-4 py-2.5 text-left font-semibold">品名</th>
            <th className="px-4 py-2.5 text-left font-semibold w-[120px]">品類</th>
            <th className="px-4 py-2.5 text-left font-semibold w-[180px]">預設供應商</th>
            <th className="px-4 py-2.5 text-right font-semibold w-[180px]">預設前置時間（天）</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const draft = drafts[r.id];
            const dirty = draft !== undefined;
            const inputValue =
              draft !== undefined
                ? draft
                : r.default_lead_time_days === null
                  ? ""
                  : String(r.default_lead_time_days);
            const err = errors[r.id];
            const saving = savingId === r.id;
            return (
              <tr key={r.id} className="border-b border-[#F4F5F7] hover:bg-[#FAFBFC]">
                <td className="px-4 py-2 font-mono text-[12px]">{r.code}</td>
                <td className="px-4 py-2">{r.name}</td>
                <td className="px-4 py-2 text-[12px] text-[#6B778C]">{r.category ?? "—"}</td>
                <td className="px-4 py-2 text-[12px]">
                  {r.default_supplier_name ?? <span className="text-[#6B778C]">—</span>}
                </td>
                <td className="px-4 py-2 text-right">
                  <div className={`inline-flex items-center gap-2 ${saving ? "opacity-60 pointer-events-none" : ""}`}>
                    {err && <span className="text-[11px] text-[#BF2600]">{err}</span>}
                    <input
                      type="number"
                      min={0}
                      step={1}
                      disabled={!canEdit}
                      value={inputValue}
                      placeholder="—"
                      onChange={(e) => setDraft(r.id, e.target.value)}
                      onBlur={() => dirty && save(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className={`w-24 px-2 py-1 text-right font-mono text-[13px] border rounded ${
                        dirty
                          ? "border-[#FFC400] bg-[#FFFAE6]"
                          : err
                            ? "border-[#BF2600]"
                            : "border-[#DFE1E6]"
                      } focus:outline-none focus:border-[#0052CC]`}
                    />
                    {saving && <span className="text-[11px] text-[#6B778C]">儲存中⋯</span>}
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-[#6B778C]">
                目前沒有可顯示的料號
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
