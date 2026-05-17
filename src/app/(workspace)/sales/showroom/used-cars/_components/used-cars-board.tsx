"use client";

import { useEffect, useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import {
  setUsedCarStatusAction,
  deleteUsedCarAction,
} from "@/lib/sales/used-car-actions";
import type { UsedCarInventoryRow } from "@/domain/used-car-inventory.constants";
import { calcDaysInStock, statusLabel } from "@/domain/used-car-inventory.constants";
import {
  type UsedCarDbStatus,
} from "@/domain/used-car-inventory.constants";

// ── Design tokens ─────────────────────────────────────────────────────
const STATUS_CHIP: Record<UsedCarDbStatus, string> = {
  available: "bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5]",
  reserved: "bg-[#FDF3E3] text-[#854F0B] border border-[#F0C97E]",
  sold: "bg-[#FDECEA] text-[#C8001A] border border-[#F5AEAD]",
  pending_inspection: "bg-[#EEEDFE] text-[#534AB7] border border-[#C5C0F0]",
  withdrawn: "bg-[#F2F2F2] text-[#6B6A68] border border-[#D5D3CB]",
};

const GRADE_CHIP: Record<string, string> = {
  S: "bg-[#7A1010] text-white",
  A: "bg-[#185FA5] text-white",
  B: "bg-[#0F6E56] text-white",
  C: "bg-[#854F0B] text-white",
  D: "bg-[#9A9890] text-white",
};

function marginRate(margin: number | null, price: number | null): number {
  if (!margin || !price || price <= 0) return 0;
  return Math.round((margin / price) * 100);
}

function isLowMargin(margin: number | null, price: number | null): boolean {
  if (!margin || !price || price <= 0) return false;
  return (margin / price) * 100 <= 5;
}

function daysToneClass(days: number): string {
  if (days > 45) return "text-[#C8001A]";
  if (days > 30) return "text-[#854F0B]";
  return "text-[#0F6E56]";
}

// ── Props ─────────────────────────────────────────────────────────────
type Props = {
  rows: UsedCarInventoryRow[];
  totalCount: number;
  brandId?: string;
  /** "dealer" = 展廳接待視角；"usedcar" = 中古車輛模組視角 */
  viewMode?: "dealer" | "usedcar";
};

type Banner = { ok: boolean; msg: string } | null;

// ─────────────────────────────────────────────────────────────────────
export default function UsedCarsBoard({
  rows,
  totalCount,
  viewMode = "dealer",
}: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const isUsedcarModule = viewMode === "usedcar";

  useSetPageHeader({
    title: "中古車庫存",
    breadcrumb: isUsedcarModule
      ? [{ label: "中古車輛" }, { label: "中古車庫存" }]
      : [{ label: "展廳接待" }, { label: "中古車庫存" }],
    hideSearch: true,
  });

  useEffect(() => {
    if (banner?.ok) {
      const t = setTimeout(() => setBanner(null), 2200);
      return () => clearTimeout(t);
    }
  }, [banner]);

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
  }

  // ── 狀態切換 ──
  function handleSetStatus(row: UsedCarInventoryRow, status: UsedCarDbStatus) {
    startTransition(async () => {
      const res = await setUsedCarStatusAction(row.id, status);
      if (res.ok) {
        showBanner(true, `✓ ${row.model_display_name} 狀態已更新`);
        router.refresh();
      } else {
        showBanner(false, res.error);
      }
    });
  }

  // ── 刪除 ──
  function handleDelete(row: UsedCarInventoryRow) {
    if (!confirm(`確定要刪除「${row.model_display_name}」嗎？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteUsedCarAction(row.id);
      if (res.ok) {
        showBanner(true, `✓ 已刪除 ${row.model_display_name}`);
        router.refresh();
      } else {
        showBanner(false, res.error);
      }
    });
  }

  // ── 欄位定義 ──
  const columns: DataGridColumn<UsedCarInventoryRow>[] = [
    {
      id: "condition_grade",
      header: "等級",
      width: 60,
      hideable: false,
      sortable: false,
      cell: (r) =>
        r.condition_grade ? (
          <span
            className={
              "inline-flex items-center justify-center w-[22px] h-[22px] rounded-full text-[11px] font-bold " +
              (GRADE_CHIP[r.condition_grade] ?? "bg-[#9A9890] text-white")
            }
          >
            {r.condition_grade}
          </span>
        ) : (
          <span className="text-[11px] text-[#9A9890]">—</span>
        ),
      exportValue: (r) => r.condition_grade ?? "",
    },
    {
      id: "model_display_name",
      header: "車款",
      width: 180,
      hideable: false,
      cell: (r) => (
        <span className="font-semibold text-[12.5px] text-[#2C2C2A]">{r.model_display_name}</span>
      ),
      exportValue: (r) => r.model_display_name,
      sortValue: (r) => r.model_display_name,
    },
    {
      id: "year",
      header: "年份",
      width: 65,
      cell: (r) => <span className="text-[12px]">{r.year}</span>,
      exportValue: (r) => String(r.year),
      sortValue: (r) => r.year,
    },
    {
      id: "color",
      header: "顏色",
      width: 70,
      cell: (r) => (
        <span className="flex items-center gap-1.5">
          {r.color_hex && (
            <span
              className="w-3 h-3 rounded-full border border-[#D5D3CB] shrink-0"
              style={{ background: r.color_hex }}
            />
          )}
          <span className="text-[12px]">{r.color ?? "—"}</span>
        </span>
      ),
      exportValue: (r) => r.color ?? "",
      sortValue: (r) => r.color ?? "",
    },
    {
      id: "mileage_km",
      header: "里程 (km)",
      width: 95,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[12px]">{(r.mileage_km ?? 0).toLocaleString()}</span>
      ),
      exportValue: (r) => String(r.mileage_km ?? 0),
      sortValue: (r) => r.mileage_km ?? 0,
    },
    {
      id: "days_in_stock",
      header: "在庫天數",
      width: 85,
      align: "right",
      cell: (r) => {
        const days = calcDaysInStock(r.listed_date, r.status === "sold" ? r.sold_date : null);
        return (
          <span className={"font-mono font-semibold text-[12px] " + daysToneClass(days)}>
            {days} 天
          </span>
        );
      },
      exportValue: (r) =>
        String(calcDaysInStock(r.listed_date, r.status === "sold" ? r.sold_date : null)),
      sortValue: (r) =>
        calcDaysInStock(r.listed_date, r.status === "sold" ? r.sold_date : null),
    },
    {
      id: "cost",
      header: "成本 (NT$)",
      width: 110,
      align: "right",
      cell: (r) => (
        <span className="font-mono text-[11.5px]">
          {r.cost != null ? r.cost.toLocaleString() : "—"}
        </span>
      ),
      exportValue: (r) => String(r.cost ?? ""),
      sortValue: (r) => r.cost ?? 0,
    },
    {
      id: "listing_price",
      header: "售價 (NT$)",
      width: 115,
      align: "right",
      cell: (r) => (
        <span className="font-mono font-bold text-[12px] text-[#1A3A5C]">
          {r.listing_price != null ? r.listing_price.toLocaleString() : "—"}
        </span>
      ),
      exportValue: (r) => String(r.listing_price ?? ""),
      sortValue: (r) => r.listing_price ?? 0,
    },
    {
      id: "margin_rate",
      header: "毛利率",
      width: 80,
      align: "right",
      cell: (r) => {
        const rate = marginRate(r.margin, r.listing_price);
        const low = isLowMargin(r.margin, r.listing_price);
        const chipCls =
          rate >= 15
            ? "bg-[#E1F5EE] text-[#0F6E56]"
            : rate >= 8
            ? "bg-[#FDF3E3] text-[#854F0B]"
            : "bg-[#FDECEA] text-[#C8001A]";
        return (
          <span className="inline-flex items-center gap-1">
            <span className={"text-[10.5px] px-1.5 py-0.5 rounded font-semibold " + chipCls}>
              {rate}%
            </span>
            {low && (
              <span className="text-[10px] px-1 py-0.5 rounded font-semibold bg-[#FDECEA] text-[#CC0000] whitespace-nowrap">
                低毛利
              </span>
            )}
          </span>
        );
      },
      exportValue: (r) => String(marginRate(r.margin, r.listing_price)) + "%",
      sortValue: (r) => marginRate(r.margin, r.listing_price),
    },
    {
      id: "status",
      header: "狀態",
      width: 90,
      cell: (r) => (
        <span
          className={
            "inline-flex items-center px-1.5 py-0.5 rounded-md text-[10.5px] font-semibold whitespace-nowrap " +
            (STATUS_CHIP[r.status] ?? "")
          }
        >
          {statusLabel(r.status)}
        </span>
      ),
      exportValue: (r) => statusLabel(r.status),
      sortValue: (r) => r.status,
    },
    {
      id: "lien_cleared",
      header: "動保",
      width: 70,
      defaultHidden: true,
      cell: (r) => {
        if (r.lien_cleared === null || r.lien_cleared === undefined)
          return <span className="text-[11px] text-[#9A9890]">—</span>;
        return r.lien_cleared ? (
          <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-[#EAF3DE] text-[#3B6D11]">
            已清償
          </span>
        ) : (
          <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-[#FDECEA] text-[#CC0000]">
            未清償
          </span>
        );
      },
      exportValue: (r) =>
        r.lien_cleared === null ? "" : r.lien_cleared ? "已清償" : "未清償",
    },
    {
      id: "note",
      header: "備註",
      width: 160,
      defaultHidden: true,
      sortable: false,
      cell: (r) => (
        <span className="text-[11.5px] text-[#5A5955] line-clamp-1">{r.note ?? ""}</span>
      ),
      exportValue: (r) => r.note ?? "",
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">中古車庫存</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          {isUsedcarModule ? "中古車輛 / RS03B" : "展廳接待 / RS03B"}
        </span>
        <span className="text-[12px] text-[#9A9890]">
          展廳中古車庫存管理 — 等級、整備、保留與在庫天數
        </span>
      </header>

      {/* Banner */}
      {banner && (
        <div
          className={
            "fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 " +
            (banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]")
          }
        >
          {banner.msg}
        </div>
      )}

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount}</b> 筆庫存（顯示{" "}
          <b>{rows.length}</b> 筆）
        </span>
        <div className="ml-auto flex gap-1.5">
          <a
            href={isUsedcarModule ? "/usedcar/stock" : "/sales/showroom/used-cars"}
            className="h-[26px] px-2.5 rounded text-[11.5px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            {isUsedcarModule ? "← 展廳視角" : "← 中古車模組視角"}
          </a>
        </div>
      </div>

      {/* DataGrid */}
      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="sales/showroom/used-cars"
        exportFileName="used-car-inventory"
        emptyMessage="沒有符合條件的中古車庫存"
        disabled={isPending}
        rowActionsWidth={200}
        rowActions={(r) => (
          <>
            <button
              onClick={() => router.push(`/sales/showroom/used-cars/${r.id}`)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              詳情
            </button>
            {r.status !== "sold" && (
              <button
                onClick={() =>
                  handleSetStatus(
                    r,
                    r.status === "available" ? "reserved" : "available"
                  )
                }
                disabled={isPending}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                {r.status === "available" ? "保留" : "取消保留"}
              </button>
            )}
            <button
              onClick={() => handleDelete(r)}
              disabled={isPending}
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
