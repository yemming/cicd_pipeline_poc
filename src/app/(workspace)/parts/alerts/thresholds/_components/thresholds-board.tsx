"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ThresholdListRow } from "@/domain/alerts";

const ABC_CHIP: Record<string, string> = {
  A: "bg-[#FDECEA] text-[#CC0000]",
  B: "bg-[#FDF3E3] text-[#854F0B]",
  C: "bg-[#E8F5F0] text-[#0F6E56]",
};

const PRIORITY_CHIP: Record<string, { label: string; chip: string }> = {
  critical: { label: "緊急", chip: "bg-[#FDECEA] text-[#CC0000]" },
  high: { label: "高", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  normal: { label: "一般", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  low: { label: "低", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

export function ThresholdsBoard({
  rows,
  canEdit,
  initialAbc,
  initialQ,
}: {
  rows: ThresholdListRow[];
  canEdit: boolean;
  initialAbc: string;
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [abc, setAbc] = useState(initialAbc);
  const [q, setQ] = useState(initialQ);

  function applyFilter() {
    const params = new URLSearchParams();
    if (abc) params.set("abc_class", abc);
    if (q) params.set("q", q);
    startTransition(() =>
      router.push(`/parts/alerts/thresholds${params.toString() ? "?" + params : ""}`),
    );
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">庫存水位設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          10.1
        </span>
        <span className="text-[12px] text-[#9A9890]">設定每個料號的安全庫存、再訂購點、最大水位</span>
      </header>

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">ABC 類別</label>
            <select
              value={abc}
              onChange={(e) => setAbc(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              <option value="">全部</option>
              <option value="A">A 類</option>
              <option value="B">B 類</option>
              <option value="C">C 類</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">商品搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="代碼或名稱..."
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
            <button
              type="button"
              disabled={!canEdit}
              title={canEdit ? "Phase 2 開放" : "沒有權限"}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white opacity-60 cursor-not-allowed"
            >
              ＋ 新增水位
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆水位設定
        </span>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">料號</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">品名</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">倉庫</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">ABC</th>
                <th className="px-3 py-2 text-right text-[11px] text-[#9A9890] font-semibold">最低 / 安全 / 再訂 / 最高</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">告警等級</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">啟用</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-[12px] text-[#9A9890]">
                    沒有符合條件的水位設定
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const pdef = PRIORITY_CHIP[r.alert_priority ?? ""] ?? PRIORITY_CHIP.normal;
                  return (
                    <tr key={r.id} className="border-t border-[#EEECE6] hover:bg-[#F8F7F4]">
                      <td className="px-3 py-2 font-mono text-[12px]">{r.item_code ?? "—"}</td>
                      <td className="px-3 py-2 text-[12.5px]">{r.item_name ?? "—"}</td>
                      <td className="px-3 py-2 text-[12.5px]">{r.warehouse_name ?? "全部"}</td>
                      <td className="px-3 py-2">
                        {r.abc_class ? (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${ABC_CHIP[r.abc_class] ?? "bg-[#F2F2F2] text-[#6B6A68]"}`}>
                            {r.abc_class}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-[12px]">
                        {r.min_stock ?? "—"} / {r.safety_stock ?? "—"} / {r.reorder_point ?? "—"} / {r.max_stock ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${pdef.chip}`}>
                          {pdef.label}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${r.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"}`}
                        >
                          {r.is_active ? "啟用" : "停用"}
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
