"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { issueForRepair, cancelIssue } from "@/lib/parts/actions";
import type { Warehouse } from "@/lib/parts/types";

type IssueRow = {
  id: string;
  gi_no: string;
  status: string;
  qty_issued_total: number;
  amount_total: number;
  warehouse_id: string;
  issue_date: string;
};

export function IssuePickButton({
  workOrderId,
  warehouses,
  existingIssues,
}: {
  workOrderId: string;
  warehouses: Warehouse[];
  existingIssues: IssueRow[];
}) {
  const [open, setOpen] = useState(false);
  const [warehouseId, setWarehouseId] = useState<string>(
    warehouses.find((w) => w.code.includes("PARTS"))?.id ?? warehouses[0]?.id ?? "",
  );
  const [notes, setNotes] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { ok: true; gi_no: string; issue_id: string }
    | { ok: false; error: string }
    | null
  >(null);

  const wById = new Map(warehouses.map((w) => [w.id, w]));

  function onSubmit() {
    setResult(null);
    startTransition(async () => {
      const res = await issueForRepair({
        work_order_id: workOrderId,
        warehouse_id: warehouseId,
        notes: notes || undefined,
      });
      if (res.ok) {
        setResult({ ok: true, gi_no: res.data.gi_no, issue_id: res.data.issue_id });
        setOpen(false);
      } else {
        setResult({ ok: false, error: res.error });
      }
    });
  }

  function onCancel(issueId: string) {
    if (!confirm("確定要取消此領料單？庫存會還原。")) return;
    setResult(null);
    startTransition(async () => {
      const res = await cancelIssue(issueId);
      if (res.ok) {
        setResult({ ok: true, gi_no: "", issue_id: res.data.issue_id });
      } else {
        setResult({ ok: false, error: res.error });
      }
    });
  }

  return (
    <div className="space-y-3">
      <header className="flex items-center justify-between">
        <h3 className="text-[14px] font-bold text-[#172B4D]">領料記錄</h3>
        {!open && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 bg-[#0052CC] hover:bg-[#0747A6] text-white text-[13px] font-semibold rounded"
          >
            <span className="material-symbols-outlined text-[16px]">box</span>
            一鍵領料
          </button>
        )}
      </header>

      {result?.ok && result.gi_no && (
        <div className="rounded-md border border-[#79F2C0] bg-[#E3FCEF] px-4 py-2 text-[13px] text-[#006644]">
          ✓ 領料成功 ・ 單號 <span className="font-mono">{result.gi_no}</span>
        </div>
      )}
      {result?.ok && !result.gi_no && (
        <div className="rounded-md border border-[#FFE380] bg-[#FFF7E6] px-4 py-2 text-[13px] text-[#974F00]">
          ✓ 領料單已取消，庫存已還原
        </div>
      )}
      {result?.ok === false && (
        <div className="rounded-md border border-[#FFBDAD] bg-[#FFEBE6] px-4 py-2 text-[13px] text-[#BF2600]">
          {result.error}
        </div>
      )}

      {open && (
        <div className="border border-[#DFE1E6] rounded-md p-4 bg-[#FAFBFC] space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">
                出庫倉庫 <span className="text-[#BF2600]">*</span>
              </label>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                disabled={pending}
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] focus:outline-none focus:border-[#0052CC]"
              >
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.code} ・ {w.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] font-bold text-[#172B4D] mb-1">
                備註
              </label>
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={pending}
                placeholder="留空使用預設「RO 一鍵領料」"
                className="w-full px-3 py-2 border border-[#DFE1E6] rounded text-[14px] focus:outline-none focus:border-[#0052CC]"
              />
            </div>
          </div>
          <p className="text-[12px] text-[#6B778C]">
            會把工單內 kind=parts 且綁定 item_id 的料件依 FIFO 從庫存扣帳。任一料件不足將整批 abort。
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onSubmit}
              disabled={pending || !warehouseId}
              className="inline-flex items-center gap-1 px-4 py-2 bg-[#0052CC] hover:bg-[#0747A6] disabled:opacity-50 text-white text-[13px] font-semibold rounded"
            >
              {pending ? "領料中…" : "確認領料"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setResult(null);
              }}
              disabled={pending}
              className="px-4 py-2 text-[13px] text-[#42526E] hover:text-[#172B4D]"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {existingIssues.length === 0 ? (
        <p className="text-[13px] text-[#6B778C] py-2">尚未領料</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="bg-[#F4F5F7] text-[#42526E]">
            <tr>
              <th className="text-left px-3 py-2 font-semibold w-[160px]">領料單</th>
              <th className="text-left px-3 py-2 font-semibold w-[140px]">倉庫</th>
              <th className="text-left px-3 py-2 font-semibold w-[100px]">日期</th>
              <th className="text-right px-3 py-2 font-semibold w-[80px]">數量</th>
              <th className="text-right px-3 py-2 font-semibold w-[110px]">金額</th>
              <th className="text-left px-3 py-2 font-semibold w-[80px]">狀態</th>
              <th className="text-left px-3 py-2 font-semibold w-[100px]">操作</th>
            </tr>
          </thead>
          <tbody>
            {existingIssues.map((iss) => {
              const wh = wById.get(iss.warehouse_id);
              return (
                <tr key={iss.id} className="border-t border-[#DFE1E6]">
                  <td className="px-3 py-2 font-mono text-[12px]">{iss.gi_no}</td>
                  <td className="px-3 py-2 text-[12px]">
                    {wh ? `${wh.code}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-[12px]">{iss.issue_date}</td>
                  <td className="px-3 py-2 text-right font-mono text-[12px]">
                    {Number(iss.qty_issued_total).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right font-mono text-[12px]">
                    NT$ {Math.round(Number(iss.amount_total)).toLocaleString()}
                  </td>
                  <td className="px-3 py-2">
                    {iss.status === "completed" ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-[#E3FCEF] text-[#006644]">
                        已出庫
                      </span>
                    ) : iss.status === "cancelled" ? (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-[#DFE1E6] text-[#42526E]">
                        已取消
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 rounded text-[11px] bg-[#FFF7E6] text-[#974F00]">
                        {iss.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {iss.status === "completed" ? (
                      <button
                        type="button"
                        onClick={() => onCancel(iss.id)}
                        disabled={pending}
                        className="text-[12px] text-[#BF2600] hover:underline disabled:opacity-50"
                      >
                        取消領料
                      </button>
                    ) : (
                      <span className="text-[#6B778C] text-[12px]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
