"use client";

import { useState, useTransition } from "react";

import { returnIssueLines } from "@/lib/parts/actions";

type IssueLine = {
  id: string;
  item_label: string;
  qty_issued: number;
  unit_cost: number;
};

export function ReturnIssueDialog({
  issueId,
  giNo,
  lines,
  onDone,
}: {
  issueId: string;
  giNo: string;
  lines: IssueLine[];
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, number>>({});
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; gr_no: string; total_qty: number }
    | { ok: false; error: string }
    | null
  >(null);

  function onSubmit() {
    const payload = Object.entries(draft)
      .filter(([, qty]) => qty > 0)
      .map(([line_id, qty_returned]) => ({ line_id, qty_returned }));
    if (payload.length === 0) {
      setResult({ ok: false, error: "至少要輸入一筆退貨數量" });
      return;
    }
    setResult(null);
    startTransition(async () => {
      const res = await returnIssueLines({ issue_id: issueId, lines: payload });
      if (res.ok) {
        setResult({ ok: true, gr_no: res.data.gr_no, total_qty: res.data.total_qty });
        setOpen(false);
        setDraft({});
        onDone?.();
      } else {
        setResult({ ok: false, error: res.error });
      }
    });
  }

  return (
    <span>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-[12px] text-[#0052CC] hover:underline"
        >
          開退貨
        </button>
      )}
      {result?.ok && (
        <span className="ml-2 text-[11px] text-[#006644]">
          ✓ {result.gr_no} 退 {result.total_qty}
        </span>
      )}
      {result?.ok === false && (
        <span className="ml-2 text-[11px] text-[#BF2600]">{result.error}</span>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-md max-w-[700px] w-full mx-4 max-h-[80vh] overflow-auto">
            <header className="flex items-center justify-between px-5 py-3 border-b border-[#DFE1E6]">
              <h3 className="text-[15px] font-bold text-[#172B4D]">退貨入庫 ・ {giNo}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-[#6B778C] hover:text-[#172B4D]"
                aria-label="關閉"
              >
                ✕
              </button>
            </header>
            <div className="px-5 py-4 space-y-3">
              <p className="text-[12px] text-[#6B778C]">
                每行可填寫退貨數量（≤ 領料數）。空白或 0 = 不退。
              </p>
              <table className="w-full text-[13px]">
                <thead className="bg-[#F4F5F7] text-[#42526E]">
                  <tr>
                    <th className="text-left px-3 py-2">料件</th>
                    <th className="text-right px-3 py-2 w-[80px]">領料</th>
                    <th className="text-right px-3 py-2 w-[100px]">退貨數</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.id} className="border-t border-[#DFE1E6]">
                      <td className="px-3 py-2">{l.item_label}</td>
                      <td className="px-3 py-2 text-right font-mono text-[12px]">
                        {Number(l.qty_issued).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max={l.qty_issued}
                          value={draft[l.id] ?? ""}
                          onChange={(e) =>
                            setDraft((p) => ({
                              ...p,
                              [l.id]: e.target.value === "" ? 0 : Number(e.target.value),
                            }))
                          }
                          disabled={pending}
                          className="w-20 px-2 py-1 border border-[#DFE1E6] rounded text-[12px] text-right focus:outline-none focus:border-[#0052CC]"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex items-center gap-2 px-5 py-3 border-t border-[#DFE1E6]">
              <button
                type="button"
                onClick={onSubmit}
                disabled={pending}
                className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded"
              >
                {pending ? "退貨中…" : "確認退貨入庫"}
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
    </span>
  );
}
