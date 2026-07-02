"use client";

/**
 * RS_INV05 中古車收購申請 — 4 步驟 wizard
 *
 * STEP 1 基本資訊（來源類型 + 賣方資料）
 * STEP 2 車輛資料（VIN / 車型 / 年份 / 里程 / 外觀 & 機械等級 A-D / 事故 / 照片）
 * STEP 3 鑑價與成本（市場行情 − 整備成本 − 利潤 = 建議收購報價 + 實際收購報價）
 * STEP 4 收購決策（確認收購 / 條件收購 / 不收購 → 真 server action）
 *
 * 設計稿：docs/20260527/RS_INV05_中古車收購申請.html
 * 確認收購 → confirmDirectBuyAction → 建中古車主檔 + 觸發 PD-UC 整備工單。
 */

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";
import {
  confirmDirectBuyAction,
  rejectUsedPurchaseAction,
  type UsedPurchaseFormInput,
} from "@/lib/vehicle-inventory/used-purchase-actions";
import { brands as brandConfigs } from "@/lib/brands/registry";
import { useActiveBrand } from "@/lib/scope/scope-context";

const BASE = "/sales/inventory/used-purchase";

type SourceKey = "auction" | "personal" | "dealer" | "other";
const SOURCE_CARDS: { key: SourceKey; icon: string; title: string; sub: string }[] = [
  { key: "auction", icon: "🏷️", title: "拍賣場", sub: "法拍 / 標售 / 競標" },
  { key: "personal", icon: "👤", title: "個人出售", sub: "車主直賣" },
  { key: "dealer", icon: "🏪", title: "同業", sub: "其他車行" },
  { key: "other", icon: "📦", title: "其他", sub: "其他來源" },
];

type GradeKey = "A" | "B" | "C" | "D";
const EXT_GRADES: { key: GradeKey; label: string; color: string }[] = [
  { key: "A", label: "近全新", color: "#0F6E56" },
  { key: "B", label: "輕微痕跡", color: "#185FA5" },
  { key: "C", label: "明顯瑕疵", color: "#854F0B" },
  { key: "D", label: "嚴重損傷", color: "#CC0000" },
];
const MECH_GRADES: { key: GradeKey; label: string; color: string }[] = [
  { key: "A", label: "正常無異音", color: "#0F6E56" },
  { key: "B", label: "輕微待修", color: "#185FA5" },
  { key: "C", label: "明顯缺陷", color: "#854F0B" },
  { key: "D", label: "重大故障", color: "#CC0000" },
];

const PHOTO_SLOTS = [
  "前方",
  "後方",
  "左側",
  "右側",
  "里程表",
  "VIN位置",
  "引擎室",
  "其他",
];

function n(v: string): number {
  return parseInt(v.replace(/[^\d]/g, ""), 10) || 0;
}
function fmtNT(v: number): string {
  return `NT$${v.toLocaleString("en-US")}`;
}

type DoneResult = {
  application_no: string;
  used_car_id: string;
  ro_code: string;
  decision: "approved" | "conditional";
};

export default function UsedPurchaseWizard({
  applicationNo,
  canEdit,
}: {
  applicationNo: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const activeBrandDisplayName = brandConfigs[useActiveBrand()].displayName;
  useSetPageHeader({
    breadcrumb: [
      { label: "中古車收購申請", href: BASE },
      { label: "新增收購申請" },
    ],
  });

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // STEP 1
  const [source, setSource] = useState<SourceKey>("auction");
  const [sellerName, setSellerName] = useState("");
  const [sellerPhone, setSellerPhone] = useState("");
  const [sellerIdNo, setSellerIdNo] = useState("");
  const [sourceNote, setSourceNote] = useState("");

  // STEP 2
  const [vin, setVin] = useState("");
  const [brandName, setBrandName] = useState(activeBrandDisplayName);
  const [modelName, setModelName] = useState("");
  const [year, setYear] = useState("");
  const [color, setColor] = useState("");
  const [mileage, setMileage] = useState("");
  const [plate, setPlate] = useState("");
  const [gradeExt, setGradeExt] = useState<GradeKey>("A");
  const [gradeMech, setGradeMech] = useState<GradeKey>("A");
  const [accident, setAccident] = useState(false);
  const [accidentNote, setAccidentNote] = useState("");
  const [photos, setPhotos] = useState<number[]>([]);

  // STEP 3
  const [pMarket, setPMarket] = useState("");
  const [pMsrp, setPMsrp] = useState("");
  const [marketSourceNote, setMarketSourceNote] = useState("");
  const [pPaint, setPPaint] = useState("");
  const [pRepair, setPRepair] = useState("");
  const [pTire, setPTire] = useState("");
  const [pBat, setPBat] = useState("");
  const [pAdmin, setPAdmin] = useState("5000");
  const [pOther, setPOther] = useState("");
  const [pProfit, setPProfit] = useState("");
  const [pComm, setPComm] = useState("");
  const [pActual, setPActual] = useState("");
  const [pActualReason, setPActualReason] = useState("");

  // STEP 4
  const [decisionNote, setDecisionNote] = useState("");
  // 輪7-6：is_own_brand（預設 true = 自家品牌，觸發整備工單）
  const [isOwnBrand, setIsOwnBrand] = useState(true);
  const [externalBuyerName, setExternalBuyerName] = useState("");
  const [externalBuyerPhone, setExternalBuyerPhone] = useState("");
  const [wholesalePrice, setWholesalePrice] = useState("");
  const [wholesaleDate, setWholesaleDate] = useState(new Date().toISOString().slice(0, 10));

  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 2800);
  };
  const [isPending, startTransition] = useTransition();
  const [done, setDone] = useState<DoneResult | null>(null);

  // ── 衍生計算 ──
  const calc = useMemo(() => {
    const market = n(pMarket);
    const recon =
      n(pPaint) + n(pRepair) + n(pTire) + n(pBat) + n(pAdmin) + n(pOther);
    const profit = n(pProfit);
    const comm = n(pComm);
    const suggested = market - recon - profit - comm;
    const actual = n(pActual);
    const totalCost = (actual || suggested) + recon;
    return { market, recon, profit, comm, suggested, actual, totalCost };
  }, [pMarket, pPaint, pRepair, pTire, pBat, pAdmin, pOther, pProfit, pComm, pActual]);

  // ── 組 form payload（送 server action）──
  const buildForm = (): UsedPurchaseFormInput => ({
    source_type: source,
    seller_name: sellerName,
    seller_phone: sellerPhone,
    seller_id_no: sellerIdNo,
    vin,
    vehicle_model_name: modelName,
    brand_name: brandName,
    year: year ? Number(year) || null : null,
    color,
    mileage_km: mileage ? n(mileage) : null,
    grade_ext: gradeExt,
    grade_mech: gradeMech,
    market_ref_price: calc.market || null,
    recon_estimate: calc.recon || null,
    suggested_price: calc.suggested || null,
    actual_price: calc.actual || null,
    accident_flag: accident,
    accident_note: accidentNote,
    market_source_note: marketSourceNote,
    note: decisionNote,
    // 輪7-6
    is_own_brand: isOwnBrand,
    external_buyer_name: isOwnBrand ? null : externalBuyerName || null,
    external_buyer_phone: isOwnBrand ? null : externalBuyerPhone || null,
    wholesale_price: isOwnBrand ? null : (wholesalePrice ? n(wholesalePrice) || null : null),
    wholesale_date: isOwnBrand ? null : wholesaleDate || null,
  });

  const guard = (): string | null => {
    if (!sellerName.trim()) return "請填寫賣方姓名 / 公司名稱（STEP 1）";
    if (!vin.trim() && !modelName.trim())
      return "請至少填寫 VIN 或車型其中一項（STEP 2）";
    if (!calc.actual) return "請填寫實際收購報價（STEP 3）";
    // 輪7-6：非自家品牌時批售金額必填
    if (!isOwnBrand && !(n(wholesalePrice) > 0)) return "批售給外部買家時請填寫批售金額（STEP 4）";
    return null;
  };

  function handleConfirm(decision: "approved" | "conditional") {
    const err = guard();
    if (err) {
      showToast(`❌ ${err}`);
      return;
    }
    startTransition(async () => {
      const r = await confirmDirectBuyAction({ form: buildForm(), decision });
      if (!r.ok) {
        showToast(`❌ ${r.error}`);
        return;
      }
      setDone({
        application_no: r.data.application_no,
        used_car_id: r.data.used_car_id,
        ro_code: r.data.ro_code,
        decision,
      });
    });
  }

  function handleReject() {
    if (!sellerName.trim()) {
      showToast("❌ 請填寫賣方姓名 / 公司名稱（STEP 1）");
      return;
    }
    startTransition(async () => {
      const r = await rejectUsedPurchaseAction({ form: buildForm() });
      if (!r.ok) {
        showToast(`❌ ${r.error}`);
        return;
      }
      showToast(`✓ 申請單 ${r.data.application_no} 已標記為「不收購」`);
      setTimeout(() => router.push(BASE), 900);
    });
  }

  const lockCls = isPending ? "pointer-events-none opacity-60" : "";

  // ── 成功卡 ──
  if (done) {
    const condTitle = done.decision === "conditional";
    const isOwnBrandDone = done.used_car_id !== ""; // 非自家品牌時 used_car_id 為空
    return (
      <div className="max-w-[900px] mx-auto px-6 py-8">
        <div className={`rounded-xl text-white p-7 shadow-lg bg-gradient-to-br ${isOwnBrandDone ? "from-[#0F6E56] to-[#185FA5]" : "from-[#854F0B] to-[#CC7A00]"}`}>
          <div className="text-[20px] font-bold mb-1">
            {isOwnBrandDone
              ? (condTitle ? "⚠️ 條件收購確認！整備工單已建立" : "🎉 收購確認完成！整備工單已建立")
              : "📦 批售完成！批售記錄已寫入金流帳冊"}
          </div>
          <div className="text-[13px] opacity-90 mb-4">
            {isOwnBrandDone
              ? "中古車車輛主檔已建立，整備工單已觸發，費用計入整車成本"
              : "非自家品牌車輛已批售給外部買家，付款記錄已寫入 sales_payments"}
          </div>
          <div className="flex flex-wrap gap-2 mb-5">
            <span className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12.5px]">
              申請單號：<b>{done.application_no}</b>
            </span>
            {isOwnBrandDone && done.ro_code && (
              <span className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12.5px]">
                整備工單：<b className="font-mono">{done.ro_code}</b>
              </span>
            )}
            <span className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12.5px]">
              來源類型：<b>{isOwnBrandDone ? "DIRECT_BUY（自家品牌）" : "WHOLESALE_EXTERNAL（批售）"}</b>
            </span>
            {isOwnBrandDone && (
              <span className="px-3 py-1.5 rounded-md bg-white/15 border border-white/25 text-[12.5px]">
                車輛狀態：<b>待整備</b>
              </span>
            )}
          </div>
          <div className="rounded-md bg-white/10 p-3 text-[12px] leading-relaxed mb-5">
            <b>✅ 系統已自動執行：</b>
            {isOwnBrandDone ? (
              <>
                <br />1 · 建立中古車車輛主檔（acquisition_source = direct_buy，狀態「待整備」）
                <br />2 · 自動建立整備工單 <b className="font-mono">{done.ro_code}</b>（PD-UC，費用計入整車成本）
                {condTitle && (
                  <><br />3 · 標記「整備後需重新鑑價」才可上架銷售</>
                )}
              </>
            ) : (
              <>
                <br />1 · 記錄批售給外部買家的收款資訊（sales_payments，source_type = wholesale_to_external）
                <br />2 · 未觸發整備工單（非自家品牌不入庫整備）
              </>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${BASE}/${""}`}
              onClick={(e) => {
                e.preventDefault();
                router.push(BASE);
              }}
              className="px-4 py-2 rounded-md bg-white text-[#0F6E56] text-[12.5px] font-semibold"
            >
              ← 回收購申請列表
            </Link>
            {isOwnBrandDone && (
              <>
                <Link
                  href="/usedcar/stock"
                  className="px-4 py-2 rounded-md bg-white/15 border border-white/30 text-[12.5px] font-semibold"
                >
                  🏍️ 查看中古車庫存
                </Link>
                <Link
                  href="/parts/aftersales/repair-orders"
                  className="px-4 py-2 rounded-md bg-white/15 border border-white/30 text-[12.5px] font-semibold"
                >
                  🔧 查看整備工單
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  const steps = [
    { num: 1, label: "基本資訊" },
    { num: 2, label: "車輛資料" },
    { num: 3, label: "鑑價與成本" },
    { num: 4, label: "收購決策" },
  ];

  return (
    <div className={`max-w-[1000px] mx-auto px-6 py-5 space-y-3 pb-20 ${lockCls}`}>
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href={BASE} className="hover:text-[#185FA5]">
            中古車收購申請
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{applicationNo}</span>
          <span className="ml-1 px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
            建立模式
          </span>
        </div>
        <Link
          href={BASE}
          className="ml-auto h-[30px] px-4 inline-flex items-center rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
        >
          ← 返回列表
        </Link>
      </div>

      {/* Page Header */}
      <header className="flex items-center gap-2.5 flex-wrap">
        <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
          中古車收購申請 — 直購（4 步驟）
        </h1>
        <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
          RS_INV05
        </span>
      </header>

      {/* Step Bar */}
      <div className="flex bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        {steps.map((s, idx) => {
          const active = s.num === step;
          const doneStep = s.num < step;
          return (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num as 1 | 2 | 3 | 4)}
              className={`flex-1 px-3 py-2.5 text-center text-[12px] whitespace-nowrap transition-colors ${
                idx < steps.length - 1 ? "border-r border-[#EEECE6]" : ""
              } ${
                active
                  ? "bg-[#1A3A5C] text-white font-bold"
                  : doneStep
                    ? "bg-[#E8F5F0] text-[#0F6E56] font-medium"
                    : "text-[#9A9890] font-medium hover:bg-[#F4F3F0]"
              }`}
            >
              <span className="block text-[10px] opacity-70 font-mono">
                STEP {s.num}
              </span>
              {s.label}
            </button>
          );
        })}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <Panel icon="📋" title="收購申請基本資訊" sub="直接收購（Direct Purchase）— 非置換，市場主動購入">
          <SecTitle>申請資訊</SecTitle>
          <Grid cols={3}>
            <Field label="申請單號">
              <input className={`${inputCls} font-mono bg-[#F8F7F4]`} value={applicationNo} readOnly />
            </Field>
            <Field label="申請日期">
              <input className={`${inputCls} font-mono`} value={new Date().toISOString().slice(0, 10)} readOnly />
            </Field>
          </Grid>

          <SecTitle>
            來源類型 <span className="text-[#CC0000]">*</span>
          </SecTitle>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            {SOURCE_CARDS.map((c) => {
              const sel = source === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setSource(c.key)}
                  className={`text-left rounded-lg border p-3 transition-colors ${
                    sel
                      ? "border-[#0F6E56] bg-[#E8F5F0]"
                      : "border-[#D5D3CB] bg-white hover:border-[#85B7EB]"
                  }`}
                >
                  <div className="text-[12.5px] font-semibold text-[#2C2C2A]">
                    {c.icon} {c.title}
                  </div>
                  <div className="text-[11px] text-[#9A9890]">{c.sub}</div>
                </button>
              );
            })}
          </div>

          <SecTitle>賣方資料</SecTitle>
          <Grid cols={3}>
            <Field label="賣方姓名 / 公司名稱" required>
              <input
                className={inputCls}
                placeholder="例：王大明 / 優質車業有限公司"
                value={sellerName}
                onChange={(e) => setSellerName(e.target.value)}
              />
            </Field>
            <Field label="聯絡電話" required>
              <input
                className={`${inputCls} font-mono`}
                placeholder="0912-345-678"
                value={sellerPhone}
                onChange={(e) => setSellerPhone(e.target.value)}
              />
            </Field>
            <Field label="身分證字號 / 統一編號">
              <input
                className={`${inputCls} font-mono`}
                placeholder="A123456789"
                value={sellerIdNo}
                onChange={(e) => setSellerIdNo(e.target.value)}
              />
            </Field>
            <Field label="備注">
              <input
                className={inputCls}
                placeholder="來源說明、介紹人等..."
                value={sourceNote}
                onChange={(e) => setSourceNote(e.target.value)}
              />
            </Field>
          </Grid>

          <div className="flex justify-end mt-3">
            <button type="button" onClick={() => setStep(2)} className={btnTeal}>
              車輛資料 →
            </button>
          </div>
        </Panel>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <Panel icon="🏍️" title="車輛基本資料" sub="填寫完整後系統將比對車輛主檔，確認非重複收購">
          <SecTitle>車輛識別</SecTitle>
          <Grid cols={3}>
            <Field label="VIN 車架號碼" required>
              <input
                className={`${inputCls} font-mono`}
                placeholder="17碼 VIN..."
                value={vin}
                onChange={(e) => setVin(e.target.value)}
              />
            </Field>
            <Field label="廠牌" required>
              <input className={inputCls} value={brandName} onChange={(e) => setBrandName(e.target.value)} />
            </Field>
            <Field label="車型" required>
              <input
                className={inputCls}
                placeholder="例：Scout Bobber"
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
              />
            </Field>
            <Field label="出廠年份" required>
              <input
                className={`${inputCls} font-mono`}
                placeholder="2022"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </Field>
            <Field label="車身顏色">
              <input
                className={inputCls}
                placeholder="例：Black Smoke"
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </Field>
            <Field label="目前里程數" required>
              <input
                className={`${inputCls} font-mono`}
                placeholder="例：23,500 km"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
              />
            </Field>
            <Field label="行照號碼">
              <input
                className={`${inputCls} font-mono`}
                placeholder="例：LGX-8096"
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
              />
            </Field>
          </Grid>

          <SecTitle>車況評級</SecTitle>
          <Grid cols={2}>
            <Field label="車身外觀等級" required>
              <GradeRow grades={EXT_GRADES} value={gradeExt} onChange={setGradeExt} />
            </Field>
            <Field label="機械狀態等級" required>
              <GradeRow grades={MECH_GRADES} value={gradeMech} onChange={setGradeMech} />
            </Field>
          </Grid>

          <SecTitle>事故紀錄</SecTitle>
          <Grid cols={2}>
            <Field label="重大事故紀錄" required>
              <div className="flex gap-3 mt-1">
                <label className="flex items-center gap-1.5 text-[12.5px] cursor-pointer">
                  <input type="radio" checked={!accident} onChange={() => setAccident(false)} /> 無
                </label>
                <label className="flex items-center gap-1.5 text-[12.5px] cursor-pointer">
                  <input type="radio" checked={accident} onChange={() => setAccident(true)} /> 有
                </label>
              </div>
            </Field>
            <Field label="事故說明（如有）">
              <input
                className={inputCls}
                placeholder="事故日期、部位、修復情況..."
                value={accidentNote}
                onChange={(e) => setAccidentNote(e.target.value)}
                disabled={!accident}
              />
            </Field>
          </Grid>

          <SecTitle>照片上傳（各角度）</SecTitle>
          <div className="grid grid-cols-4 gap-2 mb-2">
            {PHOTO_SLOTS.map((label, i) => {
              const uploaded = photos.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() =>
                    setPhotos((prev) =>
                      prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i],
                    )
                  }
                  className={`min-h-[72px] rounded-md border-[1.5px] flex flex-col items-center justify-center gap-1 transition-colors ${
                    uploaded
                      ? "border-solid border-[#5DCAA5] bg-[#E1F5EE]"
                      : "border-dashed border-[#D5D3CB] bg-[#FAFAF8] hover:border-[#85B7EB]"
                  }`}
                >
                  <span className="text-[18px]">{uploaded ? "✅" : "📷"}</span>
                  <span className="text-[11px] text-[#5A5955]">{label}</span>
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setPhotos(PHOTO_SLOTS.map((_, i) => i))}
            className={`${btnGhost} h-[28px] px-3 text-[11.5px]`}
          >
            📷 模擬全部上傳（測試）
          </button>

          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setStep(1)} className={btnGhost}>
              ← 基本資訊
            </button>
            <button type="button" onClick={() => setStep(3)} className={btnTeal}>
              鑑價與成本 →
            </button>
          </div>
        </Panel>
      )}

      {/* STEP 3 */}
      {step === 3 && (
        <Panel icon="💰" title="鑑價與成本估算" sub="市場行情 − 整備成本 − 預期毛利 ＝ 建議收購報價">
          <SecTitle>市場行情參考</SecTitle>
          <Grid cols={2}>
            <Field label="市場同款中古車行情（含稅）">
              <input className={`${inputCls} font-mono`} type="number" placeholder="0" value={pMarket} onChange={(e) => setPMarket(e.target.value)} />
            </Field>
            <Field label="新車原廠建議售價（MSRP）">
              <input className={`${inputCls} font-mono`} type="number" placeholder="0" value={pMsrp} onChange={(e) => setPMsrp(e.target.value)} />
            </Field>
            <Field label="行情來源說明">
              <input className={inputCls} placeholder="例：露天拍賣 3 筆均價、同業報價..." value={marketSourceNote} onChange={(e) => setMarketSourceNote(e.target.value)} />
            </Field>
          </Grid>

          <SecTitle>預估整備成本</SecTitle>
          <div className="space-y-1.5">
            <CostRow label="外觀修復 / 補漆" value={pPaint} onChange={setPPaint} />
            <CostRow label="機械維修" value={pRepair} onChange={setPRepair} />
            <CostRow label="輪胎更換（前後）" value={pTire} onChange={setPTire} />
            <CostRow label="電瓶更換" value={pBat} onChange={setPBat} />
            <CostRow label="代辦過戶 / 行政費用" value={pAdmin} onChange={setPAdmin} />
            <CostRow label="其他整備項目" value={pOther} onChange={setPOther} />
          </div>

          <SecTitle>銷售費用與利潤</SecTitle>
          <Grid cols={2}>
            <Field label="計畫銷售利潤（建議 4~6%）">
              <input className={`${inputCls} font-mono`} type="number" placeholder="0" value={pProfit} onChange={(e) => setPProfit(e.target.value)} />
            </Field>
            <Field label="銷售相關成本（建議 1.5%）">
              <input className={`${inputCls} font-mono`} type="number" placeholder="0" value={pComm} onChange={(e) => setPComm(e.target.value)} />
            </Field>
          </Grid>

          {/* 計算總列 */}
          <div className="mt-3 rounded-lg bg-[#1A3A5C] text-white grid grid-cols-3 divide-x divide-white/15">
            <CalcCell label="整備成本合計" value={fmtNT(calc.recon)} />
            <CalcCell label="市場行情" value={calc.market ? fmtNT(calc.market) : "NT$—"} />
            <CalcCell
              label="建議收購報價"
              value={calc.market ? fmtNT(calc.suggested) : "NT$—"}
              accent
            />
          </div>

          <div className="mt-3">
            <div className="text-[11px] text-[#9A9890] font-medium mb-1">
              實際收購報價 <span className="text-[#CC0000]">*</span>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                className={`${inputCls} font-mono max-w-[200px]`}
                type="number"
                placeholder="請輸入實際收購金額"
                value={pActual}
                onChange={(e) => setPActual(e.target.value)}
              />
              <input
                className={`${inputCls} flex-1 min-w-[200px]`}
                placeholder="若與建議價不同，請說明原因"
                value={pActualReason}
                onChange={(e) => setPActualReason(e.target.value)}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={() => setStep(2)} className={btnGhost}>
              ← 車輛資料
            </button>
            <button type="button" onClick={() => setStep(4)} className={btnTeal}>
              收購決策 →
            </button>
          </div>
        </Panel>
      )}

      {/* STEP 4 */}
      {step === 4 && (
        <Panel icon="✅" title="收購決策確認" sub="確認後依品牌屬性自動建立車輛主檔並觸發整備工單（自家品牌）或記批售資訊（外部品牌）">
          {/* 申請摘要 */}
          <div className="rounded-lg bg-[#F8F7F4] p-3 grid grid-cols-2 md:grid-cols-3 gap-3 mb-4 text-[12px]">
            <SummaryKv label="申請單號" value={applicationNo} mono />
            <SummaryKv
              label="來源類型"
              value={`直購 — ${SOURCE_CARDS.find((c) => c.key === source)?.title ?? ""}`}
            />
            <SummaryKv label="實際收購報價" value={calc.actual ? fmtNT(calc.actual) : "NT$—"} mono />
            <SummaryKv label="整備成本估算" value={fmtNT(calc.recon)} mono />
            <SummaryKv label="整車成本預估" value={calc.actual ? fmtNT(calc.totalCost) : "NT$—"} mono />
            <SummaryKv label="賣方" value={sellerName || "—"} />
          </div>

          {/* 輪7-6：是否自家品牌 toggle */}
          <SecTitle>品牌屬性 <span className="text-[#CC0000]">*</span></SecTitle>
          <div className="flex gap-3 mb-3">
            <button
              type="button"
              onClick={() => setIsOwnBrand(true)}
              className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-left text-[12.5px] transition-colors ${
                isOwnBrand
                  ? "border-[#0F6E56] bg-[#E8F5F0]"
                  : "border-[#D5D3CB] bg-white hover:border-[#85B7EB]"
              }`}
            >
              <div className="font-semibold text-[#2C2C2A]">🏍️ 自家品牌</div>
              <div className="text-[11px] text-[#9A9890] mt-0.5">觸發 PD-UC 整備工單，建立中古車主檔</div>
            </button>
            <button
              type="button"
              onClick={() => setIsOwnBrand(false)}
              className={`flex-1 rounded-lg border-2 px-3 py-2.5 text-left text-[12.5px] transition-colors ${
                !isOwnBrand
                  ? "border-[#854F0B] bg-[#FDF3E3]"
                  : "border-[#D5D3CB] bg-white hover:border-[#85B7EB]"
              }`}
            >
              <div className="font-semibold text-[#2C2C2A]">📦 非自家品牌（批售）</div>
              <div className="text-[11px] text-[#9A9890] mt-0.5">不建整備工單，記錄外部買家批售資訊</div>
            </button>
          </div>

          {/* 非自家品牌時顯示批售資訊欄位 */}
          {!isOwnBrand && (
            <div className="rounded-lg border border-[#F0C97E] bg-[#FDF3E3] p-3 mb-3">
              <div className="text-[12px] font-semibold text-[#854F0B] mb-2">批售資訊</div>
              <Grid cols={3}>
                <Field label="外部買家姓名 / 公司">
                  <input
                    className={inputCls}
                    placeholder="例：明達車業"
                    value={externalBuyerName}
                    onChange={(e) => setExternalBuyerName(e.target.value)}
                  />
                </Field>
                <Field label="聯絡電話">
                  <input
                    className={`${inputCls} font-mono`}
                    placeholder="0912-345-678"
                    value={externalBuyerPhone}
                    onChange={(e) => setExternalBuyerPhone(e.target.value)}
                  />
                </Field>
                <Field label="批售金額" required>
                  <input
                    className={`${inputCls} font-mono`}
                    type="number"
                    placeholder="0"
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value)}
                  />
                </Field>
                <Field label="批售日期">
                  <input
                    className={`${inputCls} font-mono`}
                    type="date"
                    value={wholesaleDate}
                    onChange={(e) => setWholesaleDate(e.target.value)}
                  />
                </Field>
              </Grid>
            </div>
          )}

          {isOwnBrand && (
            <div className="rounded-md bg-[#EAF4FB] border border-[#85B7EB] p-3 text-[12px] text-[#185FA5] mb-3 leading-relaxed">
              <b>✅ 確認收購</b> → 建立中古車車輛主檔（acquisition_source =
              direct_buy）+ 自動觸發整備工單（PD-UC，費用計入整車成本）。
              <br />
              <b>⚠️ 條件收購</b> → 同上，並標記「整備後需重新鑑價」才可上架。
            </div>
          )}

          <div className="mb-3">
            <div className="text-[11px] text-[#9A9890] font-medium mb-1">決策說明 / 備注</div>
            <textarea
              className={`${inputCls} h-[60px] resize-none`}
              placeholder="收購理由、風險說明、特殊狀況..."
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 flex-wrap">
            <button type="button" onClick={() => setStep(3)} className={btnGhost} disabled={isPending}>
              ← 鑑價成本
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={isPending || !canEdit}
              className={`${btnDanger} disabled:opacity-60`}
            >
              {isPending ? "處理中⋯" : "❌ 不收購"}
            </button>
            {isOwnBrand && (
              <button
                type="button"
                onClick={() => handleConfirm("conditional")}
                disabled={isPending || !canEdit}
                className={`${btnAmber} disabled:opacity-60`}
              >
                {isPending ? "建立中⋯" : "⚠️ 條件收購"}
              </button>
            )}
            <button
              type="button"
              onClick={() => handleConfirm("approved")}
              disabled={isPending || !canEdit}
              className={`${btnTeal} disabled:opacity-60`}
              style={{ fontSize: 13, padding: "0 22px" }}
            >
              {isPending ? "建立中⋯" : isOwnBrand ? "✅ 確認收購" : "✅ 確認批售"}
            </button>
          </div>
        </Panel>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg text-[12.5px] z-50 bg-[#1A3A5C] text-white max-w-[320px] leading-relaxed">
          {toast}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helper components / styles
// ============================================================

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md border border-[#D5D3CB] text-[12.5px] outline-none focus:border-[#85B7EB] bg-white";
const btnTeal =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] transition-colors";
const btnGhost =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] transition-colors";
const btnAmber =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] hover:bg-[#fbe9ce] transition-colors";
const btnDanger =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] transition-colors";

function Panel({
  icon,
  title,
  sub,
  children,
}: {
  icon: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center gap-2">
        <span className="text-[16px]">{icon}</span>
        <div>
          <div className="text-[13px] font-semibold text-[#2C2C2A]">{title}</div>
          {sub && <div className="text-[11px] text-[#9A9890]">{sub}</div>}
        </div>
      </header>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] font-semibold text-[#4A4A48] mt-3 mb-2 first:mt-0">
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return (
    <div
      className={`grid grid-cols-1 gap-x-4 gap-y-3 ${
        cols === 3 ? "md:grid-cols-3" : "md:grid-cols-2"
      }`}
    >
      {children}
    </div>
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
    <div className="flex flex-col gap-1">
      <label className="text-[11px] text-[#9A9890] font-medium">
        {label} {required && <span className="text-[#CC0000]">*</span>}
      </label>
      {children}
    </div>
  );
}

function GradeRow({
  grades,
  value,
  onChange,
}: {
  grades: { key: GradeKey; label: string; color: string }[];
  value: GradeKey;
  onChange: (g: GradeKey) => void;
}) {
  return (
    <div className="flex gap-1.5">
      {grades.map((g) => {
        const sel = value === g.key;
        return (
          <button
            key={g.key}
            type="button"
            onClick={() => onChange(g.key)}
            className={`flex-1 rounded-md border py-1.5 text-center transition-colors ${
              sel ? "border-current bg-[#F8F7F4]" : "border-[#D5D3CB] bg-white hover:border-[#9A9890]"
            }`}
            style={sel ? { color: g.color, borderColor: g.color } : undefined}
          >
            <div className="text-[14px] font-bold" style={{ color: g.color }}>
              {g.key}
            </div>
            <div className="text-[10px] text-[#5A5955]">{g.label}</div>
          </button>
        );
      })}
    </div>
  );
}

function CostRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-[12px] text-[#5A5955] flex-1">{label}</div>
      <input
        className={`${inputCls} font-mono max-w-[160px]`}
        type="number"
        placeholder="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function CalcCell({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="px-3 py-2.5 text-center">
      <div className="text-[10.5px] text-white/70">{label}</div>
      <div
        className={`font-mono font-bold ${accent ? "text-[#5DCAA5] text-[18px]" : "text-[14px]"}`}
      >
        {value}
      </div>
    </div>
  );
}

function SummaryKv({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[10.5px] text-[#9A9890] mb-0.5">{label}</div>
      <div className={`font-semibold text-[#2C2C2A] ${mono ? "font-mono" : ""}`}>
        {value}
      </div>
    </div>
  );
}
