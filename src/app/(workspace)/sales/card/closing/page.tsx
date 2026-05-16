"use client";

/**
 * 電子手卡 v8 — closing（成交確認 / 第三階段）
 *
 * 規格：RS01_電子手卡_v8.html · STEP 6-8
 *   - STEP 6：報價與追蹤
 *   - STEP 7：客戶標籤系統（reuse A6 customer_tags helper）
 *   - STEP 8：備註與競品記錄
 *   - 黃金時刻 Modal（試駕完成後自動觸發）
 */

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { CardStepBar } from "@/components/card-step-bar";
import { HandcardV8SubBar } from "@/components/handcard/handcard-v8-sub-bar";
import { HandcardPreviewModal } from "@/components/handcard/handcard-preview-modal";
import { getCustomerTagsPageData } from "@/domain/customer-tags";
import type { OfficialTag, PersonalTag } from "@/domain/customer-tags";
import { useHandcard, type HandcardSelectedTag } from "@/lib/handcard-store";

const COMPETITOR_BRANDS = [
  "BMW Motorrad",
  "KTM",
  "Aprilia",
  "Honda",
  "Kawasaki",
  "Yamaha",
  "Triumph",
  "Harley-Davidson",
];

const TAG_COLOR_TO_BG: Record<HandcardSelectedTag["color"], { bg: string; text: string; border: string }> = {
  red: { bg: "#FDECEA", text: "#CC0000", border: "#F5AEAD" },
  yellow: { bg: "#FDF3E3", text: "#854F0B", border: "#F5D6A8" },
  green: { bg: "#EAF3DE", text: "#3B6D11", border: "#C5DC9F" },
  blue: { bg: "#EAF4FB", text: "#185FA5", border: "#B6D7EB" },
};

export default function ClosingPage() {
  const router = useRouter();
  const { state, patch, reset } = useHandcard();
  const [previewOpen, setPreviewOpen] = useState(false);
  const [goldenOpen, setGoldenOpen] = useState(false);
  const goldenShownRef = useRef(false);

  // STEP 7 — 撈 customer_tags（reuse A6 helper）
  const [officialTags, setOfficialTags] = useState<OfficialTag[]>([]);
  const [personalTags, setPersonalTags] = useState<PersonalTag[]>([]);
  const [tagsLoading, setTagsLoading] = useState(true);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const [customTagInput, setCustomTagInput] = useState("");
  const [customTagColor, setCustomTagColor] = useState<HandcardSelectedTag["color"]>("blue");

  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "電子手卡 v8 · closing" },
    ],
  });

  useEffect(() => {
    let cancelled = false;
    getCustomerTagsPageData()
      .then((data) => {
        if (cancelled) return;
         
        setOfficialTags(data.officialTags);
         
        setPersonalTags(data.myTags);
         
        setTagsLoading(false);
      })
      .catch((err: Error) => {
        if (cancelled) return;
         
        setTagsError(err.message || "標籤載入失敗");
         
        setTagsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 黃金時刻 — 試駕完成且尚未顯示過
  useEffect(() => {
    if (state.rs02WriteBack && !state.goldenMomentSeen && !goldenShownRef.current) {
      goldenShownRef.current = true;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGoldenOpen(true);
    }
  }, [state.rs02WriteBack, state.goldenMomentSeen]);

  const isTagSelected = (id: string | undefined, name: string) =>
    state.tags.some((t) => (id ? t.id === id : t.name === name));

  const toggleOfficialTag = (tag: OfficialTag) => {
    const exists = state.tags.find((t) => t.id === tag.id);
    if (exists) {
      patch({ tags: state.tags.filter((t) => t.id !== tag.id) });
    } else {
      patch({
        tags: [
          ...state.tags,
          {
            id: tag.id,
            name: `${tag.emoji ?? ""} ${tag.label}`.trim(),
            color: tag.color as HandcardSelectedTag["color"],
            source: "official",
          },
        ],
      });
    }
  };

  const togglePersonalTag = (tag: PersonalTag) => {
    const exists = state.tags.find((t) => t.id === tag.id);
    if (exists) {
      patch({ tags: state.tags.filter((t) => t.id !== tag.id) });
    } else {
      patch({
        tags: [
          ...state.tags,
          {
            id: tag.id,
            name: tag.name,
            color: tag.color as HandcardSelectedTag["color"],
            source: "personal",
          },
        ],
      });
    }
  };

  const addCustomTag = () => {
    const name = customTagInput.trim();
    if (!name) return;
    const emojiMap = { red: "🔴", yellow: "🟡", green: "🟢", blue: "🔵" } as const;
    patch({
      tags: [
        ...state.tags,
        {
          name: `${emojiMap[customTagColor]} ${name}（自訂）`,
          color: customTagColor,
          source: "custom",
        },
      ],
    });
    setCustomTagInput("");
  };

  const removeTag = (index: number) => {
    patch({ tags: state.tags.filter((_, i) => i !== index) });
  };

  const closeGolden = () => {
    setGoldenOpen(false);
    patch({ goldenMomentSeen: true });
  };

  const acceptGoldenQuote = () => {
    closeGolden();
    // 預填一個 demo 報價
    if (!state.quotedAmount) {
      patch({ quotedAmount: 1688000 });
    }
  };

  const finishHandcard = () => {
    // 結案：保留 store 還是清空？這版先 reset，避免下次帶入殘留。
    reset();
    router.push("/sales/card/record");
  };

  return (
    <div className="-m-4 md:-m-8 bg-[#F8F7F4] min-h-[calc(100dvh-4rem)] flex flex-col">
      <CardStepBar currentStep={3} />
      <HandcardV8SubBar currentStage={4} />

      <main className="flex-1 pb-28">
        <div className="max-w-5xl mx-auto px-6 py-5 space-y-3">
          <header className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
              客戶接待手卡 v8 — 第三階段（試駕報價 / 成交）
            </h1>
            <span
              className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium"
              data-testid="handcard-sprint-chip"
            >
              銷售 · RS01-v8
            </span>
            <span className="text-[12px] text-[#9A9890]">
              報價 → 客戶標籤 → 競品備註
            </span>
            <button
              onClick={() => setPreviewOpen(true)}
              className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              👁 預覽手卡
            </button>
          </header>

          {/* 黃金時刻摘要橫幅 */}
          {state.rs02WriteBack && (
            <section
              className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-4 py-3 flex items-start gap-3"
              data-testid="handcard-golden-banner"
            >
              <span className="text-2xl">⭐</span>
              <div className="flex-1">
                <div className="text-[13px] font-semibold text-[#CC0000]">
                  黃金時刻 — 試駕已完成，客戶熱情最高
                </div>
                <div className="text-[12px] text-[#5A5955] mt-0.5">
                  趁機開立報價單（{state.rs02WriteBack.bike}），避免客戶離店後冷卻。
                </div>
              </div>
            </section>
          )}

          {/* STEP 6 — 報價與追蹤 */}
          <section
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="handcard-step-6"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ STEP 6 · 報價與追蹤
              </span>
              <span className="ml-auto px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
                Step 6
              </span>
            </header>
            <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="報價金額（NTD）">
                <input
                  type="text"
                  inputMode="numeric"
                  value={state.quotedAmount?.toLocaleString() ?? ""}
                  onChange={(e) => {
                    const n = Number(e.target.value.replace(/[^\d]/g, ""));
                    patch({ quotedAmount: Number.isFinite(n) && n > 0 ? n : null });
                  }}
                  placeholder="1,688,000"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none"
                />
              </Field>
              <Field label="改裝 / 配件摘要">
                <input
                  type="text"
                  placeholder="例：Akrapovič 排氣管 + 碳纖維外蓋"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="報價備註">
                  <textarea
                    value={state.quoteRemark}
                    onChange={(e) => patch({ quoteRemark: e.target.value })}
                    placeholder="付款方式 / 預計交車日期 / 客戶顧慮⋯"
                    className="min-h-[60px] border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] bg-white focus:border-[#185FA5] outline-none resize-none"
                  />
                </Field>
              </div>
            </div>
          </section>

          {/* STEP 7 — 客戶標籤系統 */}
          <section
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="handcard-step-7"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ STEP 7 · 客戶標籤
              </span>
              <span className="text-[11px] text-[#9A9890]">
                四色快選 · 官方標籤庫由主管維護
              </span>
              <span className="ml-auto px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
                Step 7
              </span>
            </header>
            <div className="px-4 py-4 space-y-4">
              {/* 已選 */}
              <div>
                <div className="text-[11px] text-[#9A9890] font-medium mb-1.5">已貼標籤</div>
                <div className="flex flex-wrap gap-1.5 min-h-[28px]" data-testid="handcard-selected-tags">
                  {state.tags.length === 0 ? (
                    <span className="text-[11.5px] text-[#9A9890]">尚未貼標 — 從下方選擇</span>
                  ) : (
                    state.tags.map((tag, idx) => {
                      const c = TAG_COLOR_TO_BG[tag.color];
                      return (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11.5px] border"
                          style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                        >
                          {tag.name}
                          <button
                            onClick={() => removeTag(idx)}
                            className="text-[12px] opacity-70 hover:opacity-100"
                            aria-label="移除標籤"
                          >
                            ✕
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
              </div>

              {/* 官方 */}
              <div>
                <div className="text-[11px] text-[#9A9890] font-medium mb-1.5">
                  官方標籤庫（{officialTags.length}）
                </div>
                {tagsLoading ? (
                  <div className="text-[11.5px] text-[#9A9890]">載入中⋯</div>
                ) : tagsError ? (
                  <div className="text-[11.5px] text-[#CC0000]">{tagsError}</div>
                ) : officialTags.length === 0 ? (
                  <div className="text-[11.5px] text-[#9A9890]">無資料</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {officialTags.map((t) => {
                      const c = TAG_COLOR_TO_BG[t.color as HandcardSelectedTag["color"]] ?? TAG_COLOR_TO_BG.blue;
                      const active = isTagSelected(t.id, t.label);
                      return (
                        <button
                          key={t.id}
                          onClick={() => toggleOfficialTag(t)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] border ${
                            active ? "ring-2 ring-[#1A3A5C]" : ""
                          }`}
                          style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                        >
                          {t.emoji} {t.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 個人 */}
              {personalTags.length > 0 && (
                <div>
                  <div className="text-[11px] text-[#9A9890] font-medium mb-1.5">
                    RS 自訂標籤（{personalTags.length}）
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {personalTags.map((t) => {
                      const c = TAG_COLOR_TO_BG[t.color as HandcardSelectedTag["color"]] ?? TAG_COLOR_TO_BG.blue;
                      const active = isTagSelected(t.id, t.name);
                      return (
                        <button
                          key={t.id}
                          onClick={() => togglePersonalTag(t)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11.5px] border ${
                            active ? "ring-2 ring-[#1A3A5C]" : ""
                          }`}
                          style={{ backgroundColor: c.bg, color: c.text, borderColor: c.border }}
                        >
                          {t.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 新增自訂 */}
              <div className="border-t border-[#EEECE6] pt-3">
                <div className="text-[11px] text-[#9A9890] font-medium mb-1.5">
                  新增自訂標籤（僅本卡使用，主管可升為官方）
                </div>
                <div className="flex gap-1.5 flex-wrap items-center">
                  <input
                    type="text"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    placeholder="輸入自訂標籤名稱..."
                    className="flex-1 min-w-[180px] h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none"
                  />
                  <select
                    value={customTagColor}
                    onChange={(e) => setCustomTagColor(e.target.value as HandcardSelectedTag["color"])}
                    className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
                  >
                    <option value="red">🔴 紅</option>
                    <option value="yellow">🟡 黃</option>
                    <option value="green">🟢 綠</option>
                    <option value="blue">🔵 藍</option>
                  </select>
                  <button
                    onClick={addCustomTag}
                    disabled={!customTagInput.trim()}
                    className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
                  >
                    + 新增
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* STEP 8 — 備註與競品 */}
          <section
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="handcard-step-8"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ STEP 8 · 備註與競品記錄
              </span>
              <span className="ml-auto px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
                Step 8
              </span>
            </header>
            <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="競品品牌">
                <select
                  value={state.competitorBrand}
                  onChange={(e) => patch({ competitorBrand: e.target.value })}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white"
                >
                  <option value="">未提及</option>
                  {COMPETITOR_BRANDS.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </Field>
              <Field label="競品車型">
                <input
                  type="text"
                  value={state.competitorModel}
                  onChange={(e) => patch({ competitorModel: e.target.value })}
                  placeholder="例：S 1000 RR"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-white focus:border-[#185FA5] outline-none"
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="客戶備註 / 後續追蹤事項">
                  <textarea
                    value={state.notes}
                    onChange={(e) => patch({ notes: e.target.value })}
                    placeholder="關鍵顧慮 / 後續追蹤事項⋯"
                    className="min-h-[80px] border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] bg-white focus:border-[#185FA5] outline-none resize-none"
                  />
                </Field>
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-[#EEECE6] px-12 py-3 flex justify-between items-center">
        <Link
          href="/sales/card/consultant"
          className="h-[30px] px-3.5 inline-flex items-center rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
        >
          ← 上一步
        </Link>
        <button
          onClick={finishHandcard}
          className="h-[34px] px-5 rounded-full text-[12.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742]"
          data-testid="handcard-closing-finish"
        >
          完成手卡並前往結案 →
        </button>
      </footer>

      <HandcardPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />

      {/* 黃金時刻 Modal */}
      {goldenOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          data-testid="handcard-golden-modal"
          onClick={closeGolden}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-5 py-4 bg-gradient-to-br from-[#FDECEA] to-[#FDF3E3] flex items-center gap-3">
              <span className="text-3xl">⭐</span>
              <div>
                <div className="text-[15px] font-semibold text-[#CC0000]">
                  黃金時刻！立即開立報價單
                </div>
                <div className="text-[11.5px] text-[#854F0B] mt-0.5">
                  把握客戶試駕後熱情最高點
                </div>
              </div>
            </header>
            <div className="px-5 py-4 text-[12.5px] text-[#2C2C2A] leading-relaxed">
              客戶試駕滿意度高（{state.rs02WriteBack?.feedback ?? "—"}）。<br />
              現在是開立報價的最佳時機，避免客戶離店後冷卻。
            </div>
            <footer className="px-5 py-3 bg-[#F8F7F4] border-t border-[#EEECE6] flex justify-end gap-2">
              <button
                onClick={closeGolden}
                className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                稍後處理
              </button>
              <button
                onClick={acceptGoldenQuote}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#a30000]"
              >
                立即開立報價單 →
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      {children}
    </div>
  );
}
