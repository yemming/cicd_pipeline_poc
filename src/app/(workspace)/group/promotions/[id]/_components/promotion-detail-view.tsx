"use client";

/**
 * GRP13 促銷活動管理 — Page View（view / edit / create 三 mode）
 *
 * Design Pattern §Page View：Breadcrumb + CRUD pill bar / Title card / 區段卡片 KV grid /
 *   LINE 海報產生器 / 狀態異動紀錄 / banner。狀態機（draft→review→active/scheduled→ended→archived）
 *   以 CRUD pill 呈現：draft 顯送審、review 顯核准上架、active/scheduled 顯緊急下架，非 archived 顯封存。
 *
 * 海報產生器（html2canvas 即時產 1080px PNG）移到 detail page —— 每張活動一份海報，
 *   view mode 用既存資料預覽 + 下載，edit/create mode 即時依表單預覽。
 *
 * 寫入走 @/lib/group/promotion-actions（Result 型別、不 redirect），client 自控導航 + banner。
 * 天條：不直連 supabase，資料由 server page 經 @/domain/group-promotions 注入。
 */

import Link from "next/link";
import { useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import {
  createPromoCampaign,
  updatePromoCampaign,
  submitPromoForReview,
  approvePromo,
  takedownPromo,
  archivePromo,
  deletePromoCampaign,
  type ActionResult,
} from "@/lib/group/promotion-actions";
import {
  PROMO_TYPES,
  PROMO_STATUS_META,
  PROMO_TEMPLATES,
  FIVE_STORES,
  type PromoStatus,
} from "@/domain/group-analytics-labels";
import type { PromoCampaign } from "@/domain/group-promotions";
import { brands as brandConfigs } from "@/lib/brands/registry";
import type { BrandKey } from "@/lib/brands/types";

type Banner = { ok: boolean; msg: string } | null;
type Mode = "view" | "edit" | "create";

const STORE_OPTIONS = FIVE_STORES.map((s) => s.short);

const fmtNT = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : "NT$" + Math.round(n).toLocaleString("en-US");

function storesToForm(stores: string[]): string[] {
  if (stores.includes("全部門店")) return [...STORE_OPTIONS];
  const sel = stores.filter((s) => STORE_OPTIONS.includes(s));
  return sel.length > 0 ? sel : [...STORE_OPTIONS];
}
function formToStores(stores: string[]): string[] {
  return stores.length === STORE_OPTIONS.length ? ["全部門店"] : stores;
}

type FormState = {
  name: string;
  promo_type: string;
  start_date: string;
  end_date: string;
  disc_min: string;
  disc_max: string;
  stores: string[];
  owner: string;
  poster_title: string;
  poster_discount: string;
  poster_subtitle: string;
  poster_detail: string;
  poster_template: string;
};

function campaignToForm(c: PromoCampaign | null): FormState {
  if (!c) {
    return {
      name: "",
      promo_type: PROMO_TYPES[0],
      start_date: "",
      end_date: "",
      disc_min: "",
      disc_max: "",
      stores: [...STORE_OPTIONS],
      owner: "",
      poster_title: "",
      poster_discount: "",
      poster_subtitle: "",
      poster_detail: "",
      poster_template: "warm",
    };
  }
  return {
    name: c.name,
    promo_type: c.promo_type || PROMO_TYPES[0],
    start_date: c.start_date ?? "",
    end_date: c.end_date ?? "",
    disc_min: c.disc_min?.toString() ?? "",
    disc_max: c.disc_max?.toString() ?? "",
    stores: storesToForm(c.stores),
    owner: c.owner ?? "",
    poster_title: c.poster.title || c.name,
    poster_discount: c.poster.discount_label,
    poster_subtitle: c.poster.subtitle,
    poster_detail: c.poster.detail_html,
    poster_template: c.poster.template || "warm",
  };
}

export type PromotionDetailViewProps = {
  campaign: PromoCampaign | null;
  initialMode: Mode;
  canEdit: boolean;
  brandId: string;
};

export function PromotionDetailView({ campaign, initialMode, canEdit, brandId }: PromotionDetailViewProps) {
  const router = useRouter();
  const brandDisplayName = brandConfigs[brandId as BrandKey]?.displayName ?? brandId;
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);
  const [form, setForm] = useState<FormState>(() => campaignToForm(campaign));
  const [pngBusy, setPngBusy] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const editingForm = mode === "edit" || mode === "create";

  const discMinN = form.disc_min ? Number(form.disc_min) : null;
  const discMaxN = form.disc_max ? Number(form.disc_max) : null;
  const discErr =
    discMinN != null && discMaxN != null && discMinN > discMaxN ? "折扣下限不得高於上限" : null;

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  const enterEditMode = () => {
    setForm(campaignToForm(campaign));
    setMode("edit");
    setBanner(null);
  };

  const buildPayload = () => ({
    brand_id: brandId,
    name: form.name.trim(),
    promo_type: form.promo_type,
    start_date: form.start_date || null,
    end_date: form.end_date || null,
    disc_min: form.disc_min ? Number(form.disc_min) : null,
    disc_max: form.disc_max ? Number(form.disc_max) : null,
    stores: formToStores(form.stores),
    owner: form.owner || null,
    poster: {
      title: form.poster_title || form.name.trim(),
      discount_label: form.poster_discount,
      subtitle: form.poster_subtitle,
      detail_html: form.poster_detail,
      template: form.poster_template,
    },
  });

  const submitEdit = () => {
    if (!campaign) return;
    if (!form.name.trim()) return showBanner({ ok: false, msg: "請填寫活動名稱" });
    if (discErr) return showBanner({ ok: false, msg: discErr });
    startTransition(async () => {
      const res = await updatePromoCampaign(campaign.id, buildPayload());
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已更新活動" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitCreate = () => {
    if (!form.name.trim()) return showBanner({ ok: false, msg: "請填寫活動名稱" });
    if (discErr) return showBanner({ ok: false, msg: discErr });
    startTransition(async () => {
      const res = await createPromoCampaign(buildPayload());
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已建立活動" });
        router.push(`/group/promotions/${res.data.id}`);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const runStatus = (fn: (id: string) => Promise<ActionResult<{ id: string }>>, label: string) => {
    if (!campaign) return;
    startTransition(async () => {
      const res = await fn(campaign.id);
      if (res.ok) {
        showBanner({ ok: true, msg: label });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeRow = () => {
    if (!campaign) return;
    if (!confirm(`確定刪除活動「${campaign.name}」？此操作無法復原。`)) return;
    startTransition(async () => {
      const res = await deletePromoCampaign(campaign.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        router.push("/group/promotions");
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  async function downloadPng() {
    if (!posterRef.current) return;
    setPngBusy(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(posterRef.current, { scale: 3, backgroundColor: null, useCORS: true });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.poster_title || form.name || "promo"}.png`;
      a.click();
      showBanner({ ok: true, msg: "✓ 海報 PNG 已下載（1080px）" });
    } catch {
      showBanner({ ok: false, msg: "海報產生失敗，請重試" });
    } finally {
      setPngBusy(false);
    }
  }

  const toggleStore = (short: string) =>
    setForm((f) => ({
      ...f,
      stores: f.stores.includes(short) ? f.stores.filter((s) => s !== short) : [...f.stores, short],
    }));

  const inputClass =
    "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] focus:outline-none disabled:bg-[#F5F5F5]";
  const labelClass = "text-[11px] text-[#9A9890] font-medium";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";

  const status: PromoStatus = campaign?.status ?? "draft";
  const statusMeta = PROMO_STATUS_META[status] ?? PROMO_STATUS_META.draft;
  const breadcrumbCode = mode === "create" ? "新增活動" : campaign?.name ?? "—";

  const tpl = PROMO_TEMPLATES[form.poster_template] ?? PROMO_TEMPLATES.warm;
  const posterStores = form.stores.length === STORE_OPTIONS.length ? "全台門店" : form.stores.join("｜");

  /* ── CRUD pill bar ── */
  const renderPills = () => {
    if (mode === "edit" && campaign) {
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
            onClick={() => router.push("/group/promotions")}
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
          href="/group/promotions"
          className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          返回列表
        </Link>
        {canEdit && (
          <Link
            href="/group/promotions/new"
            className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
          >
            新增
          </Link>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={enterEditMode}
            disabled={isPending || !campaign}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
          >
            修改
          </button>
        )}
        {/* 狀態機 pills */}
        {canEdit && campaign && status === "draft" && (
          <button
            type="button"
            onClick={() => runStatus(submitPromoForReview, "✓ 已送審")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-white border border-[#5DCAA5] text-[#0F6E56] hover:bg-[#E1F5EE] shadow-sm disabled:opacity-50"
          >
            送審
          </button>
        )}
        {canEdit && campaign && status === "review" && (
          <button
            type="button"
            onClick={() => runStatus(approvePromo, "✓ 已核准上架")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-white border border-[#5DCAA5] text-[#0F6E56] hover:bg-[#E1F5EE] shadow-sm disabled:opacity-50"
          >
            核准上架
          </button>
        )}
        {canEdit && campaign && (status === "active" || status === "scheduled") && (
          <button
            type="button"
            onClick={() => runStatus(takedownPromo, "✓ 已緊急下架")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
          >
            緊急下架
          </button>
        )}
        {canEdit && campaign && status !== "archived" && (
          <button
            type="button"
            onClick={() => runStatus(archivePromo, "✓ 已封存")}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
          >
            封存
          </button>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={removeRow}
            disabled={isPending || !campaign}
            className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
          >
            刪除
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
          <Link href="/group/promotions" className="hover:text-[#185FA5]">
            促銷活動管理
          </Link>
          <span>›</span>
          <span className="text-[#5A5955]">{breadcrumbCode}</span>
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
          <div className="text-[11px] tracking-wider text-[#9A9890]">促銷活動</div>
          <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight mt-1">（未命名活動）</h1>
          <div className="mt-1 flex items-center gap-1.5 text-[12px]">
            <span className="px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">尚未建立</span>
            <span className="text-[#9A9890]">新增促銷活動（建立後為草稿，可送審 → 核准上架）</span>
          </div>
        </header>
      ) : campaign ? (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
          <div className="flex flex-col gap-2">
            <div className="text-[11px] tracking-wider text-[#9A9890]">促銷活動</div>
            <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">{campaign.name}</h1>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${statusMeta.chip}`}>
                {statusMeta.label}
              </span>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap bg-[#FDF3E3] text-[#854F0B]">
                {campaign.promo_type}
              </span>
              <span className="text-[#9A9890]">
                📅 {campaign.start_date ?? "—"} ～ {campaign.end_date ?? "—"}
              </span>
            </div>
          </div>
        </header>
      ) : (
        <header className="bg-white border border-[#EEECE6] rounded-lg p-6 text-center text-[13px] text-[#CC0000]">
          找不到此促銷活動（id 不存在或已被刪除）
        </header>
      )}

      {/* 4. Sections */}
      {campaign || mode === "create" ? (
        <>
          {/* 基本資料 */}
          <SectionCard title="▼ 基本資料">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <div className="flex flex-col gap-1 md:col-span-3">
                <label className={labelClass}>活動名稱 *</label>
                {editingForm ? (
                  <input
                    className={inputClass}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例：2026 Q3 夏季精品節"
                  />
                ) : (
                  <div className="text-[12.5px] text-[#2C2C2A]">{campaign?.name}</div>
                )}
              </div>
              <KvField label="活動類型" editing={editingForm} display={campaign?.promo_type ?? "—"}>
                <select
                  className={inputClass}
                  value={form.promo_type}
                  onChange={(e) => setForm({ ...form, promo_type: e.target.value })}
                >
                  {PROMO_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </KvField>
              <KvField label="負責人" editing={editingForm} display={campaign?.owner ?? "—"}>
                <input
                  className={inputClass}
                  value={form.owner}
                  onChange={(e) => setForm({ ...form, owner: e.target.value })}
                  placeholder="通路管理經理姓名"
                />
              </KvField>
              <div />
              <KvField label="活動開始日" editing={editingForm} display={campaign?.start_date ?? "—"}>
                <input
                  type="date"
                  className={inputClass}
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </KvField>
              <KvField label="活動結束日" editing={editingForm} display={campaign?.end_date ?? "—"}>
                <input
                  type="date"
                  className={inputClass}
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </KvField>
            </div>
          </SectionCard>

          {/* 折扣授權範圍 */}
          <SectionCard title="▼ 折扣授權範圍">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <KvField
                label="折扣下限（門店不得低於）"
                editing={editingForm}
                display={campaign?.disc_min != null ? `${campaign.disc_min} 折` : "—"}
              >
                <input
                  type="number"
                  min={50}
                  max={100}
                  className={`${inputClass} text-center font-bold`}
                  value={form.disc_min}
                  onChange={(e) => setForm({ ...form, disc_min: e.target.value })}
                  placeholder="80"
                />
              </KvField>
              <KvField
                label="折扣上限（建議售價基準）"
                editing={editingForm}
                display={campaign?.disc_max != null ? `${campaign.disc_max} 折` : "—"}
              >
                <input
                  type="number"
                  min={50}
                  max={100}
                  className={`${inputClass} text-center font-bold`}
                  value={form.disc_max}
                  onChange={(e) => setForm({ ...form, disc_max: e.target.value })}
                  placeholder="95"
                />
              </KvField>
              {!editingForm && (
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>進行中業績貢獻</label>
                  <div className="text-[12.5px] text-[#0F6E56] font-medium">{fmtNT(campaign?.contrib_nt)}</div>
                </div>
              )}
            </div>
            {editingForm && discErr ? (
              <div className="text-[11px] text-[#CC0000] mt-2">❌ {discErr}</div>
            ) : editingForm && discMinN != null && discMaxN != null ? (
              <div className="text-[11px] text-[#0F6E56] mt-2">✅ 授權範圍：{discMinN}折 ～ {discMaxN}折</div>
            ) : null}
            <div className="text-[11px] text-[#9A9890] mt-1.5">
              ⚠️ 門店實際折扣低於下限時，系統自動標示越界警示供集團監看。
            </div>
          </SectionCard>

          {/* 適用門店 */}
          <SectionCard title="▼ 適用門店">
            {editingForm ? (
              <>
                <label className="flex items-center gap-2 mb-2 text-[12px] cursor-pointer">
                  <input
                    type="checkbox"
                    className="w-4 h-4 accent-[#0F6E56]"
                    checked={form.stores.length === STORE_OPTIONS.length}
                    onChange={(e) => setForm({ ...form, stores: e.target.checked ? [...STORE_OPTIONS] : [] })}
                  />
                  <span className="font-semibold">全部門店</span>
                </label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {STORE_OPTIONS.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 px-3 py-1.5 border border-[#EEECE6] rounded cursor-pointer hover:bg-[#F8F7F4] text-[12.5px]"
                    >
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-[#0F6E56]"
                        checked={form.stores.includes(s)}
                        onChange={() => toggleStore(s)}
                      />
                      <span className="font-medium">🏢 {s}</span>
                    </label>
                  ))}
                </div>
              </>
            ) : campaign && campaign.stores.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {campaign.stores.map((s) => (
                  <span key={s} className="inline-flex items-center px-2 py-0.5 rounded-md bg-[#EAF4FB] text-[#185FA5] text-[11.5px]">
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-[#9A9890]">未指定適用門店</div>
            )}
          </SectionCard>

          {/* 活動文案 + LINE 海報 */}
          <SectionCard title="▼ 活動文案 × LINE 海報">
            {editingForm && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mb-4">
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className={labelClass}>活動標題（海報大標）*</label>
                  <input
                    className={inputClass}
                    value={form.poster_title}
                    onChange={(e) => setForm({ ...form, poster_title: e.target.value })}
                    placeholder="例：夏日騎乘精品節"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>折扣標語（海報顯示）</label>
                  <input
                    className={inputClass}
                    value={form.poster_discount}
                    onChange={(e) => setForm({ ...form, poster_discount: e.target.value })}
                    placeholder="例：全館85折起"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className={labelClass}>活動副標 / 說明</label>
                  <input
                    className={inputClass}
                    value={form.poster_subtitle}
                    onChange={(e) => setForm({ ...form, poster_subtitle: e.target.value })}
                    placeholder="例：指定精品最低85折"
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className={labelClass}>活動詳細說明</label>
                  <textarea
                    className={`${inputClass} h-auto min-h-[70px] py-2 resize-y`}
                    value={form.poster_detail}
                    onChange={(e) => setForm({ ...form, poster_detail: e.target.value })}
                    placeholder="活動詳細說明、注意事項、條款備註…"
                  />
                </div>
                <div className="flex flex-col gap-1 md:col-span-2">
                  <label className={labelClass}>海報模板</label>
                  <div className="flex gap-2">
                    {Object.entries(PROMO_TEMPLATES).map(([key, t]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setForm({ ...form, poster_template: key })}
                        className={`px-3 py-1.5 rounded-lg text-[12px] font-medium border-2 transition-colors ${
                          form.poster_template === key
                            ? "border-[#854F0B] bg-[#FDF3E3] text-[#854F0B]"
                            : "border-[#EEECE6] text-[#9A9890] hover:border-[#F0C97E]"
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="text-[12px] text-[#9A9890] mb-2">
              下載尺寸符合 LINE 推送規格（1:1 / 1080×1080px）
            </div>
            <div className="flex gap-5 items-start flex-wrap">
              {/* poster canvas */}
              <div
                ref={posterRef}
                className="w-[300px] h-[300px] shrink-0 rounded-xl overflow-hidden relative flex flex-col items-center justify-center text-center px-6"
                style={{ background: tpl.gradient, color: tpl.fg }}
              >
                <div className="absolute top-3 right-3 text-[20px] opacity-60">🏍</div>
                <div className="text-[10px] tracking-[0.2em] uppercase mb-2" style={{ color: tpl.sub }}>
                  {brandDisplayName}
                </div>
                <div className="text-[19px] font-bold leading-snug mb-1">{form.poster_title || form.name || "活動名稱"}</div>
                <div className="text-[34px] font-bold leading-none my-1.5">{form.poster_discount || "限時優惠"}</div>
                {form.poster_subtitle && (
                  <div className="text-[12px] mt-0.5" style={{ color: tpl.sub }}>
                    {form.poster_subtitle}
                  </div>
                )}
                <div className="text-[11px] mt-2.5 pt-2.5 border-t w-full" style={{ color: tpl.sub, borderColor: "rgba(255,255,255,.3)" }}>
                  {(form.start_date || "—").replaceAll("-", ".")} — {(form.end_date || "—").replaceAll("-", ".")}
                </div>
                <div className="text-[10px] mt-1" style={{ color: tpl.sub }}>
                  {posterStores}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={downloadPng}
                  disabled={pngBusy}
                  className="w-[170px] px-4 py-2 rounded-md text-[12px] font-medium bg-[#854F0B] text-white hover:bg-[#9D5E0D] disabled:opacity-60"
                >
                  {pngBusy ? "產生中⋯" : "⬇ 下載 PNG（1080px）"}
                </button>
                <button
                  type="button"
                  onClick={() => showBanner({ ok: true, msg: "LINE 推送功能開發中（將接 Notification Hub）" })}
                  className="w-[170px] px-4 py-2 rounded-md text-[12px] font-medium bg-[#06C755] text-white hover:bg-[#05a948] disabled:opacity-60"
                >
                  📲 推送至 LINE
                </button>
                <div className="text-[11px] text-[#9A9890] mt-1 leading-relaxed">
                  ※ PNG 由 html2canvas 即時產出；LINE 推送將接 Notification Hub。
                </div>
              </div>
            </div>
          </SectionCard>

          {/* 狀態異動紀錄 */}
          {mode !== "create" && campaign && campaign.audit_log.length > 0 && (
            <SectionCard title="▼ 狀態異動紀錄">
              <div className="flex flex-col">
                {[...campaign.audit_log].reverse().map((l, i) => (
                  <div key={i} className="flex gap-3 py-2.5 border-b border-[#F5F5F5] last:border-b-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#854F0B] mt-1 shrink-0" />
                    <div>
                      <div className="text-[12px] font-semibold text-[#2C2C2A]">{AUDIT_LABELS[l.action] ?? l.action}</div>
                      <div className="text-[11px] text-[#9A9890]">
                        {l.by || "系統"}　{fmtTs(l.at)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {mode === "create" && (
            <div className="text-[12px] text-[#9A9890] px-1 py-2">
              建立後將跳轉到該活動的詳情頁，可進一步維護、送審、產海報⋯
            </div>
          )}
        </>
      ) : null}
    </main>
  );
}

const AUDIT_LABELS: Record<string, string> = {
  created: "📝 草稿建立",
  updated: "✏️ 內容更新",
  submitted_for_review: "🔍 送出審核",
  approved: "✅ 核准上架",
  ended: "🚨 緊急下架",
  archived: "📦 已封存",
};

function fmtTs(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
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

/** KV 欄位：view mode 顯示純文字，edit/create mode 顯示 children（input/select）。 */
function KvField({
  label,
  editing,
  display,
  children,
}: {
  label: string;
  editing: boolean;
  display: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {editing ? children : <div className="text-[12.5px] text-[#2C2C2A]">{display}</div>}
    </div>
  );
}
