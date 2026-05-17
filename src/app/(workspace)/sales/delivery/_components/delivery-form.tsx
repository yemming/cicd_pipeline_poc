"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSetPageHeader } from "@/components/page-header-context";
import { SignatureCanvas } from "@/components/signature-canvas";
import {
  DELIVERY_CATEGORY_TITLES,
  DELIVERY_ITEMS,
  DLV_STEPS,
  HANDOVER_DOCS,
  HANDOVER_DOC_ITEMS,
  PDI_ITEMS,
  SIGNATURE_DEFS,
  WARRANTY_CONFIRM_ITEMS,
  WARRANTY_EXCLUSIONS,
  WARRANTY_TERMS,
  type SignatureRole,
} from "./delivery.constants";

type StepIdx = 1 | 2 | 3 | 4;

export default function DeliveryForm() {
  useSetPageHeader({
    title: "交車流程",
    breadcrumb: [
      { label: "銷售管理", href: "/sales/overview" },
      { label: "展廳接待" },
      { label: "交車流程" },
    ],
    hideSearch: true,
  });

  const [step, setStep] = useState<StepIdx>(1);
  const [doneSteps, setDoneSteps] = useState<Set<StepIdx>>(new Set());

  // PDI 整備
  const [pdiTriggered, setPdiTriggered] = useState(false);
  const [pdiChecked, setPdiChecked] = useState<Set<number>>(new Set());

  // 交車確認表
  const [deliveryChecked, setDeliveryChecked] = useState<Set<string>>(new Set());

  // 保固條款表單
  const [lastName, setLastName] = useState("王");
  const [firstName, setFirstName] = useState("大明");
  const [mobile, setMobile] = useState("0912-345-678");
  const [birthday, setBirthday] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [plateNo, setPlateNo] = useState("");
  const [plateDate, setPlateDate] = useState("");
  const [vin, setVin] = useState("");
  const [warrantyReceived, setWarrantyReceived] = useState("2026-06-01");
  const [warrantyStart, setWarrantyStart] = useState("2026-06-01");
  const [warrantyConfirms, setWarrantyConfirms] = useState<Set<number>>(new Set());
  const [consentAds, setConsentAds] = useState(false);
  const [consentSurvey, setConsentSurvey] = useState(false);
  const [consentPersonalized, setConsentPersonalized] = useState(false);
  const [signatures, setSignatures] = useState<Record<SignatureRole, string | null>>({
    tech: null,
    rs: null,
    customer: null,
  });

  // 完成交車
  const [deliveryConfirmed, setDeliveryConfirmed] = useState(false);

  // RS05 文件交付段（8 項 + 鑰匙數 + 簽名 + 交付日）
  const [docChecked, setDocChecked] = useState<Set<string>>(new Set());
  const [keysCount, setKeysCount] = useState(2);
  const [docSignature, setDocSignature] = useState<string | null>(null);
  const [docDeliveredAt, setDocDeliveredAt] = useState("");

  type ToastVariant = "info" | "error";
  const [toast, setToast] = useState<{ msg: string; variant: ToastVariant } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, variant: ToastVariant = "info") {
    setToast({ msg, variant });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2800);
  }

  function goStep(n: StepIdx) {
    setDoneSteps((prev) => {
      const next = new Set(prev);
      if (n > step) next.add(step);
      return next;
    });
    setStep(n);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function togglePdi(i: number) {
    setPdiChecked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleDelivery(id: string) {
    setDeliveryChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleWarrantyConfirm(i: number) {
    setWarrantyConfirms((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  function toggleDoc(id: string) {
    setDocChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleDocSigned(dataUrl: string) {
    setDocSignature(dataUrl);
    if (!docDeliveredAt) {
      // 自動帶今日，使用者可改
      const today = new Date().toISOString().slice(0, 10);
      setDocDeliveredAt(today);
    }
    showToast("✅ 客戶簽收已完成");
  }

  function clearDocSignature() {
    setDocSignature(null);
  }

  function checkAllPdi() {
    const all = new Set<number>();
    PDI_ITEMS.forEach((_, i) => all.add(i));
    setPdiChecked(all);
  }

  function checkAllDelivery() {
    const all = new Set<string>();
    DELIVERY_ITEMS.forEach((it) => all.add(it.id));
    setDeliveryChecked(all);
  }

  function triggerPdi() {
    setPdiTriggered(true);
    showToast("🔧 PDI 工單 PD-IN-260601-001 已建立 · SA 已收到通知");
  }

  function doSign(role: SignatureRole, label: string) {
    const date = new Date().toLocaleDateString("zh-TW");
    setSignatures((prev) => ({ ...prev, [role]: date }));
    showToast(`✅ ${label}電子簽名已完成`);
  }

  function validateSignatures(): string[] {
    const missing: string[] = [];
    if (!signatures.customer) missing.push("客戶簽名");
    if (!signatures.rs) missing.push("RS 簽名");
    if (!signatures.tech) missing.push("技師簽名");
    return missing;
  }

  function confirmDelivery() {
    const missing = validateSignatures();
    if (missing.length > 0) {
      showToast(`⚠️ 尚有簽名未完成：${missing.join(" / ")}`, "error");
      return;
    }
    setDeliveryConfirmed(true);
    setDoneSteps(new Set([1, 2, 3, 4]));
    showToast("🎉 交車完成！D+3 回訪任務已排程 CRM03A · 2026-06-04");
  }

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  const pdiCount = pdiChecked.size;
  const pdiTotal = PDI_ITEMS.length;
  const pdiPct = Math.round((pdiCount / pdiTotal) * 100);

  const deliveryCount = deliveryChecked.size;
  const deliveryTotal = DELIVERY_ITEMS.length;
  const deliveryPct = Math.round((deliveryCount / deliveryTotal) * 100);

  const docCount = docChecked.size;
  const docTotal = HANDOVER_DOC_ITEMS.length;
  const docMinRequired = 6; // 寬鬆校驗：8 項至少勾 6 項
  const docHandoverComplete =
    docCount >= docMinRequired && !!docSignature && !!docDeliveredAt;

  const deliveryGrouped = useMemo(() => {
    const groups: { cat: string; title: string; items: typeof DELIVERY_ITEMS }[] = [];
    for (const item of DELIVERY_ITEMS) {
      const last = groups[groups.length - 1];
      if (!last || last.cat !== item.category) {
        groups.push({ cat: item.category, title: DELIVERY_CATEGORY_TITLES[item.category], items: [item] });
      } else {
        last.items.push(item);
      }
    }
    return groups;
  }, []);

  return (
    <main className="px-6 py-5 max-w-[1100px] mx-auto space-y-3">
      {/* Page Header */}
      <header className="flex items-center gap-2.5">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">交車流程</h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">RS05</span>
        <span className="text-[12px] text-[#9A9890]">PDI 整備 → 36 項交車確認 → 保固條款登記 → 完成交車 + 觸發 D+3</span>
      </header>

      {/* Info card：訂單摘要 */}
      <div className="bg-[#1A3A5C] rounded-[10px] px-5 py-3 text-white flex items-center gap-4 flex-wrap">
        <InfoIc label="客戶姓名" value="王大明" />
        <InfoDiv />
        <InfoIc label="訂購車款" value="Panigale V4 S" />
        <InfoDiv />
        <InfoIc label="車身顏色" value="Ducati Red" />
        <InfoDiv />
        <InfoIc label="合約編號" value="NC-20260510-001" mono />
        <InfoDiv />
        <InfoIc label="銷售顧問" value="陳志明 RS" />
        <InfoDiv />
        <InfoIc label="預定交車日" value="2026-06-01" />
      </div>

      {/* Step Bar */}
      <div className="flex bg-white border border-[#EEECE6] rounded-lg overflow-hidden" data-test-id="dlv-step-bar">
        {DLV_STEPS.map((s) => {
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
              id={`dlv-step-${s.idx}`}
              onClick={() => goStep(s.idx as StepIdx)}
              className={`flex-1 px-2 py-2.5 text-center text-[11.5px] border-r border-[#EEECE6] last:border-r-0 transition ${cls}`}
            >
              <span className="block font-mono text-[9px] opacity-65 mb-0.5">STEP {s.idx}</span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* STEP 1 PDI */}
      {step === 1 && (
        <div className="space-y-3" data-test-pane="1">
          <div className="border-2 border-[#C8001A] rounded-[10px] p-4 bg-[#FDECEA]">
            <div className="text-[14px] font-bold text-[#7A1010] mb-1.5">🔧 觸發 PDI 整備工單（必做）</div>
            <p className="text-[12px] text-[#5A1010] leading-[1.7] mb-3">
              交車前須由售後技師完成 PDI（Pre-Delivery Inspection）29 項整備檢查。本觸發建立內部工單（前綴碼 PD-IN），費用由銷售部門結算，車主不須付費。PDI 完成後方可進行交車。
            </p>
            <div className="flex gap-2.5 flex-wrap mb-3">
              <PdiChip label="工單前綴碼" value="PD-IN" />
              <PdiChip label="付款性質" value="內部結算（銷售→售後）" />
              <PdiChip label="PDI 項目" value="29 項" />
              <PdiChip label="預計工時" value="2–3 小時" />
            </div>
            {!pdiTriggered ? (
              <div className="flex gap-2 flex-wrap">
                <Btn variant="primary" onClick={triggerPdi} testId="dlv-trigger-pdi">
                  🔧 建立 PDI 工單並通知 SA
                </Btn>
                <Btn variant="ghost" onClick={() => showToast("🔍 PDI-IN-260601-001 狀態：進行中（15/29）")}>
                  🔍 查詢進度
                </Btn>
              </div>
            ) : (
              <div
                className="bg-[#E1F5EE] border border-[#5DCAA5] rounded-md px-3.5 py-2.5 text-[12.5px] text-[#085041]"
                data-test-id="dlv-pdi-triggered"
              >
                <b>✅ PDI 工單已建立</b>　工單號：PD-IN-260601-001 · 已通知技師張建國 · 預計完成：3 小時
              </div>
            )}
          </div>

          <Panel
            icon="🔧"
            iconBg="bg-[#FDECEA]"
            title="PDI 檢查清單（29項）"
            sub="技師執行 · RS 確認結果"
            badge={`${pdiCount} / ${pdiTotal}`}
            badgeId="dlv-pdi-cnt"
            badgeTone={pdiCount === pdiTotal ? "teal" : "gray"}
          >
            <ProgressRow label="PDI 進度" pct={pdiPct} />
            <div className="flex flex-col gap-1 mt-2">
              {PDI_ITEMS.map((t, i) => (
                <CheckItem
                  key={i}
                  checked={pdiChecked.has(i)}
                  onClick={() => togglePdi(i)}
                  num={i + 1}
                  text={t}
                  testId={`dlv-pdi-${i + 1}`}
                />
              ))}
            </div>
          </Panel>

          <Footer>
            <Btn variant="ghost" size="sm" onClick={checkAllPdi} testId="dlv-pdi-all">
              ✅ 全部完成（測試）
            </Btn>
            <Btn variant="teal" onClick={() => goStep(2)} testId="dlv-pdi-next">
              PDI 完成 → 交車確認表 →
            </Btn>
          </Footer>
        </div>
      )}

      {/* STEP 2 交車確認表 */}
      {step === 2 && (
        <div className="space-y-3" data-test-pane="2">
          <Panel
            icon="✅"
            iconBg="bg-[#E1F5EE]"
            title="客戶交車確認表（36項）"
            sub="DUCATI Check List — BIKE DELIVERY TO CUSTOMER · 逐項點交完成後請客戶簽名"
            badge={`${deliveryCount} / ${deliveryTotal}`}
            badgeId="dlv-del-cnt"
            badgeTone={deliveryCount === deliveryTotal ? "teal" : "gray"}
          >
            <ProgressRow label="交車進度" pct={deliveryPct} />
            <div className="flex flex-col gap-1 mt-2">
              {deliveryGrouped.map((g) => (
                <div key={g.cat} className="flex flex-col gap-1">
                  <div className="text-[11px] font-bold text-[#5A5955] px-2.5 py-1.5 bg-[#F4F3F0] rounded-md mt-1.5">
                    {g.title}
                  </div>
                  {g.items.map((it, idx) => (
                    <CheckItem
                      key={it.id}
                      checked={deliveryChecked.has(it.id)}
                      onClick={() => toggleDelivery(it.id)}
                      num={DELIVERY_ITEMS.findIndex((x) => x.id === it.id) + 1}
                      text={it.label}
                      tag={it.category.toUpperCase()}
                      tagTone={it.category}
                      testId={`dlv-del-${idx}-${g.cat}`}
                    />
                  ))}
                </div>
              ))}
            </div>
          </Panel>

          <Footer>
            <Btn variant="ghost" size="sm" onClick={checkAllDelivery} testId="dlv-del-all">
              ✅ 全部完成（測試）
            </Btn>
            <Btn variant="ghost" onClick={() => goStep(1)}>
              ← 返回 PDI
            </Btn>
            <Btn variant="teal" onClick={() => goStep(3)} testId="dlv-del-next">
              交車確認完成 → 保固條款 →
            </Btn>
          </Footer>
        </div>
      )}

      {/* STEP 3 保固條款 */}
      {step === 3 && (
        <div className="space-y-3" data-test-pane="3">
          <Panel
            icon="📜"
            iconBg="bg-[#EAF4FB]"
            title="保固條款登記表"
            sub="DUCATI Warranty Terms — 交車登記表 · 交車時由銷售人員口語宣讀並解說條款"
          >
            <SectionTitle>一、客戶資料</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2.5 mb-3">
              <Field label="姓名（Last Name）" required>
                <input type="text" className={fiClass} value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </Field>
              <Field label="名（First Name）" required>
                <input type="text" className={fiClass} value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </Field>
              <Field label="手機號碼" required>
                <input type="text" className={fiClass} value={mobile} onChange={(e) => setMobile(e.target.value)} />
              </Field>
              <Field label="出生年月日">
                <input type="date" className={fiClass} value={birthday} onChange={(e) => setBirthday(e.target.value)} />
              </Field>
              <Field label="電子郵件">
                <input
                  type="text"
                  className={fiClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="email@example.com"
                />
              </Field>
              <Field label="通訊地址">
                <input
                  type="text"
                  className={fiClass}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="縣市/鄉鎮/路街/號"
                />
              </Field>
            </div>

            <SectionTitle>二、車輛資料</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2.5 mb-3">
              <Field label="經銷商">
                <input type="text" className={`${fiClass} bg-[#F4F3F0]`} value="DUCATI 台北授權經銷商" readOnly />
              </Field>
              <Field label="車型" required>
                <input type="text" className={`${fiClass} bg-[#F4F3F0]`} value="Panigale V4 S" readOnly />
              </Field>
              <Field label="車牌號碼">
                <input
                  type="text"
                  className={fiClass}
                  value={plateNo}
                  onChange={(e) => setPlateNo(e.target.value)}
                  placeholder="辦牌後填入"
                />
              </Field>
              <Field label="掛牌日">
                <input type="date" className={fiClass} value={plateDate} onChange={(e) => setPlateDate(e.target.value)} />
              </Field>
              <div className="md:col-span-2">
                <Field label="車身號碼（VIN）" required>
                  <input
                    type="text"
                    className={fiClass}
                    value={vin}
                    onChange={(e) => setVin(e.target.value)}
                    placeholder="ZDM...（17碼）"
                  />
                </Field>
              </div>
              <Field label="保固條款收件日">
                <input
                  type="date"
                  className={fiClass}
                  value={warrantyReceived}
                  onChange={(e) => setWarrantyReceived(e.target.value)}
                />
              </Field>
              <Field label="保固啟動日" required>
                <input
                  type="date"
                  className={fiClass}
                  value={warrantyStart}
                  onChange={(e) => setWarrantyStart(e.target.value)}
                />
              </Field>
            </div>

            <SectionTitle>三、保固期限</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
              {WARRANTY_TERMS.map((w) => (
                <div key={w.label} className="bg-[#EAF4FB] border border-[#85B7EB] rounded-md px-3 py-2">
                  <div className="text-[10.5px] text-[#185FA5] font-semibold mb-0.5">{w.label}</div>
                  <div className="text-[13px] font-bold text-[#0C3E70]">{w.value}</div>
                  <div className="text-[11px] text-[#5A5955] mt-0.5">{w.sub}</div>
                </div>
              ))}
            </div>

            <SectionTitle>保固不適用情況</SectionTitle>
            <div className="flex flex-col gap-1 mb-3">
              {WARRANTY_EXCLUSIONS.map((e) => (
                <div
                  key={e}
                  className="flex gap-2 text-[11.5px] text-[#5A5955] px-2 py-1.5 rounded-md bg-[#FAFAF8] border border-[#EEECE6] leading-[1.5]"
                >
                  <span className="text-[#C8001A] shrink-0">●</span>
                  <span>{e}</span>
                </div>
              ))}
            </div>

            <SectionTitle>四、交車確認事項</SectionTitle>
            <div className="flex flex-col gap-1 mb-3">
              {WARRANTY_CONFIRM_ITEMS.map((t, i) => (
                <CheckItem
                  key={i}
                  checked={warrantyConfirms.has(i)}
                  onClick={() => toggleWarrantyConfirm(i)}
                  text={t}
                  testId={`dlv-wc-${i + 1}`}
                />
              ))}
            </div>

            <SectionTitle>五、隱私權同意</SectionTitle>
            <div className="bg-[#FAFAF8] border border-[#EEECE6] rounded-md px-3 py-2.5 flex flex-col gap-2 mb-3">
              <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                <input type="checkbox" checked={consentAds} onChange={(e) => setConsentAds(e.target.checked)} />
                同意接受廣告 / 促銷資訊
              </label>
              <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                <input type="checkbox" checked={consentSurvey} onChange={(e) => setConsentSurvey(e.target.checked)} />
                同意接受市場調查
              </label>
              <label className="flex items-center gap-2 text-[12.5px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentPersonalized}
                  onChange={(e) => setConsentPersonalized(e.target.checked)}
                />
                同意接受個人化服務
              </label>
            </div>

            <SectionTitle>六、三方簽署</SectionTitle>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {SIGNATURE_DEFS.map((sg) => {
                const signedDate = signatures[sg.role];
                const signed = !!signedDate;
                return (
                  <button
                    key={sg.role}
                    type="button"
                    onClick={() => doSign(sg.role, sg.label)}
                    data-test-id={`dlv-sign-${sg.role}`}
                    className={`rounded-md p-3 text-center min-h-[88px] flex flex-col items-center justify-center gap-1 transition border-[1.5px] ${
                      signed
                        ? "border-solid border-[#0F6E56] bg-[#E1F5EE]"
                        : "border-dashed border-[#D5D3CB] bg-[#FAFAF8] hover:border-[#85B7EB] hover:bg-[#EAF4FB]"
                    }`}
                  >
                    <div className="text-[20px]">{signed ? "✅" : sg.icon}</div>
                    <div className="text-[12px] font-semibold text-[#4A4A48]">
                      {signed ? `${sg.label.replace("簽名", "")}已簽名` : sg.label}
                    </div>
                    <div className="text-[10.5px] text-[#9A9890]">{signed ? signedDate : sg.sub}</div>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Footer>
            <Btn variant="ghost" onClick={() => goStep(2)}>
              ← 返回交車確認表
            </Btn>
            <Btn variant="ghost" onClick={() => showToast("🖨️ 保固條款書 PDF 已開啟")}>
              🖨️ 列印保固條款書
            </Btn>
            <Btn variant="teal" onClick={() => goStep(4)} testId="dlv-warranty-next">
              保固簽署完成 → 完成交車 →
            </Btn>
          </Footer>
        </div>
      )}

      {/* STEP 4 完成交車 */}
      {step === 4 && (
        <div className="space-y-3" data-test-pane="4">
          <div className="rounded-[12px] p-5 text-white text-center bg-gradient-to-br from-[#085041] to-[#0F6E56]">
            <div className="text-[20px] font-bold mb-1">🎉 恭喜！交車完成</div>
            <div className="text-[12.5px] opacity-85 mb-3 leading-[1.7]">
              王大明 的 Panigale V4 S 已完成所有交車程序
              <br />
              確認後系統將自動觸發以下動作
            </div>
            <div className="bg-white/10 border border-white/25 rounded-md px-4 py-3 mb-3 text-[12px] text-left leading-[1.8]">
              <b className="text-[#5DCAA5]">✅ 自動觸發項目：</b>
              <br />
              1 · 於 <b>CRM03A 電訪工作台</b> 建立 D+3 滿意度回訪任務（2026-06-04）
              <br />
              2 · 更新客戶狀態為「已成交 — 已交車」
              <br />
              3 · RS_M1 銷售漏斗「完成交車」層計數 +1
              <br />
              4 · 保固條款書存檔（存留 4 年）
              <br />
              5 · 交車確認表存檔（存留 4 年）
            </div>
            <div className="flex gap-2 justify-center flex-wrap">
              {!deliveryConfirmed ? (
                <button
                  type="button"
                  onClick={confirmDelivery}
                  data-test-id="dlv-confirm"
                  className="px-5 py-2 rounded-md text-[12.5px] font-semibold bg-white text-[#085041] hover:bg-[#E1F5EE] transition"
                >
                  ✅ 確認完成交車
                </button>
              ) : (
                <span
                  data-test-id="dlv-confirmed"
                  className="px-5 py-2 rounded-md text-[12.5px] font-semibold bg-white text-[#085041]"
                >
                  ✅ 已完成
                </span>
              )}
              <button
                type="button"
                onClick={() => showToast("🖨️ 交車文件套印中...")}
                className="px-5 py-2 rounded-md text-[12.5px] font-semibold bg-white/15 text-white border-[1.5px] border-white/35 hover:bg-white/25 transition"
              >
                🖨️ 列印交車文件
              </button>
              <a
                href="/customer-service/overview"
                className="px-5 py-2 rounded-md text-[12.5px] font-semibold bg-white/15 text-white border-[1.5px] border-white/35 hover:bg-white/25 transition inline-block"
              >
                📞 前往 CRM03A 電訪工作台
              </a>
            </div>
          </div>

          {/* RS05 文件交付段 — 8 項勾選 + 鑰匙數 + 客戶簽收 */}
          <Panel
            icon="📋"
            iconBg="bg-[#EAF4FB]"
            title="隨車文件點交清單（8 項）"
            sub="逐項勾選 · 點交鑰匙數量 · 客戶簽收"
            badge={`${docCount} / ${docTotal}`}
            badgeId="dlv-doc-cnt"
            badgeTone={docCount >= docMinRequired ? "teal" : "gray"}
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
              {HANDOVER_DOC_ITEMS.map((d, idx) => {
                const checked = docChecked.has(d.id);
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDoc(d.id)}
                    data-test-id={`dlv-doc-${d.id}`}
                    data-checked={checked ? "1" : "0"}
                    className={`flex items-start gap-2.5 px-3 py-2 rounded-md border text-left transition ${
                      checked
                        ? "bg-[#E1F5EE] border-[#5DCAA5]"
                        : "bg-white border-[#EEECE6] hover:border-[#85B7EB] hover:bg-[#F0F7FF]"
                    }`}
                  >
                    <div
                      className={`w-[18px] h-[18px] rounded border-2 shrink-0 flex items-center justify-center text-[10px] mt-px ${
                        checked ? "bg-[#0F6E56] border-[#0F6E56] text-white" : "border-[#D5D3CB]"
                      }`}
                    >
                      {checked ? "✓" : ""}
                    </div>
                    <span className="text-[18px] shrink-0 leading-none">{d.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12.5px] font-semibold text-[#2C2C2A] leading-[1.4]">
                        {d.label}
                        {d.id === "keys" && (
                          <span className="ml-1.5 font-mono text-[11.5px] text-[#185FA5]">×{keysCount}</span>
                        )}
                      </div>
                      {d.hint && (
                        <div className="text-[10.5px] text-[#9A9890] mt-px leading-[1.4]">{d.hint}</div>
                      )}
                    </div>
                    <span className="font-mono text-[10.5px] text-[#9A9890] shrink-0 mt-0.5">{idx + 1}</span>
                  </button>
                );
              })}
            </div>

            {/* 鑰匙數量 + 交付日期 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3.5">
              <Field label="🗝️ 鑰匙數量">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setKeysCount((n) => Math.max(1, n - 1))}
                    disabled={keysCount <= 1}
                    data-test-id="dlv-doc-keys-dec"
                    className="w-7 h-7 rounded-md border border-[#D5D3CB] bg-white text-[14px] font-bold text-[#4A4A48] hover:bg-[#F4F3F0] disabled:opacity-40"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={keysCount}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (!Number.isNaN(n)) setKeysCount(Math.min(10, Math.max(1, n)));
                    }}
                    data-test-id="dlv-doc-keys-input"
                    className={`${fiClass} w-20 text-center font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setKeysCount((n) => Math.min(10, n + 1))}
                    disabled={keysCount >= 10}
                    data-test-id="dlv-doc-keys-inc"
                    className="w-7 h-7 rounded-md border border-[#D5D3CB] bg-white text-[14px] font-bold text-[#4A4A48] hover:bg-[#F4F3F0] disabled:opacity-40"
                  >
                    ＋
                  </button>
                  <span className="text-[11px] text-[#9A9890]">把（1–10）</span>
                </div>
              </Field>
              <Field label="📅 交付日期" required>
                <input
                  type="date"
                  className={fiClass}
                  value={docDeliveredAt}
                  onChange={(e) => setDocDeliveredAt(e.target.value)}
                  data-test-id="dlv-doc-delivered-at"
                />
              </Field>
            </div>

            {/* 客戶簽收 */}
            <SectionTitle>客戶簽收</SectionTitle>
            {docSignature ? (
              <div
                className="border-2 border-[#0F6E56] bg-[#E1F5EE] rounded-md p-3 flex items-center gap-3"
                data-test-id="dlv-doc-signed"
              >
                <div className="text-[24px] shrink-0">✅</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold text-[#085041]">客戶簽收完成</div>
                  <div className="text-[11px] text-[#5A5955] mt-px">
                    交付日 {docDeliveredAt || "—"} · 鑰匙 {keysCount} 把
                  </div>
                </div>
                <img
                  src={docSignature}
                  alt="客戶簽名"
                  className="h-14 max-w-[180px] object-contain bg-white rounded border border-[#5DCAA5]"
                />
                <button
                  type="button"
                  onClick={clearDocSignature}
                  data-test-id="dlv-doc-clear-sig"
                  className="text-[11px] text-[#5A5955] hover:text-[#C8001A] px-2 py-1 rounded border border-[#D5D3CB] hover:border-[#C8001A] bg-white"
                >
                  重簽
                </button>
              </div>
            ) : (
              <div data-test-id="dlv-doc-sig-pad">
                <SignatureCanvas onSigned={handleDocSigned} />
              </div>
            )}

            {/* 完成狀態 hint */}
            <div
              className={`mt-3 px-3 py-2 rounded-md text-[11.5px] border ${
                docHandoverComplete
                  ? "bg-[#E1F5EE] border-[#5DCAA5] text-[#085041]"
                  : "bg-[#FAFAF8] border-[#EEECE6] text-[#5A5955]"
              }`}
              data-test-id="dlv-doc-status"
            >
              {docHandoverComplete
                ? `✅ 文件交付完成（${docCount}/${docTotal} 項已勾選、客戶已簽收）`
                : `⏳ 進度：${docCount}/${docTotal} 項勾選${
                    docCount < docMinRequired ? `（至少需 ${docMinRequired} 項）` : ""
                  }${docDeliveredAt ? "" : "、缺交付日期"}${docSignature ? "" : "、缺客戶簽收"}`}
            </div>
          </Panel>

          <Panel icon="📦" iconBg="bg-[#EAF3DE]" title="隨車文件點交清單" sub="交車時應一併交付車主的文件與物件">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {HANDOVER_DOCS.map((d) => (
                <div
                  key={d.name}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-md border border-[#EEECE6] bg-[#FAFAF8] text-[12.5px]"
                >
                  <span className="text-[18px] shrink-0">{d.icon}</span>
                  <div className="flex-1">
                    <div className="font-semibold">{d.name}</div>
                    <div className="text-[11px] text-[#9A9890] mt-px">{d.sub}</div>
                  </div>
                  <span
                    className={`text-[10.5px] px-2 py-0.5 rounded-md whitespace-nowrap shrink-0 ${
                      d.tagTone === "req" ? "bg-[#FDECEA] text-[#C8001A]" : "bg-[#F1EFE8] text-[#9A9890]"
                    }`}
                  >
                    {d.tag}
                  </span>
                </div>
              ))}
            </div>
          </Panel>

          <Footer>
            <Btn variant="ghost" onClick={() => goStep(3)}>
              ← 返回保固條款
            </Btn>
          </Footer>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-2.5 rounded-md text-[12.5px] z-50 shadow-lg leading-[1.5] max-w-[320px] ${
            toast.variant === "error"
              ? "bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]"
              : "bg-[#1A3A5C] text-white"
          }`}
          data-test-id="dlv-toast"
          data-test-variant={toast.variant}
        >
          {toast.msg}
        </div>
      )}
    </main>
  );
}

// ─── 子元件 ───

const fiClass =
  "w-full px-2.5 py-1.5 rounded-md border border-[#D5D3CB] text-[12.5px] text-[#2C2C2A] outline-none focus:border-[#85B7EB] bg-white";

function InfoIc({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="text-center min-w-[80px]">
      <div className="text-[10px] opacity-60 mb-0.5">{label}</div>
      <div className={`text-[13px] font-semibold ${mono ? "font-mono text-[12px]" : ""}`}>{value}</div>
    </div>
  );
}

function InfoDiv() {
  return <div className="w-px h-8 bg-white/20 shrink-0" />;
}

function PdiChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white border border-[#F5AEAD] rounded-md px-3 py-1.5 text-[12px]">
      {label}：<b className="text-[#C8001A] font-mono">{value}</b>
    </div>
  );
}

function ProgressRow({ label, pct }: { label: string; pct: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-[11.5px] font-semibold whitespace-nowrap">{label}</span>
      <div className="flex-1 h-1.5 bg-[#EEECE6] rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#0F6E56] to-[#5DCAA5] transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[12px] font-bold font-mono text-[#0F6E56] whitespace-nowrap">{pct}%</span>
    </div>
  );
}

function CheckItem({
  checked,
  onClick,
  num,
  text,
  tag,
  tagTone,
  testId,
}: {
  checked: boolean;
  onClick: () => void;
  num?: number;
  text: string;
  tag?: string;
  tagTone?: "a" | "b" | "c" | "d";
  testId?: string;
}) {
  const tagCls =
    tagTone === "a"
      ? "bg-[#185FA5]"
      : tagTone === "b"
      ? "bg-[#0F6E56]"
      : tagTone === "c"
      ? "bg-[#854F0B]"
      : tagTone === "d"
      ? "bg-[#534AB7]"
      : "bg-[#9A9890]";
  return (
    <button
      type="button"
      onClick={onClick}
      data-test-id={testId}
      data-checked={checked ? "1" : "0"}
      className={`flex items-start gap-2.5 px-2.5 py-1.5 rounded-md border text-left transition ${
        checked ? "bg-[#E1F5EE] border-[#5DCAA5]" : "bg-white border-[#EEECE6] hover:border-[#85B7EB] hover:bg-[#F0F7FF]"
      }`}
    >
      <div
        className={`w-[18px] h-[18px] rounded border-2 shrink-0 flex items-center justify-center text-[10px] mt-px ${
          checked ? "bg-[#0F6E56] border-[#0F6E56] text-white" : "border-[#D5D3CB]"
        }`}
      >
        {checked ? "✓" : ""}
      </div>
      {num !== undefined && (
        <span className="font-mono text-[10.5px] text-[#9A9890] shrink-0 min-w-[22px] mt-0.5">{num}</span>
      )}
      <span className="text-[12.5px] flex-1 leading-[1.5]">{text}</span>
      {tag && (
        <span className={`text-[10px] font-bold text-white px-1.5 py-px rounded shrink-0 ${tagCls}`}>{tag}</span>
      )}
    </button>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10.5px] font-bold tracking-wider uppercase text-[#9A9890] mt-3.5 mb-2 flex items-center gap-2">
      {children}
      <span className="flex-1 h-px bg-[#EEECE6]" />
    </div>
  );
}

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
