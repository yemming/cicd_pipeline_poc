"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  endPromoPricingAction,
  setPriceAsPromoAction,
  updatePriceOnlyAction,
} from "@/lib/parts-setup/pricing-actions";
import { DataGrid, type DataGridColumn } from "@/components/data-grid";
import type { PricingRow, StoreOption } from "@/domain/pricing";

const TYPE_LABEL: Record<PricingRow["pricing_type"], { label: string; chip: string }> = {
  default: { label: "預設", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
  store_custom: { label: "門店自訂", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  promo: { label: "促銷中", chip: "bg-[#FDF3E3] text-[#854F0B]" },
};

type Banner = { ok: boolean; msg: string } | null;

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return `NT$ ${n.toLocaleString("en-US")}`;
}

export function PricingBoard({
  stores,
  rows,
  activeStoreId,
  activeStoreName,
  canEdit,
  initialQ,
}: {
  stores: StoreOption[];
  rows: PricingRow[];
  activeStoreId: string | null;
  activeStoreName: string | null;
  canEdit: boolean;
  initialQ: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [q, setQ] = useState(initialQ);
  const [banner, setBanner] = useState<Banner>(null);
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set());

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  function applyFilter(storeId?: string) {
    const params = new URLSearchParams();
    const sid = storeId ?? activeStoreId;
    if (sid) params.set("store", sid);
    if (q) params.set("q", q);
    startTransition(() => {
      router.push(`/parts/setup/pricing${params.toString() ? "?" + params.toString() : ""}`);
    });
  }

  async function handlePromoToggle(r: PricingRow) {
    if (!r.price_id) {
      showBanner({
        ok: false,
        msg: "此商品尚未建立門店定價（請先 inline 編輯一次售價以建立紀錄）",
      });
      return;
    }
    setPendingRows((prev) => {
      const n = new Set(prev);
      n.add(r.id);
      return n;
    });
    try {
      const isPromo = r.pricing_type === "promo";
      const res = isPromo
        ? await endPromoPricingAction(r.price_id)
        : await setPriceAsPromoAction(r.price_id);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: isPromo ? "✓ 已結束促銷" : "✓ 已切成促銷",
        });
        startTransition(() => router.refresh());
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    } finally {
      setPendingRows((prev) => {
        const n = new Set(prev);
        n.delete(r.id);
        return n;
      });
    }
  }

  const columns: DataGridColumn<PricingRow>[] = [
    {
      id: "code",
      header: "備件代碼",
      width: 130,
      hideable: false,
      cell: (r) => <span className="font-mono text-[12px]">{r.code}</span>,
      exportValue: (r) => r.code,
      sortValue: (r) => r.code,
    },
    {
      id: "name",
      header: "商品名稱",
      width: 200,
      cell: (r) => r.name,
      exportValue: (r) => r.name,
      sortValue: (r) => r.name,
    },
    {
      id: "standard_cost",
      header: "標準成本",
      width: 110,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{fmtMoney(r.standard_cost)}</span>,
      exportValue: (r) => (r.standard_cost ?? 0).toString(),
      sortValue: (r) => r.standard_cost ?? 0,
    },
    {
      id: "suggested_price",
      header: "建議售價",
      width: 110,
      align: "right",
      cell: (r) => <span className="font-mono text-[12px]">{fmtMoney(r.suggested_price)}</span>,
      exportValue: (r) => (r.suggested_price ?? 0).toString(),
      sortValue: (r) => r.suggested_price ?? 0,
    },
    {
      id: "store_price",
      header: `${activeStoreName ?? "門市"}價`,
      width: 130,
      align: "right",
      cell: (r) => {
        const cls =
          r.pricing_type === "promo"
            ? "text-[#854F0B] bg-[#FDF3E3]"
            : r.pricing_type === "store_custom"
              ? "text-[#1A3A5C] bg-[#EBF3FF]"
              : "text-[#2C2C2A]";
        return (
          <span className={`font-mono text-[12px] px-1.5 py-0.5 rounded ${cls}`}>
            {fmtMoney(r.store_price)}
          </span>
        );
      },
      exportValue: (r) => (r.store_price ?? 0).toString(),
      sortValue: (r) => r.store_price ?? 0,
      editable: canEdit
        ? {
            type: "text",
            getValue: (r) => (r.store_price === null ? "" : String(r.store_price)),
            onSave: async (r, value) => {
              if (!r.price_id) {
                return {
                  ok: false,
                  error: "此商品尚未建立門店定價紀錄、無法直接編輯（請聯絡管理員初始化）",
                };
              }
              const trimmed = value.trim();
              if (!trimmed) return { ok: false, error: "價格不可為空" };
              const num = Number(trimmed.replace(/[^\d.-]/g, ""));
              if (!Number.isFinite(num) || num <= 0) {
                return { ok: false, error: "價格必須是大於 0 的數字" };
              }
              const res = await updatePriceOnlyAction(r.price_id, num);
              if (res.ok) {
                showBanner({ ok: true, msg: "✓ 已更新門市售價" });
                startTransition(() => router.refresh());
              }
              return res;
            },
          }
        : undefined,
    },
    {
      id: "margin",
      header: "毛利率",
      width: 90,
      align: "right",
      cell: (r) => {
        if (r.margin_pct === null) return <span className="text-[#9A9890]">—</span>;
        const color = r.margin_pct >= 20 ? "text-[#0F6E56]" : r.margin_pct >= 15 ? "text-[#854F0B]" : "text-[#CC0000]";
        return <span className={`font-mono text-[12px] ${color}`}>{r.margin_pct}%</span>;
      },
      exportValue: (r) => (r.margin_pct ?? 0).toString(),
      sortValue: (r) => r.margin_pct ?? 0,
    },
    {
      id: "pricing_type",
      header: "定價類型",
      width: 100,
      cell: (r) => {
        const def = TYPE_LABEL[r.pricing_type];
        return (
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${def.chip}`}>
            {def.label}
          </span>
        );
      },
      exportValue: (r) => TYPE_LABEL[r.pricing_type].label,
      sortValue: (r) => r.pricing_type,
    },
  ];

  return (
    <main className="px-6 py-5 space-y-3">
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">門市定價</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          3.3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          設定各門店備件售價・支援門店差異定價與促銷規則
        </span>
      </header>

      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[13px] ${
            banner.ok ? "bg-[#EAF3DE] text-[#3B6D11]" : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">門店</label>
            <select
              value={activeStoreId ?? ""}
              onChange={(e) => applyFilter(e.target.value)}
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none"
            >
              {stores.length === 0 && <option value="">（無門店）</option>}
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">商品搜尋</label>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && applyFilter()}
              placeholder="代碼或名稱..."
              className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none w-[200px]"
            />
          </div>
          <div className="flex gap-2 ml-auto">
            <button
              type="button"
              onClick={() => applyFilter()}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
            >
              {isPending ? "查詢中⋯" : "查詢"}
            </button>
            <button
              type="button"
              disabled
              title="Phase 2 開放"
              className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#9A9890] cursor-not-allowed"
            >
              批次調整
            </button>
          </div>
        </div>
      </section>

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          {activeStoreName ?? "—"} · 共 <b className="text-[#2C2C2A]">{rows.length}</b> 筆定價
        </span>
      </div>

      <DataGrid
        columns={columns}
        data={rows}
        rowKey={(r) => r.id}
        persistKey="parts/setup/pricing"
        exportFileName="pricing"
        emptyMessage="尚無商品 / 定價資料"
        disabled={isPending}
        rowActionsWidth={100}
        rowActions={(r) => {
          const isPromo = r.pricing_type === "promo";
          const isRowPending = pendingRows.has(r.id);
          const disabled = !canEdit || isRowPending;
          const baseClass = isPromo
            ? "bg-[#FDF3E3] border border-[#F5D9A0] text-[#854F0B] hover:bg-[#fbe9c8]"
            : "bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]";
          return (
            <button
              type="button"
              disabled={disabled}
              onClick={() => handlePromoToggle(r)}
              title={canEdit ? (isPromo ? "結束促銷（自動還原為建議售價）" : "切成促銷") : "沒有權限"}
              className={`h-[26px] px-2.5 rounded text-[11.5px] disabled:opacity-50 ${
                disabled ? "cursor-not-allowed" : "cursor-pointer"
              } ${baseClass}`}
            >
              {isRowPending ? "處理中⋯" : isPromo ? "結束促銷" : "促銷"}
            </button>
          );
        }}
      />
    </main>
  );
}
