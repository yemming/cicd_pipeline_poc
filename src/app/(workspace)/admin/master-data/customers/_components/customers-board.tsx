"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { setCustomerActiveAction, deleteCustomerAction } from "@/lib/master-data/customer-actions";

export type CustomerRow = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  tax_id: string | null;
  national_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  is_active: boolean;
};

export type CustomerFilters = {
  type: string;        // all | individual | corporate
  status: string;      // all | active | inactive
  q: string;
};

type Banner = { ok: boolean; msg: string } | null;

export function CustomersBoard({
  rows,
  totalCount,
  canEdit,
  filters,
}: {
  rows: CustomerRow[];
  totalCount: number;
  canEdit: boolean;
  filters: CustomerFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [fType, setFType] = useState(filters.type);
  const [fStatus, setFStatus] = useState(filters.status);
  const [fQ, setFQ] = useState(filters.q);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilters = () => {
    const params = new URLSearchParams();
    if (fType !== "all") params.set("type", fType);
    if (fStatus !== "all") params.set("status", fStatus);
    if (fQ.trim()) params.set("q", fQ.trim());
    const qs = params.toString();
    startTransition(() => {
      router.push(qs ? `/admin/master-data/customers?${qs}` : "/admin/master-data/customers");
    });
  };
  const resetFilters = () => {
    setFType("all");
    setFStatus("all");
    setFQ("");
    startTransition(() => router.push("/admin/master-data/customers"));
  };

  const toggleActive = (r: CustomerRow) => {
    startTransition(async () => {
      const res = await setCustomerActiveAction(r.id, !r.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: r.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (r: CustomerRow) => {
    if (
      !confirm(
        `確定刪除「${r.code} ${r.name}」？\n此動作不可復原；若有歷史工單／預約／車輛將會失敗，建議改用「停用」保留歷史。`,
      )
    ) return;
    startTransition(async () => {
      const res = await deleteCustomerAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除客戶" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const exportCsv = () => {
    const header = ["代碼", "客戶名稱", "類型", "統編", "身分證", "電話", "Email", "啟用"];
    const lines = [header.join(",")];
    for (const r of rows) {
      lines.push([
        r.code,
        r.name,
        r.type === "corporate" ? "公司" : "個人",
        r.tax_id ?? "",
        r.national_id ?? "",
        r.phone ?? "",
        r.email ?? "",
        r.is_active ? "啟用" : "停用",
      ].map(csvEscape).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass = "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const filteredCount = useMemo(() => rows.length, [rows.length]);

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">客戶資料</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">客戶主檔</span>
        <span className="text-[12px] text-[#9A9890]">預約・工單・報價・訂單都吃此處 customer_id</span>
      </header>

      {banner ? (
        <div className={`px-3 py-2 rounded text-[13px] ${banner.ok ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDECEA] text-[#CC0000]"}`}>
          {banner.msg}
        </div>
      ) : null}

      {/* Filter Bar */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${lockedClass}`}>
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>類型</label>
            <select value={fType} onChange={(e) => setFType(e.target.value)} className={`${inputClass} w-[110px]`}>
              <option value="all">全部</option>
              <option value="individual">個人</option>
              <option value="corporate">公司</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className={`${inputClass} w-[100px]`}>
              <option value="all">全部</option>
              <option value="active">往來中</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[240px]">
            <label className={labelClass}>代碼 / 名稱 / 電話 / 統編</label>
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
              href="/admin/master-data/customers/new"
              aria-disabled={!canEdit}
              className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${canEdit ? "" : "opacity-50 pointer-events-none"}`}
            >
              ＋ 新增客戶
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b> 筆客戶
          （顯示 <b className="text-[#2C2C2A]">{filteredCount.toLocaleString("en-US")}</b> 筆）
        </span>
        <div className="ml-auto flex gap-1.5">
          <button type="button" onClick={exportCsv} className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]">
            匯出 CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <section className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[11px] text-[#9A9890] bg-[#F8F7F4] border-b border-[#EEECE6]">
              <th className="text-left font-medium py-2 px-3 w-[110px]">代碼</th>
              <th className="text-left font-medium py-2 px-3">客戶名稱</th>
              <th className="text-left font-medium py-2 px-3 w-[80px]">類型</th>
              <th className="text-left font-medium py-2 px-3 w-[120px]">統編</th>
              <th className="text-left font-medium py-2 px-3 w-[140px]">電話</th>
              <th className="text-left font-medium py-2 px-3">Email</th>
              <th className="text-left font-medium py-2 px-3 w-[80px]">狀態</th>
              <th className="text-right font-medium py-2 px-3 w-[200px]">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-[12px] text-[#9A9890]">
                  尚無符合條件的客戶資料
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-t border-[#F8F7F4] hover:bg-[#FBFAF7]">
                  <td className="py-2 px-3">
                    <Link href={`/admin/master-data/customers/${r.id}`} className="font-mono text-[#185FA5] hover:underline">
                      {r.code}
                    </Link>
                  </td>
                  <td className="py-2 px-3">
                    <Link href={`/admin/master-data/customers/${r.id}`} className="font-medium text-[#2C2C2A] hover:text-[#185FA5]">
                      {r.name}
                    </Link>
                    {r.address ? (
                      <div className="text-[10.5px] text-[#9A9890] truncate max-w-[260px]">{r.address}</div>
                    ) : null}
                  </td>
                  <td className="py-2 px-3">
                    {r.type === "corporate" ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">公司</span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">個人</span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11.5px]">
                    {r.tax_id ?? <span className="text-[#9A9890]">—</span>}
                  </td>
                  <td className="py-2 px-3 font-mono text-[11.5px]">
                    {r.phone ?? <span className="text-[#9A9890]">—</span>}
                  </td>
                  <td className="py-2 px-3 text-[11.5px]">
                    {r.email ?? <span className="text-[#9A9890]">—</span>}
                  </td>
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${r.is_active ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#F2F2F2] text-[#6B6A68]"}`}>
                      {r.is_active ? "往來中" : "停用"}
                    </span>
                  </td>
                  <td className="py-2 px-3 text-right">
                    <div className="inline-flex gap-1.5">
                      <Link
                        href={`/admin/master-data/customers/${r.id}`}
                        className="h-[26px] inline-flex items-center px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                      >
                        編輯
                      </Link>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggleActive(r)}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                      >
                        {r.is_active ? "停用" : "啟用"}
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => removeRow(r)}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
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
