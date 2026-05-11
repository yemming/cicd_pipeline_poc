"use client";

import type { TransferListRow } from "@/domain/transfers";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft: { label: "草稿", chip: "bg-[#FEF9C3] text-[#5C4500]" },
  in_transit: { label: "在途", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  partial: { label: "部分出貨", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  received: { label: "已收貨", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  closed: { label: "已結案", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

function fmtDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function TransferOutBoard({
  rows,
  canEdit,
}: {
  rows: TransferListRow[];
  canEdit: boolean;
}) {
  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">調撥出庫</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          6.2
        </span>
        <span className="text-[12px] text-[#9A9890]">建立調撥單、從本倉出貨給其他倉</span>
      </header>

      <div className="flex items-center gap-2 justify-between">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆調撥出庫
        </span>
        <button
          type="button"
          disabled={!canEdit}
          title={canEdit ? "Phase 2 開放" : "沒有權限"}
          className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white opacity-60 cursor-not-allowed"
        >
          ＋ 新增調撥
        </button>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">調撥單號</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">來源倉</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">目標倉</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">出貨日</th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold">出貨/到貨</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">狀態</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">原因</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[12px] text-[#9A9890]">
                    沒有出貨中的調撥單
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const def = STATUS_LABEL[r.status ?? ""] ?? STATUS_LABEL.draft;
                  return (
                    <tr key={r.id} className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]">
                      <td className="px-3 py-2 font-mono text-[12px] text-[#1A3A5C] font-semibold">
                        {r.tr_no ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12.5px]">{r.source_warehouse_name ?? "—"}</td>
                      <td className="px-3 py-2 text-[12.5px]">{r.target_warehouse_name ?? "—"}</td>
                      <td className="px-3 py-2 font-mono text-[12px]">{fmtDate(r.ship_date)}</td>
                      <td className="px-3 py-2 text-right font-mono text-[12px]">
                        {r.qty_shipped_total ?? 0} / {r.qty_received_total ?? 0}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}>
                          {def.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[#5A5955]">{r.reason ?? "—"}</td>
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
