"use client";

/**
 * AI Curve 結果頁 — 12 欄手卡 inline 編輯版
 * - 8 欄 AI 預填、4 欄業務手填、全部都可改
 * - 業務 review 完按「儲存草稿」→ 寫回 handcard_voice_notes.reviewed_decisions
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  saveReviewedAiCurveNote,
  type AiCurveNoteResult,
  type ReviewedHandcardValues,
} from "@/domain/ai-curve-notes";

const TIMING_OPTIONS = [
  { value: "", label: "—（未設）" },
  { value: "now", label: "當下下訂" },
  { value: "3m", label: "3 個月內" },
  { value: "6m", label: "半年內" },
  { value: "explore", label: "純探詢" },
];

const IDENTITY_OPTIONS = [
  { value: "", label: "—（未設）" },
  { value: "new", label: "首次來訪" },
  { value: "revisit", label: "回訪客戶" },
  { value: "owner", label: "老車主" },
  { value: "switcher", label: "他牌換購" },
];

const ARRIVAL_SUGGESTIONS = [
  "朋友介紹",
  "網路搜尋",
  "路過",
  "老客戶回流",
  "廣告",
];

// ─────────────────────── 初始化表單（AI suggestions or 已 review values） ───────────────────────

function initFromResult(result: AiCurveNoteResult): ReviewedHandcardValues {
  if (result.reviewedValues) return result.reviewedValues;
  const s = result.suggestions;
  return {
    customer_summary: hasConf(s.customer_summary)
      ? String(s.customer_summary.value ?? "")
      : "",
    intent_level: hasConf(s.intent_level)
      ? Number(s.intent_level.value) || 0
      : 0,
    purchase_timing: hasConf(s.purchase_timing)
      ? (String(s.purchase_timing.value) as ReviewedHandcardValues["purchase_timing"])
      : "",
    intended_models:
      hasConf(s.intended_models) && Array.isArray(s.intended_models.value)
        ? (s.intended_models.value as string[])
        : [],
    competitor_brand: hasConf(s.competitor_brand)
      ? String(s.competitor_brand.value ?? "")
      : "",
    budget_range: hasConf(s.budget_range) ? String(s.budget_range.value ?? "") : "",
    arrival_source: hasConf(s.arrival_source)
      ? String(s.arrival_source.value ?? "")
      : "",
    followup_date: hasConf(s.followup_date)
      ? String(s.followup_date.value ?? "")
      : "",
    customer_name: "",
    customer_phone: "",
    customer_identity: "",
    observation_tags: [],
  };
}

function hasConf(field: { confidence?: number; value?: unknown } | undefined): boolean {
  if (!field) return false;
  return (field.confidence ?? 0) > 0;
}

// ─────────────────────── input styles ───────────────────────

const inputBase =
  "w-full text-[13.5px] text-[#2C2C2A] px-3 py-2 rounded-lg border bg-white focus:outline-none focus:ring-2 focus:ring-[#7C3AED]/40 focus:border-[#7C3AED] transition-colors";
const inputNormal = `${inputBase} border-[#EEECE6]`;
const labelStyle = "flex items-center gap-1.5 text-[11.5px] text-[#5A5955] mb-1.5";

// ─────────────────────── main component ───────────────────────

export function ResultCards({
  result,
  onClose,
}: {
  result: AiCurveNoteResult;
  onClose: () => void;
}) {
  const router = useRouter();
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [form, setForm] = useState<ReviewedHandcardValues>(() =>
    initFromResult(result),
  );
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  function set<K extends keyof ReviewedHandcardValues>(
    key: K,
    val: ReviewedHandcardValues[K],
  ) {
    setForm((prev) => ({ ...prev, [key]: val }));
  }

  function handleSave() {
    setBanner(null);
    startTransition(async () => {
      const r = await saveReviewedAiCurveNote(result.noteId, form);
      if (!r.ok) {
        setBanner({ ok: false, msg: r.error });
        return;
      }
      setBanner({ ok: true, msg: "✓ 已儲存草稿" });
      router.refresh();
      setTimeout(() => onClose(), 1500);
    });
  }

  // AI 抓到 X / 8 統計（這裡用 form 當下值算「已填」、不用 AI 原始 suggestions）
  const aiFilledCount = countAiFilled(form);

  return (
    <div className="space-y-4 pb-28">
      {/* Summary header */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#EEECE6] p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#7C3AED] text-[20px]">
              auto_awesome
            </span>
            <span className="text-[14px] font-semibold text-[#2C2C2A]">
              {result.reviewedValues
                ? "已 review 草稿（可再修改）"
                : `AI 已抓 ${aiFilledCount} / 8 欄（請 review）`}
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center text-[11px]">
          <div>
            <div className="text-[#9A9890]">處理時間</div>
            <div className="font-mono text-[13px] text-[#2C2C2A] mt-0.5">
              {result.latencyMs ? `${(result.latencyMs / 1000).toFixed(1)}s` : "—"}
            </div>
          </div>
          <div>
            <div className="text-[#9A9890]">錄音長度</div>
            <div className="font-mono text-[13px] text-[#2C2C2A] mt-0.5">
              {result.durationSeconds || "—"} 秒
            </div>
          </div>
          <div>
            <div className="text-[#9A9890]">音檔大小</div>
            <div className="font-mono text-[13px] text-[#2C2C2A] mt-0.5">
              {result.sizeBytes ? `${(result.sizeBytes / 1024).toFixed(0)} KB` : "—"}
            </div>
          </div>
        </div>
      </div>

      {/* Transcript */}
      <div className="bg-white rounded-2xl shadow-sm border border-[#EEECE6] overflow-hidden">
        <button
          onClick={() => setTranscriptOpen((b) => !b)}
          className="w-full flex items-center justify-between px-4 py-3 hover:bg-[#F8F7F4] active:bg-[#F4F2FA]"
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#5A5955] text-[18px]">
              article
            </span>
            <span className="text-[13px] font-medium text-[#2C2C2A]">逐字稿</span>
          </div>
          <span className="material-symbols-outlined text-[#9A9890] text-[20px]">
            {transcriptOpen ? "expand_less" : "expand_more"}
          </span>
        </button>
        {transcriptOpen && (
          <div className="px-4 py-3 border-t border-[#EEECE6] text-[12.5px] text-[#2C2C2A] leading-relaxed whitespace-pre-wrap">
            {result.transcript || (
              <span className="text-[#9A9890] italic">
                （AI 沒聽出對話內容、可能是錄音太短或無聲）
              </span>
            )}
          </div>
        )}
      </div>

      {/* ─── AI 預填區 ─── */}
      <SectionHeader title="AI 自動填入" count={aiFilledCount} tone="ai" />

      <div className="space-y-2.5">
        {/* 客戶需求摘要 */}
        <CardWrap icon="description" label="客戶需求摘要" filled={!!form.customer_summary}>
          <textarea
            value={form.customer_summary}
            onChange={(e) => set("customer_summary", e.target.value)}
            placeholder="AI 沒抓到、可手動填寫⋯"
            rows={3}
            className={inputNormal}
          />
          {originalQuote(result.suggestions.customer_summary?.evidence_quote)}
        </CardWrap>

        {/* 意向級別：star picker */}
        <CardWrap icon="trending_up" label="意向級別" filled={form.intent_level > 0}>
          <StarPicker
            value={form.intent_level}
            onChange={(n) => set("intent_level", n)}
          />
          {originalQuote(result.suggestions.intent_level?.evidence_quote)}
        </CardWrap>

        {/* 購車時機：select */}
        <CardWrap icon="event" label="預期購車時機" filled={!!form.purchase_timing}>
          <select
            value={form.purchase_timing}
            onChange={(e) =>
              set(
                "purchase_timing",
                e.target.value as ReviewedHandcardValues["purchase_timing"],
              )
            }
            className={inputNormal}
          >
            {TIMING_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {originalQuote(result.suggestions.purchase_timing?.evidence_quote)}
        </CardWrap>

        {/* 意向車款：chip + 文字輸入 */}
        <CardWrap
          icon="two_wheeler"
          label="意向車款（逗號分隔）"
          filled={form.intended_models.length > 0}
        >
          <ChipTextInput
            chips={form.intended_models}
            onChange={(arr) => set("intended_models", arr)}
            placeholder="例：Diavel V4, CB1000R"
            chipColor="purple"
          />
          {originalQuote(result.suggestions.intended_models?.evidence_quote)}
        </CardWrap>

        {/* 競品品牌 */}
        <CardWrap
          icon="compare_arrows"
          label="競品品牌"
          filled={!!form.competitor_brand}
        >
          <input
            type="text"
            value={form.competitor_brand}
            onChange={(e) => set("competitor_brand", e.target.value)}
            placeholder="Honda / BMW / Kawasaki ⋯"
            className={inputNormal}
          />
          {originalQuote(result.suggestions.competitor_brand?.evidence_quote)}
        </CardWrap>

        {/* 預算範圍 */}
        <CardWrap icon="payments" label="預算範圍" filled={!!form.budget_range}>
          <input
            type="text"
            value={form.budget_range}
            onChange={(e) => set("budget_range", e.target.value)}
            placeholder="例：100 萬上下"
            className={inputNormal}
          />
          {originalQuote(result.suggestions.budget_range?.evidence_quote)}
        </CardWrap>

        {/* 來店管道：text + 快選 */}
        <CardWrap icon="explore" label="來店管道" filled={!!form.arrival_source}>
          <input
            type="text"
            value={form.arrival_source}
            onChange={(e) => set("arrival_source", e.target.value)}
            placeholder="朋友介紹 / 網路 / 路過 ⋯"
            className={inputNormal}
          />
          <div className="flex flex-wrap gap-1 mt-1.5">
            {ARRIVAL_SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => set("arrival_source", s)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  form.arrival_source === s
                    ? "bg-[#7C3AED] text-white border-[#7C3AED]"
                    : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#7C3AED]"
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          {originalQuote(result.suggestions.arrival_source?.evidence_quote)}
        </CardWrap>

        {/* 追蹤日期 */}
        <CardWrap
          icon="schedule"
          label="下次追蹤日期"
          filled={!!form.followup_date}
        >
          <input
            type="date"
            value={form.followup_date}
            onChange={(e) => set("followup_date", e.target.value)}
            className={inputNormal}
          />
          {originalQuote(result.suggestions.followup_date?.evidence_quote)}
        </CardWrap>
      </div>

      {/* ─── 業務手填區 ─── */}
      <SectionHeader title="業務手動填寫" count={4} tone="manual" />

      <div className="space-y-2.5">
        <CardWrap icon="person" label="客戶姓名" filled={!!form.customer_name}>
          <input
            type="text"
            value={form.customer_name}
            onChange={(e) => set("customer_name", e.target.value)}
            placeholder="王小明"
            className={inputNormal}
          />
        </CardWrap>

        <CardWrap icon="call" label="客戶電話" filled={!!form.customer_phone}>
          <input
            type="tel"
            value={form.customer_phone}
            onChange={(e) => set("customer_phone", e.target.value)}
            placeholder="0912-345-678"
            className={inputNormal}
            inputMode="tel"
          />
        </CardWrap>

        <CardWrap icon="badge" label="來客身份" filled={!!form.customer_identity}>
          <select
            value={form.customer_identity}
            onChange={(e) =>
              set(
                "customer_identity",
                e.target.value as ReviewedHandcardValues["customer_identity"],
              )
            }
            className={inputNormal}
          >
            {IDENTITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </CardWrap>

        <CardWrap
          icon="label"
          label="觀察標籤（逗號分隔）"
          filled={form.observation_tags.length > 0}
        >
          <ChipTextInput
            chips={form.observation_tags}
            onChange={(arr) => set("observation_tags", arr)}
            placeholder="例：注重外觀, 好溝通, 急著買"
            chipColor="amber"
          />
        </CardWrap>
      </div>

      {/* Banner */}
      {banner && (
        <div
          className={`fixed bottom-20 left-4 right-4 max-w-md mx-auto px-3 py-2 rounded-lg text-[12.5px] z-40 shadow-lg ${
            banner.ok
              ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
              : "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          }`}
        >
          {banner.msg}
        </div>
      )}

      {/* Sticky bottom */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-[#EEECE6] px-4 py-3 z-30">
        <div className="max-w-md mx-auto flex items-center gap-2">
          <button
            onClick={onClose}
            disabled={isPending}
            className="flex-1 h-[44px] rounded-full bg-white border border-[#D5D3CB] text-[#5A5955] text-[13px] font-medium hover:border-[#9A9890] active:bg-[#F8F7F4] disabled:opacity-50"
          >
            返回首頁
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="flex-1 h-[44px] rounded-full bg-gradient-to-r from-[#7C3AED] to-[#CC0000] text-white text-[13px] font-semibold shadow-lg active:scale-95 transition-transform disabled:opacity-60 disabled:active:scale-100"
          >
            {isPending ? (
              "儲存中⋯"
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px] align-middle mr-1">
                  check
                </span>
                確認儲存
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────── helpers ───────────────────────

function countAiFilled(form: ReviewedHandcardValues): number {
  let n = 0;
  if (form.customer_summary) n++;
  if (form.intent_level > 0) n++;
  if (form.purchase_timing) n++;
  if (form.intended_models.length > 0) n++;
  if (form.competitor_brand) n++;
  if (form.budget_range) n++;
  if (form.arrival_source) n++;
  if (form.followup_date) n++;
  return n;
}

function SectionHeader({
  title,
  count,
  tone,
}: {
  title: string;
  count: number;
  tone: "ai" | "manual";
}) {
  return (
    <div className="flex items-center gap-2 px-1 pt-2">
      <span className="text-[11px] text-[#9A9890] uppercase tracking-wider">
        {title}
      </span>
      <div className="flex-1 h-px bg-[#EEECE6]" />
      <span
        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
          tone === "ai"
            ? "bg-[#F4F2FA] text-[#7C3AED]"
            : "bg-[#F2F2F2] text-[#6B6A68]"
        }`}
      >
        {count} 項{tone === "ai" ? "" : ""}
      </span>
    </div>
  );
}

function CardWrap({
  icon,
  label,
  filled,
  children,
}: {
  icon: string;
  label: string;
  filled: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`bg-white rounded-xl shadow-sm border p-3.5 transition-colors ${
        filled ? "border-[#7C3AED]/30" : "border-dashed border-[#D5D3CB]"
      }`}
    >
      <div className={labelStyle}>
        <span className="material-symbols-outlined text-[16px] text-[#9A9890]">
          {icon}
        </span>
        {label}
      </div>
      {children}
    </div>
  );
}

function originalQuote(quote: string | undefined) {
  if (!quote) return null;
  return (
    <div className="mt-2 text-[11px] text-[#5A5955] italic leading-snug border-l-2 border-[#7C3AED]/30 pl-2">
      ⤷ &ldquo;{quote}&rdquo;
    </div>
  );
}

function StarPicker({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(value === i ? 0 : i)}
            className="text-[24px] leading-none active:scale-90 transition-transform"
            aria-label={`設為 ${i} 級`}
          >
            <span className={i <= value ? "text-[#F59E0B]" : "text-[#E5E5E0]"}>
              ★
            </span>
          </button>
        ))}
      </div>
      <span className="text-[12px] text-[#5A5955] font-mono">
        {value > 0 ? `${value}/5` : "未設"}
      </span>
    </div>
  );
}

function ChipTextInput({
  chips,
  onChange,
  placeholder,
  chipColor,
}: {
  chips: string[];
  onChange: (arr: string[]) => void;
  placeholder: string;
  chipColor: "purple" | "amber";
}) {
  const [draft, setDraft] = useState("");
  const chipClass =
    chipColor === "purple"
      ? "bg-[#F4F2FA] text-[#7C3AED]"
      : "bg-[#FDF3E3] text-[#854F0B]";

  function commit() {
    const next = draft
      .split(/[,，]/g)
      .map((s) => s.trim())
      .filter(Boolean);
    if (next.length === 0) return;
    const merged = [...chips];
    for (const n of next) {
      if (!merged.includes(n)) merged.push(n);
    }
    onChange(merged);
    setDraft("");
  }

  return (
    <div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {chips.map((c, i) => (
            <span
              key={i}
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[12px] font-medium ${chipClass}`}
            >
              {c}
              <button
                type="button"
                onClick={() => onChange(chips.filter((_, j) => j !== i))}
                className="hover:opacity-60 leading-none"
                aria-label={`移除 ${c}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className={inputNormal}
        />
      </div>
    </div>
  );
}
