"use client";

/**
 * 賞車報價單 Detail View — view / edit / create 三 mode
 *
 * Canonical 範本：parts/setup/items/[id]/_components/item-detail-view.tsx
 * 與 admin/accounting/coa/[id]/_components/coa-detail-view.tsx
 *
 * spec: RS04 賞車報價與成交訂單 v1（Tab 0 賞車報價單）
 */

import Link from "next/link";
import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";

import {
  createSalesQuoteAction,
  updateSalesQuoteAction,
  setSalesQuoteStatusAction,
  deleteSalesQuoteAction,
} from "@/lib/sales/quote-actions";
import {
  QUOTE_STATUS_LABELS,
  QUOTE_STATUS_CHIP,
  VEHICLE_KIND_LABELS,
  type SalesQuoteDetail,
  type QuoteStatus,
  type QuoteLine,
  type QuoteLineCategory,
  type VehicleKind,
  type CreateSalesQuoteInput,
  type UpdateSalesQuoteInput,
} from "@/domain/sales-quote.constants";

type Mode = "view" | "edit" | "create";
type Banner = { ok: boolean; msg: string } | null;
type TabKey = "lines" | "addon" | "notes" | "history";

const TABS: { key: TabKey; label: string }[] = [
  { key: "lines", label: "報價明細" },
  { key: "addon", label: "加值附加" },
  { key: "notes", label: "備註" },
  { key: "history", label: "歷程" },
];

const LINE_CATEGORY_LABEL: Record<QuoteLineCategory, string> = {
  vehicle: "車輛",
  gift: "贈品",
  addon: "加值附加",
  insurance: "保險",
  license: "牌照 / 規費",
  discount: "折扣",
};

const LINE_CATEGORY_CHIP: Record<QuoteLineCategory, string> = {
  vehicle: "bg-[#EBF3FF] text-[#1A3A5C]",
  gift: "bg-[#FDF3E3] text-[#854F0B]",
  addon: "bg-[#EAF4FB] text-[#185FA5]",
  insurance: "bg-[#E8F5F0] text-[#0F6E56]",
  license: "bg-[#F2EAFB] text-[#5E2EA0]",
  discount: "bg-[#FDECEA] text-[#CC0000]",
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtNT(n: number | null | undefined): string {
  if (n == null) return "—";
  return `NT$ ${Number(n).toLocaleString("en-US")}`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    return new Date(s).toISOString().slice(0, 16).replace("T", " ");
  } catch {
    return "—";
  }
}

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

export type QuotationDetailViewProps = {
  /** view / edit 時必填；create 時 null */
  quote: SalesQuoteDetail | null;
  initialMode: Mode;
  canEdit: boolean;
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function QuotationDetailView({
  quote,
  initialMode,
  canEdit,
}: QuotationDetailViewProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>(initialMode);
  const [banner, setBanner] = useState<Banner>(null);
  const [activeTab, setActiveTab] = useState<TabKey>("lines");

  // 編輯 / 建立用的可變欄位 state
  const fromQuote = (q: SalesQuoteDetail | null): Draft => ({
    vehicle_kind: q?.vehicle_kind ?? "new",
    customer_name: q?.customer_name ?? "",
    customer_phone: q?.customer_phone ?? "",
    rs_name: q?.rs_name ?? "",
    vehicle_model_name: q?.vehicle_model_name ?? "",
    used_brand_model: q?.used_brand_model ?? "",
    vehicle_amount: q?.vehicle_amount ?? 0,
    addon_amount: q?.addon_amount ?? 0,
    discount_amount: q?.discount_amount ?? 0,
    total_amount: q?.total_amount ?? 0,
    expires_at: q?.expires_at ?? "",
    estimated_delivery_date: q?.estimated_delivery_date ?? "",
    notes: q?.notes ?? "",
  });
  const [draft, setDraft] = useState<Draft>(fromQuote(quote));

  const showInputs = mode === "edit" || mode === "create";
  const lockedClass = isPending ? "pointer-events-none opacity-60" : "";
  const inputClass =
    "h-[28px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white outline-none focus:border-[#185FA5] w-full";
  const taClass =
    "border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none w-full";

  const showBanner = (b: Banner) => {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  };

  // 自動計算 total = vehicle + addon - discount
  const computedTotal = useMemo(
    () =>
      Number(draft.vehicle_amount ?? 0) +
      Number(draft.addon_amount ?? 0) -
      Number(draft.discount_amount ?? 0),
    [draft.vehicle_amount, draft.addon_amount, draft.discount_amount],
  );

  // ── Actions ─────────────────────────────────────────────────

  const enterEdit = () => {
    setDraft(fromQuote(quote));
    setMode("edit");
  };

  const cancelEdit = () => {
    setDraft(fromQuote(quote));
    setMode("view");
  };

  const enterCreate = () => {
    setDraft({
      vehicle_kind: "new",
      customer_name: "",
      customer_phone: "",
      rs_name: "",
      vehicle_model_name: "",
      used_brand_model: "",
      vehicle_amount: 0,
      addon_amount: 0,
      discount_amount: 0,
      total_amount: 0,
      expires_at: "",
      estimated_delivery_date: "",
      notes: "",
    });
    setMode("create");
  };

  const cancelCreate = () => {
    if (quote) {
      setDraft(fromQuote(quote));
      setMode("view");
    } else {
      router.push("/sales/quote");
    }
  };

  const submitEdit = () => {
    if (!quote) return;
    const patch: UpdateSalesQuoteInput = {
      vehicle_kind: draft.vehicle_kind,
      customer_name: draft.customer_name.trim() || null,
      customer_phone: draft.customer_phone.trim() || null,
      rs_name: draft.rs_name.trim() || null,
      vehicle_model_name: draft.vehicle_model_name.trim() || null,
      used_brand_model: draft.used_brand_model.trim() || null,
      vehicle_amount: Number(draft.vehicle_amount) || 0,
      addon_amount: Number(draft.addon_amount) || 0,
      discount_amount: Number(draft.discount_amount) || 0,
      total_amount: computedTotal,
      expires_at: draft.expires_at || null,
      estimated_delivery_date: draft.estimated_delivery_date || null,
      notes: draft.notes.trim() || null,
    };
    startTransition(async () => {
      const res = await updateSalesQuoteAction(quote.id, patch);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存變更" });
        setMode("view");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const submitCreate = () => {
    if (!draft.vehicle_kind) {
      showBanner({ ok: false, msg: "請選擇車種（新車 / 中古車）" });
      return;
    }
    const input: CreateSalesQuoteInput = {
      vehicle_kind: draft.vehicle_kind,
      customer_name: draft.customer_name.trim() || null,
      customer_phone: draft.customer_phone.trim() || null,
      rs_name: draft.rs_name.trim() || null,
      vehicle_model_name: draft.vehicle_model_name.trim() || null,
      used_brand_model: draft.used_brand_model.trim() || null,
      vehicle_amount: Number(draft.vehicle_amount) || 0,
      addon_amount: Number(draft.addon_amount) || 0,
      discount_amount: Number(draft.discount_amount) || 0,
      total_amount: computedTotal,
      expires_at: draft.expires_at || null,
      estimated_delivery_date: draft.estimated_delivery_date || null,
      notes: draft.notes.trim() || null,
    };
    startTransition(async () => {
      const res = await createSalesQuoteAction(input);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已建立 ${res.data.quote_no}` });
        router.push(`/sales/quote/${res.data.id}`);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const removeQuote = () => {
    if (!quote) return;
    if (
      !confirm(
        `確定刪除報價單「${quote.quote_no}」？\n此動作無法復原，且僅在尚未成交時可執行。`,
      )
    )
      return;
    startTransition(async () => {
      const res = await deleteSalesQuoteAction(quote.id);
      if (res.ok) {
        router.push("/sales/quote");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  // 報價單沒有「停用 / 啟用」概念 → 改為「作廢」（status='lost'）
  const voidQuote = () => {
    if (!quote) return;
    if (quote.status === "won") {
      showBanner({ ok: false, msg: "已成交的報價單不可作廢" });
      return;
    }
    if (!confirm(`確定將 ${quote.quote_no} 標記為「未成交」？`)) return;
    startTransition(async () => {
      const res = await setSalesQuoteStatusAction(quote.id, "lost");
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已標記未成交" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  };

  const openPrint = () => {
    if (!quote) return;
    window.open(`/print/quotation/${quote.id}`, "_blank");
  };

  // 報價單可禁用編輯 = status in (won, lost)
  const isClosed = quote
    ? quote.status === "won" || quote.status === "lost"
    : false;

  // ── Render helpers ──────────────────────────────────────────

  const sectionCard = (title: string, body: React.ReactNode) => (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3">{body}</div>
    </section>
  );

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill bar — same top row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/sales/quote" className="hover:text-[#185FA5]">
            賞車報價
          </Link>
          <span>›</span>
          <span
            className={`text-[#5A5955] ${mode === "create" ? "" : "font-mono"}`}
          >
            {mode === "create" ? "新增報價單" : quote?.quote_no ?? "—"}
          </span>
          {mode === "edit" ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              編輯模式
            </span>
          ) : mode === "create" ? (
            <span className="ml-2 px-1.5 py-0.5 rounded bg-[#FDF3E3] text-[#854F0B] text-[11px]">
              建立模式
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "edit" && quote ? (
            <>
              <button
                type="button"
                onClick={submitEdit}
                disabled={isPending || !canEdit}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-60"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] shadow-sm hover:border-[#9A9890] disabled:opacity-60"
              >
                取消
              </button>
            </>
          ) : mode === "create" ? (
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
                {isPending ? "建立中⋯" : "建立並開啟"}
              </button>
            </>
          ) : quote ? (
            <>
              <Link
                href="/sales/quote"
                className="h-[30px] inline-flex items-center justify-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                返回列表
              </Link>
              <button
                type="button"
                disabled={!canEdit}
                onClick={enterCreate}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                新增
              </button>
              <button
                type="button"
                disabled={!canEdit || isClosed}
                onClick={enterEdit}
                title={isClosed ? "已關案的報價單不可修改" : ""}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm disabled:opacity-50"
              >
                修改
              </button>
              <button
                type="button"
                onClick={openPrint}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm inline-flex items-center gap-1"
                title="列印 / 另存 PDF"
              >
                <span className="material-symbols-outlined text-[14px]">
                  print
                </span>
                列印
              </button>
              <button
                type="button"
                disabled={!canEdit || quote.status === "won"}
                onClick={removeQuote}
                title={
                  quote.status === "won" ? "已成交的報價單不可刪除" : ""
                }
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
              >
                刪除
              </button>
              <button
                type="button"
                disabled={!canEdit || isClosed}
                onClick={voidQuote}
                title={isClosed ? "已關案的報價單不可作廢" : ""}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
              >
                作廢
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Banner */}
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
          {/* Left: title + chips */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                賞車報價單（RS04-quote）
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {mode === "create"
                  ? "（未建立報價單）"
                  : quote?.customer_name ?? "—"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                {mode === "create" ? (
                  <>
                    <span className="text-[#9A9890]">—</span>
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                      尚未建立
                    </span>
                  </>
                ) : quote ? (
                  <>
                    <span className="font-mono text-[#5A5955]">
                      {quote.quote_no}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        QUOTE_STATUS_CHIP[quote.status].bg
                      } ${QUOTE_STATUS_CHIP[quote.status].text}`}
                    >
                      {QUOTE_STATUS_LABELS[quote.status]}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        quote.vehicle_kind === "new"
                          ? "bg-[#EAF4FB] text-[#185FA5]"
                          : "bg-[#FDF3E3] text-[#854F0B]"
                      }`}
                    >
                      {VEHICLE_KIND_LABELS[quote.vehicle_kind]}
                    </span>
                    {quote.vehicle_model_name ? (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5]">
                        {quote.vehicle_model_name}
                      </span>
                    ) : null}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          {/* Right: vehicle placeholder（未來可放車型圖） */}
          <div className="shrink-0">
            <div className="w-[260px] h-[120px] border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] flex items-center justify-center text-[12px] text-[#9A9890]">
              {mode === "create"
                ? "建立後可掛車型圖片"
                : quote?.vehicle_kind === "used"
                  ? `中古：${quote.used_brand_model ?? "—"}`
                  : quote?.vehicle_model_name ?? "車型圖（未設）"}
            </div>
          </div>
        </div>
      </header>

      {/* ▼ 基本資料 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 基本資料
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          {mode !== "create" && quote ? (
            <Kv
              label="報價單號"
              value={
                <span className="font-mono font-semibold">{quote.quote_no}</span>
              }
            />
          ) : null}
          <Kv
            label="車種"
            value={
              showInputs ? (
                <select
                  value={draft.vehicle_kind}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      vehicle_kind: e.target.value as VehicleKind,
                    })
                  }
                  className={inputClass}
                >
                  <option value="new">新車</option>
                  <option value="used">中古車</option>
                </select>
              ) : quote ? (
                VEHICLE_KIND_LABELS[quote.vehicle_kind]
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="負責 RS"
            value={
              showInputs ? (
                <input
                  value={draft.rs_name}
                  onChange={(e) =>
                    setDraft({ ...draft, rs_name: e.target.value })
                  }
                  placeholder="例：王業務"
                  className={inputClass}
                />
              ) : (
                quote?.rs_name ?? "—"
              )
            }
          />
          <Kv
            label="車款 / 規格"
            value={
              showInputs ? (
                draft.vehicle_kind === "new" ? (
                  <input
                    value={draft.vehicle_model_name}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        vehicle_model_name: e.target.value,
                      })
                    }
                    placeholder="例：Panigale V4"
                    className={inputClass}
                  />
                ) : (
                  <input
                    value={draft.used_brand_model}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        used_brand_model: e.target.value,
                      })
                    }
                    placeholder="例：Honda CB650R 2020"
                    className={inputClass}
                  />
                )
              ) : quote ? (
                quote.vehicle_kind === "new"
                  ? quote.vehicle_model_name ?? "—"
                  : quote.used_brand_model ?? quote.vehicle_model_name ?? "—"
              ) : (
                "—"
              )
            }
          />
          <Kv
            label="有效期 至"
            value={
              showInputs ? (
                <input
                  type="date"
                  value={draft.expires_at}
                  onChange={(e) =>
                    setDraft({ ...draft, expires_at: e.target.value })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono text-[11.5px]">
                  {fmtDate(quote?.expires_at)}
                </span>
              )
            }
          />
          <Kv
            label="預估交期"
            value={
              showInputs ? (
                <input
                  type="date"
                  value={draft.estimated_delivery_date}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      estimated_delivery_date: e.target.value,
                    })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono text-[11.5px]">
                  {fmtDate(quote?.estimated_delivery_date)}
                </span>
              )
            }
          />
        </div>
      </section>

      {/* ▼ 客戶資訊 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 客戶資訊
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="客戶姓名"
            value={
              showInputs ? (
                <input
                  value={draft.customer_name}
                  onChange={(e) =>
                    setDraft({ ...draft, customer_name: e.target.value })
                  }
                  placeholder="例：陳大明"
                  className={inputClass}
                />
              ) : (
                <span className="font-medium">{quote?.customer_name ?? "—"}</span>
              )
            }
          />
          <Kv
            label="聯絡電話"
            value={
              showInputs ? (
                <input
                  value={draft.customer_phone}
                  onChange={(e) =>
                    setDraft({ ...draft, customer_phone: e.target.value })
                  }
                  placeholder="例：0912-345-678"
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{quote?.customer_phone ?? "—"}</span>
              )
            }
          />
          {mode !== "create" && quote?.customer_id ? (
            <Kv
              label="客戶 ID"
              value={
                <span className="font-mono text-[11.5px] text-[#9A9890]">
                  {quote.customer_id.slice(0, 8)}
                </span>
              }
            />
          ) : null}
        </div>
      </section>

      {/* ▼ 報價金額 */}
      <section
        className={`bg-white border border-[#EEECE6] rounded-lg overflow-hidden ${
          showInputs ? lockedClass : ""
        }`}
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 報價金額
          </span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="車輛金額"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={draft.vehicle_amount}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      vehicle_amount: Number(e.target.value) || 0,
                    })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{fmtNT(quote?.vehicle_amount)}</span>
              )
            }
          />
          <Kv
            label="加值附加金額"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={draft.addon_amount}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      addon_amount: Number(e.target.value) || 0,
                    })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono">{fmtNT(quote?.addon_amount)}</span>
              )
            }
          />
          <Kv
            label="折扣金額"
            value={
              showInputs ? (
                <input
                  type="number"
                  value={draft.discount_amount}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      discount_amount: Number(e.target.value) || 0,
                    })
                  }
                  className={inputClass}
                />
              ) : (
                <span className="font-mono text-[#CC0000]">
                  {quote?.discount_amount
                    ? `- ${fmtNT(quote.discount_amount)}`
                    : "—"}
                </span>
              )
            }
          />
          <Kv
            label="總計（含稅）"
            value={
              showInputs ? (
                <span className="font-mono font-semibold text-[#1A3A5C]">
                  {fmtNT(computedTotal)}{" "}
                  <span className="text-[11px] text-[#9A9890]">
                    (自動計算)
                  </span>
                </span>
              ) : (
                <span className="font-mono font-semibold text-[#1A3A5C]">
                  {fmtNT(quote?.total_amount)}
                </span>
              )
            }
          />
          {mode !== "create" && quote ? (
            <>
              <Kv
                label="未稅小計"
                value={
                  <span className="font-mono">
                    {fmtNT(Math.round(quote.total_amount / 1.05))}
                  </span>
                }
                small
              />
              <Kv
                label="稅額（5%）"
                value={
                  <span className="font-mono">
                    {fmtNT(
                      quote.total_amount -
                        Math.round(quote.total_amount / 1.05),
                    )}
                  </span>
                }
                small
              />
            </>
          ) : null}
        </div>
      </section>

      {/* create mode 提示 — tabs 隱藏 */}
      {mode === "create" ? (
        <p className="text-[12px] text-[#9A9890] leading-relaxed">
          建立後將跳轉到該報價單的詳情頁，可進一步維護報價明細、加值附加、備註與歷程資訊。
        </p>
      ) : (
        quote && (
          <>
            {/* Tabs */}
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

            {/* Tab content */}
            <div className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg p-4 space-y-3">
              {activeTab === "lines" ? (
                <div className="grid grid-cols-1 gap-3">
                  {sectionCard(
                    `報價明細（${quote.lines.length} 項）`,
                    quote.lines.length === 0 ? (
                      <div className="text-[12px] text-[#9A9890] py-2">
                        尚未新增明細項目
                      </div>
                    ) : (
                      <table className="w-full text-[12px]">
                        <thead>
                          <tr className="text-[11px] text-[#9A9890]">
                            <th className="text-left font-medium py-1 w-[36px]">
                              #
                            </th>
                            <th className="text-left font-medium py-1 w-[90px]">
                              分類
                            </th>
                            <th className="text-left font-medium py-1">
                              品項
                            </th>
                            <th className="text-right font-medium py-1 w-[110px]">
                              定價
                            </th>
                            <th className="text-right font-medium py-1 w-[110px]">
                              報價
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {quote.lines.map((l, i) => (
                            <LineRow key={l.id ?? i} line={l} index={i} />
                          ))}
                        </tbody>
                      </table>
                    ),
                  )}
                </div>
              ) : null}

              {activeTab === "addon" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sectionCard(
                    "加值附加",
                    <div className="space-y-2 text-[12.5px]">
                      <Kv
                        label="加值附加總額"
                        value={
                          <span className="font-mono">
                            {fmtNT(quote.addon_amount)}
                          </span>
                        }
                      />
                      <p className="text-[11px] text-[#9A9890] pt-1">
                        加值附加 = 保險、牌照、額外配件等項目的合計，於上方「報價金額」區編輯。
                      </p>
                    </div>,
                  )}
                  {sectionCard(
                    "折扣",
                    <div className="space-y-2 text-[12.5px]">
                      <Kv
                        label="折扣金額"
                        value={
                          <span className="font-mono text-[#CC0000]">
                            {quote.discount_amount
                              ? `- ${fmtNT(quote.discount_amount)}`
                              : "—"}
                          </span>
                        }
                      />
                      <p className="text-[11px] text-[#9A9890] pt-1">
                        折扣為對單價的整體優惠，已從總計中扣除。
                      </p>
                    </div>,
                  )}
                </div>
              ) : null}

              {activeTab === "notes" ? (
                <div className="grid grid-cols-1 gap-3">
                  {sectionCard(
                    "備註",
                    quote.notes ? (
                      <pre className="whitespace-pre-wrap text-[12.5px] text-[#2C2C2A] font-sans">
                        {quote.notes}
                      </pre>
                    ) : (
                      <div className="text-[12px] text-[#9A9890] py-2">
                        尚無備註
                      </div>
                    ),
                  )}
                </div>
              ) : null}

              {activeTab === "history" ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {sectionCard(
                    "時間軸",
                    <div className="space-y-2 text-[12.5px]">
                      <Kv
                        label="建立時間"
                        value={fmtDateTime(quote.created_at)}
                        mono
                        small
                      />
                      <Kv
                        label="最後更新"
                        value={fmtDateTime(quote.updated_at)}
                        mono
                        small
                      />
                      <Kv
                        label="傳送時間"
                        value={fmtDateTime(quote.sent_at)}
                        mono
                        small
                      />
                      <Kv
                        label="關案時間"
                        value={fmtDateTime(quote.closed_at)}
                        mono
                        small
                      />
                    </div>,
                  )}
                  {sectionCard(
                    "轉單狀態",
                    <div className="space-y-2 text-[12.5px]">
                      <Kv
                        label="是否已成交"
                        value={
                          quote.status === "won" ? (
                            <span className="text-[#3B6D11]">✓ 已成交</span>
                          ) : (
                            <span className="text-[#9A9890]">尚未成交</span>
                          )
                        }
                      />
                      <Kv
                        label="轉為訂單"
                        value={
                          quote.converted_order_id ? (
                            <Link
                              href={`/sales/order/${quote.converted_order_id}`}
                              className="text-[#185FA5] hover:underline font-mono"
                            >
                              {quote.converted_order_id.slice(0, 8)} →
                            </Link>
                          ) : (
                            <span className="text-[#9A9890]">尚未建單</span>
                          )
                        }
                      />
                    </div>,
                  )}
                </div>
              ) : null}
            </div>
          </>
        )
      )}
    </main>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

function LineRow({ line, index }: { line: QuoteLine; index: number }) {
  const chip = LINE_CATEGORY_CHIP[line.category] ?? "bg-[#F2F2F2] text-[#6B6A68]";
  const label = LINE_CATEGORY_LABEL[line.category] ?? line.category;
  return (
    <tr className="border-t border-[#F8F7F4]">
      <td className="py-1.5 font-mono text-[11.5px] text-[#9A9890]">
        {index + 1}
      </td>
      <td className="py-1.5">
        <span
          className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${chip}`}
        >
          {label}
        </span>
        {line.isGift ? (
          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            贈
          </span>
        ) : null}
      </td>
      <td className="py-1.5">
        <div>{line.name}</div>
        {line.note ? (
          <div className="text-[11px] text-[#9A9890] mt-0.5">{line.note}</div>
        ) : null}
      </td>
      <td className="py-1.5 text-right font-mono text-[#9A9890]">
        {line.listPrice != null
          ? `NT$ ${Number(line.listPrice).toLocaleString("en-US")}`
          : "—"}
      </td>
      <td className="py-1.5 text-right font-mono font-semibold">
        NT$ {Number(line.quotePrice).toLocaleString("en-US")}
      </td>
    </tr>
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

// ─────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────

type Draft = {
  vehicle_kind: VehicleKind;
  customer_name: string;
  customer_phone: string;
  rs_name: string;
  vehicle_model_name: string;
  used_brand_model: string;
  vehicle_amount: number;
  addon_amount: number;
  discount_amount: number;
  total_amount: number;
  expires_at: string;
  estimated_delivery_date: string;
  notes: string;
};
