"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { deleteSupplierAction } from "@/lib/master-data/supplier-actions";
import type { Supplier } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;

const TYPE_LABEL: Record<string, string> = {
  oem: "OEM 原廠",
  agent: "代理商",
  consumable: "耗材／工具",
  services: "服務商",
  other: "其他",
};

export function SuppliersBoard({
  rows,
  canEdit,
}: {
  rows: Supplier[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const removeRow = (s: Supplier) => {
    if (!confirm(`確定刪除供應商「${s.code} ${s.name}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteSupplierAction(s.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<Supplier>[] = [
    {
      id: "code",
      header: "代碼",
      width: 110,
      hideable: false,
      cell: (s) => (
        <Link
          href={`/admin/master-data/suppliers/${s.id}`}
          className="font-mono font-semibold text-[#1A3A5C] hover:underline"
        >
          {s.code}
        </Link>
      ),
      exportValue: (s) => s.code,
      sortValue: (s) => s.code,
    },
    {
      id: "name",
      header: "供應商名稱",
      cell: (s) => <span className="font-medium">{s.name}</span>,
      exportValue: (s) => s.name,
      sortValue: (s) => s.name,
    },
    {
      id: "type",
      header: "類型",
      width: 110,
      cell: (s) => (
        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
          {TYPE_LABEL[s.type] ?? s.type}
        </span>
      ),
      exportValue: (s) => TYPE_LABEL[s.type] ?? s.type,
      sortValue: (s) => s.type,
    },
    {
      id: "tax_id",
      header: "統編",
      width: 120,
      cell: (s) =>
        s.tax_id ? (
          <span className="font-mono text-[12px]">{s.tax_id}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (s) => s.tax_id ?? "",
      sortValue: (s) => s.tax_id ?? "",
    },
    {
      id: "phone",
      header: "電話",
      width: 140,
      cell: (s) =>
        s.phone ? (
          <span className="font-mono text-[12px]">{s.phone}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (s) => s.phone ?? "",
      sortValue: (s) => s.phone ?? "",
    },
    {
      id: "currency",
      header: "幣別",
      width: 80,
      cell: (s) => (
        <span className="font-mono text-[12px]">{s.default_currency}</span>
      ),
      exportValue: (s) => s.default_currency,
      sortValue: (s) => s.default_currency,
    },
    {
      id: "active",
      header: "狀態",
      width: 80,
      cell: (s) =>
        s.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            往來中
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
            停用
          </span>
        ),
      exportValue: (s) => (s.is_active ? "往來中" : "停用"),
      sortValue: (s) => s.is_active,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">供應商</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Master Data
        </span>
        <span className="text-[12px] text-[#9A9890]">
          採購單 / 進貨單吃此處 supplier_id
        </span>
        {canEdit && (
          <button
            onClick={() => router.push("/admin/master-data/suppliers/new")}
            disabled={isPending}
            className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增供應商
          </button>
        )}
      </header>

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

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b> 筆供應商
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(s) => s.id}
        persistKey="admin/master-data/suppliers"
        exportFileName="suppliers"
        emptyMessage="尚無供應商資料 — 點右上角「新增供應商」開始建立"
        disabled={isPending}
        rowActions={(s) => (
          <>
            <button
              onClick={() => router.push(`/admin/master-data/suppliers/${s.id}`)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => removeRow(s)}
              disabled={isPending || !canEdit}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-40"
            >
              刪除
            </button>
          </>
        )}
      />
    </main>
  );
}
