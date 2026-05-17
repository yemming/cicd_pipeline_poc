"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSupplierAction,
  deleteSupplierAction,
  updateSupplierAction,
  type SupplierInput,
} from "@/lib/master-data/supplier-actions";
import type { SupplierFieldKey } from "@/lib/master-data/supplier-form-types";
import type { Account, Supplier } from "@/lib/parts/types";

export type AccountRef = { id: string; account_code: string; name_zh_tw: string };

type Banner = { ok: boolean; msg: string } | null;
type TabKey = "basic" | "contact" | "links" | "audit";

const TABS: { key: TabKey; label: string }[] = [
  { key: "basic", label: "帳務 / 採購" },
  { key: "contact", label: "聯絡資訊" },
  { key: "links", label: "相關交易" },
  { key: "audit", label: "稽核資訊" },
];

const TYPE_OPTIONS: { value: NonNullable<SupplierInput["type"]>; label: string }[] = [
  { value: "oem", label: "OEM 原廠" },
  { value: "agent", label: "代理商" },
  { value: "consumable", label: "耗材／工具" },
  { value: "services", label: "服務商" },
  { value: "other", label: "其他" },
];

const CURRENCY_OPTIONS = [
  { value: "TWD", label: "TWD（新台幣）" },
  { value: "USD", label: "USD（美元）" },
  { value: "EUR", label: "EUR（歐元）" },
  { value: "JPY", label: "JPY（日圓）" },
  { value: "CNY", label: "CNY（人民幣）" },
];

const TYPE_LABEL = new Map<string, string>(TYPE_OPTIONS.map((o) => [o.value, o.label]));

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("zh-TW", { timeZone: "Asia/Taipei" });
  } catch {
    return "—";
  }
}

const blankInput = (): SupplierInput => ({
  code: null,
  name: "",
  type: "agent",
  tax_id: null,
  primary_contact: null,
  phone: null,
  email: null,
  address: null,
  payment_terms: null,
  default_currency: "TWD",
  gl_payable_coa_id: null,
  notes: null,
  is_active: true,
});

const fromRow = (r: Supplier): SupplierInput => ({
  code: r.code,
  name: r.name,
  type: (r.type as SupplierInput["type"]) ?? "agent",
  tax_id: r.tax_id,
  primary_contact: r.primary_contact,
  phone: r.phone,
  email: r.email,
  address: r.address,
  payment_terms: r.payment_terms,
  default_currency: r.default_currency ?? "TWD",
  gl_payable_coa_id: r.gl_payable_coa_id,
  notes: r.notes,
  is_active: r.is_active,
});

export function SupplierDetailView({
  supplier,
  accounts,
  canEdit,
  initialMode = "view",
}: {
  supplier: Supplier | null;
  accounts: Account[];
  canEdit: boolean;
  initialMode?: "view" | "create";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(initialMode === "create");
  const [activeTab, setActiveTab] = useState<TabKey>("basic");
  const [draft, setDraft] = useState<SupplierInput>(
    supplier ? fromRow(supplier) : blankInput(),
  );
  const [createDraft, setCreateDraft] = useState<SupplierInput>(blankInput());
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<SupplierFieldKey, string>>>({});

  const showInputs = editing || creating;
  const formDraft: SupplierInput = creating ? createDraft : draft;
  const setFormDraft = (next: SupplierInput) => {
    if (creating) setCreateDraft(next);
    else setDraft(next);
  };

  const accountMap = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);
  const payableAccount = supplier?.gl_payable_coa_id
    ? accountMap.get(supplier.gl_payable_coa_id) ?? null
    : null;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const save = () => {
    if (!supplier) return;
    startTransition(async () => {
      setFieldErrors({});
      const res = await updateSupplierAction(supplier.id, draft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setEditing(false);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const cancelEdit = () => {
    if (supplier) setDraft(fromRow(supplier));
    setFieldErrors({});
    setEditing(false);
  };

  const toggleActive = () => {
    if (!supplier) return;
    startTransition(async () => {
      const res = await updateSupplierAction(supplier.id, {
        ...fromRow(supplier),
        is_active: !supplier.is_active,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: supplier.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else showBanner({ ok: false, msg: res.error });
    });
  };

  const openCreate = () => {
    setEditing(false);
    setCreateDraft(blankInput());
    setFieldErrors({});
    setCreating(true);
  };

  const cancelCreate = () => {
    setFieldErrors({});
    if (initialMode === "create") router.push("/admin/master-data/suppliers");
    else setCreating(false);
  };

  const submitCreate = () => {
    startTransition(async () => {
      setFieldErrors({});
      const res = await createSupplierAction(createDraft);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立供應商，跳轉中…" });
        setCreating(false);
        router.push(`/admin/master-data/suppliers/${res.data.id}`);
        router.refresh();
      } else {
        setFieldErrors(res.fieldErrors ?? {});
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const remove = () => {
    if (!supplier) return;
    if (
      !confirm(
        `確定刪除供應商「${supplier.name}」？\n若已有採購單、定價、進貨參照會擋下；建議改用停用保留歷史。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteSupplierAction(supplier.id);
      if (res.ok) {
        router.push("/admin/master-data/suppliers");
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
    ? "（未命名供應商）"
    : supplier
      ? supplier.name
      : "（資料缺失）";
  const headlineCode = creating ? "—" : supplier?.code ?? "—";

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/admin/master-data/suppliers" className="hover:text-[#185FA5]">
            供應商
          </Link>
          <span>›</span>
          <span className={`text-[#5A5955] ${creating ? "" : "font-mono"}`}>
            {creating ? "新增供應商" : headlineCode}
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
                href="/admin/master-data/suppliers"
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
                disabled={!canEdit || !supplier}
                onClick={() => setEditing(true)}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                disabled={!canEdit || !supplier}
                onClick={remove}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                disabled={!canEdit || !supplier}
                onClick={toggleActive}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                {supplier?.is_active ? "停用" : "啟用"}
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
              <div className="text-[11px] tracking-wider text-[#9A9890]">供應商主檔</div>
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
                ) : supplier ? (
                  <>
                    <span className="font-mono text-[#5A5955]">{supplier.code}</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        supplier.is_active
                          ? "bg-[#EAF3DE] text-[#3B6D11]"
                          : "bg-[#F2F2F2] text-[#6B6A68]"
                      }`}
                    >
                      {supplier.is_active ? "啟用" : "停用"}
                    </span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                      {TYPE_LABEL.get(String(supplier.type ?? "")) ?? supplier.type}
                    </span>
                    {supplier.tax_id ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#5A5955] font-mono">
                        統編 {supplier.tax_id}
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
                <span>建立後可查看相關交易</span>
              ) : (
                <>
                  <div className="text-[11px] text-[#9A9890]">預設幣別</div>
                  <div className="text-[26px] font-semibold text-[#2C2C2A] font-mono">
                    {supplier?.default_currency ?? "TWD"}
                  </div>
                  <div className="text-[11px] text-[#9A9890] mt-1">
                    {supplier?.payment_terms ?? "—"}
                  </div>
                </>
              )}
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
            label={creating ? "供應商代碼（留空自動產生）" : "供應商代碼*"}
            value={
              showInputs ? (
                <input
                  value={formDraft.code ?? ""}
                  onChange={(e) => setFormDraft({ ...formDraft, code: e.target.value || null })}
                  placeholder={creating ? "留空自動產生 S00001…" : ""}
                  disabled={!creating}
                  className={inputClass}
                />
              ) : supplier ? (
                <span className="font-mono">{supplier.code}</span>
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="供應商名稱*"
            value={
              showInputs ? (
                <input
                  value={formDraft.name}
                  onChange={(e) => setFormDraft({ ...formDraft, name: e.target.value })}
                  placeholder="公司行號全名"
                  className={inputClass}
                />
              ) : supplier?.name ?? "—"
            }
          />
          <Kv
            label="供應商類型*"
            value={
              showInputs ? (
                <select
                  value={formDraft.type ?? "agent"}
                  onChange={(e) =>
                    setFormDraft({ ...formDraft, type: e.target.value as SupplierInput["type"] })
                  }
                  className={inputClass}
                >
                  {TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                TYPE_LABEL.get(String(supplier?.type ?? "")) ?? supplier?.type ?? "—"
              )
            }
          />
          <Kv
            label="統一編號"
            value={
              showInputs ? (
                <input
                  value={formDraft.tax_id ?? ""}
                  onChange={(e) => setFormDraft({ ...formDraft, tax_id: e.target.value || null })}
                  placeholder="8 碼數字"
                  className={inputClass}
                />
              ) : supplier?.tax_id ? (
                <span className="font-mono">{supplier.tax_id}</span>
              ) : (
                <span className="text-[#9A9890]">—</span>
              )
            }
          />
        </div>
        {Object.values(fieldErrors).some(Boolean) ? (
          <div className="px-4 pb-3 text-[11.5px] text-[#CC0000]">
            {Object.entries(fieldErrors)
              .filter(([, v]) => v)
              .map(([k, v]) => `${k}: ${v}`)
              .join(" · ")}
          </div>
        ) : null}
      </section>

      {creating ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該供應商的詳情頁，可進一步維護聯絡資訊、應付帳款科目、付款條件。
        </p>
      ) : null}

      {/* Tabs */}
      {!creating && supplier ? (
        <>
          <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto" id="tab-content">
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
            {activeTab === "basic" ? (
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${showInputs ? lockedClass : ""}`}>
                {sectionCard(
                  "帳務 / 採購",
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Kv
                      label="付款條件"
                      value={
                        showInputs ? (
                          <input
                            value={formDraft.payment_terms ?? ""}
                            onChange={(e) =>
                              setFormDraft({ ...formDraft, payment_terms: e.target.value || null })
                            }
                            placeholder="例：月結 30 天 / Net 30"
                            className={inputClass}
                          />
                        ) : supplier.payment_terms ?? <span className="text-[#9A9890]">—</span>
                      }
                    />
                    <Kv
                      label="預設幣別*"
                      value={
                        showInputs ? (
                          <select
                            value={formDraft.default_currency ?? "TWD"}
                            onChange={(e) =>
                              setFormDraft({ ...formDraft, default_currency: e.target.value })
                            }
                            className={inputClass}
                          >
                            {CURRENCY_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="font-mono">{supplier.default_currency}</span>
                        )
                      }
                    />
                    <div className="md:col-span-2">
                      <Kv
                        label="應付帳款科目"
                        value={
                          showInputs ? (
                            <select
                              value={formDraft.gl_payable_coa_id ?? ""}
                              onChange={(e) =>
                                setFormDraft({
                                  ...formDraft,
                                  gl_payable_coa_id: e.target.value || null,
                                })
                              }
                              className={inputClass}
                            >
                              <option value="">— 未指定 —</option>
                              {accounts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {`${a.account_code} ${a.name_zh_tw}`}
                                </option>
                              ))}
                            </select>
                          ) : payableAccount ? (
                            <div>
                              <div className="font-mono text-[12px] text-[#5A5955]">
                                {payableAccount.account_code}
                              </div>
                              <div>{payableAccount.name_zh_tw}</div>
                            </div>
                          ) : (
                            <span className="text-[#9A9890]">未指定（接 NetSuite 對帳時用）</span>
                          )
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Kv
                        label="備註"
                        value={
                          showInputs ? (
                            <textarea
                              value={formDraft.notes ?? ""}
                              onChange={(e) =>
                                setFormDraft({ ...formDraft, notes: e.target.value || null })
                              }
                              rows={3}
                              placeholder="供貨範圍 / 交期偏好 / 特殊條款…"
                              className="border border-[#D5D3CB] rounded px-2 py-1 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full"
                            />
                          ) : supplier.notes ? (
                            <div className="whitespace-pre-wrap text-[12.5px]">{supplier.notes}</div>
                          ) : (
                            <span className="text-[#9A9890]">—</span>
                          )
                        }
                      />
                    </div>
                  </div>,
                )}
                {sectionCard(
                  "停用影響",
                  <div className="text-[12px] text-[#5A5955] leading-relaxed">
                    停用後此供應商不會出現在新採購單、定價維護的 dropdown，但既有採購單、進貨單仍維持引用、報表可繼續查。建議跟採購對齊後再停用。
                  </div>,
                )}
              </div>
            ) : null}

            {activeTab === "contact" ? (
              <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${showInputs ? lockedClass : ""}`}>
                {sectionCard(
                  "聯絡資訊",
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Kv
                      label="主要聯絡人"
                      value={
                        showInputs ? (
                          <input
                            value={formDraft.primary_contact ?? ""}
                            onChange={(e) =>
                              setFormDraft({
                                ...formDraft,
                                primary_contact: e.target.value || null,
                              })
                            }
                            className={inputClass}
                          />
                        ) : supplier.primary_contact ?? <span className="text-[#9A9890]">—</span>
                      }
                    />
                    <Kv
                      label="電話"
                      value={
                        showInputs ? (
                          <input
                            value={formDraft.phone ?? ""}
                            onChange={(e) =>
                              setFormDraft({ ...formDraft, phone: e.target.value || null })
                            }
                            className={inputClass}
                          />
                        ) : supplier.phone ?? <span className="text-[#9A9890]">—</span>
                      }
                    />
                    <Kv
                      label="Email"
                      value={
                        showInputs ? (
                          <input
                            type="email"
                            value={formDraft.email ?? ""}
                            onChange={(e) =>
                              setFormDraft({ ...formDraft, email: e.target.value || null })
                            }
                            className={inputClass}
                          />
                        ) : supplier.email ?? <span className="text-[#9A9890]">—</span>
                      }
                    />
                    <div className="md:col-span-2">
                      <Kv
                        label="地址"
                        value={
                          showInputs ? (
                            <input
                              value={formDraft.address ?? ""}
                              onChange={(e) =>
                                setFormDraft({ ...formDraft, address: e.target.value || null })
                              }
                              className={inputClass}
                            />
                          ) : supplier.address ?? <span className="text-[#9A9890]">—</span>
                        }
                      />
                    </div>
                  </div>,
                )}
              </div>
            ) : null}

            {activeTab === "links" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {sectionCard(
                  "相關交易",
                  <div className="space-y-2 text-[12.5px]">
                    <Kv
                      label="供應商定價"
                      value={
                        <Link
                          href={`/admin/master-data/supplier-pricing?supplier=${supplier.id}`}
                          className="text-[#185FA5] hover:underline"
                        >
                          查看本供應商定價 →
                        </Link>
                      }
                      small
                    />
                    <Kv
                      label="料件交期"
                      value={
                        <Link
                          href={`/admin/master-data/item-lead-times?supplier=${supplier.id}`}
                          className="text-[#185FA5] hover:underline"
                        >
                          查看本供應商料件交期 →
                        </Link>
                      }
                      small
                    />
                  </div>,
                )}
                {sectionCard(
                  "備註提示",
                  <div className="text-[12px] text-[#5A5955] leading-relaxed">
                    若供應商已停用但仍想看歷史交易，到對應模組改用「不限狀態」篩選即可。
                  </div>,
                )}
              </div>
            ) : null}

            {activeTab === "audit" ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {sectionCard(
                  "識別碼",
                  <>
                    <Kv label="系統識別碼" value={<span className="font-mono">{supplier.id}</span>} small />
                    <Kv label="品牌" value={supplier.brand_id} mono small />
                  </>,
                )}
                {sectionCard("建立", <Kv label="建立時間" value={fmtDateTime(supplier.created_at)} mono small />)}
                {sectionCard("更新", <Kv label="最後更新" value={fmtDateTime(supplier.updated_at)} mono small />)}
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
        className={`text-[12.5px] ${bold ? "font-semibold" : ""} ${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
