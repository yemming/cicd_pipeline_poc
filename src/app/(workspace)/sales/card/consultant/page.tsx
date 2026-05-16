"use client";

/**
 * 電子手卡 v8 — consultant（意向諮詢 / 第二階段）
 *
 * 規格：RS01_電子手卡_v8.html · STEP 3-5
 *   - STEP 3：購買時機 × HABC 系統輔助建議（用 suggestHabc helper）
 *   - STEP 4：試乘試駕跳轉（RS02）+ 試駕回寫展示
 *   - STEP 5：中古車鑑價跳轉（RS06）+ 回寫展示
 *
 * HABC 算法走 @/domain/handcard-suggestions · suggestHabc()
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { CardStepBar } from "@/components/card-step-bar";
import { HandcardV8SubBar } from "@/components/handcard/handcard-v8-sub-bar";
import { HandcardPreviewModal } from "@/components/handcard/handcard-preview-modal";
import {
  INTENT_OPTIONS,
  TIMING_OPTIONS,
  TRIAL_STATUS_OPTIONS,
  suggestHabc,
  type HabcGrade,
  type HandcardIntent,
  type HandcardTiming,
  type HandcardTrialStatus,
} from "@/domain/handcard-suggestions";
import { useHandcard } from "@/lib/handcard-store";

const GRADE_COLORS: Record<HabcGrade, { bg: string; text: string }> = {
  H: { bg: "#FDECEA", text: "#CC0000" },
  A: { bg: "#FDF3E3", text: "#854F0B" },
  B: { bg: "#EAF4FB", text: "#185FA5" },
  C: { bg: "#F2F2F2", text: "#6B6A68" },
};

export default function ConsultantPage() {
  const router = useRouter();
  const { state, patch } = useHandcard();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [mockingTrial, setMockingTrial] = useState(false);
  const [mockingEval, setMockingEval] = useState(false);

  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "電子手卡 v8 · consultant" },
    ],
  });

  const systemSuggestion = useMemo(
    () =>
      suggestHabc({
        timing: state.timing,
        intent: state.intent,
        trialStatus: state.trialStatus,
      }),
    [state.timing, state.intent, state.trialStatus],
  );

  // 若尚未手動覆蓋，把系統建議落地到 store
  const effectiveGrade: HabcGrade | null = state.habcManualOverride
    ? state.habcGrade
    : (systemSuggestion?.grade ?? null);

  const setTiming = (t: HandcardTiming) => {
    patch({
      timing: state.timing === t ? null : t,
      habcManualOverride: false,
    });
  };

  const setIntent = (i: HandcardIntent) => {
    patch({
      intent: state.intent === i ? null : i,
      habcManualOverride: false,
    });
  };

  const setTrialStatus = (t: HandcardTrialStatus) => {
    patch({ trialStatus: t, habcManualOverride: false });
  };

  const overrideGrade = (g: HabcGrade) => {
    patch({ habcGrade: g, habcManualOverride: true });
  };

  // STEP 4：模擬「跳 RS02 完成試駕」回寫
  const mockTrialReturn = async () => {
    setMockingTrial(true);
    await new Promise((r) => setTimeout(r, 600));
    patch({
      rs02WriteBack: {
        bike: state.intendedModels[0] ?? "Panigale V4",
        startTime: "14:45",
        duration: "25 分鐘",
        feedback: "非常滿意",
      },
      trialStatus: "done-today",
      goldenMomentSeen: false,
    });
    setMockingTrial(false);
  };

  // STEP 5：模擬「跳 RS06 完成鑑價」回寫
  const mockEvaluationReturn = async () => {
    setMockingEval(true);
    await new Promise((r) => setTimeout(r, 600));
    patch({
      rs06WriteBack: {
        plate: "ABC-1234",
        estimatedPrice: 380000,
        note: "里程偏高，建議報價區間 36-40 萬",
      },
    });
    setMockingEval(false);
  };

  return (
    <div className="-m-4 md:-m-8 bg-[#F8F7F4] min-h-[calc(100dvh-4rem)] flex flex-col">
      <CardStepBar currentStep={2} />
      <HandcardV8SubBar currentStage={3} />

      <main className="flex-1 pb-28">
        <div className="max-w-5xl mx-auto px-6 py-5 space-y-3">
          <header className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
              客戶接待手卡 v8 — 第二階段（意向諮詢）
            </h1>
            <span
              className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium"
              data-testid="handcard-sprint-chip"
            >
              銷售 · RS01-v8
            </span>
            <span className="text-[12px] text-[#9A9890]">
              購買時機 × HABC × 試駕 / 鑑價跳轉
            </span>
            <button
              onClick={() => setPreviewOpen(true)}
              className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              👁 預覽手卡
            </button>
          </header>

          {/* STEP 3 — 購買時機 × HABC */}
          <section
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="handcard-step-3"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ STEP 3 · 購買時機 × HABC 系統輔助建議
              </span>
              <span className="ml-auto px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
                Step 3
              </span>
            </header>
            <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-[11px] text-[#9A9890] font-medium mb-2">購買時機</div>
                <div className="grid grid-cols-2 gap-2">
                  {TIMING_OPTIONS.map((t) => {
                    const active = state.timing === t.key;
                    return (
                      <button
                        key={t.key}
                        onClick={() => setTiming(t.key)}
                        data-testid={`timing-${t.key}`}
                        className={`p-2.5 rounded-lg border-2 text-left transition-all ${
                          active
                            ? "border-[#1A3A5C] bg-[#EAF4FB]"
                            : "border-[#EEECE6] bg-white hover:border-[#9A9890]"
                        }`}
                      >
                        <div className="text-[12.5px] font-semibold text-[#2C2C2A]">
                          {t.emoji} {t.title}
                        </div>
                        <div className="text-[11px] text-[#9A9890] mt-0.5">{t.sub}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <div className="text-[11px] text-[#9A9890] font-medium mb-2">意向強度評估</div>
                <div className="flex gap-1.5 flex-wrap">
                  {INTENT_OPTIONS.map((i) => {
                    const active = state.intent === i.key;
                    return (
                      <button
                        key={i.key}
                        onClick={() => setIntent(i.key)}
                        data-testid={`intent-${i.key}`}
                        className={`px-2.5 py-1.5 rounded-md text-[11.5px] font-medium border-2 transition-all min-w-[58px] text-center ${
                          active
                            ? "border-[#1A3A5C] bg-[#EAF4FB] text-[#1A3A5C]"
                            : "border-[#EEECE6] bg-white text-[#5A5955] hover:border-[#9A9890]"
                        }`}
                      >
                        <div className="text-base">{i.emoji}</div>
                        <div>{i.label}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-[#9A9890] font-medium mt-3 mb-1.5">
                  試駕狀態
                </div>
                <select
                  value={state.trialStatus}
                  onChange={(e) => setTrialStatus(e.target.value as HandcardTrialStatus)}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white w-full focus:border-[#185FA5] outline-none"
                >
                  {TRIAL_STATUS_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* HABC 系統建議 / placeholder */}
            <div className="px-4 pb-4">
              {systemSuggestion ? (
                <div
                  className="rounded-lg border-2 px-3 py-3 flex items-start gap-3"
                  style={{
                    borderColor: GRADE_COLORS[systemSuggestion.grade].text,
                    backgroundColor: GRADE_COLORS[systemSuggestion.grade].bg,
                  }}
                  data-testid="habc-suggest-block"
                >
                  <div className="text-2xl shrink-0">🤖</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="inline-flex items-center justify-center w-9 h-9 rounded-md text-[16px] font-bold"
                        style={{
                          backgroundColor: GRADE_COLORS[systemSuggestion.grade].text,
                          color: "white",
                        }}
                        data-testid="habc-grade-badge"
                      >
                        {systemSuggestion.grade}
                      </span>
                      <span className="text-[11.5px] text-[#5A5955] font-medium">
                        系統建議 — 依購買時機 × 試駕狀態
                        {state.habcManualOverride && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-white border border-[#D5D3CB] text-[10.5px]">
                            RS 已覆蓋為 {effectiveGrade}
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="text-[12px] text-[#2C2C2A] leading-relaxed">
                      {systemSuggestion.reason}
                    </div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="text-[11px] text-[#9A9890]">RS 確認或手動覆蓋：</span>
                      {(["H", "A", "B", "C"] as const).map((g) => {
                        const active = effectiveGrade === g;
                        return (
                          <button
                            key={g}
                            onClick={() => overrideGrade(g)}
                            data-testid={`habc-override-${g}`}
                            className={`w-8 h-8 rounded-md text-[13px] font-bold border-2 ${
                              active
                                ? "border-[#1A3A5C] bg-white text-[#1A3A5C]"
                                : "border-[#EEECE6] bg-white text-[#5A5955] hover:border-[#9A9890]"
                            }`}
                          >
                            {g}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-2.5 bg-[#F8F7F4] border border-dashed border-[#D5D3CB] rounded-md text-[12px] text-[#9A9890] text-center">
                  ↑ 選擇購買時機後，系統將自動推算 HABC 建議級別
                </div>
              )}
            </div>
          </section>

          {/* STEP 4 — 試乘試駕跳轉 RS02 */}
          <section
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="handcard-step-4"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ STEP 4 · 試乘試駕（跳轉 RS02 + 回寫）
              </span>
              <span className="ml-auto px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
                Step 4
              </span>
            </header>
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  href="/sales/showroom/test-ride"
                  className="inline-flex items-center gap-2 h-[34px] px-4 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                >
                  🏁 前往試乘試駕 RS02
                </Link>
                <button
                  onClick={mockTrialReturn}
                  disabled={mockingTrial}
                  data-testid="handcard-mock-trial"
                  className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
                >
                  {mockingTrial ? "回寫中⋯" : "模擬完成試駕回寫（demo）"}
                </button>
                <span className="text-[11.5px] text-[#9A9890]">
                  ⚡ 黃金時刻：試駕結束後立即開立報價單，把握客戶熱情最高峰
                </span>
              </div>

              {state.rs02WriteBack && (
                <div
                  className="bg-[#EAF3DE] border border-[#C5DC9F] rounded-lg px-3 py-3 text-[12.5px] text-[#3B6D11]"
                  data-testid="handcard-rs02-result"
                >
                  <div className="font-semibold mb-1.5">
                    🏁 試駕回寫結果（唯讀，由 RS02 寫入）
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[11.5px]">
                    <div><b>試駕車款：</b>{state.rs02WriteBack.bike}</div>
                    <div><b>試駕時間：</b>{state.rs02WriteBack.startTime}</div>
                    <div><b>時長：</b>{state.rs02WriteBack.duration}</div>
                    <div><b>客戶反應：</b>{state.rs02WriteBack.feedback}</div>
                  </div>
                  <div className="text-[10.5px] mt-1.5 opacity-70">
                    ← 資料來源：RS02_試乘試駕 · demo 寫入
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* STEP 5 — 中古車鑑價跳轉 RS06 */}
          <section
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="handcard-step-5"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ STEP 5 · 中古車評估鑑價（跳轉 RS06 + 回寫）
              </span>
              <span className="ml-auto px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
                Step 5
              </span>
            </header>
            <div className="px-4 py-4 space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <Link
                  href="/usedcar/evaluation"
                  className="inline-flex items-center gap-2 h-[34px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                >
                  💰 前往中古車鑑價 RS06
                </Link>
                <button
                  onClick={mockEvaluationReturn}
                  disabled={mockingEval}
                  data-testid="handcard-mock-eval"
                  className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-60"
                >
                  {mockingEval ? "回寫中⋯" : "模擬完成鑑價回寫（demo）"}
                </button>
                <span className="text-[11.5px] text-[#9A9890]">
                  鑑價完成後將回寫至此卡，可作為換購折抵試算
                </span>
              </div>

              {state.rs06WriteBack && (
                <div
                  className="bg-[#FDF3E3] border border-[#F5D6A8] rounded-lg px-3 py-3 text-[12.5px] text-[#854F0B]"
                  data-testid="handcard-rs06-result"
                >
                  <div className="font-semibold mb-1.5">
                    💰 鑑價回寫結果（唯讀，由 RS06 寫入）
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11.5px]">
                    <div><b>車牌：</b>{state.rs06WriteBack.plate}</div>
                    <div><b>估價：</b>NT$ {state.rs06WriteBack.estimatedPrice.toLocaleString()}</div>
                    <div className="md:col-span-1"><b>備註：</b>{state.rs06WriteBack.note}</div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-[#EEECE6] px-12 py-3 flex justify-between items-center">
        <Link
          href="/sales/card/counter"
          className="h-[30px] px-3.5 inline-flex items-center rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          ← 上一步
        </Link>
        <button
          onClick={() => router.push("/sales/card/closing")}
          className="h-[34px] px-5 rounded-full text-[12.5px] font-semibold bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
          data-testid="handcard-consultant-next"
        >
          下一步：試駕報價 →
        </button>
      </footer>

      <HandcardPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />
    </div>
  );
}
