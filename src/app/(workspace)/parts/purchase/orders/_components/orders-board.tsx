"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { PurchaseOrderListRow } from "@/domain/orders";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft: { label: "草稿", chip: "bg-[#FEF9C3] text-[#5C4500]" },
  submitted: { label: "已送出", chip: "bg-[#DBEAFE] text-[#1D4ED8]" },
  approved: { label: "已核准", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  partial: { label: "部分到貨", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  closed: { label: "已結案", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  cancelled: { label: "已取消", chip: "bg-[#FDECEA] text-[#CC0000]" },
};

const TYPE_LABEL: Record<string, string> = {
  planned: "計畫採購",
  urgent: "緊急採購",
  oem_import: "原廠匯入",
};

function fmtMoney(n: number | null): string {
  if (n === null || n === undefined) return "—";
  return `NT$ ${n.toLocaleString("en-US")}`;
}

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function OrdersBoard({
  rows,
  canEdit,
  initialStatus,
  initialQ,
}: {
  rows: PurchaseOrderListRow[];
  canEdit: boolean;
  initialStatus: string;
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);
  const [q, setQ] = useState(initialQ);

  function applyFilter() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (q) params.set("q", q);
    startTransition(() =>
      router.push(`/parts/purchase/orders${params.toString() ? "?" + params : ""}`),
    );
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">商品採購</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          4.4
        </span>
        <span className="text-[12px] text-[#9A9890]">
          建立採購單、供應商確認、追蹤到貨進度
        </span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">狀態</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              <option value="draft">草稿</option>
              <option value="submitted">已送出</option>
              <option value="approved">已核准</option>
              <option value="partial">部分到貨</option>
              <option value="closed">已結案</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">PO 編號搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="搜尋 PO 編號..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[200px]"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={applyFilter}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <Link
              href="/parts/purchase/orders/new"
              className={`h-[30px] px-3 rounded text-[12.5px] font-medium inline-flex items-center ${
                canEdit
                  ? "bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                  : "bg-[#0F6E56] text-white opacity-60 pointer-events-none"
              }`}
            >
              ＋ 新增採購單
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆採購單
        </span>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">PO 編號</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">供應商</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">入庫倉</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">類型</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">下單日</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">預計到貨</th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold">含稅金額</th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold">到貨進度</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">狀態</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-[12px] text-[#9A9890]">
                    沒有符合條件的採購單
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const def = STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.draft;
                  return (
                    <tr key={r.id} className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]">
                      <td className="px-3 py-2">
                        <Link
                          href={`/parts/purchase/orders/${r.id}`}
                          className="font-mono text-[12px] text-[#1A3A5C] font-semibold hover:underline"
                        >
                          {r.po_no ?? "—"}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-[12.5px]">{r.vendor_name ?? "—"}</td>
                      <td className="px-3 py-2 text-[12.5px]">{r.warehouse_name ?? "—"}</td>
                      <td className="px-3 py-2 text-[12px]">{TYPE_LABEL[r.purchase_type ?? ""] ?? r.purchase_type ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[12px]">{fmtDate(r.po_date)}</td>
                      <td className="px-3 py-2 font-mono text-[12px]">{fmtDate(r.eta_date)}</td>
                      <td className="px-3 py-2 text-right font-mono text-[12px]">
                        {fmtMoney(r.amount_total)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[12px]">
                        {r.receipt_progress_pct === null ? "—" : `${r.receipt_progress_pct}%`}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}>
                          {def.label}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
