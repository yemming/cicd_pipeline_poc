"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  setCustomerActiveAction,
  deleteCustomerAction,
} from "@/lib/master-data/customer-actions";

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
  type: string; // all | individual | corporate
  status: string; // all | active | inactive
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
      router.push(
        qs
          ? `/admin/master-data/customers?${qs}`
          : "/admin/master-data/customers",
      );
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
    )
      return;
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

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<CustomerRow>[] = [
    {
      id: "code",
      header: "代碼",
      width: 110,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/admin/master-data/customers/${r.id}`}
          className="font-mono text-[#185FA5] hover:underline"
        >
          {r.code}
        </Link>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "客戶名稱",
      cell: (r) => (
        <>
          <Link
            href={`/admin/master-data/customers/${r.id}`}
            className="font-medium text-[#2C2C2A] hover:text-[#185FA5]"
          >
            {r.name}
          </Link>
          {r.address ? (
            <div className="text-[10.5px] text-[#9A9890] truncate max-w-[260px]">
              {r.address}
            </div>
          ) : null}
        </>
      ),
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "type",
      header: "類型",
      width: 80,
      cell: (r) =>
        r.type === "corporate" ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
            公司
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EBF3FF] text-[#1A3A5C]">
            個人
          </span>
        ),
      exportValue: (r) => (r.type === "corporate" ? "公司" : "個人"),
      sortValue: (r) => r.type,
    },
    {
      id: "tax_id",
      header: "統編",
      width: 120,
      cell: (r) =>
        r.tax_id ? (
          <span className="font-mono text-[11.5px]">{r.tax_id}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.tax_id ?? "",
      sortValue: (r) => r.tax_id ?? "",
    },
    {
      id: "national_id",
      header: "身分證",
      width: 130,
      defaultHidden: true,
      cell: (r) =>
        r.national_id ? (
          <span className="font-mono text-[11.5px]">{r.national_id}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.national_id ?? "",
      sortValue: (r) => r.national_id ?? "",
    },
    {
      id: "phone",
      header: "電話",
      width: 140,
      cell: (r) =>
        r.phone ? (
          <span className="font-mono text-[11.5px]">{r.phone}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.phone ?? "",
      sortValue: (r) => r.phone ?? "",
    },
    {
      id: "email",
      header: "Email",
      cell: (r) =>
        r.email ? (
          <span className="text-[11.5px]">{r.email}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.email ?? "",
      sortValue: (r) => r.email ?? "",
    },
    {
      id: "is_active",
      header: "狀態",
      width: 80,
      cell: (r) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
            r.is_active
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#F2F2F2] text-[#6B6A68]"
          }`}
        >
          {r.is_active ? "往來中" : "停用"}
        </span>
      ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">客戶資料</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          客戶主檔
        </span>
        <span className="text-[12px] text-[#9A9890]">
          預約・工單・報價・訂單都吃此處 customer_id
        </span>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Filter Bar */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${lockedClass}`}
      >
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>類型</label>
            <select
              value={fType}
              onChange={(e) => setFType(e.target.value)}
              className={`${inputClass} w-[110px]`}
            >
              <option value="all">全部</option>
              <option value="individual">個人</option>
              <option value="corporate">公司</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className={`${inputClass} w-[100px]`}
            >
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
            <button
              type="button"
              onClick={submitFilters}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中…" : "查詢"}
            </button>
            <button
              type="button"
              onClick={resetFilters}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              重置
            </button>
            <Link
              href="/admin/master-data/customers/new"
              aria-disabled={!canEdit}
              className={`h-[30px] inline-flex items-center px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] ${
                canEdit ? "" : "opacity-50 pointer-events-none"
              }`}
            >
              ＋ 新增客戶
            </Link>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b>{" "}
          筆客戶（顯示{" "}
          <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b>{" "}
          筆）
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/master-data/customers"
        exportFileName="customers"
        emptyMessage="尚無符合條件的客戶資料"
        disabled={isPending}
        rowActionsWidth={210}
        rowActions={(r) => (
          <>
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
          </>
        )}
      />
    </main>
  );
}
