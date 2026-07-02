"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useSetPageHeader } from "@/components/page-header-context";
import { createTestDriveAction, saveSafetyCheckNgItemsAction, startTestDriveWithSignatureAction, completeTestDriveAction } from "@/lib/sales/test-drives-actions";
import { type SafetyNgItem, TEST_DRIVE_CONSENT_VERSION } from "@/domain/sales-test-drives.constants";
import { SignatureCanvas } from "@/components/signature-canvas";
import {
  SAFETY_CATEGORY_TITLES,
  TD_ERGONOMICS,
  TD_ESCORT_MODES,
  TD_HANDLING_FEEL,
  TD_INTENT_CHANGE,
  TD_INTENT_LEVELS,
  TD_LICENSE_OPTIONS,
  TD_OVERALL_FEEDBACK,
  TD_POWER_FEEL,
  TD_PURPOSES,
  TD_ROUTES,
  TD_SAFETY_ITEMS,
  TD_SKIP_REASONS,
  TD_STEPS,
  type SafetyCategory,
} from "./test-rides.constants";

type StepIdx = 1 | 2 | 3 | 4 | 5;
type SafetyState = "ok" | "ng" | null;
type OverallTone = "ok" | "amber" | "red" | null;

/** 車款選項（依 active brand 撈 vehicle_models，B-05 品牌中性化） */
type ModelOption = { id: string; name: string };

/** Demo 車實體選項（A1：試乘要選實體 demo 車而非車型） */
type DemoVehicleOption = {
  id: string;
  vin: string | null;
  model_display_name: string | null;
  color: string | null;
  status: string;
  demo_asset_acquired_at: string | null;
};

export default function TestRidesForm({
  models,
  demoVehicles = [],
}: {
  models: ModelOption[];
  demoVehicles?: DemoVehicleOption[];
}) {
  useSetPageHeader({
    title: "試乘試駕",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/overview" },
      { label: "展廳接待" },
      { label: "試乘試駕" },
    ],
  });

  const [step, setStep] = useState<StepIdx>(1);
  const [doneSteps, setDoneSteps] = useState<Set<StepIdx>>(new Set());

  // STEP 1 表單
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [prefillBanner, setPrefillBanner] = useState<string | null>(null);
  const driverLicenseTokenRef = useRef<string | null>(null);
  const [license, setLicense] = useState<string>(TD_LICENSE_OPTIONS[0].value);
  const [licenseNo, setLicenseNo] = useState("");
  const [tdDate, setTdDate] = useState("2026-05-14");
  const [tdTime, setTdTime] = useState("14:30");
  const [tdModelId, setTdModelId] = useState<string | null>(models[0]?.id ?? null);
  const [tdModel, setTdModel] = useState<string>(models[0]?.name ?? "");
  // A1：選取實體 demo 車庫存 id（優先以此為主，vehicle_model_id 從 demo 車推導）
  const [tdDemoVehicleId, setTdDemoVehicleId] = useState<string | null>(
    demoVehicles[0]?.id ?? null
  );
  const [plateNo, setPlateNo] = useState("");
  const [route, setRoute] = useState<string>(TD_ROUTES[0]);
  const [purpose, setPurpose] = useState<string>(TD_PURPOSES[0]);
  const [intent, setIntent] = useState<string>(TD_INTENT_LEVELS[0]);

  // STEP 2 安全清單
  const [safety, setSafety] = useState<Record<string, SafetyState>>({});
  // A-5：NG 項目的原因備注
  const [ngNotes, setNgNotes] = useState<Record<string, string>>({});
  const safetyDoneCount = useMemo(
    () => Object.values(safety).filter((v) => v !== null && v !== undefined).length,
    [safety],
  );
  const safetyPct = Math.round((safetyDoneCount / TD_SAFETY_ITEMS.length) * 100);

  // A-5：全部 14 項都完成了嗎？（done = ok 或 ng + 填了原因）
  const safetyAllDone = useMemo(() => {
    if (safetyDoneCount < TD_SAFETY_ITEMS.length) return false;
    // 所有 NG 項都必須填原因
    for (const item of TD_SAFETY_ITEMS) {
      if (safety[item.id] === "ng" && !(ngNotes[item.id] ?? "").trim()) {
        return false;
      }
    }
    return true;
  }, [safety, ngNotes, safetyDoneCount]);

  // STEP 3 計時
  const [running, setRunning] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [startedLabel, setStartedLabel] = useState("尚未開始");
  const [stopped, setStopped] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [kmStart, setKmStart] = useState("");
  const [kmEnd, setKmEnd] = useState("");
  const kmTotal = useMemo(() => {
    const s = parseInt(kmStart || "0", 10);
    const e = parseInt(kmEnd || "0", 10);
    return e > s ? `${e - s} km` : "";
  }, [kmStart, kmEnd]);
  const [escort, setEscort] = useState<string>(TD_ESCORT_MODES[0]);
  const [roadNote, setRoadNote] = useState("");

  // STEP 3 簽名同意
  const [insuranceVerified, setInsuranceVerified] = useState(false);
  const [insuranceNote, setInsuranceNote] = useState("");
  const [signedDataUrl, setSignedDataUrl] = useState<string | null>(null);
  const [signError, setSignError] = useState<string | null>(null);
  const [isSigning, startSigningTransition] = useTransition();

  // STEP 4（原第 3）評估
  const [overall, setOverall] = useState<OverallTone>(null);
  const [powerFeel, setPowerFeel] = useState<string>(TD_POWER_FEEL[0]);
  const [handlingFeel, setHandlingFeel] = useState<string>(TD_HANDLING_FEEL[0]);
  const [ergo, setErgo] = useState<string>(TD_ERGONOMICS[0]);
  const [intentChange, setIntentChange] = useState<string>(TD_INTENT_CHANGE[0]);
  const [recommendAdjust, setRecommendAdjust] = useState<string>("維持原車款");
  const [rsNote, setRsNote] = useState("");
  const [showSkipReason, setShowSkipReason] = useState(false);
  const [skipReason, setSkipReason] = useState<string>(TD_SKIP_REASONS[0]);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }

  // 寫 DB：點「儲存試駕記錄」/「回到電子手卡」/「立即開立報價單」前先存
  const router = useRouter();
  const [isSaving, startSavingTransition] = useTransition();
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);

  function buildScheduledAtIso(): string {
    // tdDate "2026-05-14" + tdTime "14:30" → ISO（強制 Asia/Taipei +08:00）
    const safeDate = tdDate || new Date().toISOString().slice(0, 10);
    const safeTime = tdTime || "12:00";
    return new Date(`${safeDate}T${safeTime}:00+08:00`).toISOString();
  }

  function buildSafetyNgItems(): SafetyNgItem[] {
    return TD_SAFETY_ITEMS.filter((it) => safety[it.id] === "ng").map((it) => ({
      item_id: it.id,
      item_label: it.label,
      ng_note: (ngNotes[it.id] ?? "").trim(),
    }));
  }

  function buildMetadata(): Record<string, unknown> {
    return {
      // 試駕快照（不放 typed core 的 wizard state 全進這）
      wizard_version: "RS02-v1",
      customer_name_snapshot: customerName.trim() || null,
      phone_snapshot: phone.trim() || null,
      license_status: license, // "valid" | "none"
      license_no: licenseNo.trim() || null,
      test_drive_model_name: tdModel,
      plate_no: plateNo.trim() || null,
      route,
      purpose,
      intent_level: intent,
      // step 2 safety check
      safety_pct: safetyPct,
      safety_done: safetyDoneCount,
      safety_total: TD_SAFETY_ITEMS.length,
      safety_detail: safety,
      // step 3 timing / km
      duration_seconds: seconds,
      started_label: startedLabel,
      stopped,
      km_start: kmStart.trim() || null,
      km_end: kmEnd.trim() || null,
      km_total: kmTotal || null,
      escort,
      road_note: roadNote.trim() || null,
      // step 4 evaluation
      overall_tone: overall,
      power_feel: powerFeel,
      handling_feel: handlingFeel,
      ergonomics: ergo,
      intent_change: intentChange,
      recommend_adjust: recommendAdjust,
      skip_reason: showSkipReason ? skipReason : null,
      // A1：實體 demo 車 inventory id（試乘選車）
      demo_vehicle_inventory_id: tdDemoVehicleId ?? null,
    };
  }

  function handleSaveTestDrive(
    afterSaved?: (recordId: string) => void,
  ): void {
    if (savedRecordId) {
      // 已存過、不重複 insert（避免 double-click）
      afterSaved?.(savedRecordId);
      return;
    }
    if (!customerName.trim()) {
      showToast("⚠️ 客戶姓名必填");
      return;
    }
    if (license === "none") {
      showToast("⚠️ 客戶無大型重機駕照，不可建立試駕記錄");
      return;
    }
    startSavingTransition(async () => {
      const r = await createTestDriveAction({
        customer_id: customerId,
        vehicle_model_id: tdModelId, // B-05：改用 DB-backed 車款，記錄真實 vehicle_model FK
        scheduled_at: buildScheduledAtIso(),
        status: stopped ? "completed" : "scheduled",
        notes: rsNote.trim() || null,
        metadata: buildMetadata(),
      });
      if (!r.ok) {
        showToast(`❌ 儲存失敗：${r.error}`);
        return;
      }
      // A-5：回寫 safety_check_ng_items（非阻斷；有 NG 項才傳）
      const ngItems = buildSafetyNgItems();
      if (ngItems.length > 0) {
        const ngRes = await saveSafetyCheckNgItemsAction(r.data.id, ngItems);
        if (!ngRes.ok) {
          console.warn("[test-ride-form] saveSafetyCheckNgItems 失敗（試駕已建立）", ngRes.error);
        }
      }
      setSavedRecordId(r.data.id);
      showToast("✓ 試駕記錄已儲存");
      afterSaved?.(r.data.id);
    });
  }

  // Step 5 評估完成：記錄已在簽名步（Step 2→3）建立並簽名出車（in_progress）。
  // 這裡用 completeTestDrive 把 wizard 完整評估（buildMetadata）以 read-merge-write
  // 併入 metadata（保留簽名 / started_at）、切 completed、回寫手卡。
  // ⚠️ 不能複用 handleSaveTestDrive 的去重分支——那條也被 Step 2→3 呼叫，
  //    誤走 complete 會在「還沒進簽名步」就把記錄切 completed。
  function handleCompleteTestDrive(afterDone?: (recordId: string) => void): void {
    if (!savedRecordId) {
      // 防禦：正常流程一定先經 Step 3 建過記錄；真的沒有就退回原 insert 流程。
      handleSaveTestDrive(afterDone);
      return;
    }
    const recordId = savedRecordId;
    startSavingTransition(async () => {
      const r = await completeTestDriveAction(recordId, {
        notes: rsNote.trim() || null,
        extraMetadata: buildMetadata(),
      });
      if (!r.ok) {
        showToast(`❌ 儲存失敗：${r.error}`);
        return;
      }
      showToast("✓ 試駕評估已儲存");
      afterDone?.(recordId);
    });
  }

  // 駕照 OCR 跨 tab prefill：點按鈕 → 開新 tab 帶 token → 對方建客戶後寫 localStorage → 這邊接收
  function openDriverLicenseOcr() {
    if (typeof window === "undefined") return;
    const token =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    driverLicenseTokenRef.current = token;
    try {
      window.localStorage.removeItem(`td_prefill_${token}`);
    } catch {}
    window.open(
      `/ai-curve/driving-license?return_token=${encodeURIComponent(token)}`,
      "_blank",
      "noopener",
    );
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    function onStorage(ev: StorageEvent) {
      const token = driverLicenseTokenRef.current;
      if (!token || !ev.key) return;
      if (ev.key !== `td_prefill_${token}`) return;
      if (!ev.newValue) return;
      try {
        const payload = JSON.parse(ev.newValue) as {
          customerId?: string;
          name?: string;
          license_no?: string;
          license_class?: string;
        };
        if (payload.customerId) setCustomerId(payload.customerId);
        if (payload.name) setCustomerName(payload.name);
        if (payload.license_no) setLicenseNo(payload.license_no);
        const lc = payload.license_class ?? "";
        const isValidBigBike = /A1|A2|大型|重型/.test(lc);
        setLicense(isValidBigBike ? "valid" : "none");
        setPrefillBanner(`✓ 已從駕照建立客戶「${payload.name ?? ""}」、欄位已自動帶入`);
        setTimeout(() => setPrefillBanner(null), 4000);
      } catch {
        /* ignore parse error */
      }
      try {
        window.localStorage.removeItem(ev.key);
      } catch {}
      driverLicenseTokenRef.current = null;
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  function goStep(n: StepIdx) {
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (n > step) next.add(step);
      return next;
    });
    setStep(n);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function setSafetyState(id: string, st: SafetyState) {
    setSafety((prev) => ({ ...prev, [id]: st }));
  }

  function checkAll() {
    const next: Record<string, SafetyState> = {};
    for (const it of TD_SAFETY_ITEMS) next[it.id] = "ok";
    setSafety(next);
  }

  function startTimer() {
    if (running) return;
    setRunning(true);
    setStopped(false);
    const now = new Date();
    setStartedLabel(`開始：${now.toLocaleTimeString("zh-TW")}`);
    intervalRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    showToast("▶ 試駕開始計時");
  }

  function stopTimer() {
    if (!running) return;
    setRunning(false);
    setStopped(true);
    if (intervalRef.current) clearInterval(intervalRef.current);
    showToast(`⏹ 試駕結束 · 共 ${formatTime(seconds)}`);
  }

  useEffect(() => () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
  }, []);

  function formatTime(total: number) {
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  }

  return (
    <main className="px-6 py-5 max-w-[960px] mx-auto space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">試乘試駕</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">RS02</span>
        <span className="text-[12px] text-[#9A9890]">登記 → 安全確認 → 簽名同意 → 計時 → 結果評估＋黃金時刻</span>
      </header>

      {/* Step Bar */}
      <div
        className="flex bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-test-id="td-step-bar"
      >
        {TD_STEPS.map((s) => {
          const active = step === s.idx;
          const done = doneSteps.has(s.idx as StepIdx) && !active;
          const cls = active
            ? "bg-[#1A3A5C] text-white font-bold"
            : done
            ? "bg-[#E1F5EE] text-[#0F6E56] font-semibold"
            : "text-[#9A9890] font-medium";
          return (
            <button
              key={s.idx}
              type="button"
              id={`td-step-${s.idx}`}
              onClick={() => goStep(s.idx as StepIdx)}
              className={`flex-1 px-2 py-2.5 text-center text-[11.5px] border-r border-[#EEECE6] last:border-r-0 transition ${cls}`}
            >
              <span className="block font-mono text-[9px] opacity-65 mb-0.5">STEP {s.idx}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div className="space-y-3" data-test-pane="1">
          <Panel
            icon="📋"
            iconBg="bg-[#EAF4FB]"
            title="試駕基本登記"
            sub="試駕前完成資料登記，確認客戶已持有合格駕照"
            badge="TD-20260514-001"
          >
            {/* 拍駕照 OCR 入口：沒客戶資料時走這條最快 */}
            <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-dashed border-[#185FA5]/40 bg-[#EAF4FB] px-3 py-2">
              <div className="flex items-center gap-2 text-[12px] text-[#185FA5] min-w-0">
                <span className="material-symbols-outlined text-[18px] shrink-0">
                  drive_eta
                </span>
                <span className="truncate">
                  沒客戶資料？拍張駕照、AI 自動建客戶並回填欄位
                </span>
              </div>
              <button
                type="button"
                onClick={openDriverLicenseOcr}
                className="shrink-0 h-[28px] px-3 rounded-full bg-[#185FA5] text-white text-[12px] font-medium hover:bg-[#0F2A45] inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[15px]">
                  photo_camera
                </span>
                拍駕照建客戶
              </button>
            </div>
            {prefillBanner && (
              <div className="mb-3 px-3 py-2 rounded-md text-[12px] bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]">
                {prefillBanner}
                {customerId && (
                  <a
                    href={`/admin/master-data/customers/${customerId}`}
                    target="_blank"
                    rel="noopener"
                    className="ml-2 underline"
                  >
                    開啟客戶主檔 →
                  </a>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2.5 mb-3">
              <Field label="客戶姓名" required>
                <input
                  type="text"
                  className={fiClass}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="拍駕照或從 RS01 電子手卡帶入"
                />
              </Field>
              <Field label="聯絡電話">
                <input
                  type="text"
                  className={fiClass}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0912-xxx-xxx"
                  inputMode="tel"
                />
              </Field>
              <Field label="大型重機駕照" required>
                <select className={fsClass} value={license} onChange={(e) => setLicense(e.target.value)}>
                  {TD_LICENSE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="駕照字號">
                <input
                  type="text"
                  className={fiClass}
                  value={licenseNo}
                  onChange={(e) => setLicenseNo(e.target.value)}
                  placeholder="請輸入駕照號碼"
                />
              </Field>
              <Field label="試駕日期" required>
                <input type="date" className={fiClass} value={tdDate} onChange={(e) => setTdDate(e.target.value)} />
              </Field>
              <Field label="試駕時段">
                <input type="time" className={fiClass} value={tdTime} onChange={(e) => setTdTime(e.target.value)} />
              </Field>
            </div>
            <Divider />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2.5">
              {/* A1：試乘車輛選擇 — 優先使用實體 demo 車庫存記錄 */}
              <Field label="試駕車輛（Demo 車）" required>
                {demoVehicles.length === 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <div className="text-[11.5px] text-[#CC0000] bg-[#FDECEA] border border-[#F5AEAD] rounded px-2.5 py-1.5">
                      ⚠️ 目前沒有可用的 demo 展示車。請先在「新車庫存」將車輛標記為 demo 車，再安排試駕。
                    </div>
                    {/* fallback：若無 demo 車，仍可手動選車款 */}
                    <select
                      className={fsClass}
                      value={tdModelId ?? ""}
                      onChange={(e) => {
                        const m = models.find((x) => x.id === e.target.value);
                        setTdModelId(m?.id ?? null);
                        setTdModel(m?.name ?? "");
                        setTdDemoVehicleId(null);
                      }}
                    >
                      <option value="">— 選車款（暫無 demo 車，僅記錄用）—</option>
                      {models.map((m) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <select
                    className={fsClass}
                    value={tdDemoVehicleId ?? ""}
                    onChange={(e) => {
                      const dv = demoVehicles.find((x) => x.id === e.target.value);
                      setTdDemoVehicleId(dv?.id ?? null);
                      // 同步更新車型顯示名（試駕記錄 metadata 用）
                      setTdModel(dv?.model_display_name ?? "");
                      // 車型 id：不依賴 demo 車直接提供，用 model_display_name 做顯示即可
                      setTdModelId(null);
                    }}
                  >
                    <option value="">— 選擇 demo 展示車 —</option>
                    {demoVehicles.map((dv) => (
                      <option key={dv.id} value={dv.id}>
                        {[
                          dv.model_display_name ?? "—",
                          dv.color ? `（${dv.color}）` : "",
                          dv.vin ? `VIN: ${dv.vin.slice(-6)}` : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              <Field label="車牌號碼">
                <input
                  type="text"
                  className={fiClass}
                  value={plateNo}
                  onChange={(e) => setPlateNo(e.target.value)}
                  placeholder="試駕車牌"
                />
              </Field>
              <Field label="試駕路線">
                <select className={fsClass} value={route} onChange={(e) => setRoute(e.target.value)}>
                  {TD_ROUTES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <SectionTitle>意向確認</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2.5">
              <Field label="試駕目的">
                <select className={fsClass} value={purpose} onChange={(e) => setPurpose(e.target.value)}>
                  {TD_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="客戶意向等級">
                <select className={fsClass} value={intent} onChange={(e) => setIntent(e.target.value)}>
                  {TD_INTENT_LEVELS.map((i) => (
                    <option key={i} value={i}>
                      {i}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Panel>
          <Footer>
            <Btn variant="ghost" onClick={() => showToast("💾 試駕登記已儲存草稿")}>
              💾 儲存
            </Btn>
            <Btn variant="primary" onClick={() => goStep(2)}>
              安全確認清單 →
            </Btn>
          </Footer>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="space-y-3" data-test-pane="2">
          <Panel
            icon="🛡️"
            iconBg="bg-[#FDECEA]"
            title="試駕前安全確認清單"
            sub="全部確認 OK 方可出發 · 任一 NG 項目須告知客戶並記錄"
            badge={`${safetyDoneCount} / ${TD_SAFETY_ITEMS.length}`}
            badgeId="td-safety-cnt"
          >
            <div className="flex items-center gap-2.5 mb-2.5">
              <span className="text-[11.5px] font-semibold whitespace-nowrap">確認進度</span>
              <div className="flex-1 h-[7px] bg-[#EEECE6] rounded">
                <div
                  className="h-full bg-gradient-to-r from-[#0F6E56] to-[#5DCAA5] rounded transition-[width]"
                  style={{ width: `${safetyPct}%` }}
                  data-test-id="td-safety-bar"
                />
              </div>
              <span
                className="text-[12px] font-bold font-mono text-[#0F6E56] whitespace-nowrap"
                data-test-id="td-safety-pct"
              >
                {safetyPct}%
              </span>
            </div>
            {/* A-5：提示未完成時不可進入計時 */}
            {!safetyAllDone && safetyDoneCount > 0 && (
              <div className="mb-2 rounded-md bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[11.5px] px-3 py-2">
                {safetyDoneCount < TD_SAFETY_ITEMS.length
                  ? `尚有 ${TD_SAFETY_ITEMS.length - safetyDoneCount} 項未確認，全部完成後才可開始計時`
                  : "有 NG 項目尚未填寫原因，請說明後方可開始計時"}
              </div>
            )}
            {(["customer", "vehicle", "briefing"] as SafetyCategory[]).map((cat) => (
              <div key={cat}>
                <div className="text-[11px] font-bold text-[#9A9890] tracking-wider uppercase px-2.5 py-1.5 bg-[#F4F3F0] rounded mt-1.5">
                  {SAFETY_CATEGORY_TITLES[cat]}
                </div>
                <div className="flex flex-col gap-1 mt-1.5">
                  {TD_SAFETY_ITEMS.filter((i) => i.category === cat).map((it) => {
                    const st = safety[it.id];
                    const isNg = st === "ng";
                    const ngNote = ngNotes[it.id] ?? "";
                    const ngMissing = isNg && !ngNote.trim();
                    const wrapCls =
                      st === "ok"
                        ? "bg-[#E1F5EE] border-[#5DCAA5]"
                        : isNg
                        ? ngMissing
                          ? "bg-[#FDECEA] border-[#CC0000]" // NG 但未填原因 → 更深紅邊框
                          : "bg-[#FDECEA] border-[#F5AEAD]"
                        : "bg-white border-[#EEECE6] hover:border-[#85B7EB] hover:bg-[#F0F7FF]";
                    return (
                      <div key={it.id} className={`px-2.5 py-1.5 border rounded transition ${wrapCls}`}>
                        <div className="flex items-start gap-2">
                          <div className="flex gap-1 shrink-0 mt-0.5">
                            <button
                              type="button"
                              onClick={() => setSafetyState(it.id, "ok")}
                              className={`w-[22px] h-[22px] rounded text-[10px] font-bold border ${
                                st === "ok"
                                  ? "bg-[#0F6E56] border-[#0F6E56] text-white"
                                  : "bg-white border-[#D5D3CB] hover:border-[#1A3A5C]"
                              }`}
                              data-test-id={`${it.id}-ok`}
                              aria-label={`${it.label} OK`}
                            >
                              ✓
                            </button>
                            <button
                              type="button"
                              onClick={() => setSafetyState(it.id, "ng")}
                              className={`w-[22px] h-[22px] rounded text-[10px] font-bold border ${
                                isNg
                                  ? "bg-[#C8001A] border-[#C8001A] text-white"
                                  : "bg-white border-[#D5D3CB] hover:border-[#1A3A5C]"
                              }`}
                              data-test-id={`${it.id}-ng`}
                              aria-label={`${it.label} NG`}
                            >
                              ✗
                            </button>
                          </div>
                          <div className="text-[12.5px] flex-1 leading-relaxed pt-0.5 text-[#2C2C2A]">
                            {it.label}
                            {isNg && (
                              <span className="ml-1.5 text-[11px] text-[#CC0000] font-medium">NG</span>
                            )}
                          </div>
                        </div>
                        {/* A-5：NG 時展開原因輸入框（必填） */}
                        {isNg && (
                          <div className="mt-1.5 pl-[50px]">
                            <textarea
                              rows={2}
                              className={`w-full border rounded px-2 py-1 text-[11.5px] resize-none outline-none focus:border-[#185FA5] ${
                                ngMissing ? "border-[#CC0000] bg-[#FEF5F5]" : "border-[#D5D3CB] bg-white"
                              }`}
                              placeholder="請說明 NG 原因（必填）*"
                              value={ngNote}
                              onChange={(e) =>
                                setNgNotes((prev) => ({ ...prev, [it.id]: e.target.value }))
                              }
                              data-test-id={`${it.id}-ng-note`}
                            />
                            {ngMissing && (
                              <span className="text-[11px] text-[#CC0000]">NG 項目必須填寫原因</span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </Panel>
          <Footer>
            <Btn variant="ghost" onClick={() => goStep(1)}>
              ← 返回
            </Btn>
            <Btn variant="ghost" size="sm" onClick={checkAll} testId="td-check-all">
              ✅ 全部 OK（測試）
            </Btn>
            {/* A-5：未完成全部清單（含 NG 原因）→ disabled；完成後先存記錄再進簽名步 */}
            <Btn
              variant="primary"
              onClick={() => safetyAllDone && handleSaveTestDrive(() => goStep(3))}
              disabled={!safetyAllDone || isSaving}
            >
              {!safetyAllDone
                ? `清單未完成（${safetyDoneCount}/${TD_SAFETY_ITEMS.length}）`
                : isSaving
                ? "儲存中⋯"
                : "客戶簽名同意 →"}
            </Btn>
          </Footer>
        </div>
      )}

      {/* STEP 3 — 簽名同意（新增） */}
      {step === 3 && (
        <div
          className={`space-y-3 ${isSigning ? "pointer-events-none opacity-60" : ""}`}
          data-test-pane="3"
        >
          <Panel
            icon="✍️"
            iconBg="bg-[#FDF3E3]"
            title="客戶簽名同意"
            sub="出車前：客戶確認保險、閱讀條款並手寫簽名，簽名後開始試駕"
          >
            {/* 保險證明確認區塊 */}
            <div className="rounded-lg border border-[#F0C97E] bg-[#FDF3E3] px-4 py-3">
              <div className="flex items-start gap-3">
                <input
                  id="wiz-insurance-verified-check"
                  type="checkbox"
                  className="mt-0.5 w-4 h-4 accent-[#1A3A5C] cursor-pointer shrink-0"
                  checked={insuranceVerified}
                  onChange={(e) => setInsuranceVerified(e.target.checked)}
                  disabled={isSigning}
                />
                <label
                  htmlFor="wiz-insurance-verified-check"
                  className="text-[12.5px] font-semibold text-[#854F0B] cursor-pointer leading-relaxed"
                >
                  ✓ 已確認客戶提供有效的機車強制責任保險證明
                  <span className="text-[#CC0000] ml-1">*</span>
                </label>
              </div>
              {!insuranceVerified && (
                <p className="mt-1.5 text-[11px] text-[#854F0B] pl-7">
                  保險證明未確認，無法開始試駕
                </p>
              )}
              <div className="mt-2.5 pl-7">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  保險備注（選填）
                </label>
                <input
                  type="text"
                  className="mt-0.5 w-full h-[28px] border border-[#D5D3CB] rounded px-2 text-[12px] bg-white focus:border-[#185FA5] outline-none"
                  placeholder="例：與駕照同人、本日有效至 2026/12/31"
                  value={insuranceNote}
                  onChange={(e) => setInsuranceNote(e.target.value)}
                  disabled={isSigning}
                />
              </div>
            </div>

            {/* 免責條款條文 */}
            <div className="mt-3 rounded-lg border border-[#EEECE6] bg-[#F8F7F4] px-4 py-3 text-[12px] text-[#5A5955] leading-relaxed max-h-[180px] overflow-y-auto">
              <p className="font-medium text-[#2C2C2A] mb-1.5">試乘同意暨免責聲明</p>
              <ol className="list-decimal pl-4 space-y-1">
                <li>本人已持有合法有效之機車駕駛執照，並於試乘前確認車輛狀況正常。</li>
                <li>試乘期間本人將遵守道路交通法規、配戴安全帽，並對自身行車安全負責。</li>
                <li>試乘期間因本人之故意或過失所致之事故、罰單、車輛損害，由本人負擔賠償責任。</li>
                <li>本人同意經銷商基於試乘服務目的，蒐集、處理及利用本人之個人資料。</li>
                <li>本人已充分了解並同意上述條款，自願簽名出車試乘。</li>
              </ol>
            </div>

            {/* 簽名板 */}
            <div className="mt-3">
              <div className="text-[11px] text-[#9A9890] font-medium mb-1.5">
                客戶簽名 <span className="text-[#CC0000]">*</span>
              </div>
              {signedDataUrl ? (
                <div className="space-y-2">
                  <div className="border-2 border-[#0F6E56] rounded-xl overflow-hidden bg-white">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={signedDataUrl}
                      alt="客戶簽名"
                      className="w-full h-40 object-contain bg-neutral-50"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setSignedDataUrl(null)}
                    disabled={isSigning}
                    className="text-[11.5px] text-[#185FA5] hover:underline disabled:opacity-40"
                  >
                    ↺ 重新簽名
                  </button>
                </div>
              ) : (
                <SignatureCanvas onSigned={(dataUrl) => setSignedDataUrl(dataUrl)} />
              )}
            </div>

            {signError && (
              <div className="mt-3 rounded-md bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] text-[12px] px-3 py-2">
                {signError}
              </div>
            )}
          </Panel>
          <Footer>
            <Btn variant="ghost" onClick={() => goStep(2)}>
              ← 返回
            </Btn>
            <Btn
              variant="primary"
              onClick={() => {
                if (!(insuranceVerified && !!signedDataUrl && !!savedRecordId)) return;
                setSignError(null);
                startSigningTransition(async () => {
                  const res = await startTestDriveWithSignatureAction(savedRecordId!, {
                    dataUrl: signedDataUrl!,
                    signerName: customerName || undefined,
                    consentVersion: TEST_DRIVE_CONSENT_VERSION,
                    insuranceVerified: true,
                    insuranceNote: insuranceNote.trim() || undefined,
                  });
                  if (res.ok) {
                    showToast("✓ 已簽名，開始試駕");
                    goStep(4);
                  } else {
                    setSignError(res.error);
                  }
                });
              }}
              disabled={!(insuranceVerified && !!signedDataUrl && !!savedRecordId) || isSigning}
            >
              {isSigning ? "儲存中⋯" : "確認簽名並開始試駕 →"}
            </Btn>
          </Footer>
        </div>
      )}

      {/* STEP 4（原第 3） — 試駕計時 */}
      {step === 4 && (
        <div className="space-y-3" data-test-pane="4">
          <Panel
            icon="⏱️"
            iconBg="bg-[#E1F5EE]"
            title="試駕計時"
            sub="記錄實際試駕開始/結束時間"
            badge={running ? "試駕中" : stopped ? "已結束" : "待開始"}
            badgeTone={running ? "red" : "teal"}
          >
            <div className="text-center py-5">
              <div className="text-[11.5px] text-[#9A9890] mb-1.5">試駕時長</div>
              <div className="text-[56px] font-bold font-mono text-[#1A3A5C] leading-none" data-test-id="td-timer-display">
                {formatTime(seconds)}
              </div>
              <div className="text-[12px] text-[#9A9890] mt-2">{startedLabel}</div>
            </div>
            <div className="flex gap-3 justify-center mt-2.5">
              <Btn variant="teal" onClick={startTimer} disabled={running}>
                ▶ 開始試駕
              </Btn>
              <Btn variant="ghost" onClick={stopTimer} disabled={!running}>
                ⏹ 結束試駕
              </Btn>
            </div>
            <Divider />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-2.5">
              <Field label="出發里程（km）">
                <input
                  type="text"
                  className={fiClass}
                  value={kmStart}
                  onChange={(e) => setKmStart(e.target.value)}
                  placeholder="記錄儀表板里程"
                />
              </Field>
              <Field label="返回里程（km）">
                <input
                  type="text"
                  className={fiClass}
                  value={kmEnd}
                  onChange={(e) => setKmEnd(e.target.value)}
                  placeholder="試駕後里程"
                />
              </Field>
              <Field label="試駕總里程">
                <input
                  type="text"
                  className={`${fiClass} bg-[#F4F3F0] font-mono font-bold text-[#1A3A5C]`}
                  value={kmTotal}
                  readOnly
                  placeholder="自動計算"
                />
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2.5 mt-2.5">
              <Field label="陪同人員">
                <select className={fsClass} value={escort} onChange={(e) => setEscort(e.target.value)}>
                  {TD_ESCORT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="試駕路況記錄">
                <input
                  type="text"
                  className={fiClass}
                  value={roadNote}
                  onChange={(e) => setRoadNote(e.target.value)}
                  placeholder="例：山路彎道，路況良好"
                />
              </Field>
            </div>
          </Panel>
          <Footer>
            <Btn variant="ghost" onClick={() => goStep(3)}>
              ← 返回
            </Btn>
            <Btn variant="primary" onClick={() => goStep(5)}>
              試駕結束 → 結果評估
            </Btn>
          </Footer>
        </div>
      )}

      {/* STEP 5（原第 4） — 結束評估 · 黃金時刻 */}
      {step === 5 && (
        <div className="space-y-3" data-test-pane="5">
          {/* 黃金時刻 */}
          <div className="rounded-xl p-6 text-white text-center bg-gradient-to-br from-[#7A1010] to-[#C8001A]">
            <div className="text-[20px] font-bold mb-1.5">⚡ 黃金時刻</div>
            <div className="text-[13px] opacity-85 mb-4 leading-relaxed">
              試駕剛結束是客戶意願最高的時刻
              <br />
              現在立即開立報價單，把握成交機會！
            </div>
            <div className="flex gap-2.5 justify-center flex-wrap">
              <button
                type="button"
                onClick={() => showToast("🏷️ 跳轉至 RS04 報價單（demo）")}
                className="px-5 py-2.5 rounded-lg text-[13px] font-semibold bg-white text-[#7A1010] hover:bg-[#FDECEA]"
              >
                🏷️ 立即開立報價單 RS04
              </button>
              <button
                type="button"
                onClick={() => setShowSkipReason(true)}
                className="px-5 py-2.5 rounded-lg text-[13px] font-semibold border-[1.5px] border-white/40 bg-white/15 hover:bg-white/25 text-white"
                style={{ display: showSkipReason ? "none" : undefined }}
              >
                稍後再說（填寫原因）
              </button>
            </div>
            {showSkipReason && (
              <div className="mt-3">
                <select
                  className="w-full max-w-[400px] mx-auto px-3 py-2 rounded-lg text-[13px] text-[#2C2C2A]"
                  value={skipReason}
                  onChange={(e) => {
                    setSkipReason(e.target.value);
                    if (e.target.value !== TD_SKIP_REASONS[0]) showToast("📝 跳過原因已記錄");
                  }}
                >
                  {TD_SKIP_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <Panel
            icon="📝"
            iconBg="bg-[#FDF3E3]"
            title="試駕結果記錄"
            sub="回寫至 RS01 電子手卡（唯讀）"
          >
            <SectionTitle>客戶整體感受</SectionTitle>
            <div className="flex gap-1 mb-3">
              {TD_OVERALL_FEEDBACK.map((f) => {
                const selected = overall === f.tone;
                const toneCls = selected
                  ? f.tone === "ok"
                    ? "bg-[#E1F5EE] border-[#5DCAA5] text-[#0F6E56] font-bold"
                    : f.tone === "amber"
                    ? "bg-[#FDF3E3] border-[#F0C97E] text-[#854F0B] font-bold"
                    : "bg-[#FDECEA] border-[#F5AEAD] text-[#C8001A] font-bold"
                  : "bg-[#F4F3F0] border-[#D5D3CB] text-[#2C2C2A]";
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setOverall(f.tone)}
                    className={`px-3 py-1.5 rounded-md border-[1.5px] text-[12.5px] transition ${toneCls}`}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2.5 mb-3">
              <Field label="動力感受">
                <select className={fsClass} value={powerFeel} onChange={(e) => setPowerFeel(e.target.value)}>
                  {TD_POWER_FEEL.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="操控靈活性">
                <select className={fsClass} value={handlingFeel} onChange={(e) => setHandlingFeel(e.target.value)}>
                  {TD_HANDLING_FEEL.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="坐姿/人機工學">
                <select className={fsClass} value={ergo} onChange={(e) => setErgo(e.target.value)}>
                  {TD_ERGONOMICS.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="試駕後意向變化">
                <select className={fsClass} value={intentChange} onChange={(e) => setIntentChange(e.target.value)}>
                  {TD_INTENT_CHANGE.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <SectionTitle>試駕後推薦車款調整</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2.5 mb-3">
              <Field label="原試駕車款">
                <input type="text" className={`${fiClass} bg-[#F4F3F0]`} value={tdModel} readOnly />
              </Field>
              <Field label="建議追加推薦">
                <select className={fsClass} value={recommendAdjust} onChange={(e) => setRecommendAdjust(e.target.value)}>
                  <option value="維持原車款">維持原車款</option>
                  {models.map((m) => (
                    <option key={m.id} value={`改推 ${m.name}`}>
                      {`改推 ${m.name}`}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="試駕備注 / RS 觀察">
              <textarea
                className={`${fiClass} h-[70px] resize-none`}
                value={rsNote}
                onChange={(e) => setRsNote(e.target.value)}
                placeholder="客戶騎乘習慣觀察、特別反應、後續跟進建議..."
              />
            </Field>
            <Divider />
            <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-md px-3.5 py-2.5 text-[12px] text-[#0C3E70]">
              ℹ️ 以下資料將<b>自動回寫</b>至 RS01 電子手卡（唯讀顯示）：試駕車款、試駕日期、試駕時長、整體感受評分、RS 備注
            </div>
          </Panel>
          <Footer>
            <Btn
              variant="ghost"
              onClick={() => handleCompleteTestDrive()}
              disabled={isSaving}
            >
              {isSaving
                ? "儲存中⋯"
                : savedRecordId
                  ? "✓ 已儲存"
                  : "💾 儲存試駕記錄"}
            </Btn>
            <Btn
              variant="teal"
              onClick={() =>
                handleCompleteTestDrive(() => {
                  setTimeout(
                    () => router.push("/sales/reception/test-rides"),
                    700,
                  );
                })
              }
              disabled={isSaving}
            >
              {isSaving ? "儲存中⋯" : "← 儲存並回到試駕列表"}
            </Btn>
            <Btn
              variant="red"
              onClick={() =>
                handleCompleteTestDrive(() => {
                  setTimeout(() => router.push("/sales/quote/new"), 700);
                })
              }
              disabled={isSaving}
            >
              {isSaving ? "儲存中⋯" : "🏷️ 儲存並開立報價單 →"}
            </Btn>
          </Footer>
        </div>
      )}

      {toast && (
        <div
          className="fixed bottom-6 right-6 bg-[#1A3A5C] text-white px-4 py-2.5 rounded-lg text-[12.5px] z-50 shadow-lg max-w-[320px] leading-relaxed"
          data-test-id="td-toast"
        >
          {toast}
        </div>
      )}
    </main>
  );
}

// ───── helpers ─────

const fiClass =
  "w-full px-2.5 py-1.5 rounded-md border border-[#D5D3CB] text-[12.5px] text-[#2C2C2A] outline-none focus:border-[#85B7EB] bg-white";
const fsClass =
  "w-full px-2.5 py-1.5 rounded-md border border-[#D5D3CB] text-[12.5px] text-[#2C2C2A] outline-none bg-white";

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-semibold text-[#4A4A48] mb-1">
        {label}
        {required && <span className="text-[#C8001A] text-[11px] ml-0.5">*</span>}
      </div>
      {children}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[#EEECE6] my-3" />;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-bold tracking-wider uppercase text-[#9A9890] mt-3.5 mb-2 flex items-center gap-2">
      {children}
      <span className="flex-1 h-px bg-[#EEECE6]" />
    </div>
  );
}

function Panel({
  icon,
  iconBg,
  title,
  sub,
  badge,
  badgeId,
  badgeTone = "gray",
  children,
}: {
  icon: string;
  iconBg: string;
  title: string;
  sub: string;
  badge?: string;
  badgeId?: string;
  badgeTone?: "gray" | "teal" | "red";
  children: React.ReactNode;
}) {
  const badgeCls =
    badgeTone === "teal"
      ? "bg-[#E1F5EE] text-[#0F6E56]"
      : badgeTone === "red"
      ? "bg-[#FDECEA] text-[#C8001A]"
      : "bg-[#F1EFE8] text-[#9A9890]";
  return (
    <div className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 flex items-center justify-between border-b border-[#EEECE6] bg-[#FAFAF8]">
        <div className="flex items-center gap-2.5">
          <div className={`w-7 h-7 rounded-md flex items-center justify-center text-[13px] shrink-0 ${iconBg}`}>
            {icon}
          </div>
          <div>
            <div className="text-[13px] font-semibold">{title}</div>
            <div className="text-[11px] text-[#9A9890] mt-px">{sub}</div>
          </div>
        </div>
        {badge && (
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold whitespace-nowrap ${badgeCls}`}
            data-test-id={badgeId}
          >
            {badge}
          </span>
        )}
      </div>
      <div className="px-4 py-3.5">{children}</div>
    </div>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 mt-2.5 flex-wrap">{children}</div>;
}

function Btn({
  variant,
  onClick,
  disabled,
  size,
  children,
  testId,
}: {
  variant: "primary" | "ghost" | "teal" | "red";
  onClick?: () => void;
  disabled?: boolean;
  size?: "sm";
  children: React.ReactNode;
  testId?: string;
}) {
  const sz = size === "sm" ? "px-3 py-1 text-[12px]" : "px-4 py-1.5 text-[12.5px]";
  const tone =
    variant === "primary"
      ? "bg-[#1A3A5C] border-[#1A3A5C] text-white hover:bg-[#142E4A]"
      : variant === "teal"
      ? "bg-[#0F6E56] border-[#0F6E56] text-white hover:bg-[#085041]"
      : variant === "red"
      ? "bg-[#C8001A] border-[#C8001A] text-white hover:bg-[#A8001A]"
      : "bg-white border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0]";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      data-test-id={testId}
      className={`rounded-md border font-semibold transition whitespace-nowrap ${sz} ${tone} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      {children}
    </button>
  );
}
