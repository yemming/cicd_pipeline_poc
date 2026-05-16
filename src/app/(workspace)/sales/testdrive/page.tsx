"use client";

/**
 * 試乘試駕 v1 — RS02 4-step wizard
 *
 * 規格：docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS02_試乘試駕_v1.html
 *
 * 落在這頁的 4 個 step：
 *   - STEP 1：試駕基本登記（客戶 / 駕照 / 日期 / 車款 / 路線 / 意向）
 *   - STEP 2：試駕前安全確認清單（14 項 OK/NG）
 *   - STEP 3：試駕計時（開始/結束 + 里程）
 *   - STEP 4：結束評估 · 黃金時刻
 *
 * 跨頁 state：N/A（單頁 wizard，純 useState）
 * 資料持久化：刻意不存 localStorage — 試駕本來就是一次性流程，refresh 重來合理
 * 後端：mock 為主，車款與動作未接 DB（A11-v1 只做 UI/UX，後續再接 testdrive_records 表）
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";

// ============================================================
// 常數
// ============================================================

const BIKES = [
  "Panigale V4 S（仿賽）",
  "Streetfighter V4（裸把）",
  "Monster SP（街車）",
  "Multistrada V4 S（旅行）",
  "DesertX Rally（越野）",
  "Hypermotard 698 RVE（超摩）",
];

const ROUTES = [
  "市區短程（約 15 分）",
  "山路/彎道體驗（約 30 分）",
  "高速公路巡航（約 20 分）",
  "綜合路線（約 45 分）",
];

const LICENSE_OPTIONS = [
  { value: "1", label: "✅ 有效大型重機駕照（A1/A2）" },
  { value: "0", label: "❌ 無駕照（不可試駕）" },
];

const PURPOSES = [
  "新車購買前體驗",
  "中古車購買前確認",
  "換購比較（現有其他車款）",
  "純體驗（暫無購買計畫）",
];

const INTENT_GRADES = [
  "H 級（本月成交）",
  "A 級（30 天內）",
  "B 級（3 個月內）",
  "C 級（暫時觀望）",
];

const SAFETY_CHECKS: Array<{ id: string; category: string; label: string }> = [
  { id: "sc0", category: "客戶本身", label: "持有有效大型重機駕照（A1 或 A2）" },
  { id: "sc1", category: "客戶本身", label: "已配戴合格安全帽（全罩式或3/4罩，需扣好扣環）" },
  { id: "sc2", category: "客戶本身", label: "著長袖長褲，穿著閉趾鞋（不可穿涼鞋、拖鞋）" },
  { id: "sc3", category: "客戶本身", label: "精神狀態良好，無飲酒或服用影響駕駛之藥物" },
  { id: "sc4", category: "客戶本身", label: "已簽署試駕同意書（客戶確認知悉風險）" },
  { id: "sc5", category: "試駕車輛", label: "前後燈光正常（頭燈/尾燈/方向燈）" },
  { id: "sc6", category: "試駕車輛", label: "前後煞車正常作動" },
  { id: "sc7", category: "試駕車輛", label: "胎壓正常（前 2.5 bar / 後 2.5 bar）" },
  { id: "sc8", category: "試駕車輛", label: "油量足夠（不低於 1/4 格）" },
  { id: "sc9", category: "試駕車輛", label: "鏡子（後視鏡）調整完畢" },
  { id: "sc10", category: "試駕車輛", label: "發動正常，怠速穩定，無故障燈亮起" },
  { id: "sc11", category: "試駕說明（RS 口頭說明完成）", label: "已向客戶說明試駕路線與路況" },
  { id: "sc12", category: "試駕說明（RS 口頭說明完成）", label: "已說明車輛特性（動力模式 / ABS / DTC 設定）" },
  { id: "sc13", category: "試駕說明（RS 口頭說明完成）", label: "已告知緊急聯絡方式及回廠時間" },
];

const ESCORT_OPTIONS = [
  "客戶獨自試駕",
  "RS 陪同（機車後座）",
  "RS 先導（另一台車）",
  "RS 尾隨（另一台車）",
];

const POWER_FEELINGS = [
  "— 選擇 —",
  "超出預期（非常強烈）",
  "符合預期",
  "低於預期",
  "太強，操控不易",
];

const HANDLING_FEELINGS = [
  "— 選擇 —",
  "非常靈活，輕鬆上手",
  "需要適應期",
  "感覺偏重/偏大",
  "感覺偏輕/不穩",
];

const POSTURE_FEELINGS = [
  "— 選擇 —",
  "非常舒適",
  "尚可",
  "坐姿太攻擊性",
  "腳踏位置不適合",
];

const INTENT_CHANGES = [
  "— 選擇 —",
  "意願明顯提升 ⬆️",
  "維持原意願",
  "意願下降 ⬇️",
  "改變車款興趣",
];

const RECOMMEND_OPTIONS = [
  "維持原車款",
  "改推 Streetfighter V4（降低坐姿）",
  "改推 Monster SP（更友善）",
  "改推 Multistrada V4 S（旅行舒適）",
  "改推 DesertX Rally（冒險性格）",
  "改推 Hypermotard 698 RVE",
];

const SKIP_REASONS = [
  "— 請選擇跳過原因 —",
  "客戶需要時間考慮",
  "客戶需要與家人商量",
  "客戶對車款尚未確定",
  "客戶對價格有疑慮，需另行溝通",
  "車款不符合期待，需推薦其他車型",
  "客戶主動說明不急購買",
];

const STEPS = [
  { num: 1, label: "試駕登記", numLabel: "STEP 1" },
  { num: 2, label: "安全確認清單", numLabel: "STEP 2" },
  { num: 3, label: "試駕計時", numLabel: "STEP 3" },
  { num: 4, label: "結束評估 · 黃金時刻", numLabel: "STEP 4" },
];

type CheckState = "none" | "ok" | "ng";
type ResultState = "none" | "ok" | "amber" | "red";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

// ============================================================
// 主元件
// ============================================================

export default function TestdrivePage() {
  const router = useRouter();

  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "試乘試駕" },
    ],
  });

  // wizard step（同頁切換）
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [doneSteps, setDoneSteps] = useState<number[]>([]);

  // STEP 1 form
  const [customerName, setCustomerName] = useState("王大明");
  const [phone] = useState("0912-345-678");
  const [licenseValid, setLicenseValid] = useState("1");
  const [licenseNo, setLicenseNo] = useState("");
  const [tdDate, setTdDate] = useState("2026-05-10");
  const [tdTime, setTdTime] = useState("14:30");
  const [bike, setBike] = useState(BIKES[0]);
  const [plate, setPlate] = useState("");
  const [route, setRoute] = useState(ROUTES[0]);
  const [purpose, setPurpose] = useState(PURPOSES[0]);
  const [intentGrade, setIntentGrade] = useState(INTENT_GRADES[0]);

  // STEP 2 safety checks
  const [checks, setChecks] = useState<Record<string, CheckState>>(() => {
    const init: Record<string, CheckState> = {};
    for (const c of SAFETY_CHECKS) init[c.id] = "none";
    return init;
  });

  // STEP 3 timer
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSec, setTimerSec] = useState(0);
  const [timerStartLabel, setTimerStartLabel] = useState("尚未開始");
  const [kmStart, setKmStart] = useState("");
  const [kmEnd, setKmEnd] = useState("");
  const [escort, setEscort] = useState(ESCORT_OPTIONS[0]);
  const [routeNote, setRouteNote] = useState("");

  // STEP 4 results
  const [overall, setOverall] = useState<ResultState>("none");
  const [power, setPower] = useState(POWER_FEELINGS[0]);
  const [handling, setHandling] = useState(HANDLING_FEELINGS[0]);
  const [posture, setPosture] = useState(POSTURE_FEELINGS[0]);
  const [intentChange, setIntentChange] = useState(INTENT_CHANGES[0]);
  const [recommend, setRecommend] = useState(RECOMMEND_OPTIONS[0]);
  const [tdNote, setTdNote] = useState("");
  const [skipShown, setSkipShown] = useState(false);
  const [skipReason, setSkipReason] = useState(SKIP_REASONS[0]);

  // toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  // 卡號（demo 用、依日期 generate 一次）
  const cardNo = useMemo(() => {
    const d = new Date();
    return `TD-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-001`;
  }, []);

  // 計時 tick
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => setTimerSec((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [timerRunning]);

  // 安全確認進度
  const safeDoneCount = Object.values(checks).filter((v) => v !== "none").length;
  const safePct = Math.round((safeDoneCount / SAFETY_CHECKS.length) * 100);

  // 里程合計
  const kmTotal = useMemo(() => {
    const s = parseInt(kmStart, 10) || 0;
    const e = parseInt(kmEnd, 10) || 0;
    return e > s ? `${e - s} km` : "";
  }, [kmStart, kmEnd]);

  // 時長顯示
  const timerDisplay = useMemo(() => {
    const m = Math.floor(timerSec / 60);
    const s = timerSec % 60;
    return `${pad(m)}:${pad(s)}`;
  }, [timerSec]);

  const goStep = (n: 1 | 2 | 3 | 4) => {
    setDoneSteps((prev) => {
      // 從當前 step 離開 → 標記為 done（但 active 那個不算 done）
      if (!prev.includes(step) && step < n) return [...prev, step];
      return prev;
    });
    setStep(n);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const setCheck = (id: string, state: CheckState) => {
    setChecks((prev) => ({ ...prev, [id]: state }));
  };

  const checkAllOk = () => {
    const next: Record<string, CheckState> = {};
    for (const c of SAFETY_CHECKS) next[c.id] = "ok";
    setChecks(next);
  };

  const startTimer = () => {
    if (timerRunning) return;
    setTimerRunning(true);
    const now = new Date();
    setTimerStartLabel(`開始：${now.toLocaleTimeString("zh-TW")}`);
    showToast("▶ 試駕開始計時");
  };
  const stopTimer = () => {
    if (!timerRunning) return;
    setTimerRunning(false);
    showToast(`⏹ 試駕結束 · 共 ${timerDisplay}`);
  };

  // ============================================================
  // Layout
  // ============================================================

  return (
    <div className="-m-4 md:-m-8 bg-[#F8F7F4] min-h-[calc(100dvh-4rem)] flex flex-col">
      <main className="flex-1 pb-20">
        <div className="max-w-5xl mx-auto px-6 py-5 space-y-3">
          {/* Page Header */}
          <header className="flex items-center gap-2.5 flex-wrap" data-testid="testdrive-page-header">
            <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
              試乘試駕 — 4 步驟流程
            </h1>
            <span
              className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium"
              data-testid="testdrive-sprint-chip"
            >
              銷售 · A11-v1
            </span>
            <span className="text-[12px] text-[#9A9890]">
              登記 → 安全確認 → 計時 → 結果評估
            </span>
            <span className="ml-auto px-2 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] font-mono">
              {cardNo}
            </span>
          </header>

          {/* Step Bar */}
          <div
            className="flex bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="testdrive-step-bar"
          >
            {STEPS.map((s, idx) => {
              const active = s.num === step;
              const done = doneSteps.includes(s.num) && !active;
              return (
                <button
                  key={s.num}
                  onClick={() => goStep(s.num as 1 | 2 | 3 | 4)}
                  data-testid={`testdrive-step-tab-${s.num}`}
                  className={`flex-1 px-2 py-2.5 text-center text-[11.5px] transition-colors ${
                    idx < STEPS.length - 1 ? "border-r border-[#EEECE6]" : ""
                  } ${
                    active
                      ? "bg-[#1A3A5C] text-white font-bold"
                      : done
                        ? "bg-[#E1F5EE] text-[#0F6E56] font-semibold"
                        : "text-[#9A9890] font-medium hover:bg-[#F4F3F0]"
                  }`}
                >
                  <span
                    className={`block text-[9px] mb-0.5 font-mono ${
                      active ? "opacity-70" : "opacity-60"
                    }`}
                  >
                    {s.numLabel}
                  </span>
                  {s.label}
                </button>
              );
            })}
          </div>

          {/* STEP 1 */}
          {step === 1 && (
            <section data-testid="testdrive-pane-1" className="space-y-3">
              <SectionCard
                icon="📋"
                iconBg="bg-[#EAF4FB]"
                title="試駕基本登記"
                subtitle="試駕前完成資料登記，確認客戶已持有合格駕照"
                trailing={
                  <span className="px-2 py-0.5 rounded text-[11px] bg-[#F2F2F2] text-[#6B6A68] font-mono">
                    {cardNo}
                  </span>
                }
              >
                <Grid cols={2}>
                  <Field label="客戶姓名" required>
                    <input
                      type="text"
                      className={inputCls}
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </Field>
                  <Field label="聯絡電話">
                    <input
                      type="text"
                      className={`${inputCls} bg-[#F4F3F0]`}
                      value={phone}
                      readOnly
                    />
                  </Field>
                  <Field label="大型重機駕照" required>
                    <select
                      className={inputCls}
                      value={licenseValid}
                      onChange={(e) => setLicenseValid(e.target.value)}
                      data-testid="testdrive-license-select"
                    >
                      {LICENSE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="駕照字號">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="請輸入駕照號碼"
                      value={licenseNo}
                      onChange={(e) => setLicenseNo(e.target.value)}
                    />
                  </Field>
                  <Field label="試駕日期" required>
                    <input
                      type="date"
                      className={inputCls}
                      value={tdDate}
                      onChange={(e) => setTdDate(e.target.value)}
                    />
                  </Field>
                  <Field label="試駕時段">
                    <input
                      type="time"
                      className={inputCls}
                      value={tdTime}
                      onChange={(e) => setTdTime(e.target.value)}
                    />
                  </Field>
                </Grid>
                <div className="h-px bg-[#EEECE6] my-3" />
                <Grid cols={3}>
                  <Field label="試駕車款" required>
                    <select
                      className={inputCls}
                      value={bike}
                      onChange={(e) => setBike(e.target.value)}
                      data-testid="testdrive-bike-select"
                    >
                      {BIKES.map((b) => (
                        <option key={b}>{b}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="車牌號碼">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="試駕車牌"
                      value={plate}
                      onChange={(e) => setPlate(e.target.value)}
                    />
                  </Field>
                  <Field label="試駕路線">
                    <select
                      className={inputCls}
                      value={route}
                      onChange={(e) => setRoute(e.target.value)}
                    >
                      {ROUTES.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </Field>
                </Grid>
                <SecTitle>意向確認</SecTitle>
                <Grid cols={2}>
                  <Field label="試駕目的">
                    <select
                      className={inputCls}
                      value={purpose}
                      onChange={(e) => setPurpose(e.target.value)}
                    >
                      {PURPOSES.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="客戶意向等級">
                    <select
                      className={inputCls}
                      value={intentGrade}
                      onChange={(e) => setIntentGrade(e.target.value)}
                    >
                      {INTENT_GRADES.map((g) => (
                        <option key={g}>{g}</option>
                      ))}
                    </select>
                  </Field>
                </Grid>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => showToast("💾 試駕登記已儲存草稿")}
                  className={btnGhost}
                >
                  💾 儲存
                </button>
                <button
                  type="button"
                  onClick={() => goStep(2)}
                  className={btnPrimary}
                  data-testid="testdrive-next-1"
                >
                  安全確認清單 →
                </button>
              </div>
            </section>
          )}

          {/* STEP 2 */}
          {step === 2 && (
            <section data-testid="testdrive-pane-2" className="space-y-3">
              <SectionCard
                icon="🛡️"
                iconBg="bg-[#FDECEA]"
                title="試駕前安全確認清單"
                subtitle="全部確認 OK 方可出發 · 任一 NG 項目須告知客戶並記錄"
                trailing={
                  <span
                    className="px-2 py-0.5 rounded text-[11px] bg-[#F2F2F2] text-[#6B6A68]"
                    data-testid="testdrive-safe-count"
                  >
                    {safeDoneCount} / {SAFETY_CHECKS.length}
                  </span>
                }
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <span className="text-[11.5px] font-semibold whitespace-nowrap">
                    確認進度
                  </span>
                  <div className="flex-1 h-[7px] bg-[#EEECE6] rounded overflow-hidden">
                    <div
                      className="h-full rounded transition-[width] duration-300"
                      style={{
                        width: `${safePct}%`,
                        background:
                          "linear-gradient(90deg, #0F6E56, #5DCAA5)",
                      }}
                      data-testid="testdrive-safe-bar"
                    />
                  </div>
                  <span
                    className="text-[12px] font-bold font-mono text-[#0F6E56]"
                    data-testid="testdrive-safe-pct"
                  >
                    {safePct}%
                  </span>
                </div>

                {(["客戶本身", "試駕車輛", "試駕說明（RS 口頭說明完成）"] as const).map(
                  (cat) => (
                    <div key={cat} className="mb-1">
                      <div className="text-[11px] font-bold text-[#9A9890] tracking-wider uppercase bg-[#F4F3F0] rounded px-2.5 py-1.5 mt-2 mb-1">
                        {cat}
                      </div>
                      <div className="flex flex-col gap-1">
                        {SAFETY_CHECKS.filter((c) => c.category === cat).map(
                          (c) => {
                            const state = checks[c.id];
                            const itemCls =
                              state === "ok"
                                ? "bg-[#E1F5EE] border-[#5DCAA5]"
                                : state === "ng"
                                  ? "bg-[#FDECEA] border-[#F5AEAD]"
                                  : "bg-white border-[#EEECE6] hover:border-[#85B7EB]";
                            return (
                              <div
                                key={c.id}
                                data-testid={`testdrive-check-${c.id}`}
                                className={`flex items-start gap-2.5 px-2.5 py-2 rounded-md border ${itemCls} transition-colors`}
                              >
                                <div className="flex gap-1 flex-shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setCheck(c.id, "ok")}
                                    className={`w-[22px] h-[22px] rounded text-[10px] font-bold transition-colors ${
                                      state === "ok"
                                        ? "bg-[#0F6E56] border-[#0F6E56] text-white border"
                                        : "bg-white border border-[#D5D3CB] hover:border-[#1A3A5C]"
                                    }`}
                                    aria-label="OK"
                                  >
                                    ✓
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setCheck(c.id, "ng")}
                                    className={`w-[22px] h-[22px] rounded text-[10px] font-bold transition-colors ${
                                      state === "ng"
                                        ? "bg-[#C8001A] border-[#C8001A] text-white border"
                                        : "bg-white border border-[#D5D3CB] hover:border-[#1A3A5C]"
                                    }`}
                                    aria-label="NG"
                                  >
                                    ✗
                                  </button>
                                </div>
                                <div className="text-[12.5px] leading-relaxed flex-1 pt-0.5">
                                  {c.label}
                                </div>
                              </div>
                            );
                          },
                        )}
                      </div>
                    </div>
                  ),
                )}
              </SectionCard>

              <div className="flex justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => goStep(1)}
                  className={btnGhost}
                >
                  ← 返回
                </button>
                <button
                  type="button"
                  onClick={checkAllOk}
                  className={`${btnGhost} h-[28px] px-3 text-[12px]`}
                  data-testid="testdrive-check-all"
                >
                  ✅ 全部 OK（測試）
                </button>
                <button
                  type="button"
                  onClick={() => goStep(3)}
                  className={btnPrimary}
                  data-testid="testdrive-next-2"
                >
                  開始試駕計時 →
                </button>
              </div>
            </section>
          )}

          {/* STEP 3 */}
          {step === 3 && (
            <section data-testid="testdrive-pane-3" className="space-y-3">
              <SectionCard
                icon="⏱️"
                iconBg="bg-[#E1F5EE]"
                title="試駕計時"
                subtitle="記錄實際試駕開始/結束時間"
                trailing={
                  <span
                    className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                      timerRunning
                        ? "bg-[#FDECEA] text-[#C8001A]"
                        : "bg-[#E1F5EE] text-[#0F6E56]"
                    }`}
                    data-testid="testdrive-timer-badge"
                  >
                    {timerRunning
                      ? "試駕中"
                      : timerSec > 0
                        ? "已結束"
                        : "待開始"}
                  </span>
                }
              >
                <div className="text-center py-5">
                  <div className="text-[11.5px] text-[#9A9890] mb-1.5">
                    試駕時長
                  </div>
                  <div
                    className="text-[56px] font-bold leading-none text-[#1A3A5C] font-mono"
                    data-testid="testdrive-timer-display"
                  >
                    {timerDisplay}
                  </div>
                  <div className="text-[12px] text-[#9A9890] mt-2">
                    {timerStartLabel}
                  </div>
                </div>
                <div className="flex gap-3 justify-center mt-2.5">
                  <button
                    type="button"
                    onClick={startTimer}
                    disabled={timerRunning}
                    className={`${btnTeal} disabled:opacity-50`}
                    data-testid="testdrive-timer-start"
                  >
                    ▶ 開始試駕
                  </button>
                  <button
                    type="button"
                    onClick={stopTimer}
                    disabled={!timerRunning}
                    className={`${btnGhost} disabled:opacity-50`}
                    data-testid="testdrive-timer-stop"
                  >
                    ⏹ 結束試駕
                  </button>
                </div>
                <div className="h-px bg-[#EEECE6] my-3" />
                <Grid cols={3}>
                  <Field label="出發里程（km）">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="記錄儀表板里程"
                      value={kmStart}
                      onChange={(e) => setKmStart(e.target.value)}
                      data-testid="testdrive-km-start"
                    />
                  </Field>
                  <Field label="返回里程（km）">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="試駕後里程"
                      value={kmEnd}
                      onChange={(e) => setKmEnd(e.target.value)}
                      data-testid="testdrive-km-end"
                    />
                  </Field>
                  <Field label="試駕總里程">
                    <input
                      type="text"
                      className={`${inputCls} bg-[#F4F3F0] font-mono font-bold text-[#1A3A5C]`}
                      placeholder="自動計算"
                      value={kmTotal}
                      readOnly
                      data-testid="testdrive-km-total"
                    />
                  </Field>
                </Grid>
                <div className="mt-2.5">
                  <Grid cols={2}>
                    <Field label="陪同人員">
                      <select
                        className={inputCls}
                        value={escort}
                        onChange={(e) => setEscort(e.target.value)}
                      >
                        {ESCORT_OPTIONS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="試駕路況記錄">
                      <input
                        type="text"
                        className={inputCls}
                        placeholder="例：山路彎道，路況良好"
                        value={routeNote}
                        onChange={(e) => setRouteNote(e.target.value)}
                      />
                    </Field>
                  </Grid>
                </div>
              </SectionCard>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => goStep(2)}
                  className={btnGhost}
                >
                  ← 返回
                </button>
                <button
                  type="button"
                  onClick={() => goStep(4)}
                  className={btnPrimary}
                  data-testid="testdrive-next-3"
                >
                  試駕結束 → 結果評估
                </button>
              </div>
            </section>
          )}

          {/* STEP 4 */}
          {step === 4 && (
            <section data-testid="testdrive-pane-4" className="space-y-3">
              {/* 黃金時刻 banner */}
              <div
                className="rounded-xl p-5 text-white text-center"
                data-testid="testdrive-golden-banner"
                style={{
                  background:
                    "linear-gradient(135deg, #7A1010, #C8001A)",
                }}
              >
                <div className="text-[20px] font-bold mb-1.5">⚡ 黃金時刻</div>
                <div className="text-[13px] opacity-85 mb-4 leading-relaxed">
                  試駕剛結束是客戶意願最高的時刻
                  <br />
                  現在立即開立報價單，把握成交機會！
                </div>
                <div className="flex gap-2.5 justify-center flex-wrap">
                  <button
                    type="button"
                    onClick={() => router.push("/sales/quote")}
                    className="px-5 py-2.5 rounded-lg text-[13px] font-semibold bg-white text-[#7A1010] hover:bg-[#FDECEA]"
                    data-testid="testdrive-golden-quote"
                  >
                    🏷️ 立即開立報價單
                  </button>
                  <button
                    type="button"
                    onClick={() => setSkipShown(true)}
                    className="px-5 py-2.5 rounded-lg text-[13px] font-semibold bg-white/15 text-white border-[1.5px] border-white/40 hover:bg-white/25"
                    data-testid="testdrive-golden-skip"
                  >
                    稍後再說（填寫原因）
                  </button>
                </div>
                {skipShown && (
                  <div className="mt-3" data-testid="testdrive-skip-block">
                    <select
                      className="w-full max-w-[400px] px-3 py-2 rounded-md text-[13px] text-[#2C2C2A]"
                      value={skipReason}
                      onChange={(e) => {
                        setSkipReason(e.target.value);
                        showToast("📝 跳過原因已記錄");
                      }}
                    >
                      {SKIP_REASONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* 結果記錄 */}
              <SectionCard
                icon="📝"
                iconBg="bg-[#FDF3E3]"
                title="試駕結果記錄"
                subtitle="回寫至 RS01 電子手卡（唯讀）"
              >
                <SecTitle>客戶整體感受</SecTitle>
                <div className="flex gap-1 mb-3">
                  {(
                    [
                      { v: "ok", label: "😊 非常滿意" },
                      { v: "amber", label: "🙂 尚可接受" },
                      { v: "red", label: "😐 不符期待" },
                    ] as const
                  ).map((o) => {
                    const sel = overall === o.v;
                    const colorCls =
                      o.v === "ok"
                        ? "bg-[#E1F5EE] border-[#5DCAA5] text-[#0F6E56]"
                        : o.v === "amber"
                          ? "bg-[#FDF3E3] border-[#F0C97E] text-[#854F0B]"
                          : "bg-[#FDECEA] border-[#F5AEAD] text-[#C8001A]";
                    return (
                      <button
                        type="button"
                        key={o.v}
                        onClick={() => setOverall(o.v)}
                        className={`px-3 py-1.5 rounded-md border-[1.5px] text-[12.5px] transition-colors ${
                          sel
                            ? `${colorCls} font-bold`
                            : "bg-[#F4F3F0] border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                        }`}
                        data-testid={`testdrive-overall-${o.v}`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
                <Grid cols={2}>
                  <Field label="動力感受">
                    <select
                      className={inputCls}
                      value={power}
                      onChange={(e) => setPower(e.target.value)}
                    >
                      {POWER_FEELINGS.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="操控靈活性">
                    <select
                      className={inputCls}
                      value={handling}
                      onChange={(e) => setHandling(e.target.value)}
                    >
                      {HANDLING_FEELINGS.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="坐姿/人機工學">
                    <select
                      className={inputCls}
                      value={posture}
                      onChange={(e) => setPosture(e.target.value)}
                    >
                      {POSTURE_FEELINGS.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="試駕後意向變化">
                    <select
                      className={inputCls}
                      value={intentChange}
                      onChange={(e) => setIntentChange(e.target.value)}
                    >
                      {INTENT_CHANGES.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </select>
                  </Field>
                </Grid>
                <SecTitle>試駕後推薦車款調整</SecTitle>
                <Grid cols={2}>
                  <Field label="原試駕車款">
                    <input
                      type="text"
                      className={`${inputCls} bg-[#F4F3F0]`}
                      readOnly
                      value={bike}
                      data-testid="testdrive-orig-model"
                    />
                  </Field>
                  <Field label="建議追加推薦">
                    <select
                      className={inputCls}
                      value={recommend}
                      onChange={(e) => setRecommend(e.target.value)}
                    >
                      {RECOMMEND_OPTIONS.map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </Field>
                </Grid>
                <Field label="試駕備注 / RS 觀察">
                  <textarea
                    className={`${inputCls} h-[72px] resize-none`}
                    placeholder="客戶騎乘習慣觀察、特別反應、後續跟進建議..."
                    value={tdNote}
                    onChange={(e) => setTdNote(e.target.value)}
                  />
                </Field>
                <div className="h-px bg-[#EEECE6] my-3" />
                <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-md px-3.5 py-2.5 text-[12px] text-[#0C3E70]">
                  ℹ️ 以下資料將<b>自動回寫</b>至 RS01
                  電子手卡（唯讀顯示）：試駕車款、試駕日期、試駕時長、整體感受評分、RS 備注
                </div>
              </SectionCard>

              <div className="flex justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => showToast("💾 試駕記錄已儲存並回寫至 RS01")}
                  className={btnGhost}
                  data-testid="testdrive-save-record"
                >
                  💾 儲存試駕記錄
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/sales/card/closing")}
                  className={btnTeal}
                >
                  ← 回到電子手卡
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/sales/quote")}
                  className={btnRed}
                >
                  🏷️ 立即開立報價單 →
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg text-[12.5px] z-50 bg-[#1A3A5C] text-white max-w-[320px] leading-relaxed"
          data-testid="testdrive-toast"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helper components
// ============================================================

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md border border-[#D5D3CB] text-[12.5px] outline-none focus:border-[#85B7EB] bg-white";

const btnPrimary =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#1A3A5C] text-white hover:bg-[#0F2A45] transition-colors";
const btnTeal =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] transition-colors";
const btnRed =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#C8001A] text-white hover:bg-[#A8001A] transition-colors";
const btnGhost =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] transition-colors";

function SectionCard({
  icon,
  iconBg,
  title,
  subtitle,
  trailing,
  children,
}: {
  icon: string;
  iconBg: string;
  title: string;
  subtitle?: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-7 h-7 rounded-md flex items-center justify-center text-[13px] flex-shrink-0 ${iconBg}`}
          >
            {icon}
          </div>
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-[#2C2C2A]">{title}</div>
            {subtitle && (
              <div className="text-[11px] text-[#9A9890] mt-0.5 leading-tight">
                {subtitle}
              </div>
            )}
          </div>
        </div>
        {trailing}
      </header>
      <div className="px-4 py-3.5">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 mb-2.5">
      <label className="text-[11.5px] font-semibold text-[#4A4A48]">
        {label} {required && <span className="text-[#C8001A] text-[11px]">*</span>}
      </label>
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return (
    <div
      className={`grid gap-x-4 gap-y-0 ${
        cols === 2
          ? "grid-cols-1 md:grid-cols-2"
          : "grid-cols-1 md:grid-cols-3"
      }`}
    >
      {children}
    </div>
  );
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[10.5px] font-bold tracking-wider uppercase text-[#9A9890] mt-3.5 mb-2">
      <span>{children}</span>
      <span className="flex-1 h-px bg-[#EEECE6]" />
    </div>
  );
}
