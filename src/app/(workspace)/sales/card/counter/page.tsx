"use client";

/**
 * 電子手卡 v8 — counter（接待 / 第一階段）
 *
 * 規格：docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS01_電子手卡_v8.html
 * 提案：docs/proposals/feature-handcard-v8.md（Ming 已核四題建議答案）
 *
 * 落在這頁的 v8 sub-step：
 *   - STEP 0：來客身份選擇（4 卡）
 *   - STEP 1：基本接待資訊（到店 / RS / 客戶資料）
 *   - STEP 2：意向車款（多選）
 *
 * 跨頁 state：via <HandcardProvider>（src/lib/handcard-store.tsx）
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import { CardStepBar } from "@/components/card-step-bar";
import { HandcardV8SubBar } from "@/components/handcard/handcard-v8-sub-bar";
import { HandcardPreviewModal } from "@/components/handcard/handcard-preview-modal";
import { getCurrentUserProfile } from "@/domain/users";
import {
  IDENTITY_LABELS,
  type HandcardIdentity,
} from "@/domain/handcard-suggestions";
import { useHandcard } from "@/lib/handcard-store";
import { brands as brandConfigs } from "@/lib/brands/registry";
import { useActiveBrand } from "@/lib/scope/scope-context";

const STAFF_LIST = ["陳建志", "林佳蓉", "王俊傑", "黃雅婷", "劉明宏", "張惠如"];

const BIKES = [
  "Panigale V4 S",
  "Panigale V4 R",
  "Multistrada V4",
  "Multistrada V4 Pikes Peak",
  "Monster SP",
  "Diavel V4",
  "DesertX",
  "Scrambler",
  "Streetfighter V4",
  "Hypermotard",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toDateStr(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function toTimeStr(d: Date) {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CounterPage() {
  const router = useRouter();
  const brandName = brandConfigs[useActiveBrand()].displayName;
  const { state, patch, hydrated } = useHandcard();

  const IDENTITY_CARDS: Array<{
    key: HandcardIdentity;
    icon: string;
    hint: string;
  }> = [
    { key: "new", icon: "🆕", hint: "從未到訪，無歷史記錄" },
    { key: "revisit", icon: "🔄", hint: "曾建檔，自動帶出上次資訊" },
    { key: "owner", icon: "🏍️", hint: `現有 ${brandName} 車主回廠或洽換新車` },
    { key: "switcher", icon: "🔀", hint: "其他品牌車主考慮換購" },
  ];

  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "電子手卡 v8 · counter" },
    ],
  });

  // 本地 UI state（非跨頁）
  const [arrivalDate, setArrivalDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [timeConfirmed, setTimeConfirmed] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 初始化：日期 / RS / cardNo（只在 store 還沒帶過時）
  useEffect(() => {
    const now = new Date();
    const today = toDateStr(now);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArrivalDate(today);
     
    setArrivalTime(toTimeStr(now));

    if (!hydrated) return;
    if (!state.cardNo) {
      patch({ cardNo: `DU-${today.replace(/-/g, "")}-001` });
    }
    if (!state.receptionStaff) {
      getCurrentUserProfile().then((profile) => {
        const name = profile?.name ?? profile?.email ?? "";
        const matched = STAFF_LIST.find((s) => s === name) ?? STAFF_LIST[1];
        patch({ receptionStaff: matched });
      });
    }
  }, [hydrated, state.cardNo, state.receptionStaff, patch]);

  const setIdentity = (key: HandcardIdentity) => {
    patch({ identity: key });
  };

  const toggleBike = (bike: string) => {
    const next = state.intendedModels.includes(bike)
      ? state.intendedModels.filter((b) => b !== bike)
      : [...state.intendedModels, bike];
    patch({ intendedModels: next });
  };

  const handleAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setAvatarUrl(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="-m-4 md:-m-8 bg-[#F8F7F4] min-h-[calc(100dvh-4rem)] flex flex-col">
      <CardStepBar currentStep={1} />
      <HandcardV8SubBar currentStage={1} />

      <main className="flex-1 pb-28">
        <div className="max-w-5xl mx-auto px-6 py-5 space-y-3">
          {/* Page Header */}
          <header className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
              客戶接待手卡 v8 — 第一階段（接待）
            </h1>
            <span
              className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium"
              data-testid="handcard-sprint-chip"
            >
              銷售 · RS01-v8
            </span>
            <span className="text-[12px] text-[#9A9890]">
              身份判定 → 接待建檔 → 意向車款
            </span>
            <button
              onClick={() => setPreviewOpen(true)}
              className="ml-auto h-[30px] px-3 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              👁 預覽手卡
            </button>
          </header>

          {/* STEP 0 — 來客身份 */}
          <section
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="handcard-step-identity"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ STEP 0 · 來客身份確認
              </span>
              <span className="ml-auto px-1.5 py-0.5 text-[11px] rounded-md bg-[#FDECEA] text-[#CC0000]">
                必填
              </span>
            </header>
            <div className="px-4 py-4">
              <div className="text-[11px] text-[#9A9890] mb-2">
                請選擇來客身份類型（決定後續表單邏輯，可在儲存前修改）
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                {IDENTITY_CARDS.map((c) => {
                  const active = state.identity === c.key;
                  return (
                    <button
                      key={c.key}
                      onClick={() => setIdentity(c.key)}
                      data-testid={`identity-card-${c.key}`}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        active
                          ? "border-[#1A3A5C] bg-[#EAF4FB] shadow-sm"
                          : "border-[#EEECE6] bg-white hover:border-[#9A9890]"
                      }`}
                    >
                      <div className="text-2xl mb-1.5">{c.icon}</div>
                      <div className="text-[13px] font-semibold text-[#2C2C2A]">
                        {IDENTITY_LABELS[c.key]}
                      </div>
                      <div className="text-[11px] text-[#9A9890] mt-1 leading-relaxed">
                        {c.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* STEP 0.5 — 身份特殊區塊（demo mock） */}
          {state.identity === "revisit" && (
            <section
              className="bg-[#FDF3E3] border border-[#F5D6A8] rounded-lg px-4 py-3 text-[12.5px] text-[#854F0B]"
              data-testid="handcard-revisit-history"
            >
              <div className="font-semibold mb-1">🔄 潛客再訪記錄 — 自動帶入上次資訊</div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2 text-[11.5px]">
                <div><b>上次到訪：</b>2026-04-22（18 天前）</div>
                <div><b>接待 RS：</b>林佳蓉（同一人）</div>
                <div><b>當時 HABC：</b>B 級潛客</div>
                <div><b>意向車款：</b>Panigale V4</div>
                <div><b>上次進展：</b>已試乘、未報價</div>
                <div className="text-[#CC0000]"><b>黃金時刻：</b>⚠ 未把握，本次須主動報價</div>
              </div>
            </section>
          )}

          {state.identity === "owner" && (
            <section
              className="bg-[#EAF4FB] border border-[#B6D7EB] rounded-lg px-4 py-3 text-[12.5px] text-[#185FA5]"
              data-testid="handcard-owner-block"
            >
              <div className="font-semibold mb-1">🏍️ {brandName} 老車主車輛資料 — 自動帶出</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-[11.5px]">
                <div><b>VIN：</b>ZDM****19</div>
                <div><b>車型：</b>Monster 821</div>
                <div><b>年份：</b>2021</div>
                <div><b>保險到期：</b>2026-07-15</div>
              </div>
            </section>
          )}

          {state.identity === "switcher" && (
            <section
              className="bg-[#EAF3DE] border border-[#C5DC9F] rounded-lg px-4 py-3 text-[12.5px] text-[#3B6D11]"
              data-testid="handcard-switcher-block"
            >
              <div className="font-semibold mb-1">🔀 他牌換購資訊 — 請填寫現有車輛</div>
              <div className="text-[11.5px] mt-1">
                現有品牌 / 排氣量 / 換購原因將在 STEP 8 競品區塊統一記錄。
              </div>
            </section>
          )}

          {/* STEP 1 — 基本接待資訊 */}
          <section
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="handcard-step-1"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ STEP 1 · 基本接待資訊
              </span>
              <span className="ml-auto px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
                Step 1
              </span>
            </header>
            <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
              <Field label="到店日期">
                <input
                  type="date"
                  value={arrivalDate}
                  disabled={timeConfirmed}
                  onChange={(e) => setArrivalDate(e.target.value)}
                  className={inputClass(timeConfirmed)}
                />
              </Field>
              <Field label="到店時間">
                <input
                  type="time"
                  value={arrivalTime}
                  disabled={timeConfirmed}
                  onChange={(e) => setArrivalTime(e.target.value)}
                  className={inputClass(timeConfirmed)}
                />
              </Field>
              <Field label="到店確認">
                {!timeConfirmed ? (
                  <button
                    onClick={() => setTimeConfirmed(true)}
                    className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45]"
                  >
                    ✓ 確認到店時間
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-[12px] text-[#3B6D11]">
                    <span>已確認 — {arrivalDate} {arrivalTime}</span>
                    <button
                      onClick={() => setTimeConfirmed(false)}
                      className="text-[11px] text-[#9A9890] underline"
                    >
                      修改
                    </button>
                  </div>
                )}
              </Field>

              <Field label="接待人員">
                <select
                  value={state.receptionStaff}
                  onChange={(e) => patch({ receptionStaff: e.target.value })}
                  className={inputClass(false)}
                >
                  <option value="">請選擇接待人員...</option>
                  {STAFF_LIST.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="客戶姓名">
                <input
                  type="text"
                  placeholder="請輸入客戶全名"
                  value={state.customerName}
                  onChange={(e) => patch({ customerName: e.target.value })}
                  className={inputClass(false)}
                />
              </Field>
              <Field label="手機">
                <input
                  type="tel"
                  placeholder="09XX-XXX-XXX"
                  value={state.customerPhone}
                  onChange={(e) => patch({ customerPhone: e.target.value })}
                  className={inputClass(false)}
                />
              </Field>

              <div className="md:col-span-3 flex items-start gap-4 pt-2">
                <div className="w-20 h-20 shrink-0 border-2 border-dashed border-[#D5D3CB] rounded-lg bg-[#F8F7F4] overflow-hidden flex items-center justify-center">
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={avatarUrl} alt="客戶照片" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[10px] text-[#9A9890]">客戶照片</span>
                  )}
                </div>
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleAvatar}
                    className="sr-only"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="h-[26px] px-2.5 rounded text-[11.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  >
                    上傳照片
                  </button>
                  <p className="text-[11px] text-[#9A9890] mt-1.5">
                    可在到店後拍照記錄（純前端 demo，未存入 DB）
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* STEP 2 — 意向車款（多選） */}
          <section
            className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="handcard-step-2"
          >
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">
                ▼ STEP 2 · 意向車款（多選）
              </span>
              <span className="ml-auto px-1.5 py-0.5 text-[11px] rounded-md bg-[#EAF4FB] text-[#185FA5]">
                Step 2
              </span>
            </header>
            <div className="px-4 py-4">
              <div className="text-[11px] text-[#9A9890] mb-2">
                客戶提及 / 詢問的車款，越多越能精準推薦
              </div>
              <div className="flex flex-wrap gap-1.5">
                {BIKES.map((b) => {
                  const active = state.intendedModels.includes(b);
                  return (
                    <button
                      key={b}
                      onClick={() => toggleBike(b)}
                      data-testid={`bike-${b.replace(/\s+/g, "-")}`}
                      className={`h-[30px] px-3 rounded-full text-[12px] font-medium transition-all ${
                        active
                          ? "bg-[#1A3A5C] text-white"
                          : "bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                      }`}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
              {state.intendedModels.length > 0 && (
                <div className="mt-3 text-[11.5px] text-[#185FA5]">
                  已選 <b>{state.intendedModels.length}</b> 款 · 將同步到第二階段意向分析
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

      <footer className="sticky bottom-0 bg-white/95 backdrop-blur-md border-t border-[#EEECE6] px-12 py-3 flex justify-between items-center">
        <button
          disabled
          className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#9A9890] cursor-not-allowed"
        >
          ← 上一步
        </button>
        <button
          onClick={() => router.push("/sales/card/consultant")}
          disabled={!state.identity}
          className="h-[34px] px-5 rounded-full text-[12.5px] font-semibold bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="handcard-counter-next"
        >
          下一步：意向諮詢 →
        </button>
      </footer>

      <HandcardPreviewModal open={previewOpen} onClose={() => setPreviewOpen(false)} />
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

function inputClass(locked: boolean) {
  return `h-[30px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none ${
    locked ? "opacity-60 cursor-not-allowed bg-[#F8F7F4]" : "bg-white"
  }`;
}
