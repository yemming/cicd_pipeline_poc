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

export type SupplierRef = { id: string; code: string; name: string };
export type ItemRef = {
  id: string;
  code: string;
  name: string;
  category: string | null;
  base_uom: string | null;
};

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "summary" | "validity" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "summary", label: "MRP 影響" },
  { key: "validity", label: "有效期間" },
  { key: "audit", label: "稽核資訊" },
];

const CURRENCY_OPTIONS = ["TWD", "USD", "EUR", "JPY", "CNY"];

function fmtMoney(n: number, currency: string): string {
  return `${currency} ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "—";
  }
}

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

export function SupplierPricingDetailView({
  pricing,
  suppliers,
  items,
  canEdit,
  initialMode = "view",
}: {
  pricing: SupplierPricingRow | null;
  suppliers: SupplierRef[];
  items: ItemRef[];
  canEdit: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);

  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("summary");

  const [draft, setDraft] = useState<SupplierPricingInput>(
    pricing ? fromRow(pricing) : blankInput(),
  );
  const [createDraft, setCreateDraft] = useState<SupplierPricingInput>(blankInput());

  const showInputs = editing || creating;
  const formDraft: SupplierPricingInput = creating ? createDraft : draft;
  const setFormDraft = (next: SupplierPricingInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const supplierMap = useMemo(
    () => new Map(suppliers.map((s) => [s.id, s])),
    [suppliers],
  );
  const itemMap = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const supplier = pricing ? supplierMap.get(pricing.supplier_id) ?? null : null;
  const item = pricing ? itemMap.get(pricing.item_id) ?? null : null;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!pricing) return;
    startTransition(async () => {
      const res = await updateSupplierPricingAction(pricing.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setEditing(false);
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const cancelEdit = () => {
    if (pricing) setDraft(fromRow(pricing));
    setEditing(false);
  };

  const toggleActive = () => {
    if (!pricing) return;
    startTransition(async () => {
      const res = await setSupplierPricingActiveAction(pricing.id, !pricing.is_active);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: pricing.is_active ? "✓ 已停用" : "✓ 已啟用",
        });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankInput());
    setCreating(true);
  };

  const cancelCreate = () => {
    if (initialMode === "create") {
      router.push("/admin/master-data/supplier-pricing");
    } else {
      setCreating(false);
    }
  };

  const submitCreate = () => {
    startTransition(async () => {
      const res = await createSupplierPricingAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已新增定價，跳轉到該筆" });
        setCreating(false);
        router.push(`/admin/master-data/supplier-pricing/${res.data.id}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!pricing) return;
    const label = `${supplier?.code ?? "?"} × ${item?.code ?? "?"}`;
    if (
      !confirm(
        `確定刪除「${label}」這筆定價？\n建議改用「停用」保留歷史，僅在誤建時才硬刪。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteSupplierPricingAction(pricing.id);
      if (res.ok) {
        router.push("/admin/master-data/supplier-pricing");
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const sectionCard = (title: string, body: React.ReactNode) => (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{body}</div>
    </section>
  );

  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const headlineLabel = creating
    ? "（未命名定價）"
    : supplier && item
      ? `${supplier.name} × ${item.name}`
      : "（資料缺失）";
  const headlineCode = creating
    ? "—"
    : `${supplier?.code ?? "?"} × ${item?.code ?? "?"}`;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/admin/master-data/supplier-pricing"
            className="hover:text-[#185FA5]"
          >
            供應商定價
          </Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增定價" : headlineCode}
          </span>
          {editing ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              編輯模式
            </span>
          ) : creating ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              建立模式
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {editing ? (
            <>
              <button
                type="button"
                onClick={save}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "儲存中…" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890]"
              >
                取消
              </button>
            </>
          ) : creating ? (
            <>
              <button
                type="button"
                onClick={cancelCreate}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
              <button
                type="button"
                onClick={submitCreate}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "建立中…" : "建立並開啟"}
              </button>
            </>
          ) : (
            <>
              <Link
                href="/admin/master-data/supplier-pricing"
                className="h-[30px] inline-flex items-center justify-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                disabled={!canEdit}
                onClick={openCreate}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                disabled={!canEdit || !pricing}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || !pricing}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                disabled={!canEdit || !pricing}
                onClick={toggleActive}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {pricing?.is_active ? "停用" : "啟用"}
              </button>
            </>
          )}
        </div>
      </div>

      {banner ? (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      ) : null}

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                供應商定價（MRP 採購參數）
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {headlineLabel}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {creating ? (
                  <>
                    <span className="text-[#9A9890]">—</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                      尚未建立
                    </span>
                  </>
                ) : pricing ? (
                  <>
                    <span className="font-mono text-[#5A5955]">{headlineCode}</span>
                    {pricing.is_primary ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                        ★ 主要供應商
                      </span>
                    ) : null}
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        pricing.is_active
                          ? "bg-[#EAF3DE] text-[#3B6D11]"
                          : "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {pricing.is_active ? "啟用" : "停用"}
                    </span>
                    {item?.category ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                        {item.category}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <div className="shrink-0">
            <div
              className={`w-[260px] h-[120px] rounded-lg flex flex-col items-center justify-center text-[12px] ${
                creating
                  ? "border-2 border-dashed border-[#D5D3CB] bg-[#F8F7F4] text-[#9A9890]"
                  : "border border-[#EEECE6] bg-[#F8F7F4]"
              }`}
            >
              {creating ? (
                <span>建立後顯示單價總覽</span>
              ) : pricing ? (
                <>
                  <div className="text-[11px] text-[#9A9890]">採購單價</div>
                  <div className="text-[24px] font-semibold text-[#2C2C2A] font-mono">
                    {fmtMoney(Number(pricing.unit_price), pricing.currency)}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-1">
                    每 {item?.base_uom ?? "單位"} ・ 前置 {pricing.lead_time_days} 天
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* 基本資料 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="供應商"
            value={
              showInputs ? (
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
              ) : supplier ? (
                <div>
                  <div className="font-medium">{supplier.name}</div>
                  <div className="font-mono text-[11px] text-[#9A9890]">
                    {supplier.code}
                  </div>
                </div>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="料號"
            value={
              showInputs ? (
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
              ) : item ? (
                <div>
                  <div className="font-medium">{item.name}</div>
                  <div className="font-mono text-[11px] text-[#9A9890]">
                    {item.code}
                  </div>
                </div>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="主要供應商旗標"
            value={
              showInputs ? (
                <label className="inline-flex items-center gap-1.5 text-[12.5px]">
                  <input
                    type="checkbox"
                    checked={formDraft.is_primary ?? false}
                    onChange={(e) =>
                      setFormDraft({ ...formDraft, is_primary: e.target.checked })
                    }
                  />
                  ★ 主要（MRP 優先擇此）
                </label>
              ) : pricing?.is_primary ? (
                "★ 主要供應商"
              ) : (
                "次要"
              )
            }
          />
        </div>
      </section>

      {/* 價格與交期 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 價格與交期
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="單價"
            value={
              showInputs ? (
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
              ) : pricing ? (
                <span className="font-mono">
                  {fmtMoney(Number(pricing.unit_price), pricing.currency)}
                </span>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="幣別"
            value={
              showInputs ? (
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
              ) : (
                pricing?.currency ?? "—"
              )
            }
          />
          <Kv
            label="前置時間（天）"
            value={
              showInputs ? (
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
              ) : pricing ? (
                `${pricing.lead_time_days} 天`
              ) : (
                "—"
              )
            }
          />
        </div>
      </section>

      {/* 下單條件 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 下單條件</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="MOQ（最小起訂量）"
            value={
              showInputs ? (
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
              ) : pricing ? (
                `${Number(pricing.min_order_qty).toLocaleString("en-US")} ${item?.base_uom ?? ""}`
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="訂購倍數"
            value={
              showInputs ? (
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
              ) : pricing ? (
                `× ${Number(pricing.order_multiple)}`
              ) : (
                "—"
              )
            }
            small
          />
          <Kv
            label="備註"
            value={
              showInputs ? (
                <input
                  value={formDraft.notes ?? ""}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, notes: e.target.value || null })
                  }
                  placeholder="付款條件 / 議價過程 / 報價單編號…"
                  className={inputClass}
                />
              ) : (
                pricing?.notes ?? "—"
              )
            }
          />
        </div>
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該定價的詳情頁，可進一步維護有效期間、備註與啟停狀態。
        </p>
      ) : null}

      {/* Tabs（只在檢視/編輯既有筆時顯示） */}
      {!creating && pricing ? (
        <>
          <div
            className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto"
            id="tab-content"
          >
            <div className="flex border-b border-[#EEECE6]">
              {TABS.map((t) => {
                const active = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r border-[#EEECE6] last:border-r-0 ${
                      active
                        ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                        : "text-[#5A5955] hover:bg-[#F8F7F4]"
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
            {activeTab === "summary" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sectionCard(
                  "MRP 計算用參數",
                  <>
                    <Kv
                      label="採購單價"
                      value={
                        <span className="font-mono">
                          {fmtMoney(Number(pricing.unit_price), pricing.currency)}
                        </span>
                      }
                    />
                    <Kv
                      label="每次最少訂"
                      value={
                        <span className="font-mono">
                          {`${Number(pricing.min_order_qty).toLocaleString("en-US")} ${item?.base_uom ?? ""}`}
                        </span>
                      }
                    />
                    <Kv
                      label="訂購倍數"
                      value={
                        <span className="font-mono">
                          {`× ${Number(pricing.order_multiple)} ${item?.base_uom ?? ""}`}
                        </span>
                      }
                    />
                    <Kv
                      label="前置時間"
                      value={
                        <span className="font-mono">{`${pricing.lead_time_days} 天`}</span>
                      }
                    />
                  </>,
                )}
                {sectionCard(
                  "實際下單參考",
                  <>
                    <Kv
                      label="若需求 100 件"
                      value={
                        <span className="font-mono">
                          {(() => {
                            const moq = Number(pricing.min_order_qty) || 0;
                            const mul = Number(pricing.order_multiple) || 1;
                            const need = Math.max(100, moq);
                            const rounded = Math.ceil(need / mul) * mul;
                            return `下 ${rounded.toLocaleString("en-US")} ${item?.base_uom ?? ""}`;
                          })()}
                        </span>
                      }
                      small
                    />
                    <Kv
                      label="若需求 50 件"
                      value={
                        <span className="font-mono">
                          {(() => {
                            const moq = Number(pricing.min_order_qty) || 0;
                            const mul = Number(pricing.order_multiple) || 1;
                            const need = Math.max(50, moq);
                            const rounded = Math.ceil(need / mul) * mul;
                            return `下 ${rounded.toLocaleString("en-US")} ${item?.base_uom ?? ""}`;
                          })()}
                        </span>
                      }
                      small
                    />
                    <Kv
                      label="主要供應商"
                      value={
                        pricing.is_primary ? "★ 是 — MRP 將優先選此筆" : "否"
                      }
                      small
                    />
                  </>,
                )}
              </div>
            ) : null}

            {activeTab === "validity" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sectionCard(
                  "有效期間",
                  <>
                    <Kv
                      label="生效日"
                      value={
                        showInputs ? (
                          <input
                            type="date"
                            value={formDraft.valid_from ?? ""}
                            onChange={(e) =>
                              setFormDraft({
                                ...formDraft,
                                valid_from: e.target.value || null,
                              })
                            }
                            className={inputClass}
                          />
                        ) : (
                          pricing.valid_from ?? "—"
                        )
                      }
                      mono
                    />
                    <Kv
                      label="到期日"
                      value={
                        showInputs ? (
                          <input
                            type="date"
                            value={formDraft.valid_to ?? ""}
                            onChange={(e) =>
                              setFormDraft({
                                ...formDraft,
                                valid_to: e.target.value || null,
                              })
                            }
                            className={inputClass}
                          />
                        ) : (
                          pricing.valid_to ?? "—"
                        )
                      }
                      mono
                    />
                    <Kv
                      label="目前狀態"
                      value={(() => {
                        const today = new Date().toISOString().slice(0, 10);
                        if (!pricing.is_active) return "已停用";
                        if (pricing.valid_from && pricing.valid_from > today)
                          return "尚未生效";
                        if (pricing.valid_to && pricing.valid_to < today)
                          return "已過期";
                        return "有效中";
                      })()}
                      small
                    />
                  </>,
                )}
                {sectionCard(
                  "備註",
                  <div className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap min-h-[3em]">
                    {pricing.notes || (
                      <span className="text-[#9A9890]">—</span>
                    )}
                  </div>,
                )}
              </div>
            ) : null}

            {activeTab === "audit" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sectionCard(
                  "識別碼",
                  <>
                    <Kv
                      label="系統識別碼"
                      value={<span className="font-mono">{pricing.id}</span>}
                      small
                    />
                    <Kv label="品牌" value={pricing.brand_id} mono small />
                  </>,
                )}
                {sectionCard(
                  "建立",
                  <Kv label="建立時間" value={fmtDateTime(pricing.created_at)} mono small />,
                )}
                {sectionCard(
                  "更新",
                  <Kv
                    label="最後更新"
                    value={fmtDateTime(pricing.updated_at)}
                    mono
                    small
                  />,
                )}
              </div>
            ) : null}
          </div>
        </>
      ) : null}
    </main>
  );
}

function Kv({
  label,
  value,
  bold,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  bold?: boolean;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] ${bold ? "font-semibold" : ""} ${
          mono ? "font-mono" : ""
        } ${small ? "text-[11.5px] text-[#5A5955]" : "text-[#2C2C2A]"}`}
      >
        {value}
      </div>
    </div>
  );
}
