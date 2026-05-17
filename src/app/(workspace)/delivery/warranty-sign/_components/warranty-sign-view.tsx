"use client";

import { useTransition } from "react";
import { DeliveryFrame } from "@/components/delivery/delivery-frame";
import { WARRANTY_CHECKLIST_ITEMS } from "@/components/delivery/delivery-constants";
import { useDelivery, type SignatureRole } from "@/lib/delivery-store";
import { updateDeliveryStepAction } from "@/lib/delivery/delivery-actions";

const EXCLUSIONS = [
  "用於任何運動競賽的機車",
  "用於租賃服務的機車",
  "正常使用自然耗損零件（輪胎、傳動零件、正時皮帶、煞車、離合器等）",
  "因氧化、環境因素、非正常使用、未定期保養所導致的故障與瑕疵",
  "在非 DUCATI 官方授權經銷商進行的維修保養",
  "使用未經 DUCATI 原廠核准之零件或改裝部品",
  "未遵守車主手冊使用建議，或未參加召回活動",
];

const WARRANTY_TERMS = [
  {
    label: "整車保固（台灣碩文版）",
    value: "2 年不限里程",
    sub: "自保固啟動日起",
  },
  {
    label: "零件保固（原廠非消耗品）",
    value: "24 個月",
    sub: "授權經銷商購買安裝起算",
  },
  {
    label: "一般保固（≥500cc 公路）",
    value: "24 個月不限里程",
    sub: "Panigale V4 S 適用",
  },
  {
    label: "Desmo 服務（≥500cc）",
    value: "24 個月 或 40,000 km",
    sub: "以先到為準",
  },
];

export function WarrantySignView({ deliveryId }: { deliveryId?: string }) {
  const {
    state,
    patch,
    sign,
    setConsent,
    toggleWarrantyItem,
  } = useDelivery();
  const [, startTransition] = useTransition();

  const allSigned =
    !!state.signatures.technician &&
    !!state.signatures.rs &&
    !!state.signatures.customer;

  const stepDone = allSigned;

  const inputCls =
    "w-full h-[32px] px-2.5 rounded border border-[#D5D3CB] text-[12.5px] focus:border-[#185FA5] focus:outline-none";

  function handleNext() {
    if (deliveryId) {
      startTransition(async () => {
        await updateDeliveryStepAction(deliveryId, "warranty", {
          plate_no: state.plateNo,
          plate_date: state.plateDate || undefined,
          warranty_receive_date: state.warrantyReceiveDate || undefined,
          warranty_start_date: state.warrantyStartDate || undefined,
          warranty_consents: state.warrantyConsents,
          warranty_checklist: state.warrantyChecklist,
          sig_technician: state.signatures.technician,
          sig_rs: state.signatures.rs,
          sig_customer: state.signatures.customer,
        }, "warranty_signed");
      });
    }
  }

  return (
    <DeliveryFrame
      stepId={5}
      stepDone={stepDone}
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
              DUCATI Warranty Terms — 交車登記表 · 交車時由銷售人員口語宣讀並解說條款
            </div>
          </div>
        </header>
        <div className="px-4 py-4 space-y-4">
          <SectionTitle>一、客戶資料</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField
              label="姓名"
              required
              value={state.customerName}
              onChange={(v) => patch({ customerName: v })}
              input={inputCls}
            />
            <FormField
              label="手機號碼"
              required
              value={state.customerPhone}
              onChange={(v) => patch({ customerPhone: v })}
              input={inputCls}
            />
            <FormField
              label="出生年月日"
              type="date"
              value={state.customerBirthday}
              onChange={(v) => patch({ customerBirthday: v })}
              input={inputCls}
            />
            <FormField
              label="電子郵件"
              value={state.customerEmail}
              onChange={(v) => patch({ customerEmail: v })}
              input={inputCls}
            />
            <FormField
              label="通訊地址"
              className="md:col-span-2"
              value={state.customerAddress}
              onChange={(v) => patch({ customerAddress: v })}
              input={inputCls}
            />
          </div>

          <SectionTitle>二、車輛資料</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <FormField
              label="車型"
              required
              value={state.vehicleModel}
              onChange={(v) => patch({ vehicleModel: v })}
              input={`${inputCls} bg-[#F4F3F0]`}
              readOnly
            />
            <FormField
              label="車牌號碼"
              testId="warranty-input-plate"
              value={state.plateNo}
              onChange={(v) => patch({ plateNo: v })}
              input={inputCls}
              placeholder="辦牌後填入"
            />
            <FormField
              label="掛牌日"
              type="date"
              value={state.plateDate}
              onChange={(v) => patch({ plateDate: v })}
              input={inputCls}
            />
            <FormField
              label="車身號碼（VIN）"
              required
              value={state.vin}
              onChange={(v) => patch({ vin: v.toUpperCase() })}
              input={`${inputCls} font-mono`}
            />
            <FormField
              label="保固條款收件日"
              type="date"
              value={state.warrantyReceiveDate}
              onChange={(v) => patch({ warrantyReceiveDate: v })}
              input={inputCls}
            />
            <FormField
              label="保固啟動日"
              required
              type="date"
              value={state.warrantyStartDate}
              onChange={(v) => patch({ warrantyStartDate: v })}
              input={inputCls}
            />
          </div>

          <SectionTitle>三、保固期限</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {WARRANTY_TERMS.map((t) => (
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

          <SectionTitle>保固不適用情況</SectionTitle>
          <div className="flex flex-col gap-1">
            {EXCLUSIONS.map((e) => (
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
              const checked = state.warrantyChecklist.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => toggleWarrantyItem(i)}
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
                  <span className="text-[12.5px] flex-1 leading-relaxed">
                    {t}
                  </span>
                </button>
              );
            })}
          </div>

          <SectionTitle>五、隱私權同意</SectionTitle>
          <div className="bg-[#FAFAF8] border border-[#EEECE6] rounded-md p-3 flex flex-col gap-2">
            <ConsentRow
              label="同意接受廣告 / 促銷資訊"
              checked={state.warrantyConsents.promo}
              onChange={(v) => setConsent("promo", v)}
              testId="warranty-consent-promo"
            />
            <ConsentRow
              label="同意接受市場調查"
              checked={state.warrantyConsents.survey}
              onChange={(v) => setConsent("survey", v)}
              testId="warranty-consent-survey"
            />
            <ConsentRow
              label="同意接受個人化服務"
              checked={state.warrantyConsents.personalize}
              onChange={(v) => setConsent("personalize", v)}
              testId="warranty-consent-personalize"
            />
          </div>

          <SectionTitle>六、三方簽署</SectionTitle>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            <SignBox
              role="technician"
              icon="🔧"
              label="技師簽名"
              sub="交車前準備已完成"
              signedAt={state.signatures.technician}
              onSign={sign}
              testId="warranty-sign-technician"
            />
            <SignBox
              role="rs"
              icon="📝"
              label="銷售顧問（RS）簽名"
              sub="交車說明完成"
              signedAt={state.signatures.rs}
              onSign={sign}
              testId="warranty-sign-rs"
            />
            <SignBox
              role="customer"
              icon="✍️"
              label="客戶簽名"
              sub="已閱讀並了解保固條款"
              signedAt={state.signatures.customer}
              onSign={sign}
              testId="warranty-sign-customer"
            />
          </div>
        </div>
      </section>
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

function FormField({
  label,
  value,
  onChange,
  input,
  required,
  type,
  readOnly,
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
  readOnly?: boolean;
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
        className={`${input} ${
          readOnly ? "bg-[#F4F3F0] text-[#5A5955] cursor-not-allowed" : ""
        }`}
        value={value}
        readOnly={readOnly}
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
  role: SignatureRole;
  icon: string;
  label: string;
  sub: string;
  signedAt: string | null;
  onSign: (r: SignatureRole) => void;
  testId: string;
}) {
  const signed = !!signedAt;
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
        {signed ? new Date(signedAt).toLocaleDateString("zh-TW") : sub}
      </div>
    </button>
  );
}
