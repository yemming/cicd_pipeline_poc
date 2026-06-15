"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { EntityImageGallery } from "@/components/image-upload/entity-image-gallery";
import {
  DEFAULT_CLEANING_ITEMS,
  DEFAULT_TEST_DRIVE_ITEMS,
  SERVICE_CATEGORY_COLOR,
  STATUS_CHIP,
  STATUS_LABEL,
  STEP_LABELS,
  hasAnyFail,
  isLineResultsAllPassed,
  type CheckState,
  type CleaningItem,
  type LineResult,
  type NotifyMethod,
  type ServiceCategory,
  type TestDriveItem,
} from "@/domain/final-inspections.constants";
import { NOTIFY_METHOD_LABEL } from "@/domain/final-inspections.constants";
import type { FinalInspectionListRow } from "@/domain/final-inspections";
import {
  addNotificationAction,
  clearSignAction,
  completeAction,
  rejectAction,
  signAction,
  updateCleaningAction,
  updateLineResultsAction,
  updateNextServiceAction,
  updateTestDriveAction,
} from "@/lib/aftersales/final-inspection-actions";

type Banner = { ok: boolean; msg: string } | null;

type TechnicianOption = { id: string; name: string; code: string };

/** Step4 可授權複檢的職級清單 */
const AUTHORIZED_INSPECTOR_ROLES = ["資深技師", "售後主管", "技師長"] as const;

type Props = {
  data: FinalInspectionListRow;
  canEdit: boolean;
  /** M-09：技師清單供複檢 step4 選人 + 後端驗證（inspector 不得為施工 lead tech） */
  technicians?: TechnicianOption[];
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function FinalInspectionWizard({ data, canEdit, technicians = [] }: Props) {
  useSetPageHeader({
    title: "竣工複檢",
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "竣工複檢", href: "/parts/aftersales/final-inspections" },
      { label: data.inspection_no },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // step1
  const [lineResults, setLineResults] = useState<LineResult[]>(data.line_results);
  const [issueNote, setIssueNote] = useState<string>(data.issue_note ?? "");
  /** 退回重工原因（必填，退回前必須填寫，獨立欄位，移除 prompt() fallback） */
  const [reworkReason, setReworkReason] = useState<string>("");

  // step2
  const initTestDriveItems: TestDriveItem[] =
    Array.isArray(data.test_drive?.items) && data.test_drive.items.length > 0
      ? data.test_drive.items
      : DEFAULT_TEST_DRIVE_ITEMS;
  const [tdKmBefore, setTdKmBefore] = useState<string>(
    data.test_drive?.km_before != null ? String(data.test_drive.km_before) : data.mileage_in != null ? String(data.mileage_in) : "",
  );
  const [tdKmAfter, setTdKmAfter] = useState<string>(
    data.test_drive?.km_after != null ? String(data.test_drive.km_after) : "",
  );
  const [tdRoute, setTdRoute] = useState<string>(data.test_drive?.route ?? "");
  const [tdTime, setTdTime] = useState<string>(data.test_drive?.test_time ?? "");
  const [tdTechnician, setTdTechnician] = useState<string>(data.test_drive?.technician ?? "");
  const [tdNote, setTdNote] = useState<string>(data.test_drive?.note ?? "");
  const [tdItems, setTdItems] = useState<TestDriveItem[]>(initTestDriveItems);

  // step3
  const initCleanItems: CleaningItem[] =
    Array.isArray(data.cleaning?.items) && data.cleaning.items.length > 0
      ? data.cleaning.items
      : DEFAULT_CLEANING_ITEMS;
  const [cleanItems, setCleanItems] = useState<CleaningItem[]>(initCleanItems);
  const [personalNote, setPersonalNote] = useState<string>(
    data.cleaning?.personal_items_note ?? "",
  );

  // step4
  const [signName, setSignName] = useState<string>(data.inspector_name ?? "");
  const [signRole, setSignRole] = useState<string>(data.inspector_role ?? "資深技師");
  const [signoffNote, setSignoffNote] = useState<string>(data.signoff_note ?? "");
  /** M-09：複檢技師 ID（對照 lead_technician_id 後端驗） */
  const [inspectorId, setInspectorId] = useState<string>(data.inspector_id ?? "");

  // step5
  const [nsKm, setNsKm] = useState<string>(data.next_service?.km != null ? String(data.next_service.km) : "");
  const [nsDate, setNsDate] = useState<string>(data.next_service?.date ?? "");
  const [nsItems, setNsItems] = useState<string>(data.next_service?.items ?? "");
  const [nsSaNote, setNsSaNote] = useState<string>(data.next_service?.sa_note ?? "");

  const totalLines = lineResults.length;
  const passedCount = lineResults.filter((l) => l.state === "ok").length;
  const failCount = lineResults.filter((l) => l.state === "fail").length;
  const allPassed = isLineResultsAllPassed(lineResults);
  const anyFail = hasAnyFail(lineResults);
  const isSigned = !!data.signed_at;
  const isCompleted = data.status === "completed";
  const isRejected = data.status === "rejected";
  const readonly = !canEdit || isCompleted;
  /** 退回重修次數（來自 RO metadata.rework_count） */
  const qcAttemptCount = data.qc_attempt_count ?? 0;
  /** Step4 職級授權檢查：inspector_role 不在授權清單時阻擋簽名 */
  const isRoleAuthorized =
    !signRole || (AUTHORIZED_INSPECTOR_ROLES as readonly string[]).includes(signRole);

  function showBanner(b: NonNullable<Banner>) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function setLineState(idx: number, state: CheckState) {
    setLineResults((prev) => prev.map((l, i) => (i === idx ? { ...l, state } : l)));
  }

  function saveStep1() {
    startTransition(async () => {
      const res = await updateLineResultsAction(data.id, {
        line_results: lineResults,
        issue_note: issueNote || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存複檢結果" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function saveStep2() {
    const before = tdKmBefore ? parseInt(tdKmBefore.replace(/,/g, ""), 10) : null;
    const after = tdKmAfter ? parseInt(tdKmAfter.replace(/,/g, ""), 10) : null;
    startTransition(async () => {
      const res = await updateTestDriveAction(data.id, {
        km_before: Number.isFinite(before) ? before : null,
        km_after: Number.isFinite(after) ? after : null,
        route: tdRoute || null,
        test_time: tdTime || null,
        technician: tdTechnician || null,
        items: tdItems,
        note: tdNote || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存試車記錄" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function saveStep3() {
    startTransition(async () => {
      const res = await updateCleaningAction(data.id, {
        items: cleanItems,
        personal_items_note: personalNote || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存清潔確認" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function doSign() {
    if (!signName.trim()) {
      showBanner({ ok: false, msg: "請填寫複檢人員姓名" });
      return;
    }
    if (!allPassed) {
      showBanner({ ok: false, msg: "尚有維修項目未通過複檢，無法簽核" });
      return;
    }
    // 前端授權不足阻擋（後端 signAction 亦需同步驗，目前 signAction 僅驗 M-09）
    if (!isRoleAuthorized) {
      showBanner({ ok: false, msg: `職級「${signRole}」不具備複檢簽核授權，請聯絡資深技師 / 售後主管 / 技師長` });
      return;
    }
    startTransition(async () => {
      const res = await signAction(data.id, {
        signature_text: signName.trim(),
        inspector_name: signName.trim(),
        inspector_role: signRole || null || undefined,
        signoff_note: signoffNote || undefined,
        // M-09：傳技師 ID 供後端驗「不得自簽自檢」
        inspector_id: inspectorId || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 簽核完成" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function clearSign() {
    if (isCompleted) return;
    startTransition(async () => {
      const res = await clearSignAction(data.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "已清除簽名" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function reject() {
    // 退回重工原因為必填（設計稿：退回原因必填才能送出）
    const reason = reworkReason.trim() || issueNote.trim();
    if (!reason) {
      showBanner({ ok: false, msg: "請填寫退回重工原因（必填）" });
      return;
    }
    startTransition(async () => {
      const res = await rejectAction(data.id, reason);
      if (res.ok) {
        showBanner({ ok: true, msg: "已退回技師重修，工單狀態 → 維修中" });
        setReworkReason(""); // 送出後清空退回原因欄
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function sendNotify(method: NotifyMethod) {
    startTransition(async () => {
      const res = await addNotificationAction(data.id, { method });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已記錄${NOTIFY_METHOD_LABEL[method]}通知` });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function saveNextService() {
    const km = nsKm ? parseInt(nsKm.replace(/,/g, ""), 10) : null;
    startTransition(async () => {
      const res = await updateNextServiceAction(data.id, {
        km: Number.isFinite(km) ? km : null,
        date: nsDate || null,
        items: nsItems || null,
        sa_note: nsSaNote || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存下次保養提醒" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function complete() {
    // 若尚未發送任何取車通知，以 confirm 提示確認（設計稿：completeRO 前驗證 notifySent）
    if (data.notifications.length === 0) {
      const confirmed = window.confirm(
        "尚未發送任何取車通知，確定要關閉 RO？\n\n建議先在 Step 5 通知車主後再完成交車。",
      );
      if (!confirmed) return;
    }
    startTransition(async () => {
      const res = await completeAction(data.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 複檢完成，工單推進到「待結帳」" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const kmDiff = useMemo(() => {
    const a = parseInt((tdKmAfter || "").replace(/,/g, ""), 10);
    const b = parseInt((tdKmBefore || "").replace(/,/g, ""), 10);
    if (Number.isFinite(a) && Number.isFinite(b) && a > b) return a - b;
    return null;
  }, [tdKmAfter, tdKmBefore]);

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + 模式 / CRUD pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link
            href="/parts/aftersales/final-inspections"
            className="hover:text-[#185FA5]"
          >
            竣工複檢
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{data.inspection_no}</span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] ${STATUS_CHIP[data.status]}`}
          >
            {STATUS_LABEL[data.status]}
          </span>
          {isRejected ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]">
              退回原因：{data.issue_note ?? "—"}
            </span>
          ) : null}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/final-inspections"
            className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          {data.ro_code ? (
            <Link
              href={`/parts/aftersales/repair-orders/${data.repair_order_id}/lines`}
              className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
            >
              查看 RO {data.ro_code}
            </Link>
          ) : null}
          {!isCompleted && canEdit && anyFail ? (
            <button
              type="button"
              onClick={reject}
              disabled={isPending}
              className="h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
            >
              {isPending ? "處理中⋯" : "退回技師重修"}
            </button>
          ) : null}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4 flex-wrap">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">FINAL INSPECTION</div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {data.ro_code ?? "—"}　{data.customer_name ?? "未掛車主"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{data.inspection_no}</span>
                <span className="text-[#9A9890]">·</span>
                <span>{data.vehicle_model_name ?? "—"}</span>
                <span className="font-mono text-[#5A5955]">{data.vehicle_license_plate ?? ""}</span>
                <span className="text-[#9A9890]">·</span>
                <span>進廠里程 {data.mileage_in?.toLocaleString() ?? "—"} km</span>
              </div>
            </div>
            <div className="flex items-center gap-2 text-[11.5px] text-[#5A5955] flex-wrap">
              <span>複檢員：{data.inspector_name ?? "—"}</span>
              <span className="text-[#9A9890]">|</span>
              <span>職級：{data.inspector_role ?? "—"}</span>
              <span className="text-[#9A9890]">|</span>
              <span>更新時間：{fmtDateTime(data.updated_at)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-[#1A3A5C] text-white text-[12px]">
            <div className="flex flex-col items-center min-w-[70px]">
              <span className="text-[10px] opacity-70">維修項目</span>
              <span className="text-[14px] font-bold">{totalLines} 項</span>
            </div>
            <div className="flex flex-col items-center min-w-[70px]">
              <span className="text-[10px] opacity-70">已通過</span>
              <span className="text-[14px] font-bold text-[#7FFFD4]">
                {passedCount} / {totalLines}
              </span>
            </div>
            <div className="flex flex-col items-center min-w-[70px]">
              <span className="text-[10px] opacity-70">異常</span>
              <span className="text-[14px] font-bold text-[#FFB3B3]">{failCount}</span>
            </div>
            <div className="flex flex-col items-center min-w-[80px]">
              <span className="text-[10px] opacity-70">通知次數</span>
              <span className="text-[14px] font-bold">{data.notifications.length}</span>
            </div>
            {data.estimated_total != null ? (
              <div className="flex flex-col items-center min-w-[90px]">
                <span className="text-[10px] opacity-70">預估費用</span>
                <span className="text-[13px] font-bold text-[#7FFFD4]">
                  NT${data.estimated_total.toLocaleString()}
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {/* Steps */}
      <div className="bg-white border border-[#EEECE6] rounded-lg p-3">
        <div className="flex items-center gap-1 flex-wrap">
          {STEP_LABELS.map((label, i) => {
            const n = (i + 1) as 1 | 2 | 3 | 4 | 5;
            const active = step === n;
            const done = step > n || (n <= 3 && allPassed) || (n === 4 && isSigned) || (n === 5 && isCompleted);
            return (
              <button
                key={label}
                type="button"
                onClick={() => setStep(n)}
                className={`h-[34px] px-3 rounded-full text-[12px] flex items-center gap-1.5 border transition-colors ${
                  active
                    ? "bg-[#1A3A5C] text-white border-[#1A3A5C]"
                    : done
                    ? "bg-[#EAF3DE] text-[#3B6D11] border-[#C5DC9F] hover:bg-[#dcecca]"
                    : "bg-white text-[#5A5955] border-[#D5D3CB] hover:border-[#9A9890]"
                }`}
              >
                <span
                  className={`w-[20px] h-[20px] rounded-full flex items-center justify-center text-[11px] font-bold ${
                    active
                      ? "bg-white text-[#1A3A5C]"
                      : done
                      ? "bg-[#3B6D11] text-white"
                      : "bg-[#F2F2F2] text-[#9A9890]"
                  }`}
                >
                  {done ? "✓" : n}
                </span>
                <span className="font-medium">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      {step === 1 ? (
        <Step1
          lineResults={lineResults}
          setLineState={setLineState}
          issueNote={issueNote}
          setIssueNote={setIssueNote}
          reworkReason={reworkReason}
          setReworkReason={setReworkReason}
          onSave={saveStep1}
          onReject={reject}
          isPending={isPending}
          readonly={readonly}
        />
      ) : null}

      {step === 2 ? (
        <Step2
          tdKmBefore={tdKmBefore}
          setTdKmBefore={setTdKmBefore}
          tdKmAfter={tdKmAfter}
          setTdKmAfter={setTdKmAfter}
          kmDiff={kmDiff}
          tdRoute={tdRoute}
          setTdRoute={setTdRoute}
          tdTime={tdTime}
          setTdTime={setTdTime}
          tdTechnician={tdTechnician}
          setTdTechnician={setTdTechnician}
          tdItems={tdItems}
          setTdItems={setTdItems}
          tdNote={tdNote}
          setTdNote={setTdNote}
          onSave={saveStep2}
          isPending={isPending}
          readonly={readonly}
        />
      ) : null}

      {step === 3 ? (
        <Step3
          cleanItems={cleanItems}
          setCleanItems={setCleanItems}
          personalNote={personalNote}
          setPersonalNote={setPersonalNote}
          onSave={saveStep3}
          isPending={isPending}
          readonly={readonly}
        />
      ) : null}

      {step === 4 ? (
        <Step4
          allPassed={allPassed}
          isSigned={isSigned}
          signedAt={data.signed_at}
          signatureText={data.signature_text}
          signName={signName}
          setSignName={setSignName}
          signRole={signRole}
          setSignRole={setSignRole}
          signoffNote={signoffNote}
          setSignoffNote={setSignoffNote}
          onSign={doSign}
          onClear={clearSign}
          isPending={isPending}
          readonly={readonly}
          // M-09：技師選人（inspector_id）+ lead_tech 阻止自簽
          technicians={technicians}
          inspectorId={inspectorId}
          setInspectorId={setInspectorId}
          leadTechnicianId={data.lead_technician_id}
          // 複檢次數 badge + 授權不足阻擋
          qcAttemptCount={qcAttemptCount}
          isRoleAuthorized={isRoleAuthorized}
        />
      ) : null}

      {step === 5 ? (
        <Step5
          customerName={data.customer_name}
          vehicleModel={data.vehicle_model_name}
          vehiclePlate={data.vehicle_license_plate}
          notifications={data.notifications}
          isCompleted={isCompleted}
          isSigned={isSigned}
          nsKm={nsKm}
          setNsKm={setNsKm}
          nsDate={nsDate}
          setNsDate={setNsDate}
          nsItems={nsItems}
          setNsItems={setNsItems}
          nsSaNote={nsSaNote}
          setNsSaNote={setNsSaNote}
          onSendNotify={sendNotify}
          onSaveNextService={saveNextService}
          onComplete={complete}
          isPending={isPending}
          readonly={readonly}
          // 通知預覽補費用 + 維修摘要
          estimatedTotal={data.estimated_total}
          lineResultsSummary={lineResults.slice(0, 3).map((l) => l.label).join("、")}
        />
      ) : null}

      {/* 竣工照片區（貫穿所有 step，最多 12 張） */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 竣工照片證據
          </h2>
          <span className="text-[11.5px] text-[#9A9890]">
            （試車後 / 清潔後 / 交車前現場照片，作為複檢與交車存證，最多 12 張）
          </span>
          <span className="ml-auto text-[11px] text-[#9A9890]">
            已上傳 {data.photos.length} / 12 張
          </span>
        </header>
        <div className="px-4 py-3">
          <EntityImageGallery
            entity="final-inspection"
            entityId={data.id}
            images={data.photos}
            alt="竣工照片"
            canEdit={canEdit && !isCompleted}
            width={320}
            height={210}
            maxImages={12}
            emptyHint="點擊上傳竣工照片（試車記錄 / 清潔狀態 / 交車前外觀）"
          />
        </div>
      </section>

      {/* footer nav */}
      <div className="flex items-center justify-between bg-white border border-[#EEECE6] rounded-lg px-4 py-2.5">
        <button
          type="button"
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4 | 5) : s))}
          disabled={step === 1}
          className="h-[32px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
        >
          ← 上一步
        </button>
        <span className="text-[11.5px] text-[#9A9890]">
          步驟 {step} / 5　{STEP_LABELS[step - 1]}
        </span>
        <button
          type="button"
          onClick={() => setStep((s) => (s < 5 ? ((s + 1) as 1 | 2 | 3 | 4 | 5) : s))}
          disabled={step === 5}
          className="h-[32px] px-3 rounded text-[12.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-40"
        >
          下一步：{step < 5 ? STEP_LABELS[step as 1 | 2 | 3 | 4] : "—"} →
        </button>
      </div>

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
    </main>
  );
}

/* ============= Sub components ============== */

function CheckRow({
  label,
  remark,
  state,
  onChange,
  okLabel = "✓ 通過",
  failLabel = "✕ 異常",
  readonly,
}: {
  label: string;
  remark?: string | null;
  state: CheckState;
  onChange: (s: CheckState) => void;
  okLabel?: string;
  failLabel?: string;
  readonly?: boolean;
}) {
  const bg =
    state === "ok"
      ? "bg-[#EAF3DE] border-[#C5DC9F]"
      : state === "fail"
      ? "bg-[#FDECEA] border-[#F5AEAD]"
      : "bg-white border-[#EEECE6]";
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-md border ${bg}`}>
      <div
        className={`w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold ${
          state === "ok"
            ? "bg-[#3B6D11] text-white"
            : state === "fail"
            ? "bg-[#CC0000] text-white"
            : "bg-white border border-[#D5D3CB] text-[#9A9890]"
        }`}
      >
        {state === "ok" ? "✓" : state === "fail" ? "✕" : ""}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[12.5px] text-[#2C2C2A]">{label}</div>
        {remark ? <div className="text-[11px] text-[#9A9890]">{remark}</div> : null}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => onChange("ok")}
          disabled={readonly}
          className={`h-[26px] px-2.5 rounded text-[11.5px] border ${
            state === "ok"
              ? "bg-[#0F6E56] text-white border-[#0F6E56]"
              : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#0F6E56]"
          } disabled:opacity-50`}
        >
          {okLabel}
        </button>
        <button
          type="button"
          onClick={() => onChange("fail")}
          disabled={readonly}
          className={`h-[26px] px-2.5 rounded text-[11.5px] border ${
            state === "fail"
              ? "bg-[#CC0000] text-white border-[#CC0000]"
              : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#CC0000]"
          } disabled:opacity-50`}
        >
          {failLabel}
        </button>
      </div>
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <h2 className="text-[13px] font-semibold text-[#2C2C2A]">{title}</h2>
      </header>
      <div className="px-4 py-3 space-y-2">{children}</div>
    </section>
  );
}

function Step1({
  lineResults,
  setLineState,
  issueNote,
  setIssueNote,
  reworkReason,
  setReworkReason,
  onSave,
  onReject,
  isPending,
  readonly,
}: {
  lineResults: LineResult[];
  setLineState: (i: number, s: CheckState) => void;
  issueNote: string;
  setIssueNote: (v: string) => void;
  reworkReason: string;
  setReworkReason: (v: string) => void;
  onSave: () => void;
  onReject: () => void;
  isPending: boolean;
  readonly: boolean;
}) {
  const anyFail = lineResults.some((l) => l.state === "fail");

  // 依系統類別分組（service_category 存在時以類別分組，否則 fallback 到 labor/part 兩欄）
  const hasCategoryData = lineResults.some((l) => l.service_category);

  // 收集全部出現過的類別（保持設計稿順序）
  const CATEGORY_ORDER: ServiceCategory[] = ["引擎系統", "煞車系統", "電氣系統", "一般保養", "其他"];
  const categoryGroups: Map<ServiceCategory | "_labor" | "_part", { r: LineResult; i: number }[]> = new Map();

  if (hasCategoryData) {
    // 依 service_category 分組
    lineResults.forEach((r, i) => {
      const cat: ServiceCategory = r.service_category ?? "其他";
      if (!categoryGroups.has(cat)) categoryGroups.set(cat, []);
      categoryGroups.get(cat)!.push({ r, i });
    });
  } else {
    // fallback：labor / part 兩群
    lineResults.forEach((r, i) => {
      const key = r.kind === "part" ? "_part" : "_labor";
      if (!categoryGroups.has(key)) categoryGroups.set(key, []);
      categoryGroups.get(key)!.push({ r, i });
    });
  }

  return (
    <div className={`space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* 系統類別分組或 labor/part 兩欄 */}
      {hasCategoryData ? (
        // 依系統類別逐區顯示，帶色彩 section header
        <div className="space-y-3">
          {CATEGORY_ORDER.filter((cat) => categoryGroups.has(cat)).map((cat) => {
            const color = SERVICE_CATEGORY_COLOR[cat];
            const items = categoryGroups.get(cat) ?? [];
            return (
              <section key={cat} className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
                <header className={`px-4 py-2 border-b border-[#EEECE6] flex items-center gap-2 ${color.header}`}>
                  <span className="text-[13px] font-semibold">{cat}</span>
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] border ${color.badge}`}>
                    {items.length} 項
                  </span>
                </header>
                <div className="px-4 py-3 space-y-2">
                  {items.map(({ r, i }) => (
                    <CheckRow
                      key={r.line_id}
                      label={`#${r.line_no}　${r.label}`}
                      remark={r.remark}
                      state={r.state}
                      onChange={(s) => setLineState(i, s)}
                      readonly={readonly}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : (
        // fallback：labor / part 兩欄並列
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <SectionCard title="工資項目逐項複檢">
            {(categoryGroups.get("_labor") ?? []).length === 0 ? (
              <p className="text-[12px] text-[#9A9890]">此工單無工資項目</p>
            ) : (
              (categoryGroups.get("_labor") ?? []).map(({ r, i }) => (
                <CheckRow
                  key={r.line_id}
                  label={`#${r.line_no}　${r.label}`}
                  remark={r.remark}
                  state={r.state}
                  onChange={(s) => setLineState(i, s)}
                  readonly={readonly}
                />
              ))
            )}
          </SectionCard>
          <SectionCard title="零件項目逐項複檢">
            {(categoryGroups.get("_part") ?? []).length === 0 ? (
              <p className="text-[12px] text-[#9A9890]">此工單無零件項目</p>
            ) : (
              (categoryGroups.get("_part") ?? []).map(({ r, i }) => (
                <CheckRow
                  key={r.line_id}
                  label={`#${r.line_no}　${r.label}`}
                  remark={r.remark}
                  state={r.state}
                  onChange={(s) => setLineState(i, s)}
                  readonly={readonly}
                />
              ))
            )}
          </SectionCard>
        </div>
      )}

      {/* 問題記錄卡（anyFail 時才顯示退回重工原因必填欄位） */}
      <SectionCard title={anyFail ? "⚠️ 複檢發現問題" : "備註 / 異常記錄（選填）"}>
        <div className="space-y-3">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] text-[#9A9890] font-medium">問題描述（複檢備註）</label>
            <textarea
              value={issueNote}
              onChange={(e) => setIssueNote(e.target.value)}
              disabled={readonly}
              placeholder="描述複檢發現的問題，作為退回技師重修時的根據..."
              className="w-full min-h-[60px] border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            />
          </div>
          {anyFail && !readonly ? (
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-[#CC0000]">
                退回重工原因 <span className="text-[#CC0000]">*必填</span>
              </label>
              <textarea
                value={reworkReason}
                onChange={(e) => setReworkReason(e.target.value)}
                disabled={readonly}
                placeholder="請詳細說明退回重工原因（必填，送出退回前需填寫）..."
                className={`w-full min-h-[70px] border rounded p-2 text-[12.5px] focus:border-[#CC0000] disabled:bg-[#F8F7F4] ${
                  reworkReason.trim() ? "border-[#D5D3CB]" : "border-[#F5AEAD] bg-[#FDECEA]"
                }`}
              />
              {!reworkReason.trim() ? (
                <p className="text-[11px] text-[#CC0000]">⚠️ 退回重工前請填寫原因</p>
              ) : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-1">
            {anyFail && !readonly ? (
              <button
                type="button"
                onClick={onReject}
                disabled={isPending || !reworkReason.trim()}
                className="h-[32px] px-3.5 rounded text-[12.5px] font-medium bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-50"
              >
                {isPending ? "處理中⋯" : "退回技師重修"}
              </button>
            ) : null}
            <button
              type="button"
              onClick={onSave}
              disabled={isPending || readonly}
              className="h-[32px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
            >
              {isPending ? "儲存中⋯" : "✓ 儲存複檢結果"}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

function Step2({
  tdKmBefore,
  setTdKmBefore,
  tdKmAfter,
  setTdKmAfter,
  kmDiff,
  tdRoute,
  setTdRoute,
  tdTime,
  setTdTime,
  tdTechnician,
  setTdTechnician,
  tdItems,
  setTdItems,
  tdNote,
  setTdNote,
  onSave,
  isPending,
  readonly,
}: {
  tdKmBefore: string;
  setTdKmBefore: (v: string) => void;
  tdKmAfter: string;
  setTdKmAfter: (v: string) => void;
  kmDiff: number | null;
  tdRoute: string;
  setTdRoute: (v: string) => void;
  tdTime: string;
  setTdTime: (v: string) => void;
  tdTechnician: string;
  setTdTechnician: (v: string) => void;
  tdItems: TestDriveItem[];
  setTdItems: (v: TestDriveItem[]) => void;
  tdNote: string;
  setTdNote: (v: string) => void;
  onSave: () => void;
  isPending: boolean;
  readonly: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <SectionCard title="試車基本資訊">
        <div className="grid grid-cols-2 gap-3">
          <Field label="試車前里程 (km)">
            <input
              value={tdKmBefore}
              onChange={(e) => setTdKmBefore(e.target.value)}
              disabled={readonly}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            />
          </Field>
          <Field label="試車後里程 (km)">
            <input
              value={tdKmAfter}
              onChange={(e) => setTdKmAfter(e.target.value)}
              disabled={readonly}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            />
          </Field>
          <Field label="試車距離">
            <input
              value={kmDiff != null ? `${kmDiff} km` : ""}
              readOnly
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] bg-[#EEF6FF] text-[#1A3A5C]"
            />
          </Field>
          <Field label="試車時間">
            <input
              type="time"
              value={tdTime}
              onChange={(e) => setTdTime(e.target.value)}
              disabled={readonly}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            />
          </Field>
          <Field label="試車路線">
            <input
              value={tdRoute}
              onChange={(e) => setTdRoute(e.target.value)}
              placeholder="例：廠區周邊"
              disabled={readonly}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            />
          </Field>
          <Field label="試車技師">
            <input
              value={tdTechnician}
              onChange={(e) => setTdTechnician(e.target.value)}
              disabled={readonly}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            />
          </Field>
        </div>
        <Field label="試車備註">
          <textarea
            value={tdNote}
            onChange={(e) => setTdNote(e.target.value)}
            disabled={readonly}
            placeholder="試車狀況說明..."
            className="w-full min-h-[60px] border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
          />
        </Field>
      </SectionCard>

      <SectionCard title="試車確認項目">
        {tdItems.map((item, i) => (
          <CheckRow
            key={item.id}
            label={item.label}
            state={item.state}
            okLabel="✓ 正常"
            failLabel="✕ 異常"
            onChange={(s) =>
              setTdItems(tdItems.map((it, idx) => (idx === i ? { ...it, state: s } : it)))
            }
            readonly={readonly}
          />
        ))}
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            disabled={isPending || readonly}
            className="h-[32px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            {isPending ? "儲存中⋯" : "✓ 儲存試車記錄"}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

function Step3({
  cleanItems,
  setCleanItems,
  personalNote,
  setPersonalNote,
  onSave,
  isPending,
  readonly,
}: {
  cleanItems: CleaningItem[];
  setCleanItems: (v: CleaningItem[]) => void;
  personalNote: string;
  setPersonalNote: (v: string) => void;
  onSave: () => void;
  isPending: boolean;
  readonly: boolean;
}) {
  return (
    <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      <SectionCard title="交車前清潔確認">
        {cleanItems.map((item, i) => (
          <CheckRow
            key={item.id}
            label={item.label}
            state={item.state}
            okLabel="✓ 完成"
            failLabel="✕ 待處理"
            onChange={(s) =>
              setCleanItems(cleanItems.map((it, idx) => (idx === i ? { ...it, state: s } : it)))
            }
            readonly={readonly}
          />
        ))}
      </SectionCard>
      <SectionCard title="客戶個人物品確認">
        <textarea
          value={personalNote}
          onChange={(e) => setPersonalNote(e.target.value)}
          disabled={readonly}
          placeholder="記錄歸還的個人物品（如安全帽、手套等）..."
          className="w-full min-h-[120px] border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
        />
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onSave}
            disabled={isPending || readonly}
            className="h-[32px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60"
          >
            {isPending ? "儲存中⋯" : "✓ 儲存清潔確認"}
          </button>
        </div>
      </SectionCard>
    </div>
  );
}

function Step4({
  allPassed,
  isSigned,
  signedAt,
  signatureText,
  signName,
  setSignName,
  signRole,
  setSignRole,
  signoffNote,
  setSignoffNote,
  onSign,
  onClear,
  isPending,
  readonly,
  technicians,
  inspectorId,
  setInspectorId,
  leadTechnicianId,
  qcAttemptCount,
  isRoleAuthorized,
}: {
  allPassed: boolean;
  isSigned: boolean;
  signedAt: string | null;
  signatureText: string | null;
  signName: string;
  setSignName: (v: string) => void;
  signRole: string;
  setSignRole: (v: string) => void;
  signoffNote: string;
  setSignoffNote: (v: string) => void;
  onSign: () => void;
  onClear: () => void;
  isPending: boolean;
  readonly: boolean;
  technicians: TechnicianOption[];
  inspectorId: string;
  setInspectorId: (v: string) => void;
  leadTechnicianId: string | null;
  /** 退回重修次數（≥2 次時顯示主管授權警告） */
  qcAttemptCount: number;
  /** 職級授權檢查（false 時阻擋簽名，顯示 auth-fail 區塊） */
  isRoleAuthorized: boolean;
}) {
  /** M-09 前端即時警示：選到施工 lead tech 就顯示紅框（後端也擋） */
  const m09Violated = !!inspectorId && !!leadTechnicianId && inspectorId === leadTechnicianId;
  /** 授權不足：職級不在允許清單（前端即時阻擋，後端 signAction 也驗） */
  const authFailed = !isRoleAuthorized && !isSigned;

  return (
    <div className={`space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {/* 複檢次數 badge（設計稿：藍色 banner，≥2 次顯示 amber 警告要求主管授權） */}
      {qcAttemptCount > 0 ? (
        <div className={`border rounded-lg px-4 py-3 text-[12px] ${
          qcAttemptCount >= 2
            ? "bg-[#FDF3E3] border-[#F5D28B] text-[#854F0B]"
            : "bg-[#EAF4FB] border-[#B8D4EE] text-[#185FA5]"
        }`}>
          {qcAttemptCount >= 2 ? (
            <>
              ⚠️ 本工單複檢次數：<b>第 {qcAttemptCount + 1} 次</b>（已退回 {qcAttemptCount} 次）。
              依規定複檢退回超過 2 次需主管授權，請確認授權後再行簽核。複檢次數記錄於稽核日誌（用於品質分析）。
            </>
          ) : (
            <>
              ℹ️ 本工單複檢次數：<b>第 {qcAttemptCount + 1} 次</b>（已退回 {qcAttemptCount} 次）。
              複檢次數記錄於稽核日誌（用於品質分析）。
            </>
          )}
        </div>
      ) : null}

      {!allPassed && !isSigned ? (
        <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-4 py-3 text-[12px] text-[#CC0000]">
          ⚠️ 尚有維修項目未通過複檢，無法進行簽核。請回到 step 1 完成所有項目。
        </div>
      ) : null}
      {allPassed && !m09Violated && !authFailed ? (
        <div className="bg-[#EAF3DE] border border-[#C5DC9F] rounded-lg px-4 py-3 text-[12px] text-[#3B6D11]">
          ✅ 所有維修項目已通過複檢，可進行電子簽名簽核。
        </div>
      ) : null}
      {m09Violated && (
        <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-4 py-3 text-[12px] text-[#CC0000]">
          ⛔ M-09 違規：施工技師本人不得自行複檢，請選擇其他技師執行竣工複檢。
        </div>
      )}

      {/* 授權不足阻擋區塊（設計稿：auth-fail-block，職級不足時禁止簽名） */}
      {authFailed ? (
        <div className="bg-[#FDECEA] border-2 border-[#CC0000] rounded-lg px-4 py-5 text-center space-y-2">
          <div className="text-[16px] font-semibold text-[#CC0000]">⛔ 授權不足，無法執行複檢簽核</div>
          <div className="text-[12px] text-[#CC0000]">
            目前職級「{signRole || "未選擇"}」不具備執行竣工複檢的授權。
          </div>
          <div className="text-[12px] text-[#5A5955]">
            具授權職級：資深技師 / 售後主管 / 技師長。
            <br />請聯絡具授權職級的人員執行複檢簽核，或更改職級後重試。
          </div>
        </div>
      ) : null}

      <SectionCard title="複檢人員資訊">
        <div className="grid grid-cols-2 gap-3">
          {technicians.length > 0 ? (
            <Field label="選擇複檢技師（M-09）">
              <select
                value={inspectorId}
                onChange={(e) => {
                  const tid = e.target.value;
                  setInspectorId(tid);
                  const found = technicians.find((t) => t.id === tid);
                  if (found) setSignName(found.name);
                }}
                disabled={readonly || isSigned}
                className={`h-[30px] w-full border rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4] ${
                  m09Violated ? "border-[#CC0000] bg-[#FDECEA]" : "border-[#D5D3CB]"
                }`}
              >
                <option value="">-- 選擇複檢技師 --</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id} disabled={t.id === leadTechnicianId}>
                    {t.name}（{t.code}）{t.id === leadTechnicianId ? " ⛔施工主技師" : ""}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field label="複檢人員姓名">
              <input
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
                disabled={readonly || isSigned}
                placeholder="輸入複檢人員姓名"
                className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
              />
            </Field>
          )}
          {technicians.length > 0 && (
            <Field label="複檢人員姓名（自動帶入）">
              <input
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
                disabled={readonly || isSigned}
                placeholder="選擇技師後自動填入"
                className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
              />
            </Field>
          )}
          <Field label="職級">
            <select
              value={signRole}
              onChange={(e) => setSignRole(e.target.value)}
              disabled={readonly || isSigned}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            >
              <option>資深技師</option>
              <option>售後主管</option>
              <option>技師長</option>
              <option>技師</option>
            </select>
          </Field>
        </div>
      </SectionCard>

      <SectionCard title="電子簽名">
        {isSigned ? (
          <div className="border border-[#1A3A5C] rounded-lg bg-white px-4 py-6 flex flex-col items-center gap-2">
            <span className="text-[28px] font-serif italic text-[#1A3A5C]">
              {signatureText ?? signName}
            </span>
            <div className="flex items-center justify-between w-full text-[11px] text-[#9A9890] mt-2">
              <span>複檢員：{signName}（{signRole}）</span>
              <span>簽核時間：{signedAt ? fmtDateTimeFull(signedAt) : "—"} ｜ 防竄改時間戳已記錄</span>
            </div>
            <button
              type="button"
              onClick={onClear}
              disabled={readonly || isPending}
              className="h-[28px] px-3 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50 mt-1"
            >
              清除重簽
            </button>
          </div>
        ) : authFailed ? (
          // 授權不足時完全禁止簽名區（auth-fail 已在上方顯示說明區塊）
          <div className="border-2 border-dashed border-[#F5AEAD] rounded-lg h-[100px] flex items-center justify-center bg-[#FDECEA]">
            <span className="text-[12.5px] text-[#CC0000]">
              ⛔ 授權不足，無法簽名（請聯絡具授權職級人員）
            </span>
          </div>
        ) : (
          <div
            className={`border-2 border-dashed rounded-lg h-[100px] flex items-center justify-center cursor-pointer transition-colors ${
              allPassed && !m09Violated
                ? "border-[#1A3A5C] bg-[#F8F7F4] hover:bg-white text-[#1A3A5C]"
                : "border-[#D5D3CB] bg-[#F8F7F4] text-[#9A9890]"
            }`}
            onClick={() => allPassed && !readonly && !m09Violated && onSign()}
          >
            <span className="text-[12.5px]">
              {allPassed && !m09Violated ? "請點此完成電子簽名" : "（未通過全部複檢項目，無法簽名）"}
            </span>
          </div>
        )}

        <Field label="複檢結論備註（選填）">
          <textarea
            value={signoffNote}
            onChange={(e) => setSignoffNote(e.target.value)}
            disabled={readonly || isSigned}
            placeholder="例：本工單所有維修項目均已完成，品質符合原廠標準..."
            className="w-full min-h-[60px] border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
          />
        </Field>
        <p className="text-[11px] text-[#9A9890]">
          數位簽名具法律效力且防竄改（POC 階段以姓名字串模擬）
        </p>
      </SectionCard>
    </div>
  );
}

function Step5({
  customerName,
  vehicleModel,
  vehiclePlate,
  notifications,
  isCompleted,
  isSigned,
  nsKm,
  setNsKm,
  nsDate,
  setNsDate,
  nsItems,
  setNsItems,
  nsSaNote,
  setNsSaNote,
  onSendNotify,
  onSaveNextService,
  onComplete,
  isPending,
  readonly,
  estimatedTotal,
  lineResultsSummary,
}: {
  customerName: string | null;
  vehicleModel: string | null;
  vehiclePlate: string | null;
  notifications: { method: NotifyMethod; sent_at: string; note?: string | null }[];
  isCompleted: boolean;
  isSigned: boolean;
  nsKm: string;
  setNsKm: (v: string) => void;
  nsDate: string;
  setNsDate: (v: string) => void;
  nsItems: string;
  setNsItems: (v: string) => void;
  nsSaNote: string;
  setNsSaNote: (v: string) => void;
  onSendNotify: (m: NotifyMethod) => void;
  onSaveNextService: () => void;
  onComplete: () => void;
  isPending: boolean;
  readonly: boolean;
  /** 預估總費用（來自 repair_orders.estimated_total） */
  estimatedTotal: number | null;
  /** 維修項目摘要（前 3 項 label，逗號分隔） */
  lineResultsSummary: string;
}) {
  return (
    <div className={`space-y-3 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
      {!isSigned ? (
        <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-4 py-3 text-[12px] text-[#CC0000]">
          ⚠️ 請先完成 step 4 電子簽名，才能進行取車通知與關閉 RO。
        </div>
      ) : null}

      <SectionCard title="取車通知（請 SA 確認車主時間及費用無誤後手動發送）">
        <div className="bg-[#F8F7F4] border border-[#EEECE6] rounded-md p-3 text-[12px] text-[#5A5955] leading-relaxed">
          【DealerOS 服務中心】<br />
          親愛的 <b>{customerName ?? "車主"}</b> 您好，
          <br />
          您的愛車 <b>{vehicleModel ?? "—"}</b>（
          <span className="font-mono">{vehiclePlate ?? "—"}</span>）已完成維修，隨時可來店取車。
          {lineResultsSummary ? (
            <>
              <br />
              📋 維修項目：{lineResultsSummary}{lineResultsSummary.includes("、") ? "⋯等" : ""}
            </>
          ) : null}
          {estimatedTotal != null ? (
            <>
              <br />
              💰 應付費用：<b>NT${estimatedTotal.toLocaleString()}</b>（含稅，請以結帳時金額為準）
            </>
          ) : null}
          <br />
          🕐 服務時間：週一至週六 09:00-18:00
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["line", "sms", "call"] as NotifyMethod[]).map((m) => {
            const sent = notifications.find((n) => n.method === m);
            return (
              <button
                key={m}
                type="button"
                onClick={() => onSendNotify(m)}
                disabled={!isSigned || readonly || isPending}
                className={`h-[34px] px-4 rounded-md text-[12.5px] border ${
                  sent
                    ? "bg-[#0F6E56] text-white border-[#0F6E56]"
                    : "bg-white text-[#0F6E56] border-[#0F6E56] hover:bg-[#EAF3DE]"
                } disabled:opacity-50`}
              >
                {sent ? "✓ 已送" : "發送"} {NOTIFY_METHOD_LABEL[m]}
              </button>
            );
          })}
        </div>
        {notifications.length > 0 ? (
          <ul className="text-[11.5px] text-[#5A5955] space-y-1 pt-1">
            {notifications.map((n, i) => (
              <li key={i}>
                ✅ {NOTIFY_METHOD_LABEL[n.method]} ｜ 時間：{fmtDateTimeFull(n.sent_at)}
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>

      <SectionCard title="下次保養溫馨提示（交車時告知車主）">
        <div className="grid grid-cols-3 gap-3">
          <Field label="下次保養里程 (km)">
            <input
              value={nsKm}
              onChange={(e) => setNsKm(e.target.value)}
              disabled={readonly}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            />
          </Field>
          <Field label="預計保養日期">
            <input
              type="date"
              value={nsDate}
              onChange={(e) => setNsDate(e.target.value)}
              disabled={readonly}
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            />
          </Field>
          <Field label="建議保養項目">
            <input
              value={nsItems}
              onChange={(e) => setNsItems(e.target.value)}
              disabled={readonly}
              placeholder="例：機油/濾芯更換"
              className="h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
            />
          </Field>
        </div>
        <Field label="SA 交車說明備註">
          <textarea
            value={nsSaNote}
            onChange={(e) => setNsSaNote(e.target.value)}
            disabled={readonly}
            placeholder="交車時需特別向車主說明的事項..."
            className="w-full min-h-[60px] border border-[#D5D3CB] rounded p-2 text-[12.5px] focus:border-[#185FA5] disabled:bg-[#F8F7F4]"
          />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onSaveNextService}
            disabled={readonly || isPending}
            className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存提醒"}
          </button>
        </div>
      </SectionCard>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onComplete}
          disabled={!isSigned || isCompleted || readonly || isPending}
          className="h-[44px] px-6 rounded-lg text-[14px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
        >
          {isCompleted
            ? "✓ 已完成（工單已推進到「待結帳」）"
            : isPending
            ? "處理中⋯"
            : "✓ 完成竣工複檢　關閉 RO 並推進到結帳"}
        </button>
      </div>
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

function fmtDateTimeFull(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
