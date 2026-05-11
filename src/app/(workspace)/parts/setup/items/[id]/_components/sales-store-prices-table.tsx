"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createStorePriceAction,
  deletePriceAction,
  endPromoPricingAction,
  setPriceAsPromoAction,
  updatePriceOnlyAction,
} from "@/lib/parts-setup/pricing-actions";
import type { ItemStorePriceWithStore } from "@/domain/pricing";
// ↑ type-only import：domain/pricing.ts 是 "use server"，但 import type 不會把 module 進 client bundle

type Banner = { ok: boolean; msg: string } | null;

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return `NT$ ${n.toLocaleString("en-US")}`;
}

const TYPE_CHIP: Record<
  ItemStorePriceWithStore["pricing_type"],
  { label: string; cls: string }
> = {
  default: { label: "預設（建議售價）", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
  custom: { label: "店家定價 (custom)", cls: "bg-[#EBF3FF] text-[#1A3A5C]" },
  promo: { label: "促銷中", cls: "bg-[#FDF3E3] text-[#854F0B]" },
};

export function SalesStorePricesTable({
  itemId,
  rows,
  suggestedPrice,
  canEdit,
}: {
  itemId: string;
  rows: ItemStorePriceWithStore[];
  suggestedPrice: number | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [pendingRows, setPendingRows] = useState<Set<string>>(new Set()); // key = store_id
  const [editingRow, setEditingRow] = useState<string | null>(null); // store_id 正在 inline edit
  const [editValue, setEditValue] = useState<string>("");
  const [editError, setEditError] = useState<string | null>(null);

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function setRowPending(storeId: string, on: boolean) {
    setPendingRows((prev) => {
      const n = new Set(prev);
      if (on) n.add(storeId);
      else n.delete(storeId);
      return n;
    });
  }

  async function handleSaveEdit(r: ItemStorePriceWithStore) {
    const trimmed = editValue.trim();
    if (!trimmed) {
      setEditError("價格不可為空");
      return;
    }
    const num = Number(trimmed.replace(/[^\d.-]/g, ""));
    if (!Number.isFinite(num) || num <= 0) {
      setEditError("價格必須是大於 0 的數字");
      return;
    }
    setRowPending(r.store_id, true);
    setEditError(null);
    try {
      let res;
      if (!r.price_id) {
        res = await createStorePriceAction({
          item_id: itemId,
          org_id: r.store_id,
          price: num,
        });
      } else {
        res = await updatePriceOnlyAction(r.price_id, num);
      }
      if (res.ok) {
        showBanner({
          ok: true,
          msg: r.price_id ? "✓ 已更新門市售價" : "✓ 已建立此門店定價",
        });
        setEditingRow(null);
        setEditValue("");
        startTransition(() => router.refresh());
      } else {
        setEditError(res.error);
      }
    } finally {
      setRowPending(r.store_id, false);
    }
  }

  async function handleAddPrice(r: ItemStorePriceWithStore) {
    if (!suggestedPrice || suggestedPrice <= 0) {
      showBanner({
        ok: false,
        msg: "此商品未設建議售價、無法以建議售價當預設值（請先到「基本資料」填建議售價）",
      });
      return;
    }
    setRowPending(r.store_id, true);
    try {
      const res = await createStorePriceAction({
        item_id: itemId,
        org_id: r.store_id,
        price: suggestedPrice,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增此門店定價" });
        startTransition(() => router.refresh());
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    } finally {
      setRowPending(r.store_id, false);
    }
  }

  async function handlePromoToggle(r: ItemStorePriceWithStore) {
    if (!r.price_id) {
      showBanner({
        ok: false,
        msg: "請先建立此門店定價，再切促銷",
      });
      return;
    }
    setRowPending(r.store_id, true);
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
      setRowPending(r.store_id, false);
    }
  }

  async function handleDelete(r: ItemStorePriceWithStore) {
    if (!r.price_id) return;
    if (!confirm(`確定刪除「${r.store_name}」的定價紀錄？\n刪除後該門店會回到「使用建議售價」狀態。`)) {
      return;
    }
    setRowPending(r.store_id, true);
    try {
      const res = await deletePriceAction(r.price_id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除門店定價" });
        startTransition(() => router.refresh());
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    } finally {
      setRowPending(r.store_id, false);
    }
  }

  return (
    <div className="space-y-2">
      {banner ? (
        <div
          className={`px-3 py-2 rounded text-[12.5px] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11]"
              : "bg-[#FDECEA] text-[#CC0000]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="text-[12px] text-[#9A9890] py-2">
          此品牌尚無 active 門店
        </div>
      ) : (
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[11px] text-[#9A9890]">
              <th className="text-left font-medium py-1">門市</th>
              <th className="text-right font-medium py-1">售價</th>
              <th className="text-left font-medium py-1 pl-2">類型</th>
              <th className="text-right font-medium py-1">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isRowPending = pendingRows.has(r.store_id);
              const noPriceRow = !r.price_id;
              const isPromo = r.pricing_type === "promo";
              const isEditing = editingRow === r.store_id;
              const chip = TYPE_CHIP[r.pricing_type];
              return (
                <tr
                  key={r.store_id}
                  className={`border-t border-[#F8F7F4] ${
                    isRowPending ? "opacity-60" : ""
                  }`}
                >
                  <td className="py-1.5">
                    <div className="font-mono text-[11.5px]">{r.store_code}</div>
                    <div className="text-[11px] text-[#9A9890]">
                      {r.store_name}
                    </div>
                  </td>
                  <td className="py-1.5 text-right">
                    {isEditing ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <input
                          autoFocus
                          type="text"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveEdit(r);
                            if (e.key === "Escape") {
                              setEditingRow(null);
                              setEditError(null);
                            }
                          }}
                          onBlur={() => handleSaveEdit(r)}
                          disabled={isRowPending}
                          className="h-[24px] w-[110px] border border-[#185FA5] rounded px-1 text-[12px] text-right font-mono outline-none disabled:opacity-50"
                        />
                        {editError ? (
                          <span className="text-[11px] text-[#CC0000]">
                            {editError}
                          </span>
                        ) : isRowPending ? (
                          <span className="text-[11px] text-[#9A9890]">
                            儲存中⋯
                          </span>
                        ) : null}
                      </div>
                    ) : noPriceRow ? (
                      <button
                        type="button"
                        disabled={!canEdit || isRowPending}
                        onClick={() => {
                          if (!canEdit) return;
                          setEditingRow(r.store_id);
                          setEditValue(
                            suggestedPrice ? String(suggestedPrice) : "",
                          );
                          setEditError(null);
                        }}
                        title="顯示建議售價（此門店尚未建立定價、點擊可建立）"
                        className="font-mono text-[12px] italic text-[#9A9890] hover:underline disabled:no-underline disabled:cursor-not-allowed"
                      >
                        {fmtMoney(suggestedPrice)} *
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={!canEdit || isRowPending}
                        onClick={() => {
                          if (!canEdit) return;
                          setEditingRow(r.store_id);
                          setEditValue(r.price === null ? "" : String(r.price));
                          setEditError(null);
                        }}
                        title={canEdit ? "點擊編輯" : "沒有權限"}
                        className={`font-mono text-[12px] px-1.5 py-0.5 rounded hover:underline disabled:no-underline disabled:cursor-not-allowed ${
                          isPromo
                            ? "text-[#854F0B] bg-[#FDF3E3]"
                            : r.pricing_type === "custom"
                              ? "text-[#1A3A5C] bg-[#EBF3FF]"
                              : "text-[#2C2C2A]"
                        }`}
                      >
                        {fmtMoney(r.price)}
                      </button>
                    )}
                  </td>
                  <td className="py-1.5 pl-2">
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${chip.cls}`}
                    >
                      {chip.label}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    <div className="inline-flex gap-1">
                      {noPriceRow ? (
                        <button
                          type="button"
                          disabled={!canEdit || isRowPending}
                          onClick={() => handleAddPrice(r)}
                          title={
                            canEdit
                              ? "以建議售價當預設值新建一筆 store-level 定價"
                              : "沒有權限"
                          }
                          className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isRowPending ? "建立中⋯" : "＋ 新增定價"}
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={!canEdit || isRowPending}
                            onClick={() => handlePromoToggle(r)}
                            title={
                              canEdit
                                ? isPromo
                                  ? "結束促銷（自動還原為建議售價）"
                                  : "切成促銷"
                                : "沒有權限"
                            }
                            className={`h-[26px] px-2.5 rounded text-[11.5px] disabled:opacity-50 ${
                              isPromo
                                ? "bg-[#FDF3E3] border border-[#F5D9A0] text-[#854F0B] hover:bg-[#fbe9c8]"
                                : "bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                            } cursor-pointer disabled:cursor-not-allowed`}
                          >
                            {isRowPending
                              ? "處理中⋯"
                              : isPromo
                                ? "結束促銷"
                                : "切促銷"}
                          </button>
                          <button
                            type="button"
                            disabled={!canEdit || isRowPending}
                            onClick={() => handleDelete(r)}
                            title={canEdit ? "刪除此門店定價" : "沒有權限"}
                            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                          >
                            {isRowPending ? "處理中⋯" : "刪除"}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-[11px] text-[#9A9890] pt-1">
        標記 <span className="italic">*</span> 表示該門店尚未建立 store-level 定價、目前顯示建議售價作為預設。
      </p>
    </div>
  );
}
