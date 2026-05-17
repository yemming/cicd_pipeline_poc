"use client";

/**
 * 成交訂單合約 Wizard — RS04
 *
 * 保留原 mock UI 的合約書 UX（新車 + 中古車），
 * 改為透過 createSalesOrderAction 寫入 DB。
 * 成功後 router.push 到 /sales/orders/[id]。
 */

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

import { useSetPageHeader } from "@/components/page-header-context";
import { createSalesOrderAction } from "@/lib/sales/order-actions";
import {
  USED_CERT_LEVELS,
  TRANSFER_OPTIONS,
  type PaymentMethod,
} from "@/domain/sales-orders.constants";
import type { CustomerPickRow, VehicleModelPickRow } from "@/domain/sales-orders.constants";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

type ContractKind = "new" | "used";

type QuoteSnapshot = {
  quoteNo: string;
  customerName: string;
  rsName: string;
  vehicleKind: ContractKind;
  model: string;
  totalAmount: number;
  expiresAt: string;
  savedAt: string;
};

const SNAPSHOT_KEY = "sales-quote-snapshot:v1";

const STEPS = [
  { num: 1, label: "報價完成", done: true },
  { num: 2, label: "訂購合約", active: true },
  { num: 3, label: "客戶簽名" },
  { num: 4, label: "交車作業" },
] as const;

const PAYMENT_OPTIONS: { id: PaymentMethod; icon: string; name: string }[] = [
  { id: "cash", icon: "💵", name: "現金全額" },
  { id: "card", icon: "💳", name: "刷卡一次" },
  { id: "loan", icon: "🏦", name: "銀行貸款" },
  { id: "installment", icon: "📋", name: "分期付款" },
];

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

type Props = {
  customers: CustomerPickRow[];
  vehicleModels: VehicleModelPickRow[];
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function OrderWizard({ customers, vehicleModels }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "訂單中心", href: "/sales/orders" },
      { label: "新增合約" },
    ],
  });

  // ── Kind from URL
  const typeParam = searchParams.get("type");
  const initialKind: ContractKind = typeParam === "used" ? "used" : "new";
  const [kind, setKind] = useState<ContractKind>(initialKind);

  const switchKind = (next: ContractKind) => {
    setKind(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("type", next);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // ── Quote snapshot from localStorage
  const [snapshot, setSnapshot] = useState<QuoteSnapshot | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SNAPSHOT_KEY);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSnapshot(JSON.parse(raw) as QuoteSnapshot);
      }
    } catch {
      /* swallow */
    }
  }, []);

  // ── Toast
  const [toast, setToast] = useState<string | null>(null);
  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }

  // ── Customer selection
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const selectedCustomer = customers.find((c) => c.id === selectedCustomerId);

  // ── Shared buyer state
  const customerName = selectedCustomer?.name ?? snapshot?.customerName ?? "";
  const rsName = snapshot?.rsName ?? "";
  const [buyerId, setBuyerId] = useState("");
  // Phone/email derive from selected customer when available; user can override
  const [buyerPhoneOverride, setBuyerPhoneOverride] = useState<string | null>(null);
  const [buyerEmailOverride, setBuyerEmailOverride] = useState<string | null>(null);
  const buyerPhone =
    buyerPhoneOverride ?? selectedCustomer?.phone ?? "";
  const buyerEmail =
    buyerEmailOverride ?? selectedCustomer?.email ?? "";
  const [buyerAddress, setBuyerAddress] = useState("");

  // ── New car state
  const [selectedVehicleModelId, setSelectedVehicleModelId] = useState("");
  const selectedVehicleModel = vehicleModels.find(
    (v) => v.id === selectedVehicleModelId,
  );
  const [newColor, setNewColor] = useState("Ducati Red");
  const [newVin, setNewVin] = useState("");
  const [newEngine, setNewEngine] = useState("");
  const [paymentId, setPaymentId] = useState<PaymentMethod>("cash");
  const [deposit, setDeposit] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("2026-05-17");
  const [specialNote, setSpecialNote] = useState(
    "贈品：原廠安全帽 AGV K6。選配：DP 排氣管，交車前安裝完成。春季折扣 NT$20,000 已含入。",
  );

  // ── Used car state
  const [usedBrand, setUsedBrand] = useState("DUCATI Panigale V2");
  const [usedYear, setUsedYear] = useState("2022");
  const [usedPlate, setUsedPlate] = useState("");
  const [usedCc, setUsedCc] = useState("955");
  const [usedVin, setUsedVin] = useState("");
  const [usedEngine, setUsedEngine] = useState("");
  const [usedMileage, setUsedMileage] = useState("12,500");
  const [usedCertLevel, setUsedCertLevel] = useState<string>(USED_CERT_LEVELS[2]);
  const [usedDealPrice, setUsedDealPrice] = useState("");
  const [usedDeposit, setUsedDeposit] = useState("");
  const [usedFinalDate, setUsedFinalDate] = useState("");
  const [usedTransferBy, setUsedTransferBy] = useState<string>(TRANSFER_OPTIONS[0]);
  const [usedConditionNote, setUsedConditionNote] = useState(
    "車況良好，無重大事故紀錄。左側下整流罩有輕微風化痕跡。12,500km 已完成 Desmo Service，保養紀錄完整。",
  );

  // ── Contract number preview
  const contractNo = useMemo(() => {
    const d = new Date();
    const yyyymmdd = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    const prefix = kind === "new" ? "PO" : "UA";
    return `${prefix}-${yyyymmdd}-XXX`;
  }, [kind]);

  // ── Submit
  function handleConfirm() {
    startTransition(async () => {
      const input =
        kind === "new"
          ? {
              contract_type: "new" as const,
              customer_id: selectedCustomerId || null,
              customer_name: customerName || null,
              customer_phone: buyerPhone || null,
              customer_email: buyerEmail || null,
              customer_address: buyerAddress || null,
              buyer_national_id: buyerId || null,
              rs_name: rsName || null,
              vehicle_model_id: selectedVehicleModelId || null,
              vehicle_model_name:
                selectedVehicleModel?.display_name ??
                snapshot?.model ??
                null,
              vehicle_color: newColor || null,
              vehicle_vin: newVin || null,
              vehicle_engine_no: newEngine || null,
              payment_method: paymentId,
              down_payment: deposit ? parseFloat(deposit.replace(/,/g, "")) : null,
              delivery_date: deliveryDate || null,
              special_notes: specialNote || null,
              quote_snapshot: snapshot
                ? (snapshot as unknown as Record<string, unknown>)
                : null,
            }
          : {
              contract_type: "used" as const,
              customer_id: selectedCustomerId || null,
              customer_name: customerName || null,
              customer_phone: buyerPhone || null,
              customer_email: buyerEmail || null,
              customer_address: buyerAddress || null,
              buyer_national_id: buyerId || null,
              rs_name: rsName || null,
              used_brand_model: usedBrand || null,
              used_year: usedYear || null,
              used_plate: usedPlate || null,
              used_cc: usedCc || null,
              used_mileage: usedMileage || null,
              used_cert_level: usedCertLevel || null,
              deal_price: usedDealPrice
                ? parseFloat(usedDealPrice.replace(/,/g, ""))
                : null,
              down_payment: usedDeposit
                ? parseFloat(usedDeposit.replace(/,/g, ""))
                : null,
              final_payment_date: usedFinalDate || null,
              transfer_by: usedTransferBy || null,
              condition_notes: usedConditionNote || null,
              quote_snapshot: snapshot
                ? (snapshot as unknown as Record<string, unknown>)
                : null,
            };

      const res = await createSalesOrderAction(input);
      if (res.ok) {
        // Clear snapshot after successful order creation
        if (typeof window !== "undefined") {
          try {
            window.localStorage.removeItem(SNAPSHOT_KEY);
          } catch {
            /* swallow */
          }
        }
        showToast(`✅ 合約 ${res.data.order_no} 已建立！即將跳轉…`);
        setTimeout(() => router.push(`/sales/orders/${res.data.id}`), 1200);
      } else {
        showToast(`❌ 建立失敗：${res.error}`);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div className="-m-4 md:-m-8 bg-[#F8F7F4] min-h-[calc(100dvh-4rem)] flex flex-col">
      <main className={`flex-1 pb-20 ${isPending ? "pointer-events-none opacity-60" : ""}`}>
        <div className="max-w-5xl mx-auto px-6 py-5 space-y-3">

          {/* Page Header */}
          <header className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
              成交訂單合約
            </h1>
            <span className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium">
              銷售 · RS04-v1
            </span>
            <span className="text-[12px] text-[#9A9890]">
              依車種產生對應合約書 · 確認後進入交車作業
            </span>
            <span className="ml-auto px-2 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B] font-mono">
              {contractNo}（建立後確定）
            </span>
          </header>

          {/* Quote Snapshot Banner */}
          {snapshot && (
            <div className="bg-[#EAF4FB] border border-[#85B7EB] rounded-md px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[12px] text-[#0C3E70] flex items-center gap-3 flex-wrap">
                <span>
                  📋 來自報價單{" "}
                  <b className="font-mono">{snapshot.quoteNo}</b>
                </span>
                <span className="text-[#185FA5]">·</span>
                <span>客戶 {snapshot.customerName}</span>
                <span className="text-[#185FA5]">·</span>
                <span>車款 {snapshot.model}</span>
                <span className="text-[#185FA5]">·</span>
                <span>
                  總額{" "}
                  <b className="font-mono">
                    NT${snapshot.totalAmount.toLocaleString("en-US")}
                  </b>
                </span>
              </div>
              <button
                type="button"
                onClick={() => router.push("/sales/quote")}
                className="text-[11.5px] font-semibold text-[#185FA5] hover:underline"
              >
                ← 返回報價單
              </button>
            </div>
          )}

          {/* Step Bar */}
          <div className="flex bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            {STEPS.map((s, idx) => {
              const active = "active" in s && s.active;
              const done = "done" in s && s.done;
              return (
                <div
                  key={s.num}
                  className={`flex-1 px-2 py-2.5 text-center text-[11.5px] ${
                    idx < STEPS.length - 1 ? "border-r border-[#EEECE6]" : ""
                  } ${
                    active
                      ? "bg-[#1A3A5C] text-white font-bold"
                      : done
                        ? "bg-[#E1F5EE] text-[#0F6E56] font-semibold"
                        : "text-[#9A9890] font-medium"
                  }`}
                >
                  <span
                    className={`block text-[9px] mb-0.5 font-mono ${
                      active ? "opacity-70" : "opacity-60"
                    }`}
                  >
                    STEP {s.num}
                  </span>
                  {done ? "✓ " : ""}
                  {s.label}
                </div>
              );
            })}
          </div>

          {/* Customer picker */}
          <div className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
            <div className="text-[13px] font-semibold text-[#2C2C2A] mb-2">
              選擇客戶
            </div>
            <select
              className={`${inputCls} w-full md:w-[360px]`}
              value={selectedCustomerId}
              onChange={(e) => setSelectedCustomerId(e.target.value)}
            >
              <option value="">— 選擇客戶（可選）—</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                  {c.phone ? ` · ${c.phone}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Contract Sub Tabs */}
          <div className="flex bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            {(
              [
                { v: "new" as const, icon: "📋", label: "新車訂購合約書" },
                { v: "used" as const, icon: "📜", label: "中古車買賣切結合約書" },
              ]
            ).map((o, idx) => {
              const active = kind === o.v;
              return (
                <button
                  key={o.v}
                  type="button"
                  onClick={() => switchKind(o.v)}
                  className={`flex-1 px-3 py-2.5 text-[12.5px] transition-colors ${
                    idx === 0 ? "border-r border-[#EEECE6]" : ""
                  } ${
                    active
                      ? "bg-[#1A3A5C] text-white font-bold"
                      : "text-[#7A7A78] hover:bg-[#F4F3F0]"
                  }`}
                >
                  {o.icon} {o.label}
                </button>
              );
            })}
          </div>

          {/* ── New Car Contract ── */}
          {kind === "new" && (
            <section className="space-y-3">
              <SectionCard
                icon="📋"
                iconBg="bg-[#EAF4FB]"
                title="DUCATI 新車訂購合約書"
                subtitle={`合約編號：建立後確定`}
                trailing={
                  <button
                    type="button"
                    onClick={() => showToast("📄 合約書已匯出 PDF")}
                    className={btnGhostSm}
                  >
                    📄 匯出 PDF
                  </button>
                }
              >
                <SecTitle>一、買受人資料</SecTitle>
                <Grid cols={2}>
                  <Field label="姓名">
                    <input
                      type="text"
                      className={`${inputCls} bg-[#F4F3F0]`}
                      value={customerName}
                      readOnly
                    />
                  </Field>
                  <Field label="身分證字號">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="A123456789"
                      value={buyerId}
                      onChange={(e) => setBuyerId(e.target.value)}
                    />
                  </Field>
                  <Field label="聯絡電話">
                    <input
                      type="text"
                      className={inputCls}
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhoneOverride(e.target.value)}
                    />
                  </Field>
                  <Field label="電子郵件">
                    <input
                      type="text"
                      className={inputCls}
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmailOverride(e.target.value)}
                    />
                  </Field>
                </Grid>
                <Field label="戶籍地址">
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="縣市、區、路號"
                    value={buyerAddress}
                    onChange={(e) => setBuyerAddress(e.target.value)}
                  />
                </Field>

                <Divider />
                <SecTitle>二、車輛資料</SecTitle>
                <Grid cols={2}>
                  <Field label="車款型號">
                    <select
                      className={inputCls}
                      value={selectedVehicleModelId}
                      onChange={(e) => setSelectedVehicleModelId(e.target.value)}
                    >
                      <option value="">— 選擇車款 —</option>
                      {vehicleModels.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.display_name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="車身顏色">
                    <input
                      type="text"
                      className={inputCls}
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                    />
                  </Field>
                  <Field label="車身號碼（VIN）">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="配車後填入"
                      value={newVin}
                      onChange={(e) => setNewVin(e.target.value)}
                    />
                  </Field>
                  <Field label="引擎號碼">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="配車後填入"
                      value={newEngine}
                      onChange={(e) => setNewEngine(e.target.value)}
                    />
                  </Field>
                </Grid>

                <Divider />
                <SecTitle>三、付款方式</SecTitle>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                  {PAYMENT_OPTIONS.map((p) => {
                    const sel = paymentId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPaymentId(p.id)}
                        className={`rounded-lg border-[1.5px] px-3 py-2.5 text-center transition-colors ${
                          sel
                            ? "bg-[#EAF4FB] border-[#185FA5]"
                            : "bg-[#FAFAF8] border-[#EEECE6] hover:border-[#B4B2A9]"
                        }`}
                      >
                        <div className="text-[20px] mb-1">{p.icon}</div>
                        <div className="text-[12px] font-semibold">{p.name}</div>
                      </button>
                    );
                  })}
                </div>
                <Grid cols={2}>
                  <Field label="訂金金額">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="NT$ 50,000"
                      value={deposit}
                      onChange={(e) => setDeposit(e.target.value)}
                    />
                  </Field>
                  <Field label="預計交車日期">
                    <input
                      type="date"
                      className={inputCls}
                      value={deliveryDate}
                      onChange={(e) => setDeliveryDate(e.target.value)}
                    />
                  </Field>
                </Grid>

                <Divider />
                <SecTitle>四、特殊約定</SecTitle>
                <Field label="">
                  <textarea
                    className={`${inputCls} h-[72px] resize-none`}
                    value={specialNote}
                    onChange={(e) => setSpecialNote(e.target.value)}
                  />
                </Field>
                <div className="bg-[#F8F7F4] rounded-md px-3 py-2.5 text-[11.5px] text-[#4A4A48] leading-relaxed">
                  1. 買受人無故取消訂單，訂金恕不退還。 2.
                  賣方無法如期交車，應通知並協商或退還訂金。 3.
                  交車後應依原廠規定完成保固登記及定期保養。 4.
                  本合約一式兩份，雙方各執一份。
                </div>

                <SignGrid roles={["買受人簽名", "銷售顧問（RS）", "經銷商授權代表"]} rsName={rsName} />
              </SectionCard>

              <div className="flex justify-end gap-2 flex-wrap">
                <Link href="/sales/orders" className={btnGhost}>
                  ← 返回訂單列表
                </Link>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending}
                  className={`${btnTeal} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isPending ? "建立中⋯" : "✅ 合約確認，進入交車作業 →"}
                </button>
              </div>
            </section>
          )}

          {/* ── Used Car Contract ── */}
          {kind === "used" && (
            <section className="space-y-3">
              <div className="bg-[#FFF8E1] border-[1.5px] border-[#F0C97E] rounded-md px-3.5 py-3 text-[11.5px] text-[#5A4500] leading-relaxed">
                <div className="text-[12px] font-bold text-[#7A3A00] mb-1">
                  ⚠️ 中古車買賣重要告知
                </div>
                本合約適用於大型重型機車二手買賣交易。車輛以「現況出售（As-Is）」為原則，買受人已充分了解並接受車輛現況。賣方已如實告知已知瑕疵，並依認證等級提供相應保障。
              </div>

              <SectionCard
                icon="📜"
                iconBg="bg-[#FDF3E3]"
                title="大型重型機車買賣切結合約書"
                subtitle="合約編號：建立後確定"
                trailing={
                  <button
                    type="button"
                    onClick={() => showToast("📄 合約書已匯出 PDF")}
                    className={btnGhostSm}
                  >
                    📄 匯出 PDF
                  </button>
                }
              >
                <SecTitle>一、買賣雙方</SecTitle>
                <Grid cols={2}>
                  <Field label="賣方（甲方）">
                    <input
                      type="text"
                      className={`${inputCls} bg-[#F4F3F0]`}
                      value="展示中心"
                      readOnly
                    />
                  </Field>
                  <Field label="買受人（乙方）">
                    <input
                      type="text"
                      className={`${inputCls} bg-[#F4F3F0]`}
                      value={customerName}
                      readOnly
                    />
                  </Field>
                  <Field label="乙方身分證字號">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="A123456789"
                      value={buyerId}
                      onChange={(e) => setBuyerId(e.target.value)}
                    />
                  </Field>
                  <Field label="乙方聯絡電話">
                    <input
                      type="text"
                      className={inputCls}
                      value={buyerPhone}
                      onChange={(e) => setBuyerPhoneOverride(e.target.value)}
                    />
                  </Field>
                </Grid>
                <Field label="乙方戶籍地址">
                  <input
                    type="text"
                    className={inputCls}
                    placeholder="縣市、區、路號"
                    value={buyerAddress}
                    onChange={(e) => setBuyerAddress(e.target.value)}
                  />
                </Field>

                <Divider />
                <SecTitle>二、車輛資料（必填完整）</SecTitle>
                <Grid cols={2}>
                  <Field label="廠牌/車款">
                    <input
                      type="text"
                      className={inputCls}
                      value={usedBrand}
                      onChange={(e) => setUsedBrand(e.target.value)}
                    />
                  </Field>
                  <Field label="出廠年份">
                    <input
                      type="text"
                      className={inputCls}
                      value={usedYear}
                      onChange={(e) => setUsedYear(e.target.value)}
                    />
                  </Field>
                  <Field label="車牌號碼">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="LGX-8096"
                      value={usedPlate}
                      onChange={(e) => setUsedPlate(e.target.value)}
                    />
                  </Field>
                  <Field label="排氣量（cc）">
                    <input
                      type="text"
                      className={inputCls}
                      value={usedCc}
                      onChange={(e) => setUsedCc(e.target.value)}
                    />
                  </Field>
                  <Field label="車身號碼（VIN）">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="17碼 VIN"
                      value={usedVin}
                      onChange={(e) => setUsedVin(e.target.value)}
                    />
                  </Field>
                  <Field label="引擎號碼">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="引擎號碼"
                      value={usedEngine}
                      onChange={(e) => setUsedEngine(e.target.value)}
                    />
                  </Field>
                  <Field label="行駛里程（km）">
                    <input
                      type="text"
                      className={inputCls}
                      value={usedMileage}
                      onChange={(e) => setUsedMileage(e.target.value)}
                    />
                  </Field>
                  <Field label="認證等級">
                    <select
                      className={inputCls}
                      value={usedCertLevel}
                      onChange={(e) => setUsedCertLevel(e.target.value)}
                    >
                      {USED_CERT_LEVELS.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                </Grid>

                <Divider />
                <SecTitle>三、成交價格與過戶</SecTitle>
                <Grid cols={2}>
                  <Field label="成交價格（NT$）">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="NT$ ___,000"
                      value={usedDealPrice}
                      onChange={(e) => setUsedDealPrice(e.target.value)}
                    />
                  </Field>
                  <Field label="訂金金額">
                    <input
                      type="text"
                      className={inputCls}
                      placeholder="NT$ ___,000"
                      value={usedDeposit}
                      onChange={(e) => setUsedDeposit(e.target.value)}
                    />
                  </Field>
                  <Field label="尾款交付日期">
                    <input
                      type="date"
                      className={inputCls}
                      value={usedFinalDate}
                      onChange={(e) => setUsedFinalDate(e.target.value)}
                    />
                  </Field>
                  <Field label="過戶辦理">
                    <select
                      className={inputCls}
                      value={usedTransferBy}
                      onChange={(e) => setUsedTransferBy(e.target.value)}
                    >
                      {TRANSFER_OPTIONS.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </Field>
                </Grid>

                <Divider />
                <SecTitle>四、車輛現況與買受人切結</SecTitle>
                <Field label="">
                  <textarea
                    className={`${inputCls} h-[72px] resize-none`}
                    value={usedConditionNote}
                    onChange={(e) => setUsedConditionNote(e.target.value)}
                  />
                </Field>
                <div className="bg-[#FDECEA] border border-[#F5AEAD] rounded-md px-3 py-2.5 text-[11.5px] text-[#4A4A48] leading-relaxed">
                  <b className="text-[#7A1010]">買受人切結聲明：</b>
                  本人已親自驗車，充分了解車輛現況及已知瑕疵，同意以「現況」購買本車，不得事後以車況為由要求退換車或減價。
                </div>

                <SignGrid
                  roles={["賣方（甲方）簽章", "買受人（乙方）簽名", "見證人/銷售顧問"]}
                  rsName={rsName}
                />
              </SectionCard>

              <div className="flex justify-end gap-2 flex-wrap">
                <Link href="/sales/orders" className={btnGhost}>
                  ← 返回訂單列表
                </Link>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isPending}
                  className={`${btnTeal} disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {isPending ? "建立中⋯" : "✅ 合約確認，安排過戶與交車 →"}
                </button>
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 px-4 py-2 rounded-lg shadow-lg text-[12.5px] z-50 bg-[#1A3A5C] text-white max-w-[320px] leading-relaxed">
          {toast}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Helper components
// ─────────────────────────────────────────────────────────────

function SignGrid({
  roles,
  rsName,
}: {
  roles: [string, string, string];
  rsName: string;
}) {
  const today = useMemo(() => {
    const d = new Date();
    return `${d.getFullYear()} 年 ${pad2(d.getMonth() + 1)} 月 ${pad2(d.getDate())} 日`;
  }, []);
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
      {roles.map((r, idx) => (
        <div
          key={r}
          className="border-[1.5px] border-dashed border-[#D5D3CB] rounded-md px-3.5 py-3.5 bg-[#FAFAF8] text-center"
        >
          <div className="text-[11px] text-[#9A9890] mb-5">{r}</div>
          <div className="border-t border-[#D5D3CB] pt-1.5 text-[11px] text-[#9A9890]">
            {idx === 1 && r.includes("銷售顧問") ? (
              <>
                {rsName}
                <br />
                {today}
              </>
            ) : idx === 2 ? (
              <>
                {r.includes("見證") ? rsName : "＿＿＿＿＿＿"}
                <br />
                {r.includes("見證") ? today : "展示中心"}
              </>
            ) : (
              <>
                簽名：＿＿＿＿＿＿
                <br />
                日期：______
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Divider() {
  return <div className="h-px bg-[#EEECE6] my-3" />;
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-[10.5px] font-bold tracking-wider uppercase text-[#9A9890] mt-1 mb-2">
      <span>{children}</span>
      <span className="flex-1 h-px bg-[#EEECE6]" />
    </div>
  );
}

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
      {label && (
        <label className="text-[11.5px] font-semibold text-[#4A4A48]">
          {label}{" "}
          {required && <span className="text-[#C8001A] text-[11px]">*</span>}
        </label>
      )}
      {children}
    </div>
  );
}

function Grid({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) {
  return (
    <div
      className={`grid gap-x-4 gap-y-0 ${
        cols === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"
      }`}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 工具 + tokens
// ─────────────────────────────────────────────────────────────

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md border border-[#D5D3CB] text-[12.5px] outline-none focus:border-[#85B7EB] bg-white";

const btnTeal =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] transition-colors";
const btnGhost =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] transition-colors inline-flex items-center";
const btnGhostSm =
  "h-[26px] px-3 rounded-md text-[11.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] transition-colors";
