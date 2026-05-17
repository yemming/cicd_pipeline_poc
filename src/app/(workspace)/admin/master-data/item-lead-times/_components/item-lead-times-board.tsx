"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { updateItemLeadTime } from "@/lib/master-data/item-lead-time-actions";

export type LeadTimeRow = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  default_supplier_name: string | null;
  default_lead_time_days: number | null;
};

type Banner = { ok: boolean; msg: string } | null;

export function ItemLeadTimesBoard({
  rows,
  canEdit,
}: {
  rows: LeadTimeRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const handleSave = async (
    row: LeadTimeRow,
    value: string,
  ): Promise<{ ok: boolean; error?: string }> => {
    if (!canEdit) return { ok: false, error: "沒有編輯權限" };
    const trimmed = value.trim();
    let next: number | null = null;
    if (trimmed.length > 0) {
      const n = parseInt(trimmed, 10);
      if (!Number.isFinite(n) || n < 0) {
        return { ok: false, error: "必須為 0 或正整數" };
      }
      next = n;
    }
    const res = await updateItemLeadTime(row.id, next);
    if (res.ok) {
      showBanner({ ok: true, msg: "✓ 已更新前置時間" });
      startTransition(() => router.refresh());
      return { ok: true };
    }
    return { ok: false, error: res.error };
  };

  const columns: DataGridColumn<LeadTimeRow>[] = [
    {
      id: "code",
      header: "料號",
      width: 140,
      hideable: false,
      cell: (r) => (
        <span className="font-mono text-[12px] text-[#1A3A5C]">{r.code}</span>
      ),
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "品名",
      cell: (r) => r.name,
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "category",
      header: "品類",
      width: 120,
      cell: (r) =>
        r.category ? (
          <span className="text-[12px] text-[#5A5955]">{r.category}</span>
        ) : (
          <span className="text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.category ?? "",
      sortValue: (r) => r.category ?? "",
    },
    {
      id: "default_supplier",
      header: "預設供應商",
      width: 180,
      cell: (r) =>
        r.default_supplier_name ?? <span className="text-[#9A9890]">—</span>,
      exportValue: (r) => r.default_supplier_name ?? "",
      sortValue: (r) => r.default_supplier_name ?? "",
    },
    {
      id: "default_lead_time_days",
      header: "預設前置時間（天）",
      width: 180,
      align: "right",
      cell: (r) =>
        r.default_lead_time_days === null ? (
          <span className="text-[#9A9890]">—</span>
        ) : (
          <span className="font-mono text-[12.5px] text-[#2C2C2A]">
            {r.default_lead_time_days}
          </span>
        ),
      exportValue: (r) =>
        r.default_lead_time_days === null ? "" : r.default_lead_time_days,
      sortValue: (r) =>
        r.default_lead_time_days === null ? null : r.default_lead_time_days,
      editable: canEdit
        ? {
            type: "text",
            getValue: (r) =>
              r.default_lead_time_days === null
                ? ""
                : String(r.default_lead_time_days),
            onSave: handleSave,
          }
        : undefined,
    },
  ];

  return (
    <>
      {banner ? (
        <div
          className={`mb-3 px-3 py-2 rounded text-[13px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/master-data/item-lead-times"
        exportFileName="item-lead-times"
        emptyMessage="目前沒有可顯示的料號"
      />
    </>
  );
}
