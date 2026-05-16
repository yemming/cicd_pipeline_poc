"use client";

/**
 * Handcard 預覽 Modal — 彙整三階段所有資料的唯讀總覽。
 *
 * 規格：RS01_電子手卡_v8.html L1235+（modal-preview）
 */

import {
  IDENTITY_LABELS,
  type HandcardTiming,
} from "@/domain/handcard-suggestions";
import { useHandcard } from "@/lib/handcard-store";

export function HandcardPreviewModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { state } = useHandcard();
  if (!open) return null;

  const identityLabel = state.identity ? IDENTITY_LABELS[state.identity] : "—";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      data-testid="handcard-preview-modal"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-[#EEECE6] flex items-center justify-between bg-[#F8F7F4]">
          <h2 className="text-[15px] font-semibold text-[#2C2C2A]">👁 手卡預覽</h2>
          <button
            onClick={onClose}
            className="h-[28px] px-3 rounded text-[12px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
          >
            關閉
          </button>
        </header>

        <div className="p-5 space-y-3 text-[12.5px]">
          <Block title="STEP 0 · 來客身份">
            <Kv label="身份類型" value={identityLabel} />
            <Kv label="手卡編號" value={state.cardNo || "—"} mono />
            <Kv label="接待 RS" value={state.receptionStaff || "—"} />
          </Block>

          <Block title="STEP 1-2 · 客戶基本 / 意向車款">
            <Kv label="客戶姓名" value={state.customerName || "—"} />
            <Kv label="電話" value={state.customerPhone || "—"} mono />
            <Kv
              label="意向車款"
              value={state.intendedModels.length ? state.intendedModels.join("、") : "—"}
            />
          </Block>

          <Block title="STEP 3 · 購買時機 × HABC">
            <Kv label="購買時機" value={timingLabel(state.timing)} />
            <Kv label="意向強度" value={state.intent ? `${state.intent} / 5` : "—"} />
            <Kv label="試駕狀態" value={trialLabel(state.trialStatus)} />
            <Kv
              label="HABC 級別"
              value={
                state.habcGrade
                  ? `${state.habcGrade}${state.habcManualOverride ? "（RS 覆蓋）" : "（系統建議）"}`
                  : "—"
              }
            />
          </Block>

          <Block title="STEP 4-5 · 試駕 / 鑑價回寫">
            <Kv
              label="試駕回寫"
              value={
                state.rs02WriteBack
                  ? `${state.rs02WriteBack.bike} · ${state.rs02WriteBack.duration} · ${state.rs02WriteBack.feedback}`
                  : "—"
              }
            />
            <Kv
              label="鑑價回寫"
              value={
                state.rs06WriteBack
                  ? `${state.rs06WriteBack.plate} · ${state.rs06WriteBack.estimatedPrice.toLocaleString()} 元`
                  : "—"
              }
            />
          </Block>

          <Block title="STEP 6-8 · 報價 / 標籤 / 備註">
            <Kv
              label="報價金額"
              value={state.quotedAmount ? `NT$ ${state.quotedAmount.toLocaleString()}` : "—"}
            />
            <Kv label="報價備註" value={state.quoteRemark || "—"} />
            <Kv
              label="客戶標籤"
              value={state.tags.length ? state.tags.map((t) => t.name).join("、") : "—"}
            />
            <Kv label="競品" value={state.competitorBrand ? `${state.competitorBrand} ${state.competitorModel}` : "—"} />
            <Kv label="備註" value={state.notes || "—"} />
          </Block>
        </div>
      </div>
    </div>
  );
}

function timingLabel(t: HandcardTiming | null): string {
  if (!t) return "—";
  return { now: "立即決策", "3m": "3 個月內", "6m": "半年左右", explore: "純粹了解" }[t];
}

function trialLabel(t: string): string {
  return (
    { none: "尚未試駕", "done-today": "本次已試駕", "done-before": "之前已試駕", refused: "拒絕試駕" } as Record<string, string>
  )[t] ?? "—";
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-3 py-2 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[12.5px] font-semibold text-[#2C2C2A]">{title}</span>
      </header>
      <div className="px-3 py-2.5 grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1.5">
        {children}
      </div>
    </section>
  );
}

function Kv({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2 text-[12.5px] leading-relaxed">
      <span className="text-[11px] text-[#9A9890] shrink-0 w-20 pt-0.5">{label}</span>
      <span className={`text-[#2C2C2A] flex-1 break-words ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}
