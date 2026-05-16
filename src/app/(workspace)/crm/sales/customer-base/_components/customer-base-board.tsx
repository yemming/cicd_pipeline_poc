"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  setCustomerActiveAction,
  deleteCustomerAction,
} from "@/lib/sales/customer-base-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";

export type CustomerBaseRow = {
  id: string;
  code: string;
  name: string;
  type: "individual" | "corporate";
  tax_id: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  source_module: string | null;
  is_active: boolean;
  vehicle_count: number;
  contact_count: number;
};

export type CustomerBaseFilters = {
  type: string;
  status: string;
  q: string;
};

type Banner = { ok: boolean; msg: string } | null;

export function CustomerBaseBoard({
  rows,
  totalCount,
  canEdit,
  filters,
}: {
  rows: CustomerBaseRow[];
  totalCount: number;
  canEdit: boolean;
  filters: CustomerBaseFilters;
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
        qs ? `/crm/sales/customer-base?${qs}` : "/crm/sales/customer-base",
      );
    });
  };
  const resetFilters = () => {
    setFType("all");
    setFStatus("all");
    setFQ("");
    startTransition(() => router.push("/crm/sales/customer-base"));
  };

  const toggleActive = (r: CustomerBaseRow) => {
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

  const removeRow = (r: CustomerBaseRow) => {
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

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  const columns: DataGridColumn<CustomerBaseRow>[] = [
    {
      id: "code",
      header: "客戶代碼",
      width: 110,
      hideable: false,
      cell: (r) => (
        <Link
          href={`/crm/sales/customer-base/${r.id}`}
          className="font-mono text-[12px] text-[#185FA5] hover:underline"
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
        <div>
          <Link
            href={`/crm/sales/customer-base/${r.id}`}
            className="font-semibold text-[12.5px] text-[#185FA5] hover:underline"
          >
            {r.name}
          </Link>
          {r.address ? (
            <div className="text-[11px] text-[#9A9890] truncate max-w-[280px]">
              {r.address}
            </div>
          ) : null}
        </div>
      ),
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "type",
      header: "類型",
      width: 70,
      cell: (r) =>
        r.type === "corporate" ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EEF4FB] text-[#185FA5]">
            公司
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
            個人
          </span>
        ),
      exportValue: (r) => (r.type === "corporate" ? "公司" : "個人"),
      sortValue: (r) => r.type,
    },
    {
      id: "tax_id",
      header: "統編",
      width: 100,
      cell: (r) =>
        r.tax_id ? (
          <span className="font-mono text-[11.5px]">{r.tax_id}</span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.tax_id ?? "",
      sortValue: (r) => r.tax_id ?? "",
    },
    {
      id: "phone",
      header: "聯絡電話",
      width: 130,
      cell: (r) =>
        r.phone ? (
          <span className="font-mono text-[11.5px]">{r.phone}</span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
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
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.email ?? "",
      sortValue: (r) => r.email ?? "",
      defaultHidden: false,
    },
    {
      id: "vehicle_count",
      header: "車輛數",
      width: 80,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {r.vehicle_count}
        </span>
      ),
      exportValue: (r) => r.vehicle_count,
      sortValue: (r) => r.vehicle_count,
    },
    {
      id: "contact_count",
      header: "聯絡人數",
      width: 90,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#2C2C2A]">
          {r.contact_count}
        </span>
      ),
      exportValue: (r) => r.contact_count,
      sortValue: (r) => r.contact_count,
    },
    {
      id: "source_module",
      header: "來源",
      width: 90,
      defaultHidden: true,
      cell: (r) =>
        r.source_module ? (
          <span className="font-mono text-[11px] text-[#5A5955]">
            {r.source_module}
          </span>
        ) : (
          <span className="text-[#9A9890] text-[12px]">—</span>
        ),
      exportValue: (r) => r.source_module ?? "",
      sortValue: (r) => r.source_module ?? "",
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
      exportValue: (r) => (r.is_active ? "往來中" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          銷售客戶基盤
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          CRM
        </span>
        <span className="text-[12px] text-[#9A9890]">
          銷售團隊客戶名單・聯絡狀態・名下車輛
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
        className={`bg-white border border-[#EEECE6] rounded-lg px-4 py-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}
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
            <label className={labelClass}>
              代碼 / 名稱 / 電話 / 統編 / Email
            </label>
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
              href="/crm/sales/customer-base/new"
              aria-disabled={!canEdit}
              data-testid="customer-base-create-link"
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
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b>{" "}
          筆客戶（顯示{" "}
          <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b>{" "}
          筆）
        </span>
      </div>

      {/* Table */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/crm/customer-base"
        exportFileName={`sales-customer-base-${new Date().toISOString().slice(0, 10)}`}
        disabled={isPending}
        emptyMessage={
          filters.q || filters.type !== "all" || filters.status !== "all"
            ? "無符合條件的客戶，請調整篩選條件"
            : "尚無客戶資料，點右上「＋ 新增客戶」開始建檔"
        }
        rowActionsWidth={210}
        rowActions={(r) => (
          <>
            <Link
              href={`/crm/sales/customer-base/${r.id}`}
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
