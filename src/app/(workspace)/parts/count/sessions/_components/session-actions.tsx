"use client";

import { useState, useTransition } from "react";

import {
  approveCountAdjustmentAction,
  submitCountSessionAction,
} from "@/lib/parts/actions";

type Line = {
  id: string;
  item_label: string;
  qty_system: number;
  qty_final: number | null;
};

export function SessionLineEditor({
  ctId,
  ctNo,
  lines,
}: {
  ctId: string;
  ctNo: string;
  lines: Line[];
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(lines.map((l) => [l.id, l.qty_final != null ? String(l.qty_final) : String(l.qty_system)])),
  );
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onSubmit() {
    const payload = Object.entries(draft)
      .filter(([, v]) => v !== "")
      .map(([line_id, v]) => ({ line_id, qty_final: Number(v) }))
      .filter((l) => Number.isFinite(l.qty_final));
    if (payload.length === 0) {
      setResult({ ok: false, msg: "至少要填一行實盤數" });
      return;
    }
    setResult(null);
    startTransition(async () => {
      const res = await submitCountSessionAction({ ct_id: ctId, lines: payload });
      if (res.ok) {
        setResult({
          ok: true,
          msg: `✓ 提交完成 ・ ${res.data.variance_lines} 行有差異 ・ 差異金額 NT$ ${Math.round(res.data.variance_amount).toLocaleString()}`,
        });
        setOpen(false);
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <div className="space-y-2">
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[12px] text-[#0052CC] hover:underline"
        >
          填實盤數
        </button>
      )}
      {result && (
        <div
          className={`text-[11px] ${result.ok ? "text-[#006644]" : "text-[#BF2600]"}`}
        >
          {result.msg}
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-md max-w-[800px] w-full mx-4 max-h-[80vh] overflow-auto">
            <header className="flex items-center justify-between px-5 py-3 border-b border-[#DFE1E6]">
              <h3 className="text-[15px] font-bold text-[#172B4D]">填實盤數 ・ {ctNo}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-[#6B778C] hover:text-[#172B4D]"
              >
                ✕
              </button>
            </header>
            <div className="px-5 py-4">
              <p className="text-[12px] text-[#6B778C] mb-2">
                預設帶入 system 數量；若實盤不同就改寫。提交後算 variance + 進 pending_approval。
              </p>
              <table className="w-full text-[13px]">
                <thead className="bg-[#F4F5F7] text-[#42526E]">
                  <tr>
                    <th className="text-left px-3 py-2">料件</th>
                    <th className="text-right px-3 py-2 w-[100px]">系統</th>
                    <th className="text-right px-3 py-2 w-[100px]">實盤</th>
                    <th className="text-right px-3 py-2 w-[80px]">差異</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const v = draft[l.id] ?? "";
                    const final = v === "" ? l.qty_system : Number(v);
                    const variance = final - l.qty_system;
                    return (
                      <tr key={l.id} className="border-t border-[#DFE1E6]">
                        <td className="px-3 py-2">{l.item_label}</td>
                        <td className="px-3 py-2 text-right font-mono text-[12px]">
                          {Number(l.qty_system).toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <input
                            type="number"
                            step="any"
                            value={v}
                            onChange={(e) =>
                              setDraft((p) => ({ ...p, [l.id]: e.target.value }))
                            }
                            disabled={pending}
                            className="w-24 px-2 py-1 border border-[#DFE1E6] rounded text-[12px] text-right focus:outline-none focus:border-[#0052CC]"
                          />
                        </td>
                        <td
                          className={`px-3 py-2 text-right font-mono text-[12px] ${
                            variance === 0
                              ? "text-[#6B778C]"
                              : variance > 0
                                ? "text-[#006644]"
                                : "text-[#BF2600]"
                          }`}
                        >
                          {variance === 0 ? "—" : variance > 0 ? `+${variance}` : variance}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <footer className="flex gap-2 px-5 py-3 border-t border-[#DFE1E6]">
              <button
                type="button"
                onClick={onSubmit}
                disabled={pending}
                className="px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded"
              >
                {pending ? "提交中…" : "提交盤點結果"}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="px-4 py-2 text-[13px] text-[#42526E] hover:text-[#172B4D]"
              >
                取消
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

export function ApproveCountButton({ ctId, ctNo }: { ctId: string; ctNo: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ ok: boolean; msg: string } | null>(null);

  function onClick() {
    if (!confirm(`確認核准 ${ctNo}？差異會 post 成 inventory_adjustments + 修 stock_items.qty。`)) return;
    setResult(null);
    startTransition(async () => {
      const res = await approveCountAdjustmentAction(ctId);
      if (res.ok) {
        setResult({
          ok: true,
          msg: res.data.adj_no
            ? `✓ ${res.data.adj_no} 已 post（${res.data.adjusted_lines} 行）`
            : "✓ 無差異，直接結案",
        });
      } else {
        setResult({ ok: false, msg: res.error });
      }
    });
  }

  return (
    <span>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="inline-flex items-center gap-1 px-2 py-1 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[12px] font-semibold rounded"
      >
        {pending ? "核准中…" : "核准"}
      </button>
      {result && (
        <span
          className={`ml-2 text-[11px] ${result.ok ? "text-[#006644]" : "text-[#BF2600]"}`}
        >
          {result.msg}
        </span>
      )}
    </span>
  );
}
