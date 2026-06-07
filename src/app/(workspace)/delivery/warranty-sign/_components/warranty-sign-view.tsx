"use client";

import { useState } from "react";
import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import { WARRANTY_CHECKLIST_ITEMS } from "@/components/delivery/delivery-constants";
import { updateDeliveryStepAction } from "@/lib/delivery/delivery-actions";
import type { DeliveryRow } from "@/lib/deliveries";
import type { WarrantyContent, WarrantySystem } from "@/domain/brand-config";

type SigRole = "technician" | "rs" | "customer";

/** ISO → YYYY-MM-DD（手動格式，避免 toLocaleDateString 的 SSR/client hydration mismatch） */
function fmtDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

/** 在 base 日期（YYYY-MM-DD）上加 days 天，回 YYYY-MM-DD（UTC 計算，避免時區飄移）。 */
function addDays(base: string, days: number): string {
  const d = new Date(`${base}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function WarrantySignView({
  delivery,
  warranty,
  warrantyRegDays,
  warrantySystem,
}: {
  delivery: DeliveryRow;
  warranty: WarrantyContent;
  warrantyRegDays: number | null;
  warrantySystem: WarrantySystem;
}) {
  const [plateNo, setPlateNo] = useState(delivery.plate_no ?? "");
  const [plateDate, setPlateDate] = useState(delivery.plate_date ?? "");
  const [warrantyReceiveDate, setWarrantyReceiveDate] = useState(
    delivery.warranty_receive_date ?? "",
  );
  const [warrantyStartDate, setWarrantyStartDate] = useState(
    delivery.warranty_start_date ?? "",
  );
  const [consents, setConsents] = useState({
    promo: Boolean(delivery.warranty_consents?.promo),
    survey: Boolean(delivery.warranty_consents?.survey),
    personalize: Boolean(delivery.warranty_consents?.personalize),
  });
  const [checklist, setChecklist] = useState<number[]>(
    delivery.warranty_checklist ?? [],
  );
  const [sigs, setSigs] = useState<Record<SigRole, string | null>>({
    technician: delivery.sig_technician,
    rs: delivery.sig_rs,
    customer: delivery.sig_customer,
  });
  const [err, setErr] = useState<string | null>(null);

  const allSigned = Boolean(sigs.technician && sigs.rs && sigs.customer);
  const inputCls =
    "w-full h-[32px] px-2.5 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] focus:outline-none";

  function sign(role: SigRole) {
    setSigs((p) => ({ ...p, [role]: new Date().toISOString() }));
  }
  function toggleChecklist(i: number) {
    setChecklist((prev) =>
      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
    );
  }

  async function handleNext(): Promise<boolean> {
    setErr(null);
    const res = await updateDeliveryStepAction(
      delivery.id,
      "warranty",
      {
        plate_no: plateNo,
        plate_date: plateDate || undefined,
        warranty_receive_date: warrantyReceiveDate || undefined,
        warranty_start_date: warrantyStartDate || undefined,
        warranty_consents: consents,
        warranty_checklist: checklist,
        sig_technician: sigs.technician,
        sig_rs: sigs.rs,
        sig_customer: sigs.customer,
      },
      "warranty_signed",
    );
    if (!res.ok) {
      setErr(res.error);
      return false;
    }
    return true;
  }

  return (
    <DeliveryFrame
      stepId={5}
      delivery={delivery}
      stepDone={allSigned}
      nextLabel="保固簽署完成 → 完成交車 →"
      nextDisabled={!allSigned}
      onNext={handleNext}
    >
      <section
        className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
        data-testid="warranty-panel"
      >
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#FAFAF8] flex items-center gap-2.5">
          <span className="w-7 h-7 rounded-md bg-[#EAF4FB] inline-flex items-center justify-center text-[13px]">
            📜
          </span>
          <div>
            <div className="text-[13px] font-semibold text-[#2C2C2A]">
              保固條款登記表
            </div>
            <div className="text-[11px] text-[#9A9890] mt-px">
              {warranty.title} · 交車時由銷售人員口語宣讀並解說條款
            </div>
          </div>
        </header>
        <div className="px-4 py-4 space-y-4">
          <SectionTitle>一、客戶資料</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoField label="姓名" value={delivery.customer_name ?? ""} input={inputCls} />
            <RoField label="手機號碼" value={delivery.customer_phone ?? ""} input={inputCls} />
            <RoField label="出生年月日" value={fmtDate(delivery.customer_birthday)} input={inputCls} />
            <RoField label="電子郵件" value={delivery.customer_email ?? ""} input={inputCls} />
            <RoField label="通訊地址" className="md:col-span-2" value={delivery.customer_address ?? ""} input={inputCls} />
          </div>

          <SectionTitle>二、車輛資料</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <RoField label="車型" value={delivery.vehicle_model_name ?? ""} input={`${inputCls} bg-[#F4F3F0]`} />
            <FormField
              label="車牌號碼"
              testId="warranty-input-plate"
              value={plateNo}
              onChange={setPlateNo}
              input={inputCls}
              placeholder="辦牌後填入"
            />
            <FormField
              label="掛牌日"
              type="date"
              value={plateDate}
              onChange={setPlateDate}
              input={inputCls}
            />
            <RoField label="車身號碼（VIN）" value={delivery.vin ?? ""} input={`${inputCls} font-mono`} />
            <FormField
              label="保固條款收件日"
              type="date"
              value={warrantyReceiveDate}
              onChange={setWarrantyReceiveDate}
              input={inputCls}
            />
            <FormField
              label="保固啟動日"
              required
              type="date"
              value={warrantyStartDate}
              onChange={setWarrantyStartDate}
              input={inputCls}
            />
          </div>

          <SectionTitle>三、保固期限</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {warranty.terms.map((t) => (
              <div
                key={t.label}
                className="bg-[#EAF4FB] border border-[#85B7EB] rounded-md px-3 py-2"
              >
                <div className="text-[10.5px] text-[#185FA5] font-semibold mb-0.5">
                  {t.label}
                </div>
                <div className="text-[13px] font-bold text-[#0C3E70]">
                  {t.value}
                </div>
                <div className="text-[11px] text-[#5A5955] mt-px">{t.sub}</div>
              </div>
            ))}
          </div>

          {warrantyRegDays != null && warrantyRegDays > 0 && (
            <div
              className="flex items-start gap-2 px-3 py-2 rounded-md bg-[#FDF3E3] border border-[#F0D9A8] text-[12px] text-[#854F0B] leading-relaxed"
              data-testid="warranty-reg-reminder"
            >
              <span className="text-[14px] shrink-0">⏰</span>
              <span>
                <b>保固登記提醒</b>：請於交車後 <b>{warrantyRegDays}</b> 天內
                {warrantyStartDate
                  ? `（最遲 ${addDays(warrantyStartDate, warrantyRegDays)} 前）`
                  : ""}
                完成{warrantySystem ? `${warrantySystem} ` : ""}保固登記，逾期恐影響保固權益。
              </span>
            </div>
          )}

          <SectionTitle>保固不適用情況</SectionTitle>
          <div className="flex flex-col gap-1">
            {warranty.exclusions.map((e) => (
              <div
                key={e}
                className="flex gap-2 text-[11.5px] text-[#5A5955] px-2 py-1.5 rounded bg-[#FAFAF8] border border-[#EEECE6] leading-relaxed"
              >
                <span className="text-[#C8001A] shrink-0">●</span>
                {e}
              </div>
            ))}
          </div>

          <SectionTitle>四、交車確認事項</SectionTitle>
          <div className="flex flex-col gap-1">
            {WARRANTY_CHECKLIST_ITEMS.map((t, i) => {
              const checked = checklist.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleChecklist(i)}
                  data-testid={`warranty-check-${i}`}
                  className={`flex items-start gap-2.5 px-2.5 py-1.5 rounded border text-left transition-colors ${
                    checked
                      ? "bg-[#E1F5EE] border-[#5DCAA5]"
                      : "bg-white border-[#EEECE6] hover:bg-[#F0F7FF] hover:border-[#85B7EB]"
                  }`}
                >
                  <span
                    className={`w-[17px] h-[17px] rounded border-2 flex items-center justify-center text-[10px] mt-0.5 shrink-0 ${
                      checked
                        ? "bg-[#0F6E56] border-[#0F6E56] text-white"
                        : "border-[#D5D3CB] text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span className="text-[12.5px] flex-1 leading-relaxed">{t}</span>
                </button>
              );
            })}
          </div>

          <SectionTitle>五、隱私權同意</SectionTitle>
          <div className="bg-[#FAFAF8] border border-[#EEECE6] rounded-md p-3 flex flex-col gap-2">
            <ConsentRow
              label="同意接受廣告 / 促銷資訊"
              checked={consents.promo}
              onChange={(v) => setConsents((p) => ({ ...p, promo: v }))}
              testId="warranty-consent-promo"
            />
            <ConsentRow
              label="同意接受市場調查"
              checked={consents.survey}
              onChange={(v) => setConsents((p) => ({ ...p, survey: v }))}
              testId="warranty-consent-survey"
            />
            <ConsentRow
              label="同意接受個人化服務"
              checked={consents.personalize}
              onChange={(v) => setConsents((p) => ({ ...p, personalize: v }))}
              testId="warranty-consent-personalize"
            />
          </div>

          <SectionTitle>六、三方簽署</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <SignBox role="technician" icon="🔧" label="技師簽名" sub="交車前準備已完成" signedAt={sigs.technician} onSign={sign} testId="warranty-sign-technician" />
            <SignBox role="rs" icon="📝" label="銷售顧問（RS）簽名" sub="交車說明完成" signedAt={sigs.rs} onSign={sign} testId="warranty-sign-rs" />
            <SignBox role="customer" icon="✍️" label="客戶簽名" sub="已閱讀並了解保固條款" signedAt={sigs.customer} onSign={sign} testId="warranty-sign-customer" />
          </div>
        </div>
      </section>

      {err && (
        <div
          className="fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
          data-testid="warranty-error"
        >
          {err}
        </div>
      )}
    </DeliveryFrame>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-bold tracking-wider uppercase text-[#9A9890] flex items-center gap-2">
      <span>{children}</span>
      <span className="flex-1 h-px bg-[#EEECE6]" />
    </div>
  );
}

function RoField({
  label,
  value,
  input,
  className,
}: {
  label: string;
  value: string;
  input: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label className="text-[11.5px] font-semibold text-[#4A4A48]">{label}</label>
      <input
        type="text"
        className={`${input} bg-[#F4F3F0] text-[#5A5955] cursor-not-allowed`}
        value={value}
        readOnly
      />
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  input,
  required,
  type,
  placeholder,
  className,
  testId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  input: string;
  required?: boolean;
  type?: string;
  placeholder?: string;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={`flex flex-col gap-1 ${className ?? ""}`}>
      <label className="text-[11.5px] font-semibold text-[#4A4A48]">
        {label}
        {required && <span className="text-[#C8001A] text-[11px] ml-0.5">*</span>}
      </label>
      <input
        type={type ?? "text"}
        className={input}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        data-testid={testId}
      />
    </div>
  );
}

function ConsentRow({
  label,
  checked,
  onChange,
  testId,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId: string;
}) {
  return (
    <label className="flex items-center gap-2 text-[12.5px] cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      {label}
    </label>
  );
}

function SignBox({
  role,
  icon,
  label,
  sub,
  signedAt,
  onSign,
  testId,
}: {
  role: SigRole;
  icon: string;
  label: string;
  sub: string;
  signedAt: string | null;
  onSign: (r: SigRole) => void;
  testId: string;
}) {
  const signed = Boolean(signedAt);
  return (
    <button
      type="button"
      onClick={() => onSign(role)}
      data-testid={testId}
      className={`border-[1.5px] rounded-lg p-3 text-center min-h-[82px] flex flex-col items-center justify-center gap-1 transition-colors ${
        signed
          ? "border-solid border-[#0F6E56] bg-[#E1F5EE]"
          : "border-dashed border-[#D5D3CB] bg-[#FAFAF8] hover:border-[#85B7EB] hover:bg-[#EAF4FB]"
      }`}
    >
      <div className="text-[20px]">{signed ? "✅" : icon}</div>
      <div className="text-[12px] font-semibold text-[#4A4A48]">
        {signed ? `${label.replace("簽名", "")}已簽名` : label}
      </div>
      <div className="text-[10.5px] text-[#9A9890]">
        {signed ? fmtDate(signedAt) : sub}
      </div>
    </button>
  );
}
