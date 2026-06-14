"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { EntityImageGallery } from "@/components/image-upload/entity-image-gallery";
import { SignatureCanvas } from "@/components/signature-canvas";
import {
  DECISION_LABEL,
  MODE_CHIP,
  MODE_DESC,
  MODE_LABEL,
  PRE_INSPECTION_MODE,
  PURPOSES,
  SAFETY_CHIP,
  SAFETY_LABEL,
  SA_ASKS,
  SIMPLE_MODE_STEP_INDICES,
  STATUS_CHIP,
  STATUS_LABEL,
  TECH_CATEGORY_BG,
  TECH_CATEGORY_LABEL,
  TECH_CATEGORY_ORDER,
  WIZARD_STEPS,
  computeQuote,
  type AskAnswer,
  type CheckRow,
  type PreInspectionMode,
  type SaQuoteItem,
  type TechCategory,
  type TechDecision,
  type TechRow,
  type TechSafety,
} from "@/domain/pre-inspections.constants";
import type { PreInspectionListRow } from "@/domain/pre-inspections";
import type { EnvCheckItem } from "@/domain/env-check-items";
import {
  cancelAction,
  deleteAction,
  setModeAction,
  signAction,
  transferToRoAction,
  updateAsksAction,
  updateBasicInfoAction,
  updateChecksAction,
  updatePurposesAction,
  updateSaItemsAction,
  updateTechRowsAction,
} from "@/lib/aftersales/pre-inspection-actions";

type Banner = { ok: boolean; msg: string } | null;

type Props = {
  data: PreInspectionListRow;
  canEdit: boolean;
  /** 環檢項目清單（由 page server component 從 business_rules 撈、只給啟用中的） */
  envCheckItems: EnvCheckItem[];
  /**
   * 品牌是否有 Desmo 系統（brand_config.has_desmo）。
   * false（如 Indian）時來廠目的選單隱藏「Desmo 保養」，避免員工誤選。
   * PURPOSES 仍維持原 index（DB 存的是整數 index），只是不渲染該選項。
   */
  hasDesmo: boolean;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function PreInspectionWizard({ data, canEdit, envCheckItems, hasDesmo }: Props) {
  // 把 setting page 維護的環檢項目轉成 wizard 用的 CheckRow 預設值（state=-1=未檢）
  const defaultChecks: CheckRow[] = useMemo(
    () => envCheckItems.map((it) => ({ label: it.label, state: -1 })),
    [envCheckItems],
  );
  useSetPageHeader({
    title: `預檢單 ${data.pi_no}`,
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "接待預檢", href: "/parts/aftersales/pre-inspections" },
      { label: data.pi_no },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [step, setStep] = useState(0);
  // RP2：簽名後把環檢/基本資料設唯讀（sig_locked 由 signAction 設定）
  const sigLocked = !!(data.metadata as { sig_locked?: boolean })?.sig_locked;
  const locked =
    !canEdit || data.status === "transferred" || data.status === "cancelled" || sigLocked;

  const currentMode: PreInspectionMode = data.mode ?? "full";
  // simple mode 只顯示「環車檢查」「確認簽名」兩步；full mode 顯示全部 5 步
  const visibleStepIndices: readonly number[] =
    currentMode === "simple"
      ? (SIMPLE_MODE_STEP_INDICES as readonly number[])
      : WIZARD_STEPS.map((_, i) => i);

  // local state — initialised from server snapshot
  const initialChecks: CheckRow[] = useMemo(() => {
    const m = data.metadata?.checks ?? [];
    if (m.length === 0) return defaultChecks.map((c) => ({ ...c }));
    // 對齊 default 順序：取 default label，state 對得上就用，否則 -1
    return defaultChecks.map((d) => {
      const found = m.find((c) => c.label === d.label);
      return found ? { ...found } : { ...d };
    });
  }, [data.metadata?.checks, defaultChecks]);
  const [checks, setChecks] = useState<CheckRow[]>(initialChecks);
  const [saRemark, setSaRemark] = useState<string>(data.metadata?.sa_remark ?? "");

  const [purposes, setPurposes] = useState<number[]>(data.metadata?.purposes ?? []);
  const [customerWords, setCustomerWords] = useState<string>(
    data.metadata?.customer_words ?? "",
  );

  const [asks, setAsks] = useState<Record<string, AskAnswer>>(data.metadata?.asks ?? {});

  const [techRows, setTechRows] = useState<TechRow[]>(data.metadata?.tech_rows ?? []);
  const [saItems, setSaItems] = useState<SaQuoteItem[]>(data.metadata?.sa_items ?? []);

  // basic info
  const [basic, setBasic] = useState({
    customer_name: data.customer_name ?? "",
    customer_phone: data.customer_phone ?? "",
    vehicle_license_plate: data.vehicle_license_plate ?? "",
    vehicle_model_name: data.vehicle_model_name ?? "",
    mileage_in: data.mileage_in?.toString() ?? "",
  });

  // 包C：手寫簽名後 text 自動帶當事人姓名（保留舊文字存證欄；只讀）
  const [saSig] = useState<string>(data.metadata?.sig_sa?.text ?? "");
  const [custSig] = useState<string>(data.metadata?.sig_customer?.text ?? "");
  // 包C：真 canvas 簽名圖（dataURL）— 取代舊文字 input
  const [saSigImg, setSaSigImg] = useState<string | null>(
    data.metadata?.sig_sa?.screenshot_url ?? null,
  );
  const [custSigImg, setCustSigImg] = useState<string | null>(
    data.metadata?.sig_customer?.screenshot_url ?? null,
  );

  function showBanner(b: NonNullable<Banner>) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function handleSetMode(mode: PreInspectionMode) {
    if (mode === currentMode) return;
    if (locked) return;
    startTransition(async () => {
      const res = await setModeAction(data.id, mode);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已切換為${MODE_LABEL[mode]}` });
        if (mode === "simple" && !SIMPLE_MODE_STEP_INDICES.includes(step as 0 | 4)) {
          setStep(0);
        }
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function refreshAndToast(msg: string) {
    showBanner({ ok: true, msg });
    router.refresh();
  }

  // Step 1 — checks save
  function saveChecks() {
    if (locked) return;
    startTransition(async () => {
      const res = await updateChecksAction(data.id, checks, saRemark);
      if (res.ok) refreshAndToast("✓ 環檢已儲存");
      else showBanner({ ok: false, msg: res.error });
    });
  }
  // Step 1 — basic info save
  function saveBasic() {
    if (locked) return;
    startTransition(async () => {
      const res = await updateBasicInfoAction(data.id, {
        customer_name: basic.customer_name,
        customer_phone: basic.customer_phone,
        vehicle_license_plate: basic.vehicle_license_plate,
        vehicle_model_name: basic.vehicle_model_name,
        mileage_in: basic.mileage_in ? Number(basic.mileage_in) : null,
      });
      if (res.ok) refreshAndToast("✓ 基本資料已儲存");
      else showBanner({ ok: false, msg: res.error });
    });
  }

  // Step 2 — purpose save
  function savePurposes() {
    if (locked) return;
    startTransition(async () => {
      const res = await updatePurposesAction(data.id, {
        purposes,
        customer_words: customerWords,
      });
      if (res.ok) refreshAndToast("✓ 來意已儲存");
      else showBanner({ ok: false, msg: res.error });
    });
  }
  // Step 2 — asks save
  function saveAsks() {
    if (locked) return;
    startTransition(async () => {
      const res = await updateAsksAction(data.id, asks);
      if (res.ok) refreshAndToast("✓ 主動詢問已儲存");
      else showBanner({ ok: false, msg: res.error });
    });
  }

  // Step 3 — tech save
  function saveTech() {
    if (locked) return;
    startTransition(async () => {
      const res = await updateTechRowsAction(data.id, techRows);
      if (res.ok) refreshAndToast("✓ 技師檢查已儲存");
      else showBanner({ ok: false, msg: res.error });
    });
  }

  // Step 4 — sa items save
  function saveSaItems() {
    if (locked) return;
    startTransition(async () => {
      const res = await updateSaItemsAction(data.id, saItems);
      if (res.ok) refreshAndToast("✓ 報價已儲存");
      else showBanner({ ok: false, msg: res.error });
    });
  }

  // Step 5 — sign / transfer
  function handleSign() {
    if (locked) return;
    if (!saSigImg && !custSigImg) {
      showBanner({ ok: false, msg: "請至少完成一個手寫簽名" });
      return;
    }
    startTransition(async () => {
      const res = await signAction(data.id, {
        // 手寫簽名後，text 自動帶當事人姓名（供 both 完成判斷 + 文字存證）
        sa_text: saSigImg ? saSig.trim() || data.sa_name || "SA" : undefined,
        customer_text: custSigImg
          ? custSig.trim() || data.customer_name || "車主"
          : undefined,
        sa_screenshot_url: saSigImg ?? undefined,
        customer_screenshot_url: custSigImg ?? undefined,
      });
      if (res.ok) refreshAndToast("✓ 簽名已儲存");
      else showBanner({ ok: false, msg: res.error });
    });
  }
  function handleTransfer() {
    if (data.status !== "signed") {
      showBanner({ ok: false, msg: "尚未完成簽名，無法轉工單" });
      return;
    }
    startTransition(async () => {
      const res = await transferToRoAction(data.id);
      if (res.ok) {
        refreshAndToast(`✓ 已轉成工單，跳轉中⋯`);
        setTimeout(() => router.push(`/parts/aftersales/repair-orders/${res.data.ro_id}`), 600);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function handleCancel() {
    if (!confirm("確定取消這張預檢單？")) return;
    startTransition(async () => {
      const res = await cancelAction(data.id);
      if (res.ok) refreshAndToast("✓ 已取消");
      else showBanner({ ok: false, msg: res.error });
    });
  }
  function handleDelete() {
    if (!confirm("確定刪除這張預檢單？無法復原")) return;
    startTransition(async () => {
      const res = await deleteAction(data.id);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已刪除" });
        setTimeout(() => router.push("/parts/aftersales/pre-inspections"), 400);
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const quote = computeQuote(saItems, techRows);
  const doneChecks = checks.filter((c) => c.state >= 0).length;
  const damageCount = checks.filter((c) => c.state === 2).length;
  const warnCount = checks.filter((c) => c.state === 1).length;

  return (
    <main className="px-6 py-5 space-y-3">
      {/* Breadcrumb + CRUD pill */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/aftersales/pre-inspections" className="hover:text-[#185FA5]">
            接待預檢
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{data.pi_no}</span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${STATUS_CHIP[data.status]}`}
          >
            {STATUS_LABEL[data.status]}
          </span>
          <span
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap ${MODE_CHIP[currentMode]}`}
            title={MODE_DESC[currentMode]}
          >
            {MODE_LABEL[currentMode]}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/pre-inspections"
            className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            ← 返回列表
          </Link>
          {data.status === "signed" && (
            <button
              onClick={handleTransfer}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#CC0000] text-white hover:bg-[#a50000] shadow-sm disabled:opacity-50"
            >
              {isPending ? "轉換中⋯" : "確認並轉入正式工單 RO →"}
            </button>
          )}
          {data.repair_order_id && (
            <Link
              href={`/parts/aftersales/repair-orders/${data.repair_order_id}`}
              className="h-[30px] inline-flex items-center px-4 rounded-full text-[12px] font-medium bg-[#185FA5] text-white hover:bg-[#0f4a85] shadow-sm"
            >
              查看工單 →
            </Link>
          )}
          {!locked && data.status !== "signed" && (
            <button
              onClick={handleCancel}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
            >
              取消預檢
            </button>
          )}
          {!locked && (
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
            >
              刪除
            </button>
          )}
        </div>
      </div>

      {/* Mode switcher */}
      <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex items-center gap-3 flex-wrap">
        <div>
          <div className="text-[11px] text-[#9A9890] font-medium mb-0.5">預檢模式</div>
          <div className="text-[11.5px] text-[#5A5955]">{MODE_DESC[currentMode]}</div>
        </div>
        <div className="ml-auto inline-flex border border-[#EEECE6] rounded overflow-hidden text-[12px]">
          {PRE_INSPECTION_MODE.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => handleSetMode(m)}
              disabled={locked || isPending}
              className={`h-[30px] px-3.5 transition-colors ${
                currentMode === m
                  ? "bg-[#1A3A5C] text-white font-medium"
                  : "bg-white text-[#5A5955] hover:bg-[#F8F7F4]"
              } disabled:opacity-60`}
            >
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {/* Step pills — simple mode 只顯示可見步驟 */}
      <div className="bg-white border border-[#EEECE6] rounded-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {WIZARD_STEPS.map((s, i) => {
            const visible = visibleStepIndices.includes(i);
            if (!visible) return null;
            return (
              <button
                key={s.key}
                onClick={() => setStep(i)}
                className={`flex-1 min-w-[140px] px-4 h-[44px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-[#EEECE6] inline-flex items-center justify-center gap-2 ${
                  i === step
                    ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                    : "text-[#5A5955] hover:bg-[#F8F7F4]"
                }`}
              >
                <span
                  className={`inline-flex items-center justify-center w-[20px] h-[20px] rounded-full text-[11px] font-semibold ${
                    i === step
                      ? "bg-[#1A3A5C] text-white"
                      : "bg-[#E8E7E4] text-[#3A3A38]"
                  }`}
                >
                  {visibleStepIndices.indexOf(i) + 1}
                </span>
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Step content */}
      <div className="bg-white border border-[#EEECE6] rounded-lg p-4 space-y-4">
        {step === 0 && (
          <Step1Circle
            piId={data.id}
            photos={data.photos ?? []}
            canEdit={canEdit}
            basic={basic}
            setBasic={setBasic}
            checks={checks}
            setChecks={setChecks}
            saRemark={saRemark}
            setSaRemark={setSaRemark}
            warranty={data.metadata?.warranty_snapshot ?? null}
            doneChecks={doneChecks}
            damageCount={damageCount}
            warnCount={warnCount}
            locked={locked}
            isPending={isPending}
            saveBasic={saveBasic}
            saveChecks={saveChecks}
          />
        )}
        {step === 1 && (
          <Step2Purpose
            purposes={purposes}
            setPurposes={setPurposes}
            customerWords={customerWords}
            setCustomerWords={setCustomerWords}
            asks={asks}
            setAsks={setAsks}
            locked={locked}
            isPending={isPending}
            savePurposes={savePurposes}
            saveAsks={saveAsks}
            hasDesmo={hasDesmo}
          />
        )}
        {step === 2 && (
          <Step3Tech
            techRows={techRows}
            setTechRows={setTechRows}
            locked={locked}
            isPending={isPending}
            saveTech={saveTech}
          />
        )}
        {step === 3 && (
          <Step4Quote
            saItems={saItems}
            setSaItems={setSaItems}
            techRows={techRows}
            quote={quote}
            locked={locked}
            isPending={isPending}
            saveSaItems={saveSaItems}
          />
        )}
        {step === 4 && (
          <Step5Sign
            saSigImg={saSigImg}
            setSaSigImg={setSaSigImg}
            custSigImg={custSigImg}
            setCustSigImg={setCustSigImg}
            data={data}
            quote={quote}
            locked={locked}
            isPending={isPending}
            handleSign={handleSign}
          />
        )}
      </div>

      {/* Footer nav — simple mode 跳過中間 step */}
      {(() => {
        const cursor = visibleStepIndices.indexOf(step);
        const prevStep = cursor > 0 ? visibleStepIndices[cursor - 1] : null;
        const nextStep =
          cursor >= 0 && cursor < visibleStepIndices.length - 1
            ? visibleStepIndices[cursor + 1]
            : null;
        return (
          <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3 flex items-center gap-2">
            <button
              onClick={() => prevStep !== null && setStep(prevStep)}
              disabled={prevStep === null}
              className="h-[30px] px-3 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-40"
            >
              ← 上一步
            </button>
            <div className="ml-auto text-[12px] text-[#9A9890]">
              第 {cursor + 1} 步 / {visibleStepIndices.length}
              {WIZARD_STEPS[step]?.label ?? ""}
            </div>
            <button
              onClick={() => nextStep !== null && setStep(nextStep)}
              disabled={nextStep === null}
              className="h-[30px] px-3 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-40"
            >
              {nextStep !== null
                ? `下一步：${WIZARD_STEPS[nextStep].label} →`
                : "已到最後一步"}
            </button>
          </div>
        );
      })()}

      {banner && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 ${
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

/* ───────────────────────────── Step 1 ───────────────────────────── */

function Step1Circle({
  piId,
  photos,
  canEdit,
  basic,
  setBasic,
  checks,
  setChecks,
  saRemark,
  setSaRemark,
  warranty,
  doneChecks,
  damageCount,
  warnCount,
  locked,
  isPending,
  saveBasic,
  saveChecks,
}: {
  piId: string;
  photos: string[];
  canEdit: boolean;
  basic: {
    customer_name: string;
    customer_phone: string;
    vehicle_license_plate: string;
    vehicle_model_name: string;
    mileage_in: string;
  };
  setBasic: React.Dispatch<React.SetStateAction<Step1Basic>>;
  checks: CheckRow[];
  setChecks: React.Dispatch<React.SetStateAction<CheckRow[]>>;
  saRemark: string;
  setSaRemark: (v: string) => void;
  warranty: { valid?: boolean; started_at?: string; expires_at?: string; mileage?: string } | null;
  doneChecks: number;
  damageCount: number;
  warnCount: number;
  locked: boolean;
  isPending: boolean;
  saveBasic: () => void;
  saveChecks: () => void;
}) {
  return (
    <div
      className={`space-y-4 ${isPending ? "pointer-events-none opacity-60" : ""}`}
    >
      <section className="border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 車輛與客戶基本資料</h2>
          <button
            onClick={saveBasic}
            disabled={locked || isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存基本資料"}
          </button>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Inp label="車主姓名" value={basic.customer_name} onChange={(v) => setBasic({ ...basic, customer_name: v })} disabled={locked} />
          <Inp label="聯絡電話" value={basic.customer_phone} onChange={(v) => setBasic({ ...basic, customer_phone: v })} disabled={locked} />
          <Inp label="進廠里程 (km)" type="number" value={basic.mileage_in} onChange={(v) => setBasic({ ...basic, mileage_in: v })} disabled={locked} />
          <Inp label="車型" value={basic.vehicle_model_name} onChange={(v) => setBasic({ ...basic, vehicle_model_name: v })} disabled={locked} />
          <Inp label="車牌號碼" value={basic.vehicle_license_plate} onChange={(v) => setBasic({ ...basic, vehicle_license_plate: v })} disabled={locked} />
        </div>
        {warranty && (
          <div className="mx-4 mb-4 px-3 py-2 bg-[#E1F5EE] border border-[#1D9E75] rounded text-[11.5px] text-[#0F6E56] flex flex-wrap gap-4">
            <span>🛡 保固狀態：<b>{warranty.valid ? "有效" : "無效"}</b></span>
            {warranty.started_at && <span>啟動：{warranty.started_at}</span>}
            {warranty.expires_at && <span>到期：{warranty.expires_at}</span>}
            {warranty.mileage && <span>里程：{warranty.mileage}</span>}
          </div>
        )}
      </section>

      <section className="border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 環檢項目（逐一確認）</h2>
            <span className="text-[11.5px] text-[#9A9890] ml-1">
              已檢 {doneChecks}/{checks.length}
              {damageCount > 0 && (
                <span className="text-[#CC0000]">損傷 {damageCount}　</span>
              )}
              {warnCount > 0 && <span className="text-[#854F0B]">注意 {warnCount}</span>}
            </span>
          </div>
          <button
            onClick={saveChecks}
            disabled={locked || isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存環檢"}
          </button>
        </header>
        <div className="px-4 py-3 space-y-1">
          {checks.map((c, i) => (
            <div key={c.label} className="flex items-center gap-2 py-1.5 border-b last:border-b-0 border-[#F2F2F2]">
              <span className="flex-1 text-[12.5px]">{c.label}</span>
              {([0, 1, 2] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    if (locked) return;
                    const next = [...checks];
                    next[i] = { ...c, state: s };
                    setChecks(next);
                  }}
                  disabled={locked}
                  className={`h-[26px] px-2.5 rounded text-[11.5px] border ${
                    c.state === s
                      ? s === 0
                        ? "bg-[#E1F5EE] text-[#0F6E56] border-[#1D9E75]"
                        : s === 1
                          ? "bg-[#FAEEDA] text-[#854F0B] border-[#BA7517]"
                          : "bg-[#FCEBEB] text-[#CC0000] border-[#CC0000]"
                      : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  } disabled:opacity-60`}
                >
                  {s === 0 ? "正常" : s === 1 ? "注意" : "損傷"}
                </button>
              ))}
            </div>
          ))}
          <div className="pt-2">
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">SA 環檢備註</label>
            <textarea
              value={saRemark}
              onChange={(e) => setSaRemark(e.target.value)}
              disabled={locked}
              rows={2}
              placeholder="記錄現有損傷..."
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
        </div>
      </section>

      {/* 環車照片區 — 最多 20 張 */}
      <section className="border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">
            ▼ 環車照片
            <span className="text-[11.5px] text-[#9A9890] ml-2 font-normal">
              （標記損傷處拍照存證，最多 20 張）
            </span>
          </h2>
        </header>
        <div className="px-4 py-3">
          <EntityImageGallery
            entity="pre-inspection"
            entityId={piId}
            images={photos}
            alt="環車照片"
            canEdit={canEdit && !locked}
            width={360}
            height={240}
            maxImages={20}
            emptyHint="點擊上傳環車照片（多角度損傷存證）"
          />
        </div>
      </section>
    </div>
  );
}

type Step1Basic = {
  customer_name: string;
  customer_phone: string;
  vehicle_license_plate: string;
  vehicle_model_name: string;
  mileage_in: string;
};

/* ───────────────────────────── Step 2 ───────────────────────────── */

function Step2Purpose({
  purposes,
  setPurposes,
  customerWords,
  setCustomerWords,
  asks,
  setAsks,
  locked,
  isPending,
  savePurposes,
  saveAsks,
  hasDesmo,
}: {
  purposes: number[];
  setPurposes: React.Dispatch<React.SetStateAction<number[]>>;
  customerWords: string;
  setCustomerWords: (v: string) => void;
  asks: Record<string, AskAnswer>;
  setAsks: React.Dispatch<React.SetStateAction<Record<string, AskAnswer>>>;
  locked: boolean;
  isPending: boolean;
  savePurposes: () => void;
  saveAsks: () => void;
  hasDesmo: boolean;
}) {
  function toggleP(i: number) {
    if (locked) return;
    const set = new Set(purposes);
    if (set.has(i)) set.delete(i);
    else set.add(i);
    setPurposes(Array.from(set).sort((a, b) => a - b));
  }
  const hasWarn = purposes.some((i) => PURPOSES[i]?.warn);
  return (
    <div
      className={`space-y-4 ${isPending ? "pointer-events-none opacity-60" : ""}`}
    >
      <section className="border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ 來廠目的（可複選）+ 車主原話</h2>
          <button
            onClick={savePurposes}
            disabled={locked || isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存來意"}
          </button>
        </header>
        <div className="px-4 py-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {PURPOSES.map((p, i) => {
              // brand_config.has_desmo=false（如 Indian）時隱藏 Desmo 保養選項。
              // i 維持原 index，不渲染只是少一顆按鈕，DB 存的整數 index 不受影響。
              if (!hasDesmo && p.label.includes("Desmo")) return null;
              const sel = purposes.includes(i);
              return (
                <button
                  key={p.label}
                  onClick={() => toggleP(i)}
                  disabled={locked}
                  className={`px-2 py-2 rounded border text-[12px] text-center ${
                    sel
                      ? p.warn
                        ? "bg-[#FAEEDA] text-[#854F0B] border-[#BA7517] font-medium"
                        : "bg-[#EAF4FB] text-[#185FA5] border-[#185FA5] font-medium"
                      : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                  } disabled:opacity-60`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
          {hasWarn && (
            <div className="px-3 py-2 bg-[#FAEEDA] border border-[#BA7517] rounded text-[12px] text-[#412402] leading-relaxed">
              <strong>⚠️ SA 注意事項（記錄為主，勿自行判斷）</strong>
              <br />• <strong>疑似保固問題</strong>：請如實記錄車主描述，待技師診斷後由<strong>售後主管</strong>確認是否符合保固範圍。
              <br />• <strong>公報召回</strong>：技師檢查時請透過 NDCS 確認，相關費用由原廠撥付，須售後主管審批。
            </div>
          )}
          <div>
            <label className="text-[11px] text-[#9A9890] font-medium block mb-1">
              車主原話（請勿加入 SA 主觀判斷）
            </label>
            <textarea
              value={customerWords}
              onChange={(e) => setCustomerWords(e.target.value)}
              disabled={locked}
              rows={3}
              className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
            />
          </div>
        </div>
      </section>

      <section className="border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">▼ SA 主動詢問（第一次商機挖掘）</h2>
          <button
            onClick={saveAsks}
            disabled={locked || isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存詢問"}
          </button>
        </header>
        <div className="px-4 py-3 space-y-1">
          {SA_ASKS.map((q, i) => {
            const v = asks[String(i)];
            return (
              <div key={q} className="flex items-center gap-2 py-1.5 border-b last:border-b-0 border-[#F2F2F2]">
                <span className="flex-1 text-[12.5px]">{q}</span>
                {(["yes", "no", "na"] as const).map((opt) => (
                  <button
                    key={opt}
                    onClick={() => {
                      if (locked) return;
                      setAsks((prev) => ({ ...prev, [String(i)]: opt }));
                    }}
                    disabled={locked}
                    className={`h-[26px] px-2.5 rounded text-[11.5px] border ${
                      v === opt
                        ? opt === "yes"
                          ? "bg-[#E1F5EE] text-[#0F6E56] border-[#1D9E75]"
                          : opt === "no"
                            ? "bg-[#FCEBEB] text-[#CC0000] border-[#CC0000]"
                            : "bg-[#F5F5F4] text-[#6B6A68] border-[#D5D3CB]"
                        : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                    } disabled:opacity-60`}
                  >
                    {opt === "yes" ? "有/是" : opt === "no" ? "無/否" : "暫略"}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────────── Step 3 ───────────────────────────── */

function Step3Tech({
  techRows,
  setTechRows,
  locked,
  isPending,
  saveTech,
}: {
  techRows: TechRow[];
  setTechRows: React.Dispatch<React.SetStateAction<TechRow[]>>;
  locked: boolean;
  isPending: boolean;
  saveTech: () => void;
}) {
  const [draft, setDraft] = useState<{
    cat: TechCategory;
    title: string;
    diag: string;
    safety: TechSafety;
    lu: string;
    parts: string;
  }>({ cat: "engine", title: "", diag: "", safety: 2, lu: "", parts: "" });

  function addRow() {
    if (!draft.title.trim()) return;
    const next: TechRow = {
      cat: draft.cat,
      title: draft.title.trim(),
      diag: draft.diag.trim(),
      safety: draft.safety,
      state: "none",
      lu: Number(draft.lu) || 0,
      parts: Number(draft.parts) || 0,
    };
    setTechRows((prev) => [...prev, next]);
    setDraft({ cat: draft.cat, title: "", diag: "", safety: 2, lu: "", parts: "" });
  }

  function setDecision(i: number, v: TechDecision) {
    if (locked) return;
    setTechRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, state: v } : r)));
  }
  function removeRow(i: number) {
    if (locked) return;
    setTechRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div
      className={`space-y-4 ${isPending ? "pointer-events-none opacity-60" : ""}`}
    >
      <div className="px-3 py-2 bg-[#FAEEDA] border border-[#BA7517] rounded text-[12px] text-[#412402]">
        車輛已進入車間，技師執行深入檢查（第二次商機挖掘）。完成後切到 Tab 4 報價彙整，可隨時切回查看診斷詳情。
      </div>

      <section className="border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">技師深入檢查結果（{techRows.length} 項）</h2>
          <button
            onClick={saveTech}
            disabled={locked || isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存技師檢查"}
          </button>
        </header>
        <div className="px-4 py-3 space-y-3">
          {TECH_CATEGORY_ORDER.map((cat) => {
            const items = techRows.filter((r) => r.cat === cat);
            if (items.length === 0) return null;
            return (
              <div key={cat} className="space-y-1.5">
                <div className={`px-2 py-1 text-[11px] font-semibold text-white rounded ${TECH_CATEGORY_BG[cat]}`}>
                  {TECH_CATEGORY_LABEL[cat]}
                </div>
                {items.map((t) => {
                  const idx = techRows.indexOf(t);
                  return (
                    <div
                      key={idx}
                      className="flex items-start gap-2 px-2 py-2 border border-[#EEECE6] rounded bg-white"
                    >
                      <div className="flex-1">
                        <div className="text-[12.5px] font-medium">{t.title}</div>
                        <div className="text-[11.5px] text-[#5A5955]">技師診斷：{t.diag || "—"}</div>
                        <div className="text-[11px] text-[#9A9890] mt-0.5">
                          LU {t.lu}　零件費 NT${t.parts.toLocaleString()}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${SAFETY_CHIP[t.safety]}`}>
                          {SAFETY_LABEL[t.safety]}
                        </span>
                        <div className="flex gap-1">
                          {(["agree", "defer", "reject"] as const).map((d) => (
                            <button
                              key={d}
                              onClick={() => setDecision(idx, d)}
                              disabled={locked}
                              className={`h-[24px] px-2 rounded text-[10.5px] border ${
                                t.state === d
                                  ? d === "agree"
                                    ? "bg-[#E1F5EE] text-[#0F6E56] border-[#1D9E75]"
                                    : d === "defer"
                                      ? "bg-[#FAEEDA] text-[#854F0B] border-[#BA7517]"
                                      : "bg-[#FCEBEB] text-[#CC0000] border-[#CC0000]"
                                  : "bg-white border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
                              } disabled:opacity-60`}
                            >
                              {DECISION_LABEL[d]}
                            </button>
                          ))}
                          <button
                            onClick={() => removeRow(idx)}
                            disabled={locked}
                            className="h-[24px] px-1.5 rounded text-[10.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
                          >
                            刪除
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {!locked && (
            <div className="border border-dashed border-[#D5D3CB] rounded p-3 bg-[#F8F7F4] space-y-2">
              <div className="text-[12px] font-semibold text-[#2C2C2A]">+ 新增技師檢查項目</div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <select
                  value={draft.cat}
                  onChange={(e) => setDraft({ ...draft, cat: e.target.value as TechCategory })}
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] bg-white"
                >
                  {TECH_CATEGORY_ORDER.map((c) => (
                    <option key={c} value={c}>
                      {TECH_CATEGORY_LABEL[c]}
                    </option>
                  ))}
                </select>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="項目名稱"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] col-span-2"
                />
                <input
                  value={draft.diag}
                  onChange={(e) => setDraft({ ...draft, diag: e.target.value })}
                  placeholder="診斷描述"
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px]"
                />
                <select
                  value={draft.safety}
                  onChange={(e) =>
                    setDraft({ ...draft, safety: Number(e.target.value) as TechSafety })
                  }
                  className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] bg-white"
                >
                  <option value={1}>🔴 立即必修</option>
                  <option value={2}>🟡 近期建議</option>
                  <option value={3}>🟢 一般建議</option>
                </select>
                <div className="flex gap-1">
                  <input
                    value={draft.lu}
                    type="number"
                    onChange={(e) => setDraft({ ...draft, lu: e.target.value })}
                    placeholder="LU"
                    className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] w-1/2"
                  />
                  <input
                    value={draft.parts}
                    type="number"
                    onChange={(e) => setDraft({ ...draft, parts: e.target.value })}
                    placeholder="零件"
                    className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] w-1/2"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={addRow}
                  className="h-[28px] px-3 rounded text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742]"
                >
                  + 新增此項
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

/* ───────────────────────────── Step 4 ───────────────────────────── */

function Step4Quote({
  saItems,
  setSaItems,
  techRows,
  quote,
  locked,
  isPending,
  saveSaItems,
}: {
  saItems: SaQuoteItem[];
  setSaItems: React.Dispatch<React.SetStateAction<SaQuoteItem[]>>;
  techRows: TechRow[];
  quote: { labor: number; parts: number; tax: number; total: number; agreedLu: number };
  locked: boolean;
  isPending: boolean;
  saveSaItems: () => void;
}) {
  const [draft, setDraft] = useState({ name: "", lu: "", parts: "" });
  function addItem() {
    if (!draft.name.trim()) return;
    setSaItems((prev) => [
      ...prev,
      { name: draft.name.trim(), lu: Number(draft.lu) || 0, parts: Number(draft.parts) || 0 },
    ]);
    setDraft({ name: "", lu: "", parts: "" });
  }
  function removeItem(i: number) {
    if (locked) return;
    setSaItems((prev) => prev.filter((_, idx) => idx !== i));
  }
  return (
    <div
      className={`space-y-4 ${isPending ? "pointer-events-none opacity-60" : ""}`}
    >
      <section className="border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">SA 環檢＋來意報價項目</h2>
          <button
            onClick={saveSaItems}
            disabled={locked || isPending}
            className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存報價"}
          </button>
        </header>
        <div className="px-4 py-3 space-y-2">
          <table className="w-full text-[12px]">
            <thead className="bg-[#1A1A1A] text-white">
              <tr>
                <th className="text-left px-2 py-1.5">服務項目</th>
                <th className="text-center px-2 py-1.5 w-[60px]">LU</th>
                <th className="text-right px-2 py-1.5 w-[90px]">工時費</th>
                <th className="text-right px-2 py-1.5 w-[90px]">零件費</th>
                <th className="text-right px-2 py-1.5 w-[90px]">小計</th>
                <th className="w-[60px]"></th>
              </tr>
            </thead>
            <tbody>
              {saItems.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-3 text-[#9A9890]">
                    尚無項目，請從下方新增
                  </td>
                </tr>
              ) : (
                saItems.map((it, i) => {
                  const labor = Math.round(it.lu * 165);
                  return (
                    <tr key={i} className="border-b border-[#F2F2F2]">
                      <td className="px-2 py-1.5">{it.name}</td>
                      <td className="px-2 py-1.5 text-center">{it.lu}</td>
                      <td className="px-2 py-1.5 text-right">{labor.toLocaleString()}</td>
                      <td className="px-2 py-1.5 text-right">{it.parts ? it.parts.toLocaleString() : "—"}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{(labor + it.parts).toLocaleString()}</td>
                      <td className="px-1 py-1.5 text-right">
                        <button
                          onClick={() => removeItem(i)}
                          disabled={locked}
                          className="h-[24px] px-1.5 rounded text-[10.5px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] disabled:opacity-60"
                        >
                          刪除
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>

          {!locked && (
            <div className="border border-dashed border-[#D5D3CB] rounded p-2 flex flex-wrap gap-2 items-center bg-[#F8F7F4]">
              <input
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="新增服務項目名稱"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] flex-1 min-w-[180px]"
              />
              <input
                value={draft.lu}
                type="number"
                onChange={(e) => setDraft({ ...draft, lu: e.target.value })}
                placeholder="LU"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] w-[80px]"
              />
              <input
                value={draft.parts}
                type="number"
                onChange={(e) => setDraft({ ...draft, parts: e.target.value })}
                placeholder="零件費"
                className="h-[30px] border border-[#D5D3CB] rounded px-2 text-[12px] w-[110px]"
              />
              <button
                onClick={addItem}
                className="h-[30px] px-3 rounded text-[12px] font-medium bg-[#185FA5] text-white hover:bg-[#0f4a85]"
              >
                + 新增
              </button>
            </div>
          )}
        </div>
      </section>

      <section className="border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <h2 className="text-[13px] font-semibold text-[#2C2C2A]">技師深入檢查增項（依車主決定計入）</h2>
        </header>
        <div className="px-4 py-3">
          <table className="w-full text-[12px]">
            <thead className="bg-[#1A1A1A] text-white">
              <tr>
                <th className="text-left px-2 py-1.5">增項名稱</th>
                <th className="text-center px-2 py-1.5 w-[60px]">LU</th>
                <th className="text-right px-2 py-1.5 w-[90px]">工時費</th>
                <th className="text-right px-2 py-1.5 w-[90px]">零件費</th>
                <th className="text-right px-2 py-1.5 w-[90px]">車主決定</th>
              </tr>
            </thead>
            <tbody>
              {techRows.filter((t) => t.state !== "none").length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-3 text-[#9A9890]">
                    技師完成檢查、車主作出決定後，已決定項目將自動顯示
                  </td>
                </tr>
              ) : (
                techRows
                  .filter((t) => t.state !== "none")
                  .map((t, i) => {
                    const labor = Math.round(t.lu * 165);
                    return (
                      <tr
                        key={i}
                        className={`border-b border-[#F2F2F2] ${
                          t.state === "agree"
                            ? "bg-[#E1F5EE]"
                            : t.state === "defer"
                              ? "bg-[#FAEEDA]"
                              : "opacity-50 line-through"
                        }`}
                      >
                        <td className="px-2 py-1.5">{t.title}</td>
                        <td className="px-2 py-1.5 text-center">{t.lu}</td>
                        <td className="px-2 py-1.5 text-right">{labor.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right">{t.parts ? t.parts.toLocaleString() : "—"}</td>
                        <td className="px-2 py-1.5 text-right">{DECISION_LABEL[t.state]}</td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bg-[#1A1A1A] text-white rounded-lg px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex flex-wrap gap-5 text-[12px]">
          <div>
            <div className="text-[10px] opacity-70">工時費小計</div>
            <div className="font-semibold">NT${quote.labor.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] opacity-70">零件費小計</div>
            <div className="font-semibold">NT${quote.parts.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] opacity-70">稅額 (5%)</div>
            <div className="font-semibold">NT${quote.tax.toLocaleString()}</div>
          </div>
          <div>
            <div className="text-[10px] opacity-70">同意 LU 合計</div>
            <div className="font-semibold">{quote.agreedLu}</div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[11px] opacity-70">預估總費用（含稅）</div>
          <div className="text-[22px] font-bold text-[#FF6B6B]">NT${quote.total.toLocaleString()}</div>
        </div>
      </section>
      <div className="text-[11px] text-[#9A9890]">
        LU × 6 分鐘 × NT$1,650/小時 = 工時費。車主口頭確認後進入簽名頁。
      </div>
    </div>
  );
}

/* ───────────────────────────── Step 5 ───────────────────────────── */

function Step5Sign({
  saSigImg,
  setSaSigImg,
  custSigImg,
  setCustSigImg,
  data,
  quote,
  locked,
  isPending,
  handleSign,
}: {
  saSigImg: string | null;
  setSaSigImg: (v: string | null) => void;
  custSigImg: string | null;
  setCustSigImg: (v: string | null) => void;
  data: PreInspectionListRow;
  quote: { labor: number; parts: number; tax: number; total: number; agreedLu: number };
  locked: boolean;
  isPending: boolean;
  handleSign: () => void;
}) {
  return (
    <div
      className={`space-y-4 ${isPending ? "pointer-events-none opacity-60" : ""}`}
    >
      <div className="px-3 py-2 bg-[#F5F5F4] border border-[#E8E7E4] rounded text-[12px] text-[#3A3A38] leading-relaxed">
        本人確認以上環檢結果、來廠需求及預估報價（NT${quote.total.toLocaleString()}），同意本店依確認項目進行作業。車輛現有損傷已如實記錄，進廠後新增損傷由本店負責。
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SigPanel
          headerCls="bg-[#F8F7F4]"
          headerTextCls="text-[#2C2C2A]"
          title="SA 確認簽名"
          hint="本次預檢由本人執行並彙整報價"
          who={`SA：${data.sa_name ?? "—"}`}
          signedAt={data.metadata?.sig_sa?.signed_at ?? null}
          img={saSigImg}
          locked={locked}
          onSigned={(url) => setSaSigImg(url)}
          onReSign={() => setSaSigImg(null)}
        />
        <SigPanel
          headerCls="bg-[#CC0000]"
          headerTextCls="text-white"
          title="車主確認簽名（第一次）"
          hint="本人確認車況交接無誤，授權本店依確認項目執行維修"
          who={`車主：${data.customer_name ?? "—"}`}
          signedAt={data.metadata?.sig_customer?.signed_at ?? null}
          img={custSigImg}
          locked={locked}
          onSigned={(url) => setCustSigImg(url)}
          onReSign={() => setCustSigImg(null)}
        />
      </div>

      {locked && (
        <div className="px-3 py-2 bg-[#EAF3DE] border border-[#C5DC9F] rounded text-[12px] text-[#3B6D11]">
          🔒 已完成簽名並鎖定，車況 / 報價不可再修改（如需更動請作廢重開）。
        </div>
      )}

      {!locked && (
        <div className="flex justify-end gap-2">
          <button
            onClick={handleSign}
            disabled={isPending || (!saSigImg && !custSigImg)}
            className="h-[36px] px-5 rounded text-[13px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-50"
          >
            {isPending ? "儲存中⋯" : "儲存簽名"}
          </button>
        </div>
      )}
    </div>
  );
}

/** 單一簽名面板：未簽 → 顯示 canvas；已簽 / 鎖定 → 顯示簽名圖預覽 + 重簽 */
function SigPanel({
  headerCls,
  headerTextCls,
  title,
  hint,
  who,
  signedAt,
  img,
  locked,
  onSigned,
  onReSign,
}: {
  headerCls: string;
  headerTextCls: string;
  title: string;
  hint: string;
  who: string;
  signedAt: string | null;
  img: string | null;
  locked: boolean;
  onSigned: (dataUrl: string) => void;
  onReSign: () => void;
}) {
  return (
    <section className="border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className={`px-4 py-2.5 border-b border-[#EEECE6] ${headerCls}`}>
        <h2 className={`text-[13px] font-semibold ${headerTextCls}`}>{title}</h2>
      </header>
      <div className="px-4 py-3 space-y-2">
        <div className="text-[11px] text-[#9A9890]">{hint}</div>
        {img ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={img}
              alt="簽名"
              className="w-full h-40 object-contain bg-[#F5F5F4] border border-[#E8E7E4] rounded"
            />
            {!locked && (
              <button
                type="button"
                onClick={onReSign}
                className="text-[11px] text-[#185FA5] hover:underline"
              >
                重新簽名
              </button>
            )}
          </div>
        ) : locked ? (
          <div className="h-40 flex items-center justify-center bg-[#F5F5F4] border border-dashed border-[#D5D3CB] rounded text-[12px] text-[#9A9890]">
            未簽名
          </div>
        ) : (
          <SignatureCanvas onSigned={onSigned} />
        )}
        <div className="flex justify-between text-[11px] text-[#9A9890]">
          <span>{who}</span>
          <span>{signedAt ? fmtDateTime(signedAt) : "—"}</span>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── helpers ───────────────────────────── */

function Inp({
  label,
  value,
  onChange,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-[34px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none disabled:bg-[#F5F5F4] disabled:text-[#6B6A68]"
      />
    </div>
  );
}
