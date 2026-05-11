"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { StockBalanceRow } from "@/domain/stock";

const STATUS_LABEL: Record<string, string> = {
  on_hand: "在庫",
  reserved: "保留",
  issued: "已發",
  damaged: "損壞",
};

export function StockBalanceBoard({
  rows,
  initialQ,
}: {
  rows: StockBalanceRow[];
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initialQ);

  function applyFilter() {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    startTransition(() =>
      router.push(`/parts/operations/balance${params.toString() ? "?" + params : ""}`),
    );
  }

  const total = rows.reduce((sum, r) => sum + r.on_hand_qty, 0);
  const distinctItems = new Set(rows.map((r) => r.item_id)).size;

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">商品庫存查詢</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          7.0
        </span>
        <span className="text-[12px] text-[#9A9890]">即時 stock_items 庫存彙整</span>
      </header>

      {/* KPI */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">不重複料號</div>
          <div className="text-[24px] font-semibold font-mono mt-1 text-[#1A3A5C]">{distinctItems}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">總庫存件數</div>
          <div className="text-[24px] font-semibold font-mono mt-1 text-[#0F6E56]">{total}</div>
        </div>
        <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
          <div className="text-[11px] text-[#9A9890]">行數</div>
          <div className="text-[24px] font-semibold font-mono mt-1 text-[#854F0B]">{rows.length}</div>
        </div>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">商品搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="代碼或名稱..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[240px]"
            />
          </div>
          <button
            type="button"
            onClick={applyFilter}
            disabled={isPending}
            className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
          >
            {isPending ? "查詢中⋯" : "查詢"}
          </button>
        </div>
      </section>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">料號</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">品名</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">倉庫</th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold">數量</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">狀態組成</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-10 text-center text-[12px] text-[#9A9890]">
                    沒有符合條件的庫存
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={`${r.item_id}-${r.warehouse_id ?? ""}`} className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]">
                    <td className="px-3 py-2 font-mono text-[12px] text-[#1A3A5C] font-semibold">
                      {r.item_code}
                    </td>
                    <td className="px-3 py-2 text-[12.5px]">{r.item_name}</td>
                    <td className="px-3 py-2 text-[12.5px]">{r.warehouse_name ?? "—"}</td>
                    <td className="px-3 py-2 text-right font-mono text-[12px]">{r.on_hand_qty}</td>
                    <td className="px-3 py-2 text-[11.5px] text-[#5A5955]">
                      {Object.entries(r.status_breakdown).map(([s, q]) => (
                        <span key={s} className="mr-2">
                          {STATUS_LABEL[s] ?? s}: <b className="font-mono">{q}</b>
                        </span>
                      ))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
