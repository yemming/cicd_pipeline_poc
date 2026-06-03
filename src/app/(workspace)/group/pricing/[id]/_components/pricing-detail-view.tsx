"use client";

/**
 * GRP14 定價折扣設定 — Page View（view / edit / create 三 mode）
 *
 * Design Pattern §Page View：Breadcrumb + CRUD pill bar / Title card / 區段卡片 KV grid /
 *   audit log section / banner。狀態機（draft → review → active；review → draft）以 CRUD pill
 *   呈現（取代標準「停用啟用」位置）：draft 顯送審、review 顯核准生效＋退回修改。
 *
 * 寫入走 @/lib/group/pricing-policy-actions（Result 型別、不 redirect），client 自控導航 + banner。
 * 天條：不直連 supabase，資料由 server page 經 @/domain/group-pricing 注入。
 */

import Link from "next/link";
import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  createPricingPolicyAction,
  updatePricingPolicyAction,
  submitPricingForReviewAction,
  approvePricingPolicyAction,
  rejectPricingPolicyAction,
  deletePricingPolicyAction,
  type PricingPolicyInput,
} from "@/lib/group/pricing-policy-actions";
import type { PricingPolicy, PricingKind, PricingStatus } from "@/domain/group-pricing";
import type { ServicePackage } from "@/domain/service-packages";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

const KIND_LABEL: Record<PricingKind, string> = { vehicle: "整車", parts: "零件", accessory: "精品" };
const KIND_ICON: Record<PricingKind, string> = { vehicle: "🏍 整車", parts: "🔧 零件", accessory: "✨ 精品" };
const STATUS_META: Record<PricingStatus, { label: string; cls: string }> = {
  active: { label: "生效中", cls: "bg-[#EAF3DE] text-[#3B6D11]" },
  review: { label: "審核中", cls: "bg-[#FDF3E3] text-[#854F0B]" },
  draft: { label: "草稿", cls: "bg-[#F2F2F2] text-[#6B6A68]" },
};

const fmtInt = (n: number | null | undefined): string =>
  n == null || Number.isNaN(n) ? "—" : "NT$" + String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const fmtPct = (rate: number | null | undefined, d = 1): string =>
  rate == null || Number.isNaN(rate) ? "—" : `${(rate * 100).toFixed(d)}%`;

export type PricingDetailViewProps = {
  policy: PricingPolicy | null;
  initialMode: Mode;
  /** G4：本 brand 全部服務套餐（含停用），給「下游服務套餐」多選用。 */
  servicePackages: ServicePackage[];
};

export function PricingDetailView({ policy, initialMode, servicePackages }: PricingDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);

  // 表單 state（edit 與 create 共用一組；進 edit 時用 policy 重灌）
  const [kind, setKind] = useState<PricingKind>(policy?.kind ?? "parts");
  const [name, setName] = useState(policy?.name ?? "");
  const [code, setCode] = useState(policy?.code ?? "");
  const [series, setSeries] = useState(policy?.series ?? "");
  const [msrp, setMsrp] = useState<string>(policy?.msrp != null ? String(policy.msrp) : "");
  const [cost, setCost] = useState<string>(policy?.cost != null ? String(policy.cost) : "");
  const [discMin, setDiscMin] = useState<string>(policy?.discMin != null ? String(policy.discMin) : "");
  const [discMax, setDiscMax] = useState<string>(policy?.discMax != null ? String(policy.discMax) : "");
  const [effDate, setEffDate] = useState(policy?.effectiveDate ?? "2026-06-01");
  const [targetCodes, setTargetCodes] = useState<string[]>(policy?.targetPackageCodes ?? []);

  const msrpN = msrp ? Number(msrp) : null;
  const costN = cost ? Number(cost) : null;
  const minN = discMin ? Number(discMin) : null;
  const maxN = discMax ? Number(discMax) : null;
  const margin = msrpN != null && msrpN > 0 && costN != null ? ((msrpN - costN) / msrpN) * 100 : null;
  const minPriceLive = msrpN != null && minN != null ? Math.round((msrpN * minN) / 100) : null;
  const discErr = minN != null && maxN != null && minN > maxN ? "折扣下限不得高於上限" : null;

  const enterEditMode = () => {
    if (policy) {
      setKind(policy.kind);
      setName(policy.name);
      setCode(policy.code ?? "");
      setSeries(policy.series ?? "");
      setMsrp(policy.msrp != null ? String(policy.msrp) : "");
      setCost(policy.cost != null ? String(policy.cost) : "");
      setDiscMin(policy.discMin != null ? String(policy.discMin) : "");
      setDiscMax(policy.discMax != null ? String(policy.discMax) : "");
      setEffDate(policy.effectiveDate ?? "2026-06-01");
      setTargetCodes(policy.targetPackageCodes ?? []);
    }
    setMode("edit");
  };

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const buildInput = (): PricingPolicyInput => ({
    kind,
    name: name.trim(),
    code: kind === "vehicle" ? null : code.trim() || null,
    series: kind === "vehicle" ? series.trim() || null : null,
    msrp: msrpN,
    cost: costN,
    disc_min: minN,
    disc_max: maxN,
    effective_date: effDate || null,
    target_package_codes: targetCodes,
  });

  const submitEdit = () => {
    if (!policy) return;
    if (!name.trim()) return showBanner({ ok: false, msg: "品項名稱必填" });
    if (discErr) return showBanner({ ok: false, msg: discErr });
    startTransition(async () => {
      const res = await updatePricingPolicyAction(policy.id, buildInput());
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
    if (!name.trim()) return showBanner({ ok: false, msg: "品項名稱必填" });
    if (msrpN == null || msrpN <= 0) return showBanner({ ok: false, msg: "建議售價必填且須 > 0" });
    if (discErr) return showBanner({ ok: false, msg: discErr });
    startTransition(async () => {
      const res = await createPricingPolicyAction(buildInput());
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立定價項目" });
        router.push(`/group/pricing/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const runStatus = (action: "review" | "approve" | "reject") => {
    if (!policy) return;
    startTransition(async () => {
      const res =
        action === "review"
          ? await submitPricingForReviewAction(policy.id)
          : action === "approve"
            ? await approvePricingPolicyAction(policy.id)
            : await rejectPricingPolicyAction(policy.id);
      if (res.ok) {
        const synced = res.data.syncedCount ?? 0;
        const approveMsg =
          synced > 0 ? `✓ 已核准生效，已同步 ${synced} 個服務套餐定價` : "✓ 已核准生效";
        showBanner({
          ok: true,
          msg: action === "review" ? "✓ 已送審" : action === "approve" ? approveMsg : "✓ 已退回草稿",
        });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = () => {
    if (!policy) return;
    if (!confirm(`刪除定價項目「${policy.name}」？此動作無法復原。`)) return;
    startTransition(async () => {
      const res = await deletePricingPolicyAction(policy.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push("/group/pricing");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const inputClass =
    "h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] focus:outline-none";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const breadcrumbCode = mode === "create" ? "新增定價" : policy?.code ?? policy?.series ?? policy?.name ?? "—";
  const status = policy?.status ?? "draft";

  /* ── CRUD pill bar ── */
  const renderPills = () => {
    if (mode === "edit" && policy) {
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
            disabled={isPending || !!discErr}
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
            onClick={() => router.push("/group/pricing")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={submitCreate}
            disabled={isPending || !!discErr}
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
          href="/group/pricing"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
        <Link
          href="/group/pricing/new"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
        >
          新增
        </Link>
        <button
          type="button"
          onClick={enterEditMode}
          disabled={isPending || !policy}
          className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
        >
          修改
        </button>
        {/* 狀態機 pill（取代標準「停用啟用」位置） */}
        {policy && status === "draft" && (
          <button
            type="button"
            onClick={() => runStatus("review")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-white border border-[#5DCAA5] text-[#0F6E56] hover:bg-[#E1F5EE] shadow-sm disabled:opacity-50"
          >
            送審
          </button>
        )}
        {policy && status === "review" && (
          <>
            <button
              type="button"
              onClick={() => runStatus("approve")}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-white border border-[#5DCAA5] text-[#0F6E56] hover:bg-[#E1F5EE] shadow-sm disabled:opacity-50"
            >
              核准生效
            </button>
            <button
              type="button"
              onClick={() => runStatus("reject")}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#F0C97E] text-[#854F0B] hover:bg-[#FDF3E3] shadow-sm disabled:opacity-50"
            >
              退回修改
            </button>
          </>
        )}
        <button
          type="button"
          onClick={removeRow}
          disabled={isPending || !policy}
          className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
        >
          刪除
        </button>
      </>
    );
  };

  /* ── 表單欄位（edit / create 共用） ── */
  const formFields = (
    <>
      <SectionCard title="▼ 品項資料">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1 md:col-span-2">
            <label className={labelClass}>品項名稱 *</label>
            <input
              className={`${inputClass} w-full`}
              placeholder="例：FTR 1200 S / 原廠機油濾心"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>品項類別</label>
            <select
              className={`${inputClass} w-full`}
              value={kind}
              onChange={(e) => setKind(e.target.value as PricingKind)}
            >
              <option value="vehicle">🏍 整車</option>
              <option value="parts">🔧 零件</option>
              <option value="accessory">✨ 精品</option>
            </select>
          </div>
          {kind === "vehicle" ? (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>車系</label>
              <input
                className={`${inputClass} w-full`}
                placeholder="例：FTR"
                value={series}
                onChange={(e) => setSeries(e.target.value)}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              <label className={labelClass}>品號</label>
              <input
                className={`${inputClass} w-full font-mono`}
                placeholder="例：IM-OIL-FLT-009"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
          )}
        </div>
      </SectionCard>

      <SectionCard title="▼ 定價設定">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>建議售價（NT$）*</label>
            <input
              type="number"
              className={`${inputClass} w-full`}
              placeholder="例：689000"
              value={msrp}
              onChange={(e) => setMsrp(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>成本（NT$）</label>
            <input
              type="number"
              className={`${inputClass} w-full`}
              placeholder="例：480000"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>標準毛利率</label>
            <div
              className="h-[30px] flex items-center text-[12.5px] font-semibold"
              style={{ color: margin == null ? "#9A9890" : margin >= 30 ? "#0F6E56" : margin >= 20 ? "#854F0B" : "#CC0000" }}
            >
              {margin == null ? "— 請輸入售價與成本" : `${margin.toFixed(1)}%`}
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="▼ 折扣授權範圍">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>折扣下限（門店不得低於）*</label>
            <input
              type="number"
              min={50}
              max={100}
              className={`${inputClass} w-full text-center font-bold`}
              placeholder="例：93"
              value={discMin}
              onChange={(e) => setDiscMin(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>折扣上限（定價基準）*</label>
            <input
              type="number"
              min={50}
              max={100}
              className={`${inputClass} w-full text-center font-bold`}
              placeholder="例：100"
              value={discMax}
              onChange={(e) => setDiscMax(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelClass}>最低售價（自動）</label>
            <div className="h-[30px] flex items-center text-[12.5px] font-semibold text-[#CC0000]">
              {minPriceLive != null ? fmtInt(minPriceLive) : "—"}
            </div>
          </div>
        </div>
        {discErr ? (
          <div className="text-[11px] text-[#CC0000] mt-2">❌ {discErr}</div>
        ) : minN != null && maxN != null ? (
          <div className="text-[11px] text-[#0F6E56] mt-2">✅ 授權範圍：{minN}折 ～ {maxN}折</div>
        ) : null}
        <div className="text-[11px] text-[#9A9890] mt-1.5">
          ⚠️ 門店實際成交均價低於下限時，系統自動標示越界警示供集團監看。
        </div>
      </SectionCard>

      <SectionCard title="▼ 適用範圍">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1">
            <label className={labelClass}>生效日期</label>
            <input
              type="date"
              className={`${inputClass} w-full`}
              value={effDate}
              onChange={(e) => setEffDate(e.target.value)}
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard title="▼ 下游服務套餐（核准後同步定價）">
        <div className="text-[11px] text-[#9A9890] mb-2">
          勾選的服務套餐將在本政策<b>核准生效</b>時，把建議售價同步成上方 MSRP（04B 快速報價 / 07B
          套餐費率即時反映）。未勾選則不影響任何套餐。
        </div>
        {servicePackages.length === 0 ? (
          <div className="text-[12px] text-[#9A9890] border border-dashed border-[#D5D3CB] rounded px-3 py-3 text-center">
            本品牌尚無服務套餐可綁定
          </div>
        ) : (
          <div className="bg-white border border-[#EEECE6] rounded-lg divide-y divide-[#F4F3F0]">
            {servicePackages.map((p) => {
              const checked = targetCodes.includes(p.code);
              return (
                <label
                  key={p.id}
                  className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-[#FAFAF8]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      setTargetCodes((prev) =>
                        e.target.checked ? [...prev, p.code] : prev.filter((c) => c !== p.code),
                      )
                    }
                    className="w-3.5 h-3.5 accent-[#1A3A5C]"
                  />
                  <span className="font-mono text-[11.5px] text-[#1A3A5C] font-semibold min-w-[110px]">
                    {p.code}
                  </span>
                  <span className="text-[12.5px] text-[#2C2C2A] flex-1 min-w-0 truncate">{p.name}</span>
                  <span className="text-[11.5px] text-[#9A9890] font-mono whitespace-nowrap">
                    現價 {fmtInt(p.listPrice)}
                  </span>
                  {!p.isActive && (
                    <span className="text-[10.5px] px-1.5 py-0.5 rounded-md bg-[#F2F2F2] text-[#6B6A68] whitespace-nowrap">
                      停用
                    </span>
                  )}
                </label>
              );
            })}
          </div>
        )}
        {targetCodes.length > 0 && (
          <div className="text-[11px] text-[#0F6E56] mt-2">
            ✅ 已選 {targetCodes.length} 個套餐，核准生效時將同步定價。
          </div>
        )}
      </SectionCard>
    </>
  );

  return (
    <main className={`px-6 py-5 space-y-3 ${lockedClass}`}>
      {/* 1. Breadcrumb + CRUD Pill Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/group/pricing" className="hover:text-[#185FA5]">
            定價折扣設定
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{breadcrumbCode}</span>
          {mode === "edit" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">編輯模式</span>
          )}
          {mode === "create" && (
            <span className="px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B]">建立模式</span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5 flex-wrap">{renderPills()}</div>
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
          <div className="text-[11px] tracking-wider text-[#9A9890]">定價政策</div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight mt-1">（未命名定價）</h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]">
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">尚未建立</span>
            <span className="text-[#9A9890]">新增定價項目（建立後為草稿，可送審 → 核准生效）</span>
          </div>
        </header>
      ) : policy ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">定價政策</div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">{policy.name}</h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              {policy.code && <span className="font-mono text-[#5A5955]">{policy.code}</span>}
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF4FB] text-[#185FA5]">
                {policy.kind === "vehicle" ? policy.series ?? KIND_LABEL.vehicle : KIND_LABEL[policy.kind]}
              </span>
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${STATUS_META[policy.status].cls}`}>
                {STATUS_META[policy.status].label}
              </span>
              {policy.marginRate != null && (
                <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#EAF3DE] text-[#3B6D11]">
                  毛利 {fmtPct(policy.marginRate)}
                </span>
              )}
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[13px] text-[#CC0000]">
          找不到此定價項目（id 不存在或已被刪除）
        </header>
      )}

      {/* 4. Sections */}
      {mode === "create" || mode === "edit" ? (
        formFields
      ) : policy ? (
        <>
          <SectionCard title="▼ 品項資料">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="品項名稱" value={policy.name} />
              <Kv label="品項類別" value={KIND_ICON[policy.kind]} />
              {policy.kind === "vehicle" ? (
                <Kv label="車系" value={policy.series ?? "—"} />
              ) : (
                <Kv label="品號" value={policy.code ?? "—"} mono />
              )}
            </div>
          </SectionCard>

          <SectionCard title="▼ 定價設定">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="建議售價" value={fmtInt(policy.msrp)} />
              <Kv label="成本" value={fmtInt(policy.cost)} />
              <Kv label="標準毛利率" value={fmtPct(policy.marginRate)} />
            </div>
          </SectionCard>

          <SectionCard title="▼ 折扣授權範圍">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="折扣下限" value={policy.discMin != null ? `${policy.discMin} 折` : "—"} />
              <Kv label="折扣上限" value={policy.discMax != null ? `${policy.discMax} 折` : "—"} />
              <Kv label="最低售價" value={fmtInt(policy.minPrice)} />
            </div>
          </SectionCard>

          <SectionCard title="▼ 適用範圍">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Kv label="生效日期" value={policy.effectiveDate ?? "—"} small />
              <Kv label="審核狀態" value={STATUS_META[policy.status].label} small />
            </div>
          </SectionCard>

          <SectionCard title="▼ 下游服務套餐（核准後同步定價）">
            {policy.targetPackageCodes.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] py-1">
                未綁定下游套餐（核准生效不會同步任何套餐定價）
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                <div className="text-[11px] text-[#9A9890]">
                  {policy.status === "active"
                    ? "已核准生效，下列套餐定價已同步本政策 MSRP："
                    : "核准生效後將同步下列套餐定價為本政策 MSRP："}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {policy.targetPackageCodes.map((code) => {
                    const pkg = servicePackages.find((p) => p.code === code);
                    return (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded-md text-[11px] bg-[#EAF4FB] text-[#185FA5]"
                      >
                        <span className="font-mono font-semibold">{code}</span>
                        {pkg && <span className="text-[#5A7FA5]">{pkg.name}</span>}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard title="▼ 異動稽核 Audit Log">
            {policy.auditLog.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] py-2">尚無定價異動紀錄</div>
            ) : (
              <div className="flex flex-col">
                {[...policy.auditLog].reverse().map((e, i) => {
                  const isStatus = e.field === "狀態";
                  return (
                    <div key={i} className="flex gap-3 py-2.5 border-b border-[#F5F5F5] last:border-b-0">
                      <span className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 ${isStatus ? "bg-[#1A3A5C]" : "bg-[#854F0B]"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-semibold text-[#2C2C2A]">{e.field}異動</div>
                        <div className="text-[11px] text-[#9A9890] mt-0.5">
                          {e.by}　{e.at}
                        </div>
                        {e.old || e.new ? (
                          <div className="text-[11px] mt-1">
                            {e.old && e.old !== "—" ? (
                              <span className="text-[#CC0000] line-through mr-1.5">{e.old}</span>
                            ) : null}
                            <span className="text-[#0F6E56] font-semibold">{e.new}</span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </>
      ) : null}
    </main>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
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
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <label className="text-[11px] text-[#9A9890]">{label}</label>
      <div className={`${mono ? "font-mono" : ""} ${small ? "text-[11.5px] text-[#5A5955]" : "text-[12.5px] text-[#2C2C2A]"}`}>
        {value}
      </div>
    </div>
  );
}
