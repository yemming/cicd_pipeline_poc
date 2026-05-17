"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import { deleteReplenishmentPolicyAction } from "@/lib/master-data/replenishment-policy-actions";
import {
  FREQUENCY_LABEL,
  type ReplenishmentPolicyRow,
} from "@/lib/master-data/replenishment-policy-form-types";

type Banner = { ok: boolean; msg: string } | null;

type WarehouseLite = { id: string; code: string; name: string };

export function ReplenishmentPoliciesBoard({
  rows,
  canEdit,
  warehouses,
}: {
  rows: ReplenishmentPolicyRow[];
  canEdit: boolean;
  warehouses: WarehouseLite[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const whMap = new Map(warehouses.map((w) => [w.id, w]));

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const removeRow = (r: ReplenishmentPolicyRow) => {
    const label = r.warehouse_id
      ? `${whMap.get(r.warehouse_id)?.name ?? "?"}`
      : "brand 全域預設";
    if (!confirm(`確定刪除補貨計畫「${label}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteReplenishmentPolicyAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const columns: DataGridColumn<ReplenishmentPolicyRow>[] = [
    {
      id: "warehouse",
      header: "適用倉庫",
      hideable: false,
      cell: (r) =>
        r.warehouse_id ? (
          <button
            onClick={() =>
              router.push(`/admin/master-data/replenishment-policies/${r.id}`)
            }
            className="text-left hover:underline"
          >
            <span className="font-mono text-[12px] text-[#6B778C] mr-1">
              {whMap.get(r.warehouse_id)?.code ?? "?"}
            </span>
            <span>{whMap.get(r.warehouse_id)?.name ?? "未知倉庫"}</span>
          </button>
        ) : (
          <button
            onClick={() =>
              router.push(`/admin/master-data/replenishment-policies/${r.id}`)
            }
            className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap bg-[#DEEBFF] text-[#0747A6] hover:underline"
          >
            brand 全域預設
          </button>
        ),
      exportValue: (r) =>
        r.warehouse_id
          ? `${whMap.get(r.warehouse_id)?.code ?? ""} ${whMap.get(r.warehouse_id)?.name ?? ""}`.trim()
          : "brand 全域預設",
      sortValue: (r) =>
        r.warehouse_id ? whMap.get(r.warehouse_id)?.name ?? "" : "",
    },
    {
      id: "frequency",
      header: "執行頻率",
      width: 110,
      cell: (r) => FREQUENCY_LABEL[r.frequency] ?? r.frequency,
      exportValue: (r) => FREQUENCY_LABEL[r.frequency] ?? r.frequency,
      sortValue: (r) => r.frequency,
    },
    {
      id: "horizon",
      header: "需求視野",
      align: "right",
      width: 100,
      cell: (r) => <span className="font-mono">{`${r.horizon_days} 天`}</span>,
      exportValue: (r) => `${r.horizon_days} 天`,
      sortValue: (r) => r.horizon_days,
    },
    {
      id: "auto_pr",
      header: "急件自動建 PR",
      width: 130,
      cell: (r) =>
        r.auto_create_pr_for_urgent ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            啟用
          </span>
        ) : (
          <span className="text-[#6B778C]">—</span>
        ),
      exportValue: (r) => (r.auto_create_pr_for_urgent ? "啟用" : ""),
      sortValue: (r) => r.auto_create_pr_for_urgent,
    },
    {
      id: "active",
      header: "狀態",
      width: 80,
      cell: (r) =>
        r.is_active ? (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
            啟用
          </span>
        ) : (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#F2F2F2] text-[#6B6A68]">
            停用
          </span>
        ),
      exportValue: (r) => (r.is_active ? "啟用" : "停用"),
      sortValue: (r) => r.is_active,
    },
  ];

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">補貨計畫設定</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          Master Data
        </span>
        <span className="text-[12px] text-[#9A9890]">
          控制 MRP 的執行頻率、需求視野、自動化規則
        </span>
        {canEdit && (
          <button
            onClick={() =>
              router.push("/admin/master-data/replenishment-policies/new")
            }
            disabled={isPending}
            className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            ＋ 新增計畫
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
          共 <b className="text-[#2C2C2A]">{rows.length.toLocaleString("en-US")}</b>{" "}
          筆計畫
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="admin/master-data/replenishment-policies"
        exportFileName="replenishment-policies"
        emptyMessage="尚無計畫設定 — 至少建一筆 brand 全域預設（warehouse 留空）"
        disabled={isPending}
        rowActions={(r) => (
          <>
            <button
              onClick={() =>
                router.push(`/admin/master-data/replenishment-policies/${r.id}`)
              }
              disabled={isPending}
              className="h-[26px] px-2.5 rounded text-[11.5px] whitespace-nowrap bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              編輯
            </button>
            <button
              onClick={() => removeRow(r)}
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
