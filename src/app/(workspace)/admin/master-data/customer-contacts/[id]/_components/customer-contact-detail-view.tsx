"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createCustomerContactResultAction,
  deleteCustomerContactAction,
  setCustomerContactActiveAction,
  updateCustomerContactResultAction,
  type CustomerContactInput,
} from "@/lib/master-data/customer-contact-actions";
import type { CustomerContact, CustomerContactRole } from "@/lib/parts/types";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";
type CustomerLite = { id: string; code: string; name: string };

const ROLE_OPTIONS: { value: CustomerContactRole; label: string }[] = [
  { value: "primary", label: "主要" },
  { value: "emergency", label: "緊急" },
  { value: "family", label: "家屬" },
  { value: "secretary", label: "秘書" },
  { value: "other", label: "其他" },
];

const ROLE_LABEL: Record<string, string> = Object.fromEntries(
  ROLE_OPTIONS.map((o) => [o.value, o.label]),
);

const ROLE_CHIP: Record<string, string> = {
  primary: "bg-[#DEEBFF] text-[#0747A6]",
  emergency: "bg-[#FFEBE6] text-[#BF2600]",
  family: "bg-[#E3FCEF] text-[#006644]",
  secretary: "bg-[#EAE6FF] text-[#403294]",
  other: "bg-[#DFE1E6] text-[#42526E]",
};

export type CustomerContactDetailViewProps = {
  contact: CustomerContact | null;
  customers: CustomerLite[];
  initialMode: Mode;
  canEdit: boolean;
};

export function CustomerContactDetailView({
  contact,
  customers,
  initialMode,
  canEdit,
}: CustomerContactDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  const customerById = new Map(customers.map((c) => [c.id, c]));

  // Edit form state
  const [eRole, setERole] = useState<CustomerContactRole>(
    (contact?.role as CustomerContactRole) ?? "primary",
  );
  const [eName, setEName] = useState(contact?.name ?? "");
  const [ePhone, setEPhone] = useState(contact?.phone ?? "");
  const [eEmail, setEEmail] = useState(contact?.email ?? "");
  const [eRelation, setERelation] = useState(contact?.relation ?? "");
  const [eNotes, setENotes] = useState(contact?.notes ?? "");

  // Create form state
  const [cCustomerId, setCCustomerId] = useState("");
  const [cRole, setCRole] = useState<CustomerContactRole>("primary");
  const [cName, setCName] = useState("");
  const [cPhone, setCPhone] = useState("");
  const [cEmail, setCEmail] = useState("");
  const [cRelation, setCRelation] = useState("");
  const [cNotes, setCNotes] = useState("");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const enterEditMode = () => {
    if (contact) {
      setERole((contact.role as CustomerContactRole) ?? "primary");
      setEName(contact.name ?? "");
      setEPhone(contact.phone ?? "");
      setEEmail(contact.email ?? "");
      setERelation(contact.relation ?? "");
      setENotes(contact.notes ?? "");
    }
    setMode("edit");
  };

  const submitEdit = () => {
    if (!contact) return;
    if (!eName.trim()) {
      showBanner({ ok: false, msg: "姓名必填" });
      return;
    }
    startTransition(async () => {
      const res = await updateCustomerContactResultAction(contact.id, {
        role: eRole,
        name: eName.trim(),
        phone: ePhone.trim() || null,
        email: eEmail.trim() || null,
        relation: eRelation.trim() || null,
        notes: eNotes.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitCreate = () => {
    if (!cCustomerId) {
      showBanner({ ok: false, msg: "請選擇所屬客戶" });
      return;
    }
    if (!cName.trim()) {
      showBanner({ ok: false, msg: "姓名必填" });
      return;
    }
    const input: CustomerContactInput = {
      customer_id: cCustomerId,
      role: cRole,
      name: cName.trim(),
      phone: cPhone.trim() || null,
      email: cEmail.trim() || null,
      relation: cRelation.trim() || null,
      notes: cNotes.trim() || null,
    };
    startTransition(async () => {
      const res = await createCustomerContactResultAction(input);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增 ${input.name}` });
        router.push(`/admin/master-data/customer-contacts/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = () => {
    if (!contact) return;
    if (!confirm(`刪除聯絡人「${contact.name}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deleteCustomerContactAction(contact.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push("/admin/master-data/customer-contacts");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const toggleActive = () => {
    if (!contact) return;
    startTransition(async () => {
      const res = await setCustomerContactActiveAction(
        contact.id,
        !contact.is_active,
      );
      if (res.ok) {
        showBanner({ ok: true, msg: contact.is_active ? "✓ 已停用" : "✓ 已啟用" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const taClass =
    "border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const breadcrumbCode =
    mode === "create" ? "新增聯絡人" : contact?.name ?? "—";
  const customerOfContact = contact
    ? customerById.get(contact.customer_id)
    : undefined;

  const renderPills = () => {
    if (mode === "edit" && contact) {
      return (
        <>
          <button
            type="button"
            onClick={() => setMode("view")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitEdit}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存變更"}
          </button>
        </>
      );
    }
    if (mode === "create") {
      return (
        <>
          <button
            type="button"
            onClick={() => router.push("/admin/master-data/customer-contacts")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitCreate}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
          >
            {isPending ? "建立中⋯" : "建立並開啟"}
          </button>
        </>
      );
    }
    return (
      <>
        <Link
          href="/admin/master-data/customer-contacts"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
        {canEdit && (
          <Link
            href="/admin/master-data/customer-contacts/new"
            className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
          >
            新增
          </Link>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={enterEditMode}
            disabled={isPending || !contact}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
          >
            修改
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={removeRow}
            disabled={isPending || !contact}
            className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
          >
            刪除
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={toggleActive}
            disabled={isPending || !contact}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            {contact?.is_active ? "停用" : "啟用"}
          </button>
        )}
      </>
    );
  };

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/admin/master-data/customer-contacts"
            className="hover:text-[#185FA5]"
          >
            客戶聯絡人
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">{breadcrumbCode}</span>
          {mode === "edit" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
              編輯模式
            </span>
          )}
          {mode === "create" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">
              建立模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">{renderPills()}</div>
      </div>

      {/* 2. Banner */}
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

      {/* 3. Title Card */}
      {mode === "create" ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="text-[11px] tracking-wider text-[#9A9890]">
            客戶聯絡人
          </div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight mt-1">
            （未命名聯絡人）
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]">
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              尚未建立
            </span>
            <span className="text-[#9A9890]">
              新增客戶聯絡人（須指定所屬客戶與姓名）
            </span>
          </div>
        </header>
      ) : contact ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">
              客戶聯絡人
            </div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {contact.name}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${
                  ROLE_CHIP[contact.role] ?? ROLE_CHIP.other
                }`}
              >
                {ROLE_LABEL[contact.role] ?? contact.role}
              </span>
              {customerOfContact ? (
                <span className="inline-flex items-center gap-1 text-[#5A5955]">
                  <span className="font-mono text-[11.5px] text-[#6B778C]">
                    {customerOfContact.code}
                  </span>
                  {customerOfContact.name}
                </span>
              ) : (
                <span className="text-[#BF2600]">客戶不存在</span>
              )}
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                  contact.is_active
                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                    : "bg-[#F2F2F2] text-[#6B6A68]"
                }`}
              >
                {contact.is_active ? "啟用" : "停用"}
              </span>
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[13px] text-[#CC0000]">
          找不到此聯絡人（id 不存在或已被刪除）
        </header>
      )}

      {/* 4. Sections */}
      {mode === "create" ? (
        <SectionCard title="▼ 基本資料">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>所屬客戶 *</label>
              <select
                className={inputClass}
                value={cCustomerId}
                onChange={(e) => setCCustomerId(e.target.value)}
              >
                <option value="">— 請選擇 —</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} ｜ {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>角色 *</label>
              <select
                className={inputClass}
                value={cRole}
                onChange={(e) =>
                  setCRole(e.target.value as CustomerContactRole)
                }
              >
                {ROLE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>姓名 *</label>
              <input
                className={inputClass}
                value={cName}
                onChange={(e) => setCName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>電話</label>
              <input
                className={`${inputClass} font-mono`}
                value={cPhone}
                onChange={(e) => setCPhone(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>Email</label>
              <input
                className={inputClass}
                value={cEmail}
                onChange={(e) => setCEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>關係</label>
              <input
                className={inputClass}
                placeholder="例：配偶、父子"
                value={cRelation}
                onChange={(e) => setCRelation(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-3">
              <label className={labelClass}>備註</label>
              <textarea
                className={`${taClass} w-full`}
                rows={2}
                value={cNotes}
                onChange={(e) => setCNotes(e.target.value)}
              />
            </div>
          </div>
          <div className="text-[12px] text-[#9A9890] px-1 py-2 mt-2">
            建立後將跳轉到該聯絡人的詳情頁，可進一步維護⋯
          </div>
        </SectionCard>
      ) : contact ? (
        <>
          <SectionCard title="▼ 基本資料">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="所屬客戶"
                value={
                  customerOfContact ? (
                    <span>
                      <span className="font-mono text-[11.5px] text-[#6B778C]">
                        {customerOfContact.code}
                      </span>{" "}
                      {customerOfContact.name}
                    </span>
                  ) : (
                    <span className="text-[#BF2600]">客戶不存在</span>
                  )
                }
              />
              <Kv
                label="角色"
                value={
                  mode === "edit" ? (
                    <select
                      className={`${inputClass} w-full`}
                      value={eRole}
                      onChange={(e) =>
                        setERole(e.target.value as CustomerContactRole)
                      }
                    >
                      {ROLE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    ROLE_LABEL[contact.role] ?? contact.role
                  )
                }
              />
              <Kv
                label="姓名"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} w-full`}
                      value={eName}
                      onChange={(e) => setEName(e.target.value)}
                    />
                  ) : (
                    contact.name
                  )
                }
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ 聯絡方式">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="電話"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} font-mono w-full`}
                      value={ePhone}
                      onChange={(e) => setEPhone(e.target.value)}
                    />
                  ) : contact.phone ? (
                    <span className="font-mono">{contact.phone}</span>
                  ) : (
                    "—"
                  )
                }
              />
              <Kv
                label="Email"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} w-full`}
                      value={eEmail}
                      onChange={(e) => setEEmail(e.target.value)}
                    />
                  ) : (
                    contact.email ?? "—"
                  )
                }
              />
              <Kv
                label="關係"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} w-full`}
                      placeholder="例：配偶、父子"
                      value={eRelation}
                      onChange={(e) => setERelation(e.target.value)}
                    />
                  ) : (
                    contact.relation ?? "—"
                  )
                }
              />
              <Kv
                label="備註"
                full
                value={
                  mode === "edit" ? (
                    <textarea
                      className={`${taClass} w-full`}
                      rows={2}
                      value={eNotes}
                      onChange={(e) => setENotes(e.target.value)}
                    />
                  ) : (
                    contact.notes ?? "—"
                  )
                }
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ 進階（系統欄位）">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="狀態"
                value={contact.is_active ? "啟用" : "停用"}
                small
              />
              <Kv label="contact id" value={contact.id} mono small />
              <Kv
                label="建立時間"
                value={fmtTs(contact.created_at)}
                small
              />
            </div>
          </SectionCard>
        </>
      ) : null}
    </main>
  );
}

// 以手動 +8 格式化（避免 toLocaleString 無固定 tz 造成 hydration mismatch）
function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const t = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(
    t.getUTCDate(),
  )} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">{title}</span>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function Kv({
  label,
  value,
  mono,
  small,
  full,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
  full?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${full ? "md:col-span-3" : ""}`}>
      <label className="text-[11px] text-[#9A9890]">{label}</label>
      <div
        className={`${mono ? "font-mono" : ""} ${
          small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
