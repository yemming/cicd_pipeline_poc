"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  approveRequisitionAction,
  rejectRequisitionAction,
  deleteRequisitionAction,
} from "@/lib/parts/actions/requisition-actions";

export type RequisitionRow = {
  id: string;
  req_no: string;
  org_id: string | null;
  status: string;
  required_date: string | null;
  notes: string | null;
  approved_at: string | null;
  // 第一行明細展開（demo 一張單對應一行）
  item_code: string | null;
  item_name: string | null;
  qty_required: number | null;
  uom: string | null;
};

export type OrgRef = { id: string; code: string; name: string };

export type RequisitionFilters = {
  org: string;       // all | <org_id>
  status: string;    // all | submitted | approved | converted | cancelled
  q: string;
};

type Banner = { ok: boolean; msg: string } | null;

const STATUS_META: Record<string, { label: string; chip: string }> = {
  draft:     { label: "草稿",       chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  submitted: { label: "待審核",     chip: "bg-[#FDF3E3] text-[#854F0B]" },
  approved:  { label: "已核准",     chip: "bg-[#EAF3DE] text-[#3B6D11]" },
  converted: { label: "已轉採購單", chip: "bg-[#EAF4FB] text-[#185FA5]" },
  cancelled: { label: "已拒絕",     chip: "bg-[#FDECEA] text-[#CC0000]" },
};

export function RequisitionsBoard({
  rows,
  totalCount,
  orgs,
  canEdit,
  canApprove,
  filters,
}: {
  rows: RequisitionRow[];
  totalCount: number;
  orgs: OrgRef[];
  canEdit: boolean;
  canApprove: boolean;
  filters: RequisitionFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fOrg, setFOrg] = useState(filters.org);
  const [fStatus, setFStatus] = useState(filters.status);
  const [fQ, setFQ] = useState(filters.q);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilters = () => {
    const params = new URLSearchParams();
    if (fOrg !== "all") params.set("org", fOrg);
    if (fStatus !== "all") params.set("status", fStatus);
    if (fQ.trim()) params.set("q", fQ.trim());
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/parts/purchase/requisitions?${qs}` : "/parts/purchase/requisitions");
    });
  };
  const resetFilters = () => {
    setFOrg("all");
    setFStatus("all");
    setFQ("");
    startTransition(() => router.push("/parts/purchase/requisitions"));
  };

  const approve = (r: RequisitionRow) => {
    startTransition(async () => {
      const res = await approveRequisitionAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${r.req_no} 已核准，可轉採購單` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const reject = (r: RequisitionRow) => {
    if (!confirm(`確定拒絕「${r.req_no}」？\n此動作不可復原（需重新提出）。`)) return;
    startTransition(async () => {
      const res = await rejectRequisitionAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ ${r.req_no} 已拒絕` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = (r: RequisitionRow) => {
    if (!confirm(`確定刪除「${r.req_no}」？\n此動作會移除單頭與明細，不可復原。`)) return;
    startTransition(async () => {
      const res = await deleteRequisitionAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除需求單" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const exportCsv = () => {
    const header = ["需求單號", "提出門店", "料號", "品名", "需求數量", "單位", "需求日期", "狀態", "備註"];
    const lines = [header.join(",")];
    const orgMap = new Map(orgs.map((o) => [o.id, o]));
    for (const r of rows) {
      const orgName = r.org_id ? orgMap.get(r.org_id)?.name ?? "—" : "—";
      const status = STATUS_META[r.status]?.label ?? r.status;
      lines.push([
        r.req_no, orgName, r.item_code ?? "", r.item_name ?? "",
        r.qty_required ?? "", r.uom ?? "", r.required_date ?? "",
        status, r.notes ?? "",
      ].map(v => csvEscape(String(v))).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `requisitions-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass = "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const orgMap = new Map(orgs.map((o) => [o.id, o]));

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">採購需求處理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">04.0</span>
        <span className="text-[12px] text-[#9A9890]">需求單建立・審核・轉採購單</span>
      </header>

      <div className="bg-[#EAF4FB] border border-[#B5D4F4] rounded-lg px-4 py-2.5 text-[12px] text-[#1A3A5C]">
        📋 需求處理：門店服務人員提出備料／補貨需求，採購部門審核後轉為正式採購單。
      </div>

      {banner ? (
        <div className={`px-3 py-2 rounded text-[13px] ${banner.ok ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDECEA] text-[#CC0000]"}`}>
          {banner.msg}
        </div>
      ) : null}

      {/* Filter Bar */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${lockedClass}`}>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>門店</label>
            <select value={fOrg} onChange={(e) => setFOrg(e.target.value)} className={`${inputClass} w-[160px]`}>
              <option value="all">全部門店</option>
              {orgs.map((o) => (<option key={o.id} value={o.id}>{o.name}</option>))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={`${inputClass} w-[120px]`}>
              <option value="all">全部</option>
              <option value="submitted">待審核</option>
              <option value="approved">已核准</option>
              <option value="converted">已轉採購單</option>
              <option value="cancelled">已拒絕</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
            <label className={labelClass}>需求單號 / 料號 / 品名</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入關鍵字..."
              className={`${inputClass} w-full`}
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button type="button" onClick={submitFilters} disabled={isPending} className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60">
              {isPending ? "查詢中…" : "查詢"}
            </button>
            <button type="button" onClick={resetFilters} className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">
              重置
            </button>
            <Link
              href="/parts/purchase/requisitions/new"
              aria-disabled={!canEdit}
              className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
            >
              ＋ 新增需求
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b> 筆需求單
          （顯示 <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b> 筆）
        </span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={exportCsv} className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">
            匯出 CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890] bg-[#F8F7F4] border-b border-[#EEECE6]">
                <th className="text-left font-medium py-2 px-3 w-[140px]">需求單號</th>
                <th className="text-left font-medium py-2 px-3 w-[120px]">提出門店</th>
                <th className="text-left font-medium py-2 px-3">料號 / 品名</th>
                <th className="text-right font-medium py-2 px-3 w-[80px]">需求量</th>
                <th className="text-left font-medium py-2 px-3 w-[110px]">需求日期</th>
                <th className="text-left font-medium py-2 px-3 w-[110px]">狀態</th>
                <th className="text-left font-medium py-2 px-3">備註</th>
                <th className="text-right font-medium py-2 px-3 w-[280px]">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-[12px] text-[#9A9890]">
                    尚無符合條件的需求單。需求單通常由門店建立或系統自動補貨產生。
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const status = STATUS_META[r.status] ?? STATUS_META.draft;
                  const isPendingApproval = r.status === "submitted";
                  const isConverted = r.status === "converted";
                  return (
                    <tr key={r.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                      <td className="py-2 px-3">
                        <Link href={`/parts/purchase/requisitions/${r.id}`} className="font-mono text-[#185FA5] hover:underline">
                          {r.req_no}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-[11.5px]">
                        {r.org_id ? orgMap.get(r.org_id)?.name ?? <span className="text-[#9A9890]">—</span> : <span className="text-[#9A9890]">—</span>}
                      </td>
                      <td className="py-2 px-3">
                        {r.item_name ? (
                          <>
                            <div className="font-medium">{r.item_name}</div>
                            <div className="font-mono text-[10.5px] text-[#9A9890]">{r.item_code}</div>
                          </>
                        ) : <span className="text-[#9A9890]">—</span>}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {r.qty_required ?? "—"} {r.uom ? <span className="text-[10.5px] text-[#9A9890]">{r.uom}</span> : null}
                      </td>
                      <td className="py-2 px-3 font-mono text-[11.5px]">{r.required_date ?? "—"}</td>
                      <td className="py-2 px-3">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${status.chip}`}>
                          {status.label}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-[11.5px] text-[#5A5955] max-w-[220px] truncate" title={r.notes ?? ""}>
                        {r.notes ?? <span className="text-[#9A9890]">—</span>}
                      </td>
                      <td className="py-2 px-3 text-right whitespace-nowrap">
                        <div className="inline-flex gap-1.5 flex-nowrap items-center justify-end">
                          {isPendingApproval ? (
                            <>
                              <button
                                type="button"
                                disabled={!canApprove}
                                onClick={() => approve(r)}
                                className="h-[26px] inline-flex items-center px-3 rounded-full text-[11.5px] font-medium whitespace-nowrap bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                              >
                                核准
                              </button>
                              <button
                                type="button"
                                disabled={!canApprove}
                                onClick={() => reject(r)}
                                className="h-[26px] inline-flex items-center px-3 rounded-full text-[11.5px] font-medium whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                              >
                                拒絕
                              </button>
                            </>
                          ) : isConverted ? (
                            <Link
                              href={`/parts/purchase/requisitions/${r.id}`}
                              className="h-[26px] inline-flex items-center px-3 rounded-full text-[11.5px] font-medium whitespace-nowrap bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
                            >
                              查看採購單
                            </Link>
                          ) : null}
                          <Link
                            href={`/parts/purchase/requisitions/${r.id}`}
                            className="h-[26px] inline-flex items-center px-3 rounded-full text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
                          >
                            詳情
                          </Link>
                          {!isConverted ? (
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => remove(r)}
                              className="h-[26px] inline-flex items-center px-3 rounded-full text-[11.5px] font-medium whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                            >
                              刪除
                            </button>
                          ) : null}
                        </div>
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

function csvEscape(v: string): string {
  if (v.includes(",") || v.includes("\"") || v.includes("\n")) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}
