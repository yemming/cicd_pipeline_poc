"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSupplierPricingAction,
  deleteSupplierPricingAction,
  setSupplierPricingActiveAction,
  updateSupplierPricingAction,
  type SupplierPricingInput,
} from "@/lib/master-data/supplier-pricing-actions";
import type { SupplierPricingRow } from "@/lib/master-data/supplier-pricing-form-types";

export type SupplierOption = { id: string; code: string; name: string };
export type ItemOption = {
  id: string;
  code: string;
  name: string;
  category: string | null;
};

export type SupplierPricingFilters = {
  supplier: string;
  item: string;
  primary: string;
  status: string;
  q: string;
};

const CURRENCY_OPTIONS = ["TWD", "USD", "EUR", "JPY", "CNY"];

type Banner = { ok: boolean; msg: string } | null;

type FormMode = { kind: "closed" } | { kind: "create" } | { kind: "edit"; id: string };

const blankInput = (): SupplierPricingInput => ({
  supplier_id: "",
  item_id: "",
  is_primary: false,
  unit_price: 0,
  currency: "TWD",
  lead_time_days: 7,
  min_order_qty: 1,
  order_multiple: 1,
  valid_from: null,
  valid_to: null,
  notes: null,
  is_active: true,
});

const fromRow = (r: SupplierPricingRow): SupplierPricingInput => ({
  supplier_id: r.supplier_id,
  item_id: r.item_id,
  is_primary: r.is_primary,
  unit_price: Number(r.unit_price) || 0,
  currency: r.currency,
  lead_time_days: r.lead_time_days,
  min_order_qty: Number(r.min_order_qty) || 0,
  order_multiple: Number(r.order_multiple) || 1,
  valid_from: r.valid_from,
  valid_to: r.valid_to,
  notes: r.notes,
  is_active: r.is_active,
});

function csvEscape(s: string): string {
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function SupplierPricingBoard({
  rows,
  suppliers,
  items,
  canEdit,
  totalCount,
  filters,
}: {
  rows: SupplierPricingRow[];
  suppliers: SupplierOption[];
  items: ItemOption[];
  canEdit: boolean;
  totalCount: number;
  filters: SupplierPricingFilters;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [formMode, setFormMode] = useState<FormMode>({ kind: "closed" });
  const [formDraft, setFormDraft] = useState<SupplierPricingInput>(blankInput());

  const [fSupplier, setFSupplier] = useState(filters.supplier);
  const [fItem, setFItem] = useState(filters.item);
  const [fPrimary, setFPrimary] = useState(filters.primary);
  const [fStatus, setFStatus] = useState(filters.status);
  const [fQ, setFQ] = useState(filters.q);

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const submitFilters = () => {
    const params = new URLSearchParams();
    if (fSupplier !== "all") params.set("supplier", fSupplier);
    if (fItem !== "all") params.set("item", fItem);
    if (fPrimary !== "all") params.set("primary", fPrimary);
    if (fStatus !== "all") params.set("status", fStatus);
    if (fQ.trim()) params.set("q", fQ.trim());
    const qs = params.toString();
    startTransition(() => {
      router.push(
        qs
          ? `/admin/master-data/supplier-pricing?${qs}`
          : "/admin/master-data/supplier-pricing",
      );
    });
  };

  const resetFilters = () => {
    setFSupplier("all");
    setFItem("all");
    setFPrimary("all");
    setFStatus("all");
    setFQ("");
    startTransition(() => router.push("/admin/master-data/supplier-pricing"));
  };

  const openCreate = () => {
    setFormDraft(blankInput());
    setFormMode({ kind: "create" });
  };
  const openEdit = (r: SupplierPricingRow) => {
    setFormDraft(fromRow(r));
    setFormMode({ kind: "edit", id: r.id });
  };
  const closeForm = () => setFormMode({ kind: "closed" });

  const submitForm = () => {
    startTransition(async () => {
      const res =
        formMode.kind === "edit"
          ? await updateSupplierPricingAction(formMode.id, formDraft)
          : formMode.kind === "create"
            ? await createSupplierPricingAction(formDraft)
            : null;
      if (!res) return;
      if (res.ok) {
        showBanner({
          ok: true,
          msg: formMode.kind === "edit" ? "✓ 已儲存變更" : "✓ 已新增定價",
        });
        closeForm();
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleActive = (id: string, next: boolean) => {
    startTransition(async () => {
      const res = await setSupplierPricingActiveAction(id, next);
      if (res.ok) {
        showBanner({ ok: true, msg: next ? "✓ 已啟用" : "✓ 已停用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const deleteRow = (r: SupplierPricingRow) => {
    const s = supplierMap.get(r.supplier_id);
    const i = itemMap.get(r.item_id);
    const label = `${s?.code ?? "?"} × ${i?.code ?? "?"}`;
    if (
      !confirm(
        `確定刪除「${label}」這筆定價？\n建議改用「停用」保留歷史，僅在誤建時才硬刪。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteSupplierPricingAction(r.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除定價" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const exportCsv = () => {
    const header = [
      "供應商代碼",
      "供應商名稱",
      "料號",
      "品名",
      "幣別",
      "單價",
      "前置(天)",
      "MOQ",
      "倍數",
      "主要",
      "生效日",
      "到期日",
      "狀態",
      "備註",
    ];
    const lines = [header.join(",")];
    for (const r of rows) {
      const s = supplierMap.get(r.supplier_id);
      const i = itemMap.get(r.item_id);
      lines.push(
        [
          s?.code ?? "",
          s?.name ?? "",
          i?.code ?? "",
          i?.name ?? "",
          r.currency,
          Number(r.unit_price),
          r.lead_time_days,
          Number(r.min_order_qty),
          Number(r.order_multiple),
          r.is_primary ? "是" : "否",
          r.valid_from ?? "",
          r.valid_to ?? "",
          r.is_active ? "啟用" : "停用",
          r.notes ?? "",
        ]
          .map((v) => csvEscape(String(v)))
          .join(","),
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `supplier-pricing-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">供應商定價</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          MD-3
        </span>
        <span className="text-[12px] text-[#9A9890]">
          MRP 計算供應商擇優、單價、lead time、MOQ、訂購倍數的單一事實來源
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

      {/* Filter Bar */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="flex gap-2 items-end flex-wrap">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>供應商</label>
            <select
              value={fSupplier}
              onChange={(e) => setFSupplier(e.target.value)}
              className={`${inputClass} w-[170px]`}
            >
              <option value="all">全部</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{`${s.code} ${s.name}`}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>料號</label>
            <select
              value={fItem}
              onChange={(e) => setFItem(e.target.value)}
              className={`${inputClass} w-[170px]`}
            >
              <option value="all">全部</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>{`${i.code} ${i.name}`}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>主要</label>
            <select
              value={fPrimary}
              onChange={(e) => setFPrimary(e.target.value)}
              className={`${inputClass} w-[80px]`}
            >
              <option value="all">全部</option>
              <option value="primary">★ 主要</option>
              <option value="secondary">次要</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>狀態</label>
            <select
              value={fStatus}
              onChange={(e) => setFStatus(e.target.value)}
              className={`${inputClass} w-[90px]`}
            >
              <option value="all">全部</option>
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>備註關鍵字</label>
            <input
              type="text"
              value={fQ}
              onChange={(e) => setFQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitFilters()}
              placeholder="輸入備註關鍵字..."
              className={`${inputClass} w-[180px]`}
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
            <button
              type="button"
              disabled={!canEdit}
              onClick={openCreate}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
            >
              ＋ 新增定價
            </button>
          </div>
        </div>
      </section>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <span className="text-[12px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{totalCount.toLocaleString("en-US")}</b> 筆定價
          （顯示 <b className="text-[#2C2C2A]">{rows.length}</b> 筆）
        </span>
        <div className="ml-auto flex gap-1.5">
          <button
            type="button"
            onClick={exportCsv}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            匯出 CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${lockedClass}`}
      >
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6]">
                  供應商
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6]">
                  料號
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6] whitespace-nowrap">
                  單價
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6] whitespace-nowrap">
                  前置(天)
                </th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6] whitespace-nowrap">
                  MOQ × 倍數
                </th>
                <th className="px-3 py-2 text-center text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6]">
                  主要
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6] whitespace-nowrap">
                  有效期間
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6]">
                  狀態
                </th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold text-[#5A5955] bg-[#F8F7F4] border-b border-[#EEECE6]">
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = supplierMap.get(r.supplier_id);
                const it = itemMap.get(r.item_id);
                return (
                  <tr
                    key={r.id}
                    className="border-b border-[#EEECE6] last:border-b-0 hover:bg-[#F8F7F4]"
                  >
                    <td className="px-3 py-2">
                      {s ? (
                        <Link
                          href={`/admin/master-data/supplier-pricing/${r.id}`}
                          className="block hover:text-[#185FA5]"
                        >
                          <div className="font-mono text-[12px] text-[#185FA5]">
                            {s.code}
                          </div>
                          <div className="text-[12.5px] text-[#2C2C2A]">{s.name}</div>
                        </Link>
                      ) : (
                        <span className="text-[#9A9890]">未知供應商</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {it ? (
                        <Link
                          href={`/admin/master-data/supplier-pricing/${r.id}`}
                          className="block hover:text-[#185FA5]"
                        >
                          <div className="font-mono text-[12px] text-[#185FA5]">
                            {it.code}
                          </div>
                          <div className="text-[12.5px] text-[#2C2C2A]">{it.name}</div>
                          {it.category ? (
                            <div className="text-[11px] text-[#9A9890]">
                              {it.category}
                            </div>
                          ) : null}
                        </Link>
                      ) : (
                        <span className="text-[#9A9890]">未知料號</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] text-[#2C2C2A]">
                      {`${r.currency} ${Number(r.unit_price).toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] text-[#2C2C2A]">
                      {r.lead_time_days}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] text-[#2C2C2A]">
                      {`${Number(r.min_order_qty)} × ${Number(r.order_multiple)}`}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {r.is_primary ? (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                          ★ 主要
                        </span>
                      ) : (
                        <span className="text-[#9A9890] text-[12px]">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11.5px] text-[#5A5955] whitespace-nowrap">
                      {r.valid_from || r.valid_to
                        ? `${r.valid_from ?? "—"} → ${r.valid_to ?? "—"}`
                        : "永久"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                          r.is_active
                            ? "bg-[#EAF3DE] text-[#3B6D11]"
                            : "bg-[#F2F2F2] text-[#6B6A68]"
                        }`}
                      >
                        {r.is_active ? "啟用" : "停用"}
                      </span>
                    </td>
                    <td className="px-3 py-2 space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => openEdit(r)}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => toggleActive(r.id, !r.is_active)}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                      >
                        {r.is_active ? "停用" : "啟用"}
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => deleteRow(r)}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                      >
                        刪除
                      </button>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-10 text-center text-[#9A9890] text-[12.5px]"
                  >
                    {filters.q ||
                    filters.supplier !== "all" ||
                    filters.item !== "all" ||
                    filters.primary !== "all" ||
                    filters.status !== "all"
                      ? "無符合條件的定價，請調整篩選條件"
                      : "尚無定價資料 — 點右上角「＋ 新增定價」開始建立"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {/* Unified Create/Edit Modal */}
      {formMode.kind !== "closed" ? (
        <Modal
          title={formMode.kind === "edit" ? "編輯供應商定價" : "新增供應商定價"}
          onClose={closeForm}
        >
          <div className={`grid grid-cols-2 gap-3 ${lockedClass}`}>
            <Field label="供應商 *">
              <select
                value={formDraft.supplier_id}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, supplier_id: e.target.value })
                }
                className={inputClass}
              >
                <option value="">— 選擇供應商 —</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{`${s.code} ${s.name}`}</option>
                ))}
              </select>
            </Field>
            <Field label="料號 *">
              <select
                value={formDraft.item_id}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, item_id: e.target.value })
                }
                className={inputClass}
              >
                <option value="">— 選擇料號 —</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>{`${i.code} ${i.name}`}</option>
                ))}
              </select>
            </Field>
            <Field label="單價 *">
              <input
                type="number"
                step="0.01"
                value={formDraft.unit_price ?? 0}
                onChange={(e) =>
                  setFormDraft({
                    ...formDraft,
                    unit_price: e.target.value ? Number(e.target.value) : 0,
                  })
                }
                className={inputClass}
              />
            </Field>
            <Field label="幣別">
              <select
                value={formDraft.currency ?? "TWD"}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, currency: e.target.value })
                }
                className={inputClass}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="前置時間（天）*">
              <input
                type="number"
                value={formDraft.lead_time_days}
                onChange={(e) =>
                  setFormDraft({
                    ...formDraft,
                    lead_time_days: e.target.value ? Number(e.target.value) : 0,
                  })
                }
                className={inputClass}
              />
            </Field>
            <Field label="MOQ（最小起訂量）*">
              <input
                type="number"
                value={formDraft.min_order_qty}
                onChange={(e) =>
                  setFormDraft({
                    ...formDraft,
                    min_order_qty: e.target.value ? Number(e.target.value) : 0,
                  })
                }
                className={inputClass}
              />
            </Field>
            <Field label="訂購倍數 *">
              <input
                type="number"
                value={formDraft.order_multiple}
                onChange={(e) =>
                  setFormDraft({
                    ...formDraft,
                    order_multiple: e.target.value ? Number(e.target.value) : 1,
                  })
                }
                className={inputClass}
              />
            </Field>
            <Field label="生效日">
              <input
                type="date"
                value={formDraft.valid_from ?? ""}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, valid_from: e.target.value || null })
                }
                className={inputClass}
              />
            </Field>
            <Field label="到期日">
              <input
                type="date"
                value={formDraft.valid_to ?? ""}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, valid_to: e.target.value || null })
                }
                className={inputClass}
              />
            </Field>
            <Field label="備註" full>
              <input
                value={formDraft.notes ?? ""}
                onChange={(e) =>
                  setFormDraft({ ...formDraft, notes: e.target.value || null })
                }
                placeholder="付款條件 / 議價過程 / 報價單編號…"
                className={inputClass}
              />
            </Field>
            <Field label="狀態" full>
              <div className="flex gap-4 text-[12.5px]">
                <label className="inline-flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={formDraft.is_primary ?? false}
                    onChange={(e) =>
                      setFormDraft({ ...formDraft, is_primary: e.target.checked })
                    }
                  />
                  ★ 主要供應商（MRP 優先擇此供應商）
                </label>
                <label className="inline-flex items-center gap-1.5 ml-auto">
                  <input
                    type="checkbox"
                    checked={formDraft.is_active ?? true}
                    onChange={(e) =>
                      setFormDraft({ ...formDraft, is_active: e.target.checked })
                    }
                  />
                  啟用
                </label>
              </div>
            </Field>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            {formMode.kind === "edit" ? (
              <button
                type="button"
                onClick={() => {
                  const r = rows.find((x) => x.id === formMode.id);
                  if (!r) return;
                  closeForm();
                  deleteRow(r);
                }}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] disabled:opacity-60 mr-auto"
              >
                刪除這筆定價
              </button>
            ) : null}
            <button
              type="button"
              onClick={closeForm}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955]"
            >
              取消
            </button>
            <button
              type="button"
              onClick={submitForm}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#0F6E56] text-white disabled:opacity-60"
            >
              {isPending
                ? formMode.kind === "edit"
                  ? "儲存中…"
                  : "建立中…"
                : formMode.kind === "edit"
                  ? "儲存變更"
                  : "建立"}
            </button>
          </div>
        </Modal>
      ) : null}
    </main>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-[#EEECE6] flex items-center">
          <h2 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto w-7 h-7 rounded hover:bg-[#F8F7F4] text-[#9A9890] text-[18px] leading-none"
          >
            ×
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "col-span-2" : ""}`}>
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}
