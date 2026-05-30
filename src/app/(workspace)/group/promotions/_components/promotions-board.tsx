"use client";

import { useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
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
  PROMO_STATUS_TABS,
  PROMO_TEMPLATES,
  FIVE_STORES,
  type PromoStatus,
} from "@/domain/group-analytics-labels";
import type {
  PromoCampaign,
  PromoStoreExec,
  PromoEffect,
  PromoOverview,
} from "@/domain/group-promotions";

const STORE_OPTIONS = FIVE_STORES.map((s) => s.short);

const fmtNT = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : "NT$" + Math.round(n).toLocaleString("en-US");
const fmtM = (n: number) => "NT$" + (n / 1_000_000).toFixed(2) + "M";

type FormState = {
  id: string | null;
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

const EMPTY_FORM: FormState = {
  id: null,
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

function storesToForm(stores: string[]): string[] {
  if (stores.includes("全部門店")) return [...STORE_OPTIONS];
  return stores.filter((s) => STORE_OPTIONS.includes(s));
}
function formToStores(stores: string[]): string[] {
  return stores.length === STORE_OPTIONS.length ? ["全部門店"] : stores;
}

export function PromotionsBoard({
  campaigns,
  storeExec,
  effect,
  overview,
  canEdit,
  brandId,
}: {
  campaigns: PromoCampaign[];
  storeExec: PromoStoreExec[];
  effect: PromoEffect[];
  overview: PromoOverview;
  canEdit: boolean;
  brandId: string;
}) {
  useSetPageHeader({ title: "促銷活動管理", hideSearch: true });
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editing, setEditing] = useState<PromoCampaign | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | PromoStatus>("all");
  const [pngBusy, setPngBusy] = useState(false);
  const posterRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => (activeTab === "all" ? campaigns : campaigns.filter((c) => c.status === activeTab)),
    [campaigns, activeTab],
  );

  const tabCount = (key: "all" | PromoStatus) =>
    key === "all" ? campaigns.length : campaigns.filter((c) => c.status === key).length;

  const violations = storeExec.filter(
    (s) => s.exec_status === "越界" || s.exec_status === "待確認",
  );

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditing(null);
    setPanelOpen(true);
    setBanner(null);
  }

  function openEdit(c: PromoCampaign) {
    setForm({
      id: c.id,
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
    });
    setEditing(c);
    setPanelOpen(true);
    setBanner(null);
  }

  const discMinN = form.disc_min ? Number(form.disc_min) : null;
  const discMaxN = form.disc_max ? Number(form.disc_max) : null;
  const discError =
    discMinN != null && discMaxN != null && discMinN > discMaxN
      ? "❌ 折扣下限不得高於上限"
      : discMinN != null && discMaxN != null
        ? `✅ 授權範圍：${discMinN}折 ～ ${discMaxN}折`
        : "";

  function handleSubmit() {
    if (!form.name.trim()) {
      showBanner(false, "請填寫活動名稱");
      return;
    }
    if (discMinN != null && discMaxN != null && discMinN > discMaxN) {
      showBanner(false, "折扣下限不得高於上限");
      return;
    }
    startTransition(async () => {
      const payload = {
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
      };
      try {
        const res: ActionResult<{ id: string }> = editing
          ? await updatePromoCampaign(editing.id, payload)
          : await createPromoCampaign(payload);
        if (res.ok) {
          showBanner(true, editing ? "✓ 已更新活動" : "✓ 已建立活動");
          setPanelOpen(false);
          router.refresh();
        } else {
          showBanner(false, res.error);
        }
      } catch (e) {
        showBanner(false, `操作失敗：${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  function runStatus(
    id: string,
    fn: (id: string) => Promise<ActionResult<{ id: string }>>,
    label: string,
    closePanel = false,
  ) {
    startTransition(async () => {
      try {
        const res = await fn(id);
        if (res.ok) {
          showBanner(true, label);
          if (closePanel) setPanelOpen(false);
          router.refresh();
        } else {
          showBanner(false, res.error);
        }
      } catch (e) {
        showBanner(false, `操作失敗：${e instanceof Error ? e.message : String(e)}`);
      }
    });
  }

  function handleDelete(c: PromoCampaign) {
    if (!confirm(`確定刪除活動「${c.name}」？此操作無法復原。`)) return;
    runStatus(c.id, deletePromoCampaign, "✓ 已刪除", true);
  }

  async function downloadPng() {
    if (!posterRef.current) return;
    setPngBusy(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(posterRef.current, {
        scale: 3,
        backgroundColor: null,
        useCORS: true,
      });
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.poster_title || form.name || "promo"}.png`;
      a.click();
      showBanner(true, "✓ 海報 PNG 已下載（1080px）");
    } catch {
      showBanner(false, "海報產生失敗，請重試");
    } finally {
      setPngBusy(false);
    }
  }

  function toggleStore(short: string) {
    setForm((f) => ({
      ...f,
      stores: f.stores.includes(short)
        ? f.stores.filter((s) => s !== short)
        : [...f.stores, short],
    }));
  }

  const tpl = PROMO_TEMPLATES[form.poster_template] ?? PROMO_TEMPLATES.warm;
  const posterStores =
    form.stores.length === STORE_OPTIONS.length ? "全台門店" : form.stores.join("｜");

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">促銷活動管理</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#FDF3E3] text-[#854F0B] font-medium">
          GRP13
        </span>
        <span className="text-[12px] text-[#9A9890]">
          活動建立 × 折扣授權範圍 × 門店執行監看 × 海報產出
        </span>
        <button
          onClick={openCreate}
          disabled={!canEdit || isPending}
          className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
        >
          ＋ 新增活動
        </button>
      </header>

      {/* 越界警示 banner */}
      {violations.length > 0 && (
        <div className="bg-[#FDECEA] border border-[#F5AEAD] border-l-4 border-l-[#CC0000] rounded-lg px-4 py-2.5 flex items-start gap-2.5">
          <span className="text-[15px]">⚠️</span>
          <div className="flex flex-col gap-1">
            <span className="text-[12.5px] font-semibold text-[#8B0012]">折扣越界警示</span>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {violations.map((v, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[12px] text-[#8B0012]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#CC0000]" />
                  {v.exec_status === "越界"
                    ? `${v.store_short}：「${v.campaign}」實際 ${v.actual_discount}折，低於授權下限 ${v.auth_min}折`
                    : `${v.store_short}：「${v.campaign}」尚未回報執行狀況`}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* KPI */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi
          label="✅ 進行中活動"
          value={String(overview.active)}
          unit="個"
          sub={`另有 ${overview.scheduled} 個已排程`}
          tone="good"
        />
        <Kpi
          label="💰 進行中業績貢獻"
          value={fmtM(overview.contribNt)}
          sub="進行中活動加總"
          tone="navy"
        />
        <Kpi
          label="📉 平均實際折扣"
          value={overview.avgDiscount !== null ? overview.avgDiscount + "折" : "—"}
          sub="門店執行監看加權"
          tone="info"
        />
        <Kpi
          label="🚨 折扣越界 / 待確認"
          value={String(overview.violationCount)}
          unit="筆"
          sub="需通路管理經理確認"
          tone="warn"
        />
      </section>

      {/* Status tabs */}
      <div className="flex border border-[#EEECE6] rounded-lg overflow-hidden bg-white">
        {PROMO_STATUS_TABS.map((t) => {
          const active = activeTab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex-1 py-2.5 text-[12px] font-semibold border-r border-[#EEECE6] last:border-r-0 transition-colors ${
                active ? "bg-[#FDF3E3] text-[#854F0B]" : "text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              {t.label}
              <span
                className={`ml-1.5 inline-block px-1.5 rounded-full text-[10px] ${
                  active ? "bg-[#F0C97E] text-[#854F0B]" : "bg-[#EEECE6] text-[#9A9890]"
                }`}
              >
                {tabCount(t.key)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Activity list */}
      <div className="flex flex-col gap-2.5">
        {filtered.length === 0 && (
          <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-8 text-center text-[12.5px] text-[#9A9890]">
            沒有符合條件的活動
          </div>
        )}
        {filtered.map((c) => {
          const m = PROMO_STATUS_META[c.status] ?? PROMO_STATUS_META.draft;
          return (
            <div key={c.id} className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
              <div className="px-4 py-3 flex items-center gap-3 border-b border-[#EEECE6]">
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ background: m.dot }}
                />
                <span className="text-[13.5px] font-semibold text-[#2C2C2A] flex-1">{c.name}</span>
                <span className="text-[12px] text-[#9A9890] whitespace-nowrap">
                  📅 {c.start_date ?? "—"} ～ {c.end_date ?? "—"}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap ${m.chip}`}
                >
                  {m.label}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B] whitespace-nowrap">
                  {c.promo_type}
                </span>
              </div>
              <div className="px-4 py-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4 items-center">
                <div>
                  <div className="text-[11px] text-[#9A9890] mb-1">折扣授權範圍</div>
                  <div className="flex items-center gap-1.5 text-[12.5px]">
                    <span className="px-1.5 py-0.5 rounded bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] font-bold">
                      {c.disc_min ?? "—"}折
                    </span>
                    <span className="text-[#9A9890]">～</span>
                    <span className="px-1.5 py-0.5 rounded bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] font-bold">
                      {c.disc_max ?? "—"}折
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890] mb-1">適用門店</div>
                  <div className="text-[12.5px] font-medium text-[#2C2C2A]">
                    {c.stores.join("、") || "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890] mb-1">業績貢獻</div>
                  <div
                    className={`text-[12.5px] font-medium ${c.contrib_nt ? "text-[#0F6E56]" : "text-[#9A9890]"}`}
                  >
                    {c.contrib_nt ? fmtNT(c.contrib_nt) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-[#9A9890] mb-1">執行單數</div>
                  <div className="text-[12.5px] font-medium text-[#2C2C2A]">
                    {c.exec_count ? c.exec_count + " 單" : "—"}
                  </div>
                </div>
                <div className="flex gap-1.5 justify-end col-span-2 md:col-span-4 lg:col-span-1">
                  <button
                    onClick={() => openEdit(c)}
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                  >
                    {canEdit ? "編輯" : "檢視"}
                  </button>
                  <button
                    onClick={() => openEdit(c)}
                    disabled={isPending}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF4FB] border border-[#85B7EB] text-[#185FA5] hover:bg-[#dbeefb] disabled:opacity-50"
                  >
                    海報
                  </button>
                  {canEdit && c.status === "active" && (
                    <button
                      onClick={() => runStatus(c.id, takedownPromo, "✓ 已緊急下架")}
                      disabled={isPending}
                      className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
                    >
                      下架
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 門店折扣執行監看 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            🏪 門店折扣執行監看 — 各門店實際折扣 vs 集團授權範圍
          </span>
          {violations.length > 0 && (
            <span className="px-2 py-0.5 rounded text-[11px] bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]">
              越界 / 待確認 {violations.length} 筆 ⚠️
            </span>
          )}
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-[11px] text-[#9A9890]">
                <th className="text-left px-3 py-2 font-medium">門店</th>
                <th className="text-left px-3 py-2 font-medium">活動名稱</th>
                <th className="text-left px-3 py-2 font-medium">集團授權範圍</th>
                <th className="text-right px-3 py-2 font-medium">門店實際折扣</th>
                <th className="text-right px-3 py-2 font-medium">執行單數</th>
                <th className="text-right px-3 py-2 font-medium">業績貢獻</th>
                <th className="text-left px-3 py-2 font-medium">狀態</th>
              </tr>
            </thead>
            <tbody>
              {storeExec.map((s, i) => {
                const warn = s.exec_status !== "正常";
                return (
                  <tr
                    key={i}
                    className={`border-t border-[#F0EDE8] ${warn ? "bg-[#FFF8F8]" : ""}`}
                  >
                    <td className="px-3 py-2 font-semibold text-[#2C2C2A]">{s.store_short}</td>
                    <td className="px-3 py-2 text-[#5A5955]">{s.campaign}</td>
                    <td className="px-3 py-2 text-[#9A9890]">
                      {s.auth_min}折 ～ {s.auth_max}折
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-bold ${
                        s.exec_status === "越界"
                          ? "text-[#CC0000]"
                          : s.actual_discount === null
                            ? "text-[#9A9890]"
                            : "text-[#0F6E56]"
                      }`}
                    >
                      {s.actual_discount !== null
                        ? `${s.actual_discount}折${s.exec_status === "越界" ? " ⚠️" : ""}`
                        : "— 未回報"}
                    </td>
                    <td className="px-3 py-2 text-right text-[#5A5955]">
                      {s.exec_count !== null ? s.exec_count + " 單" : "—"}
                    </td>
                    <td className="px-3 py-2 text-right text-[#5A5955]">
                      {s.contrib_nt !== null ? fmtNT(s.contrib_nt) : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] whitespace-nowrap ${
                          s.exec_status === "正常"
                            ? "bg-[#EAF3DE] text-[#3B6D11]"
                            : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
                        }`}
                      >
                        {s.exec_status === "正常"
                          ? "正常"
                          : s.exec_status === "越界"
                            ? "越界警示"
                            : "待確認"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* 活動效益分析 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            📊 活動效益分析 — 活動期間 vs 非活動期間（本季已結束活動）
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          {effect.map((e, i) => {
            const color =
              e.accent === "teal" ? "#0F6E56" : e.accent === "amber" ? "#854F0B" : "#1A3A5C";
            const deltaColor =
              e.dir === "up" ? "#0F6E56" : e.dir === "down" ? "#CC0000" : "#9A9890";
            return (
              <div key={i} className="bg-[#F8F7F4] border border-[#EEECE6] rounded-lg px-4 py-3">
                <div className="text-[11px] text-[#9A9890] mb-1.5">{e.label}</div>
                <div className="text-[20px] font-bold mb-1" style={{ color }}>
                  {e.value_text}
                </div>
                <div className="text-[12px]" style={{ color: deltaColor }}>
                  {e.delta}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== SIDE PANEL ===== */}
      {panelOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => !isPending && setPanelOpen(false)}
          />
          <div className="fixed top-0 right-0 w-full max-w-[700px] h-screen bg-white z-50 flex flex-col shadow-2xl">
            {/* panel header */}
            <div className="bg-[#0D2438] px-6 py-4 flex items-center gap-3 border-b-2 border-[#854F0B] shrink-0">
              <span className="text-white text-[15px] font-semibold flex-1">
                {editing ? `編輯活動：${editing.name}` : "新增促銷活動"}
              </span>
              <button
                onClick={() => !isPending && setPanelOpen(false)}
                className="text-[#8AAABB] hover:text-white text-[18px] leading-none"
              >
                ✕
              </button>
            </div>

            <div className={`flex-1 overflow-y-auto px-6 py-5 space-y-5 ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
              {/* 狀態列 + 狀態機按鈕（編輯時） */}
              {editing && (
                <div className="flex items-center gap-3 bg-[#FDF3E3] border border-[#F0C97E] rounded-lg px-4 py-2.5">
                  <div>
                    <div className="text-[11px] text-[#9A9890]">目前狀態</div>
                    <div className="text-[13px] font-bold text-[#854F0B]">
                      {(PROMO_STATUS_META[editing.status] ?? PROMO_STATUS_META.draft).label}
                    </div>
                  </div>
                  {canEdit && (
                    <div className="ml-auto flex gap-1.5 flex-wrap">
                      {editing.status === "draft" && (
                        <button
                          onClick={() => runStatus(editing.id, submitPromoForReview, "✓ 已送審")}
                          disabled={isPending}
                          className="px-3 py-1 rounded text-[11px] font-medium bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5] hover:bg-[#0F6E56] hover:text-white disabled:opacity-50"
                        >
                          送審
                        </button>
                      )}
                      {editing.status === "review" && (
                        <button
                          onClick={() => runStatus(editing.id, approvePromo, "✓ 已核准上架")}
                          disabled={isPending}
                          className="px-3 py-1 rounded text-[11px] font-medium bg-[#E1F5EE] text-[#0F6E56] border border-[#5DCAA5] hover:bg-[#0F6E56] hover:text-white disabled:opacity-50"
                        >
                          核准上架
                        </button>
                      )}
                      {(editing.status === "active" || editing.status === "scheduled") && (
                        <button
                          onClick={() => runStatus(editing.id, takedownPromo, "✓ 已緊急下架")}
                          disabled={isPending}
                          className="px-3 py-1 rounded text-[11px] font-medium bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD] hover:bg-[#CC0000] hover:text-white disabled:opacity-50"
                        >
                          緊急下架
                        </button>
                      )}
                      {editing.status !== "archived" && (
                        <button
                          onClick={() => runStatus(editing.id, archivePromo, "✓ 已封存")}
                          disabled={isPending}
                          className="px-3 py-1 rounded text-[11px] font-medium bg-[#F5F5F5] text-[#666] border border-[#DDD] hover:bg-[#999] hover:text-white disabled:opacity-50"
                        >
                          封存
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(editing)}
                        disabled={isPending}
                        className="px-3 py-1 rounded text-[11px] font-medium bg-white text-[#CC0000] border border-[#F5AEAD] hover:bg-[#FDECEA] disabled:opacity-50"
                      >
                        刪除
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 基本資料 */}
              <FormSection title="基本資料">
                <Field label="活動名稱 *" full>
                  <input
                    className={inputClass}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    placeholder="例：2026 Q3 夏季精品節"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="活動開始日 *">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.start_date}
                      onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    />
                  </Field>
                  <Field label="活動結束日 *">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.end_date}
                      onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="活動類型">
                    <select
                      className={inputClass}
                      value={form.promo_type}
                      onChange={(e) => setForm({ ...form, promo_type: e.target.value })}
                    >
                      {PROMO_TYPES.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="負責人">
                    <input
                      className={inputClass}
                      value={form.owner}
                      onChange={(e) => setForm({ ...form, owner: e.target.value })}
                      placeholder="通路管理經理姓名"
                    />
                  </Field>
                </div>
              </FormSection>

              {/* 折扣授權範圍 */}
              <FormSection title="折扣授權範圍（手動填寫）">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="折扣下限（門店不得低於）*">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={50}
                        max={100}
                        className={`${inputClass} w-[100px] text-center font-bold`}
                        value={form.disc_min}
                        onChange={(e) => setForm({ ...form, disc_min: e.target.value })}
                        placeholder="80"
                      />
                      <span className="text-[12.5px] text-[#9A9890]">折</span>
                    </div>
                  </Field>
                  <Field label="折扣上限（建議售價基準）*">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={50}
                        max={100}
                        className={`${inputClass} w-[100px] text-center font-bold`}
                        value={form.disc_max}
                        onChange={(e) => setForm({ ...form, disc_max: e.target.value })}
                        placeholder="95"
                      />
                      <span className="text-[12.5px] text-[#9A9890]">折</span>
                    </div>
                  </Field>
                </div>
                <div className="text-[11px] text-[#9A9890] mt-1">
                  ⚠️ 門店實際折扣低於下限時，系統將自動標示越界警示供集團監看。
                </div>
                {discError && (
                  <div
                    className={`text-[12px] mt-1 ${discError.startsWith("❌") ? "text-[#CC0000]" : "text-[#0F6E56]"}`}
                  >
                    {discError}
                  </div>
                )}
              </FormSection>

              {/* 適用門店 */}
              <FormSection title="適用門店">
                <label className="flex items-center gap-2 mb-2 text-[12px] cursor-pointer">
                  <input
                    type="checkbox"
                    className="accent-[#854F0B] w-[15px] h-[15px]"
                    checked={form.stores.length === STORE_OPTIONS.length}
                    onChange={(e) =>
                      setForm({ ...form, stores: e.target.checked ? [...STORE_OPTIONS] : [] })
                    }
                  />
                  <span className="font-semibold">全部門店</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {STORE_OPTIONS.map((s) => (
                    <label
                      key={s}
                      className="flex items-center gap-2 px-3 py-2 border border-[#EEECE6] rounded-md cursor-pointer hover:bg-[#FDF3E3] text-[12.5px]"
                    >
                      <input
                        type="checkbox"
                        className="accent-[#854F0B] w-[15px] h-[15px]"
                        checked={form.stores.includes(s)}
                        onChange={() => toggleStore(s)}
                      />
                      <span className="font-medium">🏢 {s}</span>
                    </label>
                  ))}
                </div>
              </FormSection>

              {/* 活動文案 */}
              <FormSection title="活動文案編輯">
                <Field label="活動標題（海報大標）*" full>
                  <input
                    className={inputClass}
                    value={form.poster_title}
                    onChange={(e) => setForm({ ...form, poster_title: e.target.value })}
                    placeholder="例：夏日騎乘精品節"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="折扣標語（海報顯示）">
                    <input
                      className={inputClass}
                      value={form.poster_discount}
                      onChange={(e) => setForm({ ...form, poster_discount: e.target.value })}
                      placeholder="例：全館85折起"
                    />
                  </Field>
                  <Field label="活動副標 / 說明">
                    <input
                      className={inputClass}
                      value={form.poster_subtitle}
                      onChange={(e) => setForm({ ...form, poster_subtitle: e.target.value })}
                      placeholder="例：指定精品最低85折"
                    />
                  </Field>
                </div>
                <Field label="活動詳細說明" full>
                  <textarea
                    className={`${inputClass} min-h-[70px] resize-y`}
                    value={form.poster_detail}
                    onChange={(e) => setForm({ ...form, poster_detail: e.target.value })}
                    placeholder="活動詳細說明、注意事項、條款備註…"
                  />
                </Field>
              </FormSection>

              {/* LINE 海報預覽 × 下載 */}
              <FormSection title="LINE 海報預覽 × 下載">
                <div className="text-[12px] text-[#9A9890] mb-2">
                  選擇模板即時預覽，下載尺寸符合 LINE 推送規格（1:1 / 1080×1080px）
                </div>
                <div className="flex gap-2 mb-3">
                  {Object.entries(PROMO_TEMPLATES).map(([key, t]) => (
                    <button
                      key={key}
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
                <div className="flex gap-5 items-start flex-wrap">
                  {/* poster canvas */}
                  <div
                    ref={posterRef}
                    className="w-[300px] h-[300px] shrink-0 rounded-xl overflow-hidden relative flex flex-col items-center justify-center text-center px-6"
                    style={{ background: tpl.gradient, color: tpl.fg }}
                  >
                    <div className="absolute top-3 right-3 text-[20px] opacity-60">🏍</div>
                    <div
                      className="text-[10px] tracking-[0.2em] uppercase mb-2"
                      style={{ color: tpl.sub }}
                    >
                      INDIAN MOTORCYCLE TAIWAN
                    </div>
                    <div className="text-[19px] font-bold leading-snug mb-1">
                      {form.poster_title || "活動名稱"}
                    </div>
                    <div className="text-[34px] font-bold leading-none my-1.5">
                      {form.poster_discount || "限時優惠"}
                    </div>
                    {form.poster_subtitle && (
                      <div className="text-[12px] mt-0.5" style={{ color: tpl.sub }}>
                        {form.poster_subtitle}
                      </div>
                    )}
                    <div
                      className="text-[11px] mt-2.5 pt-2.5 border-t w-full"
                      style={{ color: tpl.sub, borderColor: "rgba(255,255,255,.3)" }}
                    >
                      {(form.start_date || "—").replaceAll("-", ".")} —{" "}
                      {(form.end_date || "—").replaceAll("-", ".")}
                    </div>
                    <div className="text-[10px] mt-1" style={{ color: tpl.sub }}>
                      {posterStores}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={downloadPng}
                      disabled={pngBusy}
                      className="w-[170px] px-4 py-2 rounded-md text-[12px] font-medium bg-[#854F0B] text-white hover:bg-[#9D5E0D] disabled:opacity-60"
                    >
                      {pngBusy ? "產生中⋯" : "⬇ 下載 PNG（1080px）"}
                    </button>
                    <button
                      onClick={() =>
                        showBanner(true, "LINE 推送功能開發中（將接 Notification Hub）")
                      }
                      className="w-[170px] px-4 py-2 rounded-md text-[12px] font-medium bg-[#06C755] text-white hover:bg-[#05a948] disabled:opacity-60"
                    >
                      📲 推送至 LINE
                    </button>
                    <div className="text-[11px] text-[#9A9890] mt-1 leading-relaxed">
                      ※ PNG 由 html2canvas 即時產出；LINE 推送將接 Notification Hub。
                    </div>
                  </div>
                </div>
              </FormSection>

              {/* 狀態異動紀錄 */}
              {editing && editing.audit_log.length > 0 && (
                <FormSection title="狀態異動紀錄">
                  <div className="flex flex-col">
                    {editing.audit_log.map((l, i) => (
                      <div key={i} className="flex gap-3 py-2 border-b border-[#F5F5F5] last:border-b-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#854F0B] mt-1 shrink-0" />
                        <div>
                          <div className="text-[12px] font-semibold text-[#2C2C2A]">
                            {AUDIT_LABELS[l.action] ?? l.action}
                          </div>
                          <div className="text-[11px] text-[#9A9890]">
                            {l.by || "系統"}　{fmtTs(l.at)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </FormSection>
              )}
            </div>

            {/* panel footer */}
            <div className="px-6 py-4 border-t border-[#EEECE6] bg-[#FAFAF8] flex gap-2.5 justify-end shrink-0">
              <button
                onClick={() => !isPending && setPanelOpen(false)}
                className="px-4 py-2 rounded-md text-[13px] border border-[#EEECE6] text-[#5A5955] hover:bg-[#EEECE6]"
              >
                取消
              </button>
              {canEdit && (
                <button
                  onClick={handleSubmit}
                  disabled={isPending}
                  className="px-5 py-2 rounded-md text-[13px] font-medium bg-[#854F0B] text-white hover:bg-[#9D5E0D] disabled:opacity-60"
                >
                  {isPending ? (editing ? "儲存中⋯" : "建立中⋯") : editing ? "儲存變更" : "建立活動"}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Banner toast */}
      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-[60] ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}
    </main>
  );
}

const inputClass =
  "h-[34px] w-full border border-[#EEECE6] rounded-md px-2.5 text-[13px] bg-white focus:outline-none focus:border-[#F5B942] focus:ring-2 focus:ring-[#F5B942]/20";

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
  // 手動 +8（Asia/Taipei），避免 toLocaleString 無固定 tz 造成 hydration mismatch
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const t = new Date(d.getTime() + 8 * 3600 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}`;
}

function Kpi({
  label,
  value,
  unit,
  sub,
  tone,
}: {
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  tone: "navy" | "good" | "warn" | "info";
}) {
  const bar =
    tone === "warn"
      ? "bg-[#C8001A]"
      : tone === "good"
        ? "bg-[#0F6E56]"
        : tone === "info"
          ? "bg-[#185FA5]"
          : "bg-[#854F0B]";
  return (
    <div className="relative bg-white border border-[#EEECE6] rounded-[10px] px-[18px] py-4 overflow-hidden">
      <span className={`absolute top-0 left-0 right-0 h-[3px] ${bar}`} />
      <div className="text-[11px] text-[#5A5A5A] mb-2">{label}</div>
      <div className="text-[24px] font-bold text-[#1A1A1A] leading-none mb-1.5">
        {value}
        {unit ? <span className="text-[13px] font-normal text-[#5A5A5A]"> {unit}</span> : null}
      </div>
      {sub ? <div className="text-[11px] text-[#5A5A5A]">{sub}</div> : null}
    </div>
  );
}

function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-[#854F0B] uppercase tracking-wider mb-3 pb-1.5 border-b border-[#F0C97E]">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  full,
  children,
}: {
  label: string;
  full?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-col gap-1 ${full ? "" : ""}`}>
      <label className="text-[11px] font-semibold text-[#9A9890]">{label}</label>
      {children}
    </div>
  );
}
