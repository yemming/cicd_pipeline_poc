"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { updateItemLeadTimeDetail } from "@/lib/master-data/item-lead-time-actions";
import { createItemAction } from "@/lib/parts-setup/item-actions";
import type {
  ItemLeadTimeDetail,
  SupplierLeadTimeOption,
} from "@/domain/items";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

const CONTROL_CHIP: Record<string, string> = {
  A: "bg-[#FDECEA] text-[#CC0000]",
  B: "bg-[#FDF3E3] text-[#854F0B]",
  C: "bg-[#E8F5F0] text-[#0F6E56]",
  D: "bg-[#EAF4FB] text-[#185FA5]",
};

export type ItemLeadTimeDetailViewProps = {
  item: ItemLeadTimeDetail | null;
  suppliers: SupplierLeadTimeOption[];
  canEdit: boolean;
  initialMode: Mode;
};

const LIST_HREF = "/admin/master-data/item-lead-times";

export function ItemLeadTimeDetailView({
  item,
  suppliers,
  canEdit,
  initialMode,
}: ItemLeadTimeDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  // Edit form state（只編輯 MRP 子集：前置時間 + 預設供應商）
  const [eLeadTime, setELeadTime] = useState(
    item?.default_lead_time_days === null || item?.default_lead_time_days === undefined
      ? ""
      : String(item.default_lead_time_days),
  );
  const [eSupplier, setESupplier] = useState(item?.default_supplier_id ?? "");

  // Create form state（建立新料號的最小欄位 + MRP 設定）
  const [cCode, setCCode] = useState("");
  const [cName, setCName] = useState("");
  const [cCategory, setCCategory] = useState("");
  const [cControl, setCControl] = useState("C");
  const [cUom, setCUom] = useState("個");
  const [cLeadTime, setCLeadTime] = useState("");
  const [cSupplier, setCSupplier] = useState("");

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const enterEditMode = () => {
    if (item) {
      setELeadTime(
        item.default_lead_time_days === null
          ? ""
          : String(item.default_lead_time_days),
      );
      setESupplier(item.default_supplier_id ?? "");
    }
    setMode("edit");
  };

  const parseLeadTime = (raw: string): { ok: true; value: number | null } | { ok: false } => {
    const t = raw.trim();
    if (!t) return { ok: true, value: null };
    const n = parseInt(t, 10);
    if (!Number.isFinite(n) || n < 0 || String(n) !== t) return { ok: false };
    return { ok: true, value: n };
  };

  const submitEdit = () => {
    if (!item) return;
    const lt = parseLeadTime(eLeadTime);
    if (!lt.ok) {
      showBanner({ ok: false, msg: "前置時間必須為 0 或正整數" });
      return;
    }
    startTransition(async () => {
      const res = await updateItemLeadTimeDetail(item.id, {
        default_lead_time_days: lt.value,
        default_supplier_id: eSupplier || null,
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
    if (!cCode.trim()) {
      showBanner({ ok: false, msg: "料號代碼必填" });
      return;
    }
    if (!cName.trim()) {
      showBanner({ ok: false, msg: "品名必填" });
      return;
    }
    const lt = parseLeadTime(cLeadTime);
    if (!lt.ok) {
      showBanner({ ok: false, msg: "前置時間必須為 0 或正整數" });
      return;
    }
    startTransition(async () => {
      const res = await createItemAction({
        code: cCode.trim(),
        name: cName.trim(),
        category: cCategory.trim() || undefined,
        control_type: cControl,
        base_uom: cUom.trim() || "個",
        default_supplier_id: cSupplier || null,
        default_lead_time_days: lt.value,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已新增 ${cCode.trim()}` });
        router.push(`${LIST_HREF}/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const breadcrumbCode = mode === "create" ? "新增料號" : item?.code ?? "—";

  const renderPills = () => {
    if (mode === "edit" && item) {
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
            onClick={() => router.push(LIST_HREF)}
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
          href={LIST_HREF}
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
        {canEdit && (
          <Link
            href={`${LIST_HREF}/new`}
            className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
          >
            新增
          </Link>
        )}
        <button
          type="button"
          onClick={enterEditMode}
          disabled={isPending || !item || !canEdit}
          className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
        >
          修改
        </button>
        {item && (
          <Link
            href={`/parts/setup/items/${item.id}`}
            className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
            title="到完整商品主檔維護其他欄位"
          >
            完整商品主檔
          </Link>
        )}
      </>
    );
  };

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={LIST_HREF} className="hover:text-[#185FA5]">
            料號預設前置時間
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{breadcrumbCode}</span>
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
            料號 / MRP 前置時間
          </div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight mt-1">
            （未命名料號）
          </h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]">
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
              尚未建立
            </span>
            <span className="text-[#9A9890]">
              建立新料號並設定 MRP 預設前置時間與供應商
            </span>
          </div>
        </header>
      ) : item ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">
              料號 / MRP 前置時間
            </div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
              {item.name}
            </h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className="font-mono text-[#5A5955]">{item.code}</span>
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                  CONTROL_CHIP[item.control_type] ?? "bg-[#EBF3FF] text-[#1A3A5C]"
                }`}
              >
                {item.control_type} 類
              </span>
              {item.category && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EEF4FB] text-[#185FA5]">
                  {item.category}
                </span>
              )}
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${
                  item.is_active
                    ? "bg-[#EAF3DE] text-[#3B6D11]"
                    : "bg-[#F2F2F2] text-[#6B6A68]"
                }`}
              >
                {item.is_active ? "啟用" : "停用"}
              </span>
              {item.default_lead_time_days === null ? (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
                  前置時間未設（MRP 套 7 天）
                </span>
              ) : (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
                  前置時間 {item.default_lead_time_days} 天
                </span>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[13px] text-[#CC0000]">
          找不到此料號（id 不存在或不在當前品牌）
        </header>
      )}

      {/* 4. Sections */}
      {mode === "create" ? (
        <SectionCard title="▼ 基本資料">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
            <div className="flex flex-col gap-1">
              <label className={labelClass}>料號代碼 *</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="例：PART-0001"
                value={cCode}
                onChange={(e) => setCCode(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>品名 *</label>
              <input
                className={inputClass}
                value={cName}
                onChange={(e) => setCName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>品類</label>
              <input
                className={inputClass}
                value={cCategory}
                onChange={(e) => setCCategory(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>管控等級</label>
              <select
                className={inputClass}
                value={cControl}
                onChange={(e) => setCControl(e.target.value)}
              >
                <option value="A">A</option>
                <option value="B">B</option>
                <option value="C">C</option>
                <option value="D">D</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>基本單位</label>
              <input
                className={inputClass}
                value={cUom}
                onChange={(e) => setCUom(e.target.value)}
              />
            </div>
            <div />
            <div className="flex flex-col gap-1">
              <label className={labelClass}>預設供應商</label>
              <select
                className={inputClass}
                value={cSupplier}
                onChange={(e) => setCSupplier(e.target.value)}
              >
                <option value="">（未指定）</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} ・ {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelClass}>預設前置時間（天）</label>
              <input
                className={`${inputClass} font-mono`}
                placeholder="空白＝MRP 套 7 天"
                value={cLeadTime}
                onChange={(e) => setCLeadTime(e.target.value)}
              />
            </div>
          </div>
          <div className="text-[12px] text-[#9A9890] px-1 py-2 mt-2">
            建立後將跳轉到該料號的詳情頁，可進一步維護⋯（其他欄位請到完整商品主檔）
          </div>
        </SectionCard>
      ) : item ? (
        <>
          <SectionCard title="▼ MRP 前置時間設定">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="預設前置時間（天）"
                value={
                  mode === "edit" ? (
                    <input
                      className={`${inputClass} font-mono w-full`}
                      placeholder="空白＝MRP 套 7 天"
                      value={eLeadTime}
                      onChange={(e) => setELeadTime(e.target.value)}
                    />
                  ) : item.default_lead_time_days === null ? (
                    "—（MRP 將套用 7 天預設）"
                  ) : (
                    <span className="font-mono">{item.default_lead_time_days}</span>
                  )
                }
              />
              <Kv
                label="預設供應商"
                value={
                  mode === "edit" ? (
                    <select
                      className={`${inputClass} w-full`}
                      value={eSupplier}
                      onChange={(e) => setESupplier(e.target.value)}
                    >
                      <option value="">（未指定）</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} ・ {s.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    item.default_supplier_name ?? "—"
                  )
                }
              />
              <Kv
                label="說明"
                small
                value="MRP 計算時若該料沒有 supplier_item_pricing，就吃這個 fallback 值"
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ 料號核心（唯讀・到完整商品主檔編輯）">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="料號代碼" value={<span className="font-mono">{item.code}</span>} />
              <Kv label="品名" value={item.name} />
              <Kv label="英文品名" value={item.name_en ?? "—"} small />
              <Kv label="品類" value={item.category ?? "—"} />
              <Kv label="管控等級" value={`${item.control_type} 類`} />
              <Kv label="基本單位" value={item.base_uom} />
              <Kv
                label="規格說明"
                full
                value={item.spec_description ?? "—"}
                small
              />
            </div>
          </SectionCard>

          <SectionCard title="▼ 成本 / 售價 / 保固（唯讀）">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv
                label="標準成本"
                value={item.standard_cost === null ? "—" : String(item.standard_cost)}
                mono
              />
              <Kv
                label="建議售價"
                value={item.suggested_price === null ? "—" : String(item.suggested_price)}
                mono
              />
              <Kv
                label="保固月數"
                value={item.warranty_months === null ? "—" : String(item.warranty_months)}
                mono
                small
              />
              <Kv
                label="保存月數"
                value={item.shelf_life_months === null ? "—" : String(item.shelf_life_months)}
                mono
                small
              />
              <Kv label="狀態" value={item.is_active ? "啟用" : "停用"} small />
            </div>
          </SectionCard>
        </>
      ) : null}
    </main>
  );
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
