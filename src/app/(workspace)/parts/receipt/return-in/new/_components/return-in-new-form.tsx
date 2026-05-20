"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  createReturnInReceipt,
  type IssueCandidate,
  type IssueWithLines,
} from "@/domain/parts-return-in";
import { RETURN_REASONS, fmtDate } from "@/domain/parts-return-in.constants";

type Banner = { ok: boolean; msg: string } | null;

const inputClass =
  "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";

export function ReturnInNewForm({
  issues,
  initialPick,
}: {
  issues: IssueCandidate[];
  initialPick: IssueWithLines | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [pick, setPick] = useState<IssueWithLines | null>(initialPick);
  const [reason, setReason] = useState<string>(RETURN_REASONS[0].value);
  const [receiptDate, setReceiptDate] = useState<string>(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [qtyMap, setQtyMap] = useState<Record<string, number>>(() =>
    Object.fromEntries((initialPick?.lines ?? []).map((l) => [l.id, 0])),
  );

  function selectIssue(issueId: string) {
    if (!issueId) {
      setPick(null);
      setQtyMap({});
      return;
    }
    // 跳轉 URL 讓 server 撈 lines（避免 client 直連 supabase）
    router.push(`/parts/receipt/return-in/new?issue_id=${issueId}`);
  }

  function submit() {
    if (!pick) {
      setBanner({ ok: false, msg: "請先選擇要退入的領料單" });
      return;
    }
    const lines = Object.entries(qtyMap)
      .filter(([, q]) => q > 0)
      .map(([line_id, qty_returned]) => ({ line_id, qty_returned }));
    if (lines.length === 0) {
      setBanner({ ok: false, msg: "至少要輸入一筆退入數量" });
      return;
    }
    setBanner(null);
    startTransition(async () => {
      const res = await createReturnInReceipt({
        issue_id: pick.issue.id,
        receipt_date: receiptDate,
        return_reason: reason,
        notes: notes.trim() || undefined,
        lines,
      });
      if (res.ok) {
        router.push(`/parts/receipt/return-in/${res.data.id}`);
      } else {
        setBanner({ ok: false, msg: `建立失敗：${res.error}` });
      }
    });
  }

  const totalQty = Object.values(qtyMap).reduce((s, q) => s + q, 0);
  const totalAmount = pick
    ? pick.lines.reduce(
        (s, l) => s + (qtyMap[l.id] ?? 0) * l.unit_cost,
        0,
      )
    : 0;
  const linesPicked = Object.values(qtyMap).filter((q) => q > 0).length;

  return (
    <main className={`px-6 py-5 space-y-3 ${pending ? "pointer-events-none opacity-60" : ""}`}>
      {/* Breadcrumb + CRUD pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/receipt/return-in" className="hover:text-[#185FA5]">
            領料退貨入庫
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">新增</span>
          <span className="ml-1 inline-flex items-center px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            建立模式
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/receipt/return-in"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            取消
          </Link>
          <button
            type="button"
            onClick={submit}
            disabled={pending || !pick || linesPicked === 0}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {pending ? "建立中⋯" : "建立並開啟"}
          </button>
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">領料退貨入庫單</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                （新建）
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                  尚未建立
                </span>
                {pick && (
                  <>
                    <span className="text-[#9A9890]">·</span>
                    <span className="text-[#5A5955]">
                      來源 <span className="font-mono">{pick.issue.gi_no}</span>
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[260px] h-[120px] bg-[#F8F7F4] border border-[#EEECE6] rounded-lg flex flex-col items-center justify-center gap-1">
            <div className="text-[11px] text-[#9A9890]">預計退入金額</div>
            <div className="text-[20px] font-semibold text-[#1A3A5C] font-mono">
              NT$ {totalAmount.toLocaleString("en-US")}
            </div>
            <div className="text-[11px] text-[#9A9890]">
              選 {linesPicked} 筆 / {totalQty} 件
            </div>
          </div>
        </div>
      </header>

      {/* Step 1：選領料單 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 步驟 1：選擇要退入的領料單
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div className="md:col-span-2">
            <div className="text-[11px] text-[#9A9890] font-medium mb-1">領料單</div>
            <select
              className={inputClass + " w-full"}
              value={pick?.issue.id ?? ""}
              onChange={(e) => selectIssue(e.target.value)}
            >
              <option value="">— 請選擇 —</option>
              {issues.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.gi_no} ・ {fmtDate(i.issue_date)} ・ {i.warehouse_name ?? "—"} ・ 領{" "}
                  {i.qty_issued_total} 件 / {i.line_count} 行
                </option>
              ))}
            </select>
            <div className="text-[11px] text-[#9A9890] mt-1">
              僅顯示狀態為「已過帳」的領料單，最近 50 筆。
            </div>
          </div>
          {pick && (
            <>
              <div>
                <div className="text-[11px] text-[#9A9890] font-medium mb-1">退入倉</div>
                <div className="text-[12.5px] text-[#2C2C2A] h-[30px] flex items-center">
                  {pick.issue.warehouse_name ?? "—"}
                </div>
              </div>
            </>
          )}
        </div>
      </section>

      {/* Step 2：填退入明細 */}
      {pick && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ 步驟 2：填寫退入數量（≤ 領料數）
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] border-collapse">
              <thead>
                <tr className="border-b border-[#EEECE6] bg-[#F8F7F4]">
                  <th className="text-left px-3 py-2 text-[11px] text-[#9A9890] font-medium w-[60px]">
                    行號
                  </th>
                  <th className="text-left px-3 py-2 text-[11px] text-[#9A9890] font-medium w-[130px]">
                    品項代碼
                  </th>
                  <th className="text-left px-3 py-2 text-[11px] text-[#9A9890] font-medium">
                    品項名稱
                  </th>
                  <th className="text-left px-3 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">
                    倉位
                  </th>
                  <th className="text-right px-3 py-2 text-[11px] text-[#9A9890] font-medium w-[90px]">
                    領料數
                  </th>
                  <th className="text-right px-3 py-2 text-[11px] text-[#9A9890] font-medium w-[100px]">
                    退入數
                  </th>
                  <th className="text-right px-3 py-2 text-[11px] text-[#9A9890] font-medium w-[110px]">
                    單價
                  </th>
                  <th className="text-right px-3 py-2 text-[11px] text-[#9A9890] font-medium w-[120px]">
                    退入金額
                  </th>
                </tr>
              </thead>
              <tbody>
                {pick.lines.map((l) => {
                  const v = qtyMap[l.id] ?? 0;
                  const amount = v * l.unit_cost;
                  return (
                    <tr key={l.id} className="border-b border-[#EEECE6]">
                      <td className="px-3 py-2 font-mono text-[#9A9890]">{l.line_no}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-[#1A3A5C]">
                        {l.item_code ?? "—"}
                      </td>
                      <td className="px-3 py-2">{l.item_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[#5A5955]">{l.bin_label ?? "—"}</td>
                      <td className="px-3 py-2 text-right font-mono">{l.qty_issued}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          step="any"
                          min="0"
                          max={l.qty_issued}
                          value={v === 0 ? "" : v}
                          onChange={(e) =>
                            setQtyMap((p) => ({
                              ...p,
                              [l.id]:
                                e.target.value === ""
                                  ? 0
                                  : Math.min(l.qty_issued, Math.max(0, Number(e.target.value))),
                            }))
                          }
                          disabled={pending}
                          className="w-20 h-[26px] px-2 border border-[#D5D3CB] rounded text-[12px] text-right focus:border-[#185FA5] focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[#5A5955]">
                        {l.unit_cost.toLocaleString("en-US")}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">
                        {amount > 0 ? `NT$ ${amount.toLocaleString("en-US")}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[#1A3A5C] bg-[#F8F7F4]">
                  <td colSpan={5} className="px-3 py-2 text-[11px] text-[#9A9890]">
                    合計
                  </td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-[#2C2C2A]">
                    {totalQty}
                  </td>
                  <td></td>
                  <td className="px-3 py-2 text-right font-mono font-semibold text-[#2C2C2A]">
                    NT$ {totalAmount.toLocaleString("en-US")}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {/* Step 3：退料原因 + 備註 */}
      {pick && (
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ 步驟 3：退料原因與備註
            </span>
          </header>
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <div>
              <div className="text-[11px] text-[#9A9890] font-medium mb-1">
                退料原因 <span className="text-[#CC0000]">*</span>
              </div>
              <select
                className={inputClass + " w-full"}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              >
                {RETURN_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.value}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[11px] text-[#9A9890] font-medium mb-1">退入日期</div>
              <input
                type="date"
                className={inputClass + " w-full"}
                value={receiptDate}
                onChange={(e) => setReceiptDate(e.target.value)}
              />
            </div>
            <div></div>
            <div className="md:col-span-3">
              <div className="text-[11px] text-[#9A9890] font-medium mb-1">備註</div>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="例如：師傅多領兩件未拆封退回⋯"
                className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none"
              />
            </div>
          </div>
        </section>
      )}

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}
