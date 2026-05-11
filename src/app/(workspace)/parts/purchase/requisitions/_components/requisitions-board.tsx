"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { RequisitionWithLines } from "@/domain/requisitions";

const STATUS_LABEL: Record<string, { label: string; chip: string }> = {
  draft: { label: "草稿", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  pending: { label: "待審核", chip: "bg-[#FDF3E3] text-[#854F0B]" },
  approved: { label: "已核准", chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  converted: { label: "已轉採購單", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  rejected: { label: "已拒絕", chip: "bg-[#FDECEA] text-[#CC0000]" },
  cancelled: { label: "已取消", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
};

function formatDate(d: string | null): string {
  return d ? d.replace(/-/g, "/") : "—";
}

export function RequisitionsBoard({
  rows,
  canEdit,
  initialStatus,
}: {
  rows: RequisitionWithLines[];
  canEdit: boolean;
  initialStatus: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState(initialStatus);

  function applyFilter() {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    startTransition(() =>
      router.push(`/parts/purchase/requisitions${params.toString() ? "?" + params : ""}`),
    );
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">採購需求處理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          4.3
        </span>
        <span className="text-[12px] text-[#9A9890]">需求單建立 · 審核 · 轉採購單</span>
      </header>

      <div className="bg-[#EAF4FB] border border-[#B5D4F4] rounded-md px-4 py-2.5 text-[12px] text-[#1A3A5C]">
        📋 需求處理：門店服務人員提出備料/補貨需求，採購部門審核後轉為正式採購單。
      </div>

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
              <option value="pending">待審核</option>
              <option value="approved">已核准</option>
              <option value="converted">已轉採購單</option>
              <option value="rejected">已拒絕</option>
            </select>
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
              href="/parts/purchase/requisitions/new"
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] inline-flex items-center"
            >
              ＋ 新增需求
            </Link>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆
        </span>
      </div>

      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-[#F8F7F4]">
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">需求單號</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">提出門店</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">料號 / 品名</th>
                <th className="px-3 py-2 text-center text-[11px] text-[#9A9890] font-semibold">需求數量</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">需求日期</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">狀態</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold">備註</th>
                <th className="px-3 py-2 text-left text-[11px] text-[#9A9890] font-semibold w-[120px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-[12px] text-[#9A9890]">
                    沒有符合條件的需求單
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const status = r.status ?? "pending";
                  const def = STATUS_LABEL[status] ?? STATUS_LABEL.pending;
                  return (
                    <tr key={r.id} className="border-t border-[#EEECE6]">
                      <td className="px-3 py-2 font-mono text-[12px] text-[#1A3A5C] font-semibold">
                        {r.req_no ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-[12.5px]">{r.store_name ?? "—"}</td>
                      <td className="px-3 py-2 text-[12.5px]">
                        {r.first_item ? (
                          <>
                            <div>{r.first_item.name}</div>
                            <div className="font-mono text-[11px] text-[#9A9890]">
                              {r.first_item.code}
                            </div>
                          </>
                        ) : (
                          "—"
                        )}
                        {r.line_count > 1 && (
                          <span className="ml-1 text-[10px] text-[#9A9890]">
                            +{r.line_count - 1}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center font-mono text-[12px]">
                        {r.first_item?.qty ?? 0}
                      </td>
                      <td className="px-3 py-2 font-mono text-[12px]">{formatDate(r.required_date)}</td>
                      <td className="px-3 py-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}>
                          {def.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-[12px] text-[#5A5955]">{r.notes ?? "—"}</td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/parts/purchase/requisitions/${r.id}`}
                          className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] inline-flex items-center hover:border-[#9A9890]"
                        >
                          詳細
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
      {!canEdit && (
        <div className="text-[11px] text-[#9A9890]">💡 你目前沒有審核權限（PR_APPROVE），僅能檢視</div>
      )}
    </main>
  );
}
