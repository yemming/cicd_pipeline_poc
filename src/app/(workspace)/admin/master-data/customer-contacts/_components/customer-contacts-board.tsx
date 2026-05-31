"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  deleteCustomerContactAction,
  setCustomerContactActiveAction,
} from "@/lib/master-data/customer-contact-actions";
import type { CustomerContact } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;

const ROLE_LABEL: Record<string, string> = {
  primary: "主要",
  emergency: "緊急",
  family: "家屬",
  secretary: "秘書",
  other: "其他",
};

const ROLE_COLOR: Record<string, string> = {
  primary: "bg-[#DEEBFF] text-[#0747A6]",
  emergency: "bg-[#FFEBE6] text-[#BF2600]",
  family: "bg-[#E3FCEF] text-[#006644]",
  secretary: "bg-[#EAE6FF] text-[#403294]",
  other: "bg-[#DFE1E6] text-[#42526E]",
};

type CustomerLite = { id: string; code: string; name: string };

export function CustomerContactsBoard({
  rows,
  customers,
}: {
  rows: CustomerContact[];
  customers: CustomerLite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const toggleActive = (c: CustomerContact) => {
    startTransition(async () => {
      const res = await setCustomerContactActiveAction(c.id, !c.is_active);
      if (res.ok) {
        showBanner({ ok: true, msg: c.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = (c: CustomerContact) => {
    if (!confirm(`刪除聯絡人「${c.name}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteCustomerContactAction(c.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const columns: DataGridColumn<CustomerContact>[] = [
    {
      id: "role",
      header: "角色",
      width: 90,
      hideable: false,
      cell: (c) => (
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${ROLE_COLOR[c.role] ?? ROLE_COLOR.other}`}
        >
          {ROLE_LABEL[c.role] ?? c.role}
        </span>
      ),
      exportValue: (c) => ROLE_LABEL[c.role] ?? c.role,
      sortValue: (c) => c.role,
    },
    {
      id: "name",
      header: "姓名",
      width: 140,
      hideable: false,
      cell: (c) => (
        <Link
          href={`/admin/master-data/customer-contacts/${c.id}`}
          className="font-medium text-[#185FA5] hover:underline"
        >
          {c.name}
        </Link>
      ),
      exportValue: (c) => c.name,
      sortValue: (c) => c.name,
    },
    {
      id: "customer",
      header: "所屬客戶",
      cell: (c) => {
        const cu = customerById.get(c.customer_id);
        return cu ? (
          <span>
            <span className="font-mono text-[12px] text-[#6B778C]">{cu.code}</span>
            <span className="ml-2">{cu.name}</span>
          </span>
        ) : (
          <span className="text-[#BF2600]">客戶不存在</span>
        );
      },
      exportValue: (c) => {
        const cu = customerById.get(c.customer_id);
        return cu ? `${cu.code} ${cu.name}` : "客戶不存在";
      },
      sortValue: (c) => customerById.get(c.customer_id)?.name ?? "",
    },
    {
      id: "phone",
      header: "電話",
      width: 140,
      cell: (c) =>
        c.phone ? (
          <span className="font-mono text-[12px]">{c.phone}</span>
        ) : (
          <span className="text-[#6B778C]">—</span>
        ),
      exportValue: (c) => c.phone ?? "",
    },
    {
      id: "email",
      header: "Email",
      cell: (c) =>
        c.email ? (
          <span className="text-[12px]">{c.email}</span>
        ) : (
          <span className="text-[#6B778C]">—</span>
        ),
      exportValue: (c) => c.email ?? "",
    },
    {
      id: "relation",
      header: "關係",
      width: 110,
      cell: (c) => c.relation ?? <span className="text-[#6B778C]">—</span>,
      exportValue: (c) => c.relation ?? "",
    },
    {
      id: "active",
      header: "狀態",
      width: 80,
      cell: (c) =>
        c.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
            停用
          </span>
        ),
      exportValue: (c) => (c.is_active ? "啟用" : "停用"),
      sortValue: (c) => c.is_active,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">客戶聯絡人</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Master Data
        </span>
        <span className="text-[12px] text-[#9A9890]">
          跨客戶總覽；點姓名進詳情頁檢視 / 編輯
        </span>
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
          共 <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b>{" "}
          筆聯絡人
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            onClick={() =>
              router.push("/admin/master-data/customer-contacts/new")
            }
            disabled={isPending}
            className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增聯絡人
          </button>
        </div>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(c) => c.id}
        persistKey="admin/master-data/customer-contacts"
        exportFileName="customer-contacts"
        emptyMessage="尚無聯絡人 — 至各客戶詳情頁新增"
        disabled={isPending}
        rowActions={(c) => (
          <>
            <button
              onClick={() =>
                router.push(`/admin/master-data/customer-contacts/${c.id}`)
              }
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => toggleActive(c)}
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              {c.is_active ? "停用" : "啟用"}
            </button>
            <button
              onClick={() => removeRow(c)}
              disabled={isPending}
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
