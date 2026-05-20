"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSupplier,
  updateSupplier,
  setSupplierActive,
  softDeleteSupplier,
  type SupplierRow,
  type SupplierContractRow,
  type SupplierWriteInput,
  type SupplierMetrics,
  type CoaOption,
  type TaxCodeOption,
} from "@/domain/suppliers";
import {
  createContract,
  updateContract,
  deleteContract,
  type ContractWriteInput,
} from "@/domain/contracts";
import { KpiCard, Timeline, type TimelineEvent } from "@/components/visualization";
import { SparkLine } from "@/components/charts";

type Mode = "view" | "edit" | "create";
type Banner = { ok: boolean; msg: string } | null;
type TabKey = "performance" | "contracts" | "categories" | "system";

const SUPPLIER_TYPE_OPTIONS: { value: string; label: string; chip: string }[] = [
  { value: "VEHICLE_DEALER", label: "原廠 / 整車代理", chip: "bg-[#EBF3FF] text-[#1A3A5C]" },
  { value: "PARTS_SUPPLIER", label: "零件供應商", chip: "bg-[#E8F5F0] text-[#0F6E56]" },
  { value: "OTHER", label: "其他 / 耗材", chip: "bg-[#F2F2F2] text-[#6B6A68]" },
];
const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "agent", label: "代理商 (agent)" },
  { value: "oem", label: "原廠 (oem)" },
  { value: "consumable", label: "耗材 (consumable)" },
];
const CURRENCY_OPTIONS = ["TWD", "USD", "EUR", "JPY", "CNY"];

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 10);
  } catch {
    return "—";
  }
}
function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "—";
  }
}
function fmtMoney(n: number | null | undefined, currency = "TWD"): string {
  if (n == null) return "—";
  return `${currency} ${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function fmtAbbreviated(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n === 0) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

function daysAgoLabel(iso: string | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const d = Math.floor((Date.now() - t) / (1000 * 60 * 60 * 24));
  if (d <= 0) return "今天";
  return `${d} 天前`;
}

const PO_STATUS_LABEL: Record<string, { label: string; tone: "blue" | "amber" | "teal" | "green" | "gray" | "red" }> = {
  draft: { label: "草稿", tone: "gray" },
  pending: { label: "待審", tone: "amber" },
  approved: { label: "已核准", tone: "blue" },
  partial: { label: "部分到貨", tone: "teal" },
  closed: { label: "已結案", tone: "green" },
  cancelled: { label: "已取消", tone: "red" },
};

function emptyInput(): SupplierWriteInput {
  return {
    code: "",
    name: "",
    supplier_type: "PARTS_SUPPLIER",
    type: "agent",
    primary_contact: "",
    phone: "",
    email: "",
    address: "",
    tax_id: "",
    payment_terms: "",
    payment_terms_days: 30,
    default_currency: "TWD",
    notes: "",
    is_active: true,
    is_withholding_required: false,
    withholding_tax_code_id: null,
    default_tax_code_id: null,
    gl_payable_coa_id: null,
    default_expense_coa_id: null,
    supply_categories: "",
  };
}

function rowToInput(row: SupplierRow): SupplierWriteInput {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const supply_categories =
    typeof meta.supply_categories === "string" ? meta.supply_categories : "";
  return {
    code: row.code ?? "",
    name: row.name ?? "",
    supplier_type: row.supplier_type ?? "PARTS_SUPPLIER",
    type: row.type ?? "agent",
    primary_contact: row.primary_contact ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    tax_id: row.tax_id ?? "",
    payment_terms: row.payment_terms ?? "",
    payment_terms_days: row.payment_terms_days ?? 30,
    default_currency: row.default_currency ?? "TWD",
    notes: row.notes ?? "",
    is_active: row.is_active,
    is_withholding_required: row.is_withholding_required ?? false,
    withholding_tax_code_id: row.withholding_tax_code_id ?? null,
    default_tax_code_id: row.default_tax_code_id ?? null,
    gl_payable_coa_id: row.gl_payable_coa_id ?? null,
    default_expense_coa_id: row.default_expense_coa_id ?? null,
    supply_categories,
  };
}

const inputClass =
  "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]";
const textareaClass =
  "w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F8F7F4]";

export function SupplierDetailView({
  supplier,
  contracts,
  metrics,
  coaOptions,
  taxCodeOptions,
  canEdit,
  initialMode = "view",
}: {
  supplier: SupplierRow | null;
  contracts: SupplierContractRow[];
  metrics: SupplierMetrics | null;
  coaOptions: CoaOption[];
  taxCodeOptions: TaxCodeOption[];
  canEdit: boolean;
  initialMode?: Mode;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [tab, setTab] = useState<TabKey>("performance");
  const [form, setForm] = useState<SupplierWriteInput>(
    supplier ? rowToInput(supplier) : emptyInput(),
  );
  const [banner, setBanner] = useState<Banner>(null);
  const [contractModal, setContractModal] = useState<
    { open: false } | { open: true; row: SupplierContractRow | null }
  >({ open: false });
  const [contractDelete, setContractDelete] = useState<SupplierContractRow | null>(null);
  const [supplierDelete, setSupplierDelete] = useState(false);

  const supplierTypeOpt = useMemo(
    () =>
      SUPPLIER_TYPE_OPTIONS.find((o) => o.value === (form.supplier_type ?? "")) ??
      SUPPLIER_TYPE_OPTIONS[1],
    [form.supplier_type],
  );

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function patch<K extends keyof SupplierWriteInput>(
    key: K,
    value: SupplierWriteInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function enterEdit() {
    if (!supplier) return;
    setForm(rowToInput(supplier));
    setMode("edit");
  }
  function enterCreate() {
    setForm(emptyInput());
    setMode("create");
    if (supplier) {
      router.push("/parts/setup/suppliers/new");
    }
  }
  function cancelEdit() {
    if (mode === "create") {
      router.push("/parts/setup/suppliers");
      return;
    }
    if (supplier) setForm(rowToInput(supplier));
    setMode("view");
  }

  function saveEdit() {
    if (!supplier) return;
    startTransition(async () => {
      const res = await updateSupplier(supplier.id, form);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function saveCreate() {
    startTransition(async () => {
      const res = await createSupplier(form);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立，導向詳情" });
        router.push(`/parts/setup/suppliers/${res.data.id}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function toggleActive() {
    if (!supplier) return;
    startTransition(async () => {
      const res = await setSupplierActive(supplier.id, !supplier.is_active);
      if (res.ok) {
        showBanner({
          ok: true,
          msg: supplier.is_active ? "✓ 已停用" : "✓ 已啟用",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function confirmDelete() {
    if (!supplier) return;
    startTransition(async () => {
      const res = await softDeleteSupplier(supplier.id);
      if (res.ok) {
        setSupplierDelete(false);
        showBanner({ ok: true, msg: "✓ 已刪除（軟刪除 + 連動合約停用）" });
        router.push("/parts/setup/suppliers");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  // ─────── Render helpers ───────
  const isEditing = mode === "edit" || mode === "create";
  const isCreating = mode === "create";

  function coaName(id: string | null | undefined): string {
    if (!id) return "—";
    const o = coaOptions.find((x) => x.id === id);
    return o ? `${o.account_code} ${o.name}` : "（不存在）";
  }
  function taxName(id: string | null | undefined): string {
    if (!id) return "—";
    const o = taxCodeOptions.find((x) => x.id === id);
    return o ? `${o.tax_code} ${o.name} (${o.rate}%)` : "（不存在）";
  }

  return (
    <main className="px-6 py-5 space-y-3">
      {/* 1. Breadcrumb + CRUD pill bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/setup/suppliers" className="hover:text-[#185FA5]">
            供應商資訊
          </Link>
          <span>›</span>
          {isCreating ? (
            <>
              <span className="text-[#5A5955]">新增供應商</span>
              <span className="px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B] font-medium">
                建立模式
              </span>
            </>
          ) : supplier ? (
            <>
              <span className="text-[#5A5955] font-mono">{supplier.code}</span>
              {mode === "edit" && (
                <span className="px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B] font-medium">
                  編輯模式
                </span>
              )}
            </>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" && supplier && (
            <>
              <Link
                href="/parts/setup/suppliers"
                className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                onClick={enterCreate}
                disabled={!canEdit || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                onClick={enterEdit}
                disabled={!canEdit || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                onClick={() => setSupplierDelete(true)}
                disabled={!canEdit || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                onClick={toggleActive}
                disabled={!canEdit || isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {supplier.is_active ? "停用" : "啟用"}
              </button>
            </>
          )}
          {mode === "edit" && (
            <>
              <button
                type="button"
                onClick={saveEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                取消
              </button>
            </>
          )}
          {mode === "create" && (
            <>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={saveCreate}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Title Card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">供應商</div>
              {isEditing ? (
                <input
                  value={form.name}
                  onChange={(e) => patch("name", e.target.value)}
                  placeholder="（未命名供應商）"
                  className="h-[36px] w-full max-w-[400px] border border-[#D5D3CB] rounded px-2 text-[18px] font-semibold text-[#2C2C2A] focus:border-[#185FA5] outline-none"
                />
              ) : (
                <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                  {supplier?.name ?? "（未命名供應商）"}
                </h1>
              )}
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {isCreating ? (
                  <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                    尚未建立
                  </span>
                ) : (
                  <>
                    <span className="font-mono text-[#5A5955]">{supplier?.code}</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${supplierTypeOpt.chip}`}
                    >
                      {supplierTypeOpt.label}
                    </span>
                    {supplier?.is_active ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                        啟用中
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                        已停用
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="shrink-0 w-[260px] h-[120px] rounded-lg bg-[#F8F7F4] border border-[#EEECE6] flex items-center justify-center text-[12px] text-[#9A9890]">
            （供應商 logo 待開放）
          </div>
        </div>
      </header>

      {/* 2b. KPI strip — view mode only, 不在 create / 沒 metrics 時隱藏 */}
      {!isCreating && metrics && supplier && (
        <section className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard
            label="合作天數"
            value={metrics.partnership_days}
            tone="blue"
            icon={<span className="text-[18px]">📅</span>}
          />
          <KpiCard
            label="近 12 個月 PO"
            value={metrics.po_count_ltm}
            tone="teal"
            icon={<span className="text-[18px]">📦</span>}
          />
          <KpiCard
            label="近 12 個月金額"
            value={fmtAbbreviated(metrics.po_amount_ltm)}
            tone="green"
            icon={<span className="text-[18px]">💰</span>}
          />
          <KpiCard
            label="進行中 PO"
            value={metrics.open_po_count}
            tone="amber"
            icon={<span className="text-[18px]">🔄</span>}
          />
          <KpiCard
            label="有效合約"
            value={`${metrics.active_contract_count} / ${metrics.contract_count}`}
            tone={metrics.active_contract_count > 0 ? "purple" : "gray"}
            icon={<span className="text-[18px]">📑</span>}
          />
        </section>
      )}

      {/* 3a. Section: 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="代碼">
            {isEditing ? (
              <input
                value={form.code}
                onChange={(e) => patch("code", e.target.value)}
                placeholder="如 SUP-001"
                className={`${inputClass} font-mono`}
              />
            ) : (
              <span className="font-mono text-[#5A5955]">{supplier?.code ?? "—"}</span>
            )}
          </Kv>
          <Kv label="名稱">
            {isEditing ? (
              <input
                value={form.name}
                onChange={(e) => patch("name", e.target.value)}
                className={inputClass}
              />
            ) : (
              <span>{supplier?.name ?? "—"}</span>
            )}
          </Kv>
          <Kv label="供應商分類 (supplier_type)">
            {isEditing ? (
              <select
                value={form.supplier_type ?? ""}
                onChange={(e) => patch("supplier_type", e.target.value)}
                className={inputClass}
              >
                {SUPPLIER_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <span>{supplierTypeOpt.label}</span>
            )}
          </Kv>
          <Kv label="型態 (type, 舊欄位)">
            {isEditing ? (
              <select
                value={form.type ?? "agent"}
                onChange={(e) => patch("type", e.target.value)}
                className={inputClass}
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <span>
                {TYPE_OPTIONS.find((o) => o.value === supplier?.type)?.label ?? "—"}
              </span>
            )}
          </Kv>
          <Kv label="主要聯絡人">
            {isEditing ? (
              <input
                value={form.primary_contact ?? ""}
                onChange={(e) => patch("primary_contact", e.target.value)}
                className={inputClass}
              />
            ) : (
              <span>{supplier?.primary_contact ?? "—"}</span>
            )}
          </Kv>
          <Kv label="聯絡電話">
            {isEditing ? (
              <input
                value={form.phone ?? ""}
                onChange={(e) => patch("phone", e.target.value)}
                className={`${inputClass} font-mono`}
              />
            ) : (
              <span className="font-mono">{supplier?.phone ?? "—"}</span>
            )}
          </Kv>
          <Kv label="Email">
            {isEditing ? (
              <input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => patch("email", e.target.value)}
                className={inputClass}
              />
            ) : (
              <span>{supplier?.email ?? "—"}</span>
            )}
          </Kv>
          <Kv label="統一編號">
            {isEditing ? (
              <input
                value={form.tax_id ?? ""}
                onChange={(e) => patch("tax_id", e.target.value)}
                className={`${inputClass} font-mono`}
              />
            ) : (
              <span className="font-mono">{supplier?.tax_id ?? "—"}</span>
            )}
          </Kv>
          <Kv label="狀態">
            {isEditing && !isCreating ? (
              <select
                value={form.is_active ? "1" : "0"}
                onChange={(e) => patch("is_active", e.target.value === "1")}
                className={inputClass}
              >
                <option value="1">啟用</option>
                <option value="0">停用</option>
              </select>
            ) : isCreating ? (
              <span className="text-[#5A5955]">啟用（建立後預設）</span>
            ) : supplier?.is_active ? (
              <span className="text-[#3B6D11]">啟用中</span>
            ) : (
              <span className="text-[#6B6A68]">已停用</span>
            )}
          </Kv>
          <div className="md:col-span-3">
            <Kv label="地址">
              {isEditing ? (
                <input
                  value={form.address ?? ""}
                  onChange={(e) => patch("address", e.target.value)}
                  className={inputClass}
                />
              ) : (
                <span>{supplier?.address ?? "—"}</span>
              )}
            </Kv>
          </div>
          <div className="md:col-span-3">
            <Kv label="備註">
              {isEditing ? (
                <textarea
                  value={form.notes ?? ""}
                  onChange={(e) => patch("notes", e.target.value)}
                  rows={2}
                  className={textareaClass}
                />
              ) : (
                <span className="text-[#5A5955] text-[12px]">
                  {supplier?.notes ?? "—"}
                </span>
              )}
            </Kv>
          </div>
        </div>
      </section>

      {/* 3b. Section: 付款 / 稅務 / 會計 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 付款 / 稅務 / 會計
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="付款條件">
            {isEditing ? (
              <input
                value={form.payment_terms ?? ""}
                onChange={(e) => patch("payment_terms", e.target.value)}
                placeholder="如 月結 30 天"
                className={inputClass}
              />
            ) : (
              <span>{supplier?.payment_terms ?? "—"}</span>
            )}
          </Kv>
          <Kv label="付款天期 (天)">
            {isEditing ? (
              <input
                type="number"
                min={0}
                value={form.payment_terms_days ?? ""}
                onChange={(e) => patch("payment_terms_days", e.target.value)}
                className={`${inputClass} font-mono`}
              />
            ) : (
              <span className="font-mono">{supplier?.payment_terms_days ?? "—"}</span>
            )}
          </Kv>
          <Kv label="預設幣別">
            {isEditing ? (
              <select
                value={form.default_currency ?? "TWD"}
                onChange={(e) => patch("default_currency", e.target.value)}
                className={inputClass}
              >
                {CURRENCY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-mono">{supplier?.default_currency ?? "TWD"}</span>
            )}
          </Kv>
          <Kv label="預設進項稅碼">
            {isEditing ? (
              <select
                value={form.default_tax_code_id ?? ""}
                onChange={(e) => patch("default_tax_code_id", e.target.value || null)}
                className={inputClass}
              >
                <option value="">— 不指定 —</option>
                {taxCodeOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.tax_code} {o.name} ({o.rate}%)
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[12px]">{taxName(supplier?.default_tax_code_id)}</span>
            )}
          </Kv>
          <Kv label="需扣繳所得稅">
            {isEditing ? (
              <select
                value={form.is_withholding_required ? "1" : "0"}
                onChange={(e) =>
                  patch("is_withholding_required", e.target.value === "1")
                }
                className={inputClass}
              >
                <option value="0">否</option>
                <option value="1">是（外國勞務 / 個人）</option>
              </select>
            ) : (
              <span>{supplier?.is_withholding_required ? "是" : "否"}</span>
            )}
          </Kv>
          <Kv label="扣繳稅碼">
            {isEditing ? (
              <select
                value={form.withholding_tax_code_id ?? ""}
                onChange={(e) =>
                  patch("withholding_tax_code_id", e.target.value || null)
                }
                className={inputClass}
                disabled={!form.is_withholding_required}
              >
                <option value="">— 不指定 —</option>
                {taxCodeOptions
                  .filter((o) => o.direction === "withholding" || o.direction === "input")
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.tax_code} {o.name} ({o.rate}%)
                    </option>
                  ))}
              </select>
            ) : (
              <span className="text-[12px]">{taxName(supplier?.withholding_tax_code_id)}</span>
            )}
          </Kv>
          <div className="md:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
            <Kv label="應付帳款科目 (gl_payable_coa_id)">
              {isEditing ? (
                <select
                  value={form.gl_payable_coa_id ?? ""}
                  onChange={(e) => patch("gl_payable_coa_id", e.target.value || null)}
                  className={inputClass}
                >
                  <option value="">— 不指定 —</option>
                  {coaOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.account_code} {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[12px]">{coaName(supplier?.gl_payable_coa_id)}</span>
              )}
            </Kv>
            <Kv label="預設費用科目 (default_expense_coa_id)">
              {isEditing ? (
                <select
                  value={form.default_expense_coa_id ?? ""}
                  onChange={(e) =>
                    patch("default_expense_coa_id", e.target.value || null)
                  }
                  className={inputClass}
                >
                  <option value="">— 不指定 —</option>
                  {coaOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.account_code} {o.name}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-[12px]">
                  {coaName(supplier?.default_expense_coa_id)}
                </span>
              )}
            </Kv>
          </div>
        </div>
      </section>

      {/* 4. Tabs */}
      {isCreating ? (
        <div className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[12px] text-[#9A9890]">
          建立後將跳轉到該供應商的詳情頁，可進一步維護合約 / 供應品類 / 系統整合資訊⋯
        </div>
      ) : supplier ? (
        <>
          <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
            <div className="flex border-b border-[#EEECE6]">
              {(
                [
                  { key: "performance", label: "效能 / 統計" },
                  { key: "contracts", label: "合約" },
                  { key: "categories", label: "供應品類" },
                  { key: "system", label: "系統 / 整合" },
                ] as { key: TabKey; label: string }[]
              ).map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-[#EEECE6] ${
                    tab === t.key
                      ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                      : "text-[#5A5955] hover:bg-[#F8F7F4]"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
            {tab === "performance" && (
              <PerformancePanel metrics={metrics} />
            )}
            {tab === "contracts" && (
              <ContractsPanel
                contracts={contracts}
                canEdit={canEdit}
                onAdd={() => setContractModal({ open: true, row: null })}
                onEdit={(row) => setContractModal({ open: true, row })}
                onDelete={(row) => setContractDelete(row)}
              />
            )}
            {tab === "categories" && (
              <CategoriesPanel
                supplyCategories={form.supply_categories ?? ""}
                canEdit={canEdit}
                isPending={isPending}
                onSave={(value) => {
                  if (!supplier) return;
                  startTransition(async () => {
                    const res = await updateSupplier(supplier.id, {
                      supply_categories: value,
                    });
                    if (res.ok) {
                      patch("supply_categories", value);
                      showBanner({ ok: true, msg: "✓ 已儲存" });
                      router.refresh();
                    } else {
                      showBanner({ ok: false, msg: res.error });
                    }
                  });
                }}
              />
            )}
            {tab === "system" && <SystemPanel supplier={supplier} />}
          </div>
        </>
      ) : null}

      {/* Banner */}
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

      {/* Supplier delete modal */}
      {supplierDelete && supplier && (
        <Modal
          title="刪除供應商"
          onClose={() => setSupplierDelete(false)}
        >
          <p className="text-[13px] text-[#5A5955]">
            確認刪除供應商 <b>{supplier.name}</b>（{supplier.code}）？
          </p>
          <p className="text-[12px] text-[#9A9890] mt-1">
            這是軟刪除：is_active 設成 false、底下 active 合約會一併設為 inactive。
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setSupplierDelete(false)}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-50"
            >
              {isPending ? "刪除中⋯" : "確認刪除"}
            </button>
          </div>
        </Modal>
      )}

      {/* Contract create/edit modal */}
      {contractModal.open && supplier && (
        <ContractModal
          supplierId={supplier.id}
          row={contractModal.row}
          onClose={() => setContractModal({ open: false })}
          onSaved={() => {
            setContractModal({ open: false });
            showBanner({ ok: true, msg: "✓ 已儲存" });
            router.refresh();
          }}
          onError={(msg) => showBanner({ ok: false, msg })}
        />
      )}

      {/* Contract delete modal */}
      {contractDelete && (
        <Modal title="刪除合約" onClose={() => setContractDelete(null)}>
          <p className="text-[13px] text-[#5A5955]">
            確認刪除合約 <b className="font-mono">{contractDelete.contract_no}</b>？
          </p>
          <p className="text-[12px] text-[#9A9890] mt-1">
            這是真刪除（hard delete）。如果合約已經被採購單引用，DB 會擋下。
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={() => setContractDelete(null)}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
            >
              取消
            </button>
            <button
              type="button"
              onClick={() => {
                const target = contractDelete;
                startTransition(async () => {
                  const res = await deleteContract(target.id);
                  if (res.ok) {
                    setContractDelete(null);
                    showBanner({ ok: true, msg: "✓ 已刪除" });
                    router.refresh();
                  } else {
                    showBanner({ ok: false, msg: res.error });
                  }
                });
              }}
              disabled={isPending}
              className="h-[30px] px-3.5 rounded text-[12.5px] bg-[#CC0000] text-white hover:bg-[#a30000] disabled:opacity-50"
            >
              {isPending ? "刪除中⋯" : "確認刪除"}
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

// ───────── Sub-components ─────────

function Kv({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[11px] text-[#9A9890]">{label}</span>
      <div className="text-[12.5px] text-[#2C2C2A] min-h-[30px] flex items-center">
        {children}
      </div>
    </div>
  );
}

function Modal({
  title,
  children,
  onClose,
  size = "md",
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  size?: "md" | "lg";
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className={`bg-white rounded-lg border border-[#EEECE6] shadow-xl ${
          size === "lg" ? "max-w-[640px]" : "max-w-[440px]"
        } w-full`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-[#EEECE6] flex items-center">
          <h3 className="text-[14px] font-semibold text-[#2C2C2A]">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-[#9A9890] hover:text-[#5A5955] text-[16px]"
            aria-label="關閉"
          >
            ✕
          </button>
        </header>
        <div className="px-4 py-3">{children}</div>
      </div>
    </div>
  );
}

function ContractsPanel({
  contracts,
  canEdit,
  onAdd,
  onEdit,
  onDelete,
}: {
  contracts: SupplierContractRow[];
  canEdit: boolean;
  onAdd: () => void;
  onEdit: (row: SupplierContractRow) => void;
  onDelete: (row: SupplierContractRow) => void;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">合約清單</h2>
        <span className="ml-2 text-[11px] text-[#9A9890]">
          共 <b className="text-[#2C2C2A]">{contracts.length}</b> 筆
        </span>
        <button
          type="button"
          onClick={onAdd}
          disabled={!canEdit}
          className="ml-auto h-[26px] px-3 rounded-full text-[11.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
        >
          ＋ 新增合約
        </button>
      </header>
      {contracts.length === 0 ? (
        <div className="px-4 py-6 text-center text-[12px] text-[#9A9890]">
          尚無合約
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="bg-[#F8F7F4] text-[11px] text-[#9A9890]">
                <th className="px-3 py-2 text-left font-medium">合約編號</th>
                <th className="px-3 py-2 text-left font-medium">起始</th>
                <th className="px-3 py-2 text-left font-medium">截止</th>
                <th className="px-3 py-2 text-left font-medium">付款條件</th>
                <th className="px-3 py-2 text-right font-medium">最低訂購金額</th>
                <th className="px-3 py-2 text-left font-medium">狀態</th>
                <th className="px-3 py-2 text-right font-medium" style={{ width: 180 }}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {contracts.map((c) => (
                <tr key={c.id} className="border-t border-[#EEECE6]">
                  <td className="px-3 py-2 font-mono">{c.contract_no}</td>
                  <td className="px-3 py-2 font-mono">{fmtDate(c.effective_from)}</td>
                  <td className="px-3 py-2 font-mono">{fmtDate(c.effective_to)}</td>
                  <td className="px-3 py-2">{c.payment_terms ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-mono">
                    {fmtMoney(c.min_order_amount)}
                  </td>
                  <td className="px-3 py-2">
                    {c.status === "active" ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF3DE] text-[#3B6D11]">
                        有效
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
                        {c.status}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => onEdit(c)}
                        disabled={!canEdit}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(c)}
                        disabled={!canEdit}
                        className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function CategoriesPanel({
  supplyCategories,
  canEdit,
  isPending,
  onSave,
}: {
  supplyCategories: string;
  canEdit: boolean;
  isPending: boolean;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState(supplyCategories);
  const dirty = draft !== supplyCategories;
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">供應品類</h2>
      </header>
      <div className="px-4 py-3 space-y-2">
        <p className="text-[11.5px] text-[#9A9890]">
          自由文字描述（如「煞車系統・傳動系統・電裝」），存於 metadata.supply_categories。
        </p>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          placeholder="例：煞車系統・傳動系統・電裝"
          className={textareaClass}
          disabled={!canEdit}
        />
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSave(draft)}
            disabled={!canEdit || !dirty || isPending}
            className="h-[30px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存"}
          </button>
        </div>
      </div>
    </section>
  );
}

function SystemPanel({ supplier }: { supplier: SupplierRow }) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">系統 / 整合</h2>
      </header>
      <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
        <Kv label="UUID">
          <span className="font-mono text-[11.5px] text-[#5A5955] break-all">
            {supplier.id}
          </span>
        </Kv>
        <Kv label="External Source">
          <span>{supplier.external_source ?? "—"}</span>
        </Kv>
        <Kv label="External ID">
          <span className="font-mono">{supplier.external_id ?? "—"}</span>
        </Kv>
        <Kv label="同步時間">
          <span className="font-mono text-[11.5px]">
            {fmtDateTime(supplier.synced_at)}
          </span>
        </Kv>
        <Kv label="建立時間">
          <span className="font-mono text-[11.5px]">
            {fmtDateTime(supplier.created_at)}
          </span>
        </Kv>
        <Kv label="更新時間">
          <span className="font-mono text-[11.5px]">
            {fmtDateTime(supplier.updated_at)}
          </span>
        </Kv>
      </div>
    </section>
  );
}

function ContractModal({
  supplierId,
  row,
  onClose,
  onSaved,
  onError,
}: {
  supplierId: string;
  row: SupplierContractRow | null;
  onClose: () => void;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState<ContractWriteInput>(
    row
      ? {
          supplier_id: supplierId,
          contract_no: row.contract_no,
          effective_from: row.effective_from,
          effective_to: row.effective_to ?? "",
          payment_terms: row.payment_terms ?? "",
          min_order_amount: row.min_order_amount ?? "",
          status: row.status,
          document_url: row.document_url ?? "",
          notes: row.notes ?? "",
        }
      : {
          supplier_id: supplierId,
          contract_no: "",
          effective_from: new Date().toISOString().slice(0, 10),
          effective_to: "",
          payment_terms: "",
          min_order_amount: "",
          status: "active",
          document_url: "",
          notes: "",
        },
  );

  function patch<K extends keyof ContractWriteInput>(
    key: K,
    value: ContractWriteInput[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const res = row
        ? await updateContract(row.id, form)
        : await createContract(form);
      if (res.ok) {
        onSaved();
      } else {
        onError(res.error);
      }
    });
  }

  return (
    <Modal title={row ? "編輯合約" : "新增合約"} onClose={onClose} size="lg">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#9A9890]">合約編號 *</label>
          <input
            value={form.contract_no}
            onChange={(e) => patch("contract_no", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#9A9890]">狀態</label>
          <select
            value={form.status ?? "active"}
            onChange={(e) => patch("status", e.target.value)}
            className={inputClass}
          >
            <option value="active">有效</option>
            <option value="inactive">停用</option>
            <option value="draft">草稿</option>
            <option value="expired">已到期</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#9A9890]">起始日期 *</label>
          <input
            type="date"
            value={form.effective_from ?? ""}
            onChange={(e) => patch("effective_from", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#9A9890]">截止日期</label>
          <input
            type="date"
            value={form.effective_to ?? ""}
            onChange={(e) => patch("effective_to", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#9A9890]">付款條件</label>
          <input
            value={form.payment_terms ?? ""}
            onChange={(e) => patch("payment_terms", e.target.value)}
            placeholder="如 月結 30 天"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[11px] text-[#9A9890]">最低訂購金額</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={form.min_order_amount ?? ""}
            onChange={(e) => patch("min_order_amount", e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </div>
        <div className="md:col-span-2 flex flex-col gap-1">
          <label className="text-[11px] text-[#9A9890]">合約文件 URL</label>
          <input
            value={form.document_url ?? ""}
            onChange={(e) => patch("document_url", e.target.value)}
            placeholder="https://..."
            className={inputClass}
          />
        </div>
        <div className="md:col-span-2 flex flex-col gap-1">
          <label className="text-[11px] text-[#9A9890]">備註</label>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => patch("notes", e.target.value)}
            rows={2}
            className={textareaClass}
          />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button
          type="button"
          onClick={onClose}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
        >
          取消
        </button>
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
        >
          {isPending ? "儲存中⋯" : row ? "儲存變更" : "建立"}
        </button>
      </div>
    </Modal>
  );
}

function PerformancePanel({ metrics }: { metrics: SupplierMetrics | null }) {
  if (!metrics) {
    return (
      <div className="text-center text-[12px] text-[#9A9890] py-6">
        尚無績效資料（建立後待採購單累積）
      </div>
    );
  }

  const closedRate =
    metrics.po_count_total > 0
      ? Math.round((metrics.closed_po_count / metrics.po_count_total) * 100)
      : 0;

  // 依 月份 統計 recent_pos
  const monthBuckets = new Map<string, number>();
  for (const p of metrics.recent_pos) {
    if (!p.po_date) continue;
    const m = p.po_date.slice(0, 7);
    monthBuckets.set(m, (monthBuckets.get(m) ?? 0) + p.amount_total);
  }
  const sortedMonths = Array.from(monthBuckets.entries())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .slice(-6);
  const sparkData = sortedMonths.map(([, v]) => Math.round(v));

  const events: TimelineEvent[] = metrics.recent_pos.slice(0, 6).map((p) => {
    const def = PO_STATUS_LABEL[p.status] ?? { label: p.status || "—", tone: "gray" as const };
    return {
      id: p.id,
      time: p.po_date ? p.po_date.replaceAll("-", "/") : "—",
      title: p.po_no || "（無單號）",
      description: (
        <span className="font-mono">
          {fmtMoney(p.amount_total)} · {def.label}
        </span>
      ),
      tone: def.tone,
    };
  });

  return (
    <div className="space-y-3">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="累計 PO 張數"
          value={metrics.po_count_total}
          tone="blue"
          icon={<span className="text-[18px]">📦</span>}
        />
        <KpiCard
          label="累計採購額"
          value={fmtAbbreviated(metrics.po_amount_total)}
          tone="green"
          icon={<span className="text-[18px]">💰</span>}
        />
        <KpiCard
          label="結案率"
          value={`${closedRate}%`}
          tone={closedRate >= 80 ? "green" : closedRate >= 50 ? "teal" : "amber"}
          icon={<span className="text-[18px]">✅</span>}
        />
        <KpiCard
          label="最後採購"
          value={daysAgoLabel(metrics.last_po_date)}
          tone="purple"
          icon={<span className="text-[18px]">⏱️</span>}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Sparkline of recent months */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">近 6 個月採購趨勢</h2>
            <span className="ml-auto text-[11px] text-[#9A9890]">
              {sortedMonths.length > 0 ? `${sortedMonths[0][0]} ~ ${sortedMonths[sortedMonths.length - 1][0]}` : "—"}
            </span>
          </header>
          <div className="px-4 py-3">
            {sparkData.length > 0 ? (
              <SparkLine data={sparkData} tone="teal" height={80} strokeWidth={2} />
            ) : (
              <div className="text-center text-[12px] text-[#9A9890] py-4">
                近期無採購紀錄
              </div>
            )}
            <div className="flex flex-wrap gap-1 mt-2">
              {sortedMonths.map(([m, v]) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] bg-[#F8F7F4] text-[#5A5955]"
                >
                  <span className="font-mono">{m}</span>
                  <span className="font-semibold text-[#1A3A5C]">{fmtAbbreviated(v)}</span>
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Recent PO Timeline */}
        <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
          <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
              最近採購單（{metrics.recent_pos.length}/8）
            </h2>
          </header>
          <div className="px-4 py-3">
            {events.length > 0 ? (
              <Timeline events={events} variant="vertical" />
            ) : (
              <div className="text-center text-[12px] text-[#9A9890] py-4">
                尚無採購紀錄
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
