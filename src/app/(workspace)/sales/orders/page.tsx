"use client";

/**
 * 成交訂單合約書 v1 — RS04 Tab 1 + Tab 2
 *
 * 規格：docs/DUCATI_v2_output/01_銷售接待/02_展廳接待/RS04_賞車報價與成交訂單_v1.html
 *
 * 範圍（A13 工序，本頁負責 Tab 1 新車訂購合約書 + Tab 2 中古車買賣切結合約書）：
 *   - QuoteSnapshotBanner（讀 localStorage 顯示來源報價單摘要）
 *   - StepBar（4 步驟：① 報價完成 ✓ ② 訂購合約（active）③ 客戶簽名 ④ 交車作業）
 *   - ContractSubTabs（新車 / 中古車）：依 URL ?type=new|used 預設
 *   - 新車合約書 4 段（買受人 / 車輛 / 付款 / 特殊約定 + 簽名 3 欄）
 *   - 中古車合約書 4 段（買賣雙方 / 車輛資料 / 成交價過戶 / 現況切結 + 簽名 3 欄）
 *   - 「合約確認」push 到 /sales/delivery
 *
 * 跨頁 state：
 *   - URL ?type=new|used（從 /sales/quote 過來時帶）
 *   - localStorage key `sales-quote-snapshot:v1`（/sales/quote 寫入）
 *
 * 後端：mock-only，無 DB / Supabase 直連
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { useSetPageHeader } from "@/components/page-header-context";

// ============================================================
// 常數
// ============================================================

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

const STEPS = [
  { num: 1, label: "報價完成", done: true },
  { num: 2, label: "訂購合約", active: true },
  { num: 3, label: "客戶簽名" },
  { num: 4, label: "交車作業" },
] as const;

const PAYMENT_OPTIONS = [
  { id: "cash", icon: "💵", name: "現金全額" },
  { id: "card", icon: "💳", name: "刷卡一次" },
  { id: "loan", icon: "🏦", name: "銀行貸款" },
  { id: "installment", icon: "📋", name: "分期付款" },
] as const;

const USED_CERT_LEVELS = ["CPO 原廠認證", "DPO 經銷商認證", "PO 一般中古"];

const TRANSFER_OPTIONS = ["本店代辦", "買受人自行辦理"];

const SNAPSHOT_KEY = "sales-quote-snapshot:v1";

// ============================================================
// 主元件
// ============================================================

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useSetPageHeader({
    breadcrumb: [
      { label: "銷售管理", href: "/sales/showroom" },
      { label: "訂單中心" },
    ],
  });

  // ── URL ?type=new|used
  const typeParam = searchParams.get("type");
  const initialKind: ContractKind =
    typeParam === "used" ? "used" : "new"; // 預設新車
  const [kind, setKind] = useState<ContractKind>(initialKind);

  // 切 sub-tab 時同步 URL
  const switchKind = (next: ContractKind) => {
    setKind(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("type", next);
      window.history.replaceState({}, "", url.toString());
    }
  };

  // ── 讀 localStorage snapshot（mount 後從 external store 同步進來，這是 set-state-in-effect 的合法用例）
  const [snapshot, setSnapshot] = useState<QuoteSnapshot | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(SNAPSHOT_KEY);
      if (raw) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSnapshot(JSON.parse(raw));
      }
    } catch {
      /* swallow */
    }
  }, []);

  // ── 合約編號（demo 用，依日期 + kind 生成）
  const contractNo = useMemo(() => {
    const d = new Date();
    const yyyymmdd = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
    const prefix = kind === "new" ? "PO" : "UA";
    return `${prefix}-${yyyymmdd}-008`;
  }, [kind]);

  // ── toast
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  };

  // ── 共用表單 state
  const customerName = snapshot?.customerName ?? "陳志宏";
  const rsName = snapshot?.rsName ?? "林育誠";
  const [buyerId, setBuyerId] = useState("");
  const [buyerPhone, setBuyerPhone] = useState("0912-345-678");
  const [buyerEmail, setBuyerEmail] = useState("chen@email.com");
  const [buyerAddress, setBuyerAddress] = useState("");

  // ── 新車合約 state
  const [newColor, setNewColor] = useState("Ducati Red");
  const [newVin, setNewVin] = useState("");
  const [newEngine, setNewEngine] = useState("");
  const [paymentId, setPaymentId] = useState<string>("cash");
  const [deposit, setDeposit] = useState("");
  const [deliveryDate, setDeliveryDate] = useState("2026-05-17");
  const [specialNote, setSpecialNote] = useState(
    "贈品：原廠安全帽 AGV K6。選配：DP 排氣管，交車前安裝完成。春季折扣 NT$20,000 已含入。",
  );

  // ── 中古車合約 state
  const [usedBrand, setUsedBrand] = useState("DUCATI Panigale V2");
  const [usedYear, setUsedYear] = useState("2022");
  const [usedPlate, setUsedPlate] = useState("");
  const [usedCc, setUsedCc] = useState("955");
  const [usedVin, setUsedVin] = useState("");
  const [usedEngine, setUsedEngine] = useState("");
  const [usedMileage, setUsedMileage] = useState("12,500");
  const [usedCertLevel, setUsedCertLevel] = useState(USED_CERT_LEVELS[2]);
  const [usedDealPrice, setUsedDealPrice] = useState("");
  const [usedDeposit, setUsedDeposit] = useState("");
  const [usedFinalDate, setUsedFinalDate] = useState("");
  const [usedTransferBy, setUsedTransferBy] = useState(TRANSFER_OPTIONS[0]);
  const [usedConditionNote, setUsedConditionNote] = useState(
    "車況良好，無重大事故紀錄。左側下整流罩有輕微風化痕跡。12,500km 已完成 Desmo Service，保養紀錄完整。",
  );

  const confirmContract = () => {
    showToast("✅ 合約確認完成！即將前往交車管理…");
    setTimeout(() => router.push("/sales/delivery"), 1200);
  };

  // ============================================================
  // Layout
  // ============================================================

  return (
    <div className="-m-4 md:-m-8 bg-[#F8F7F4] min-h-[calc(100dvh-4rem)] flex flex-col">
      <main className="flex-1 pb-20">
        <div className="max-w-5xl mx-auto px-6 py-5 space-y-3">
          {/* Page Header */}
          <header
            className="flex items-center gap-2.5 flex-wrap"
            data-testid="orders-page-header"
          >
            <h1 className="text-[16px] font-semibold text-[#2C2C2A]">
              成交訂單合約
            </h1>
            <span
              className="px-2 py-0.5 text-[11px] rounded-full bg-[#EAF4FB] text-[#185FA5] font-medium"
              data-testid="orders-sprint-chip"
            >
              銷售 · RS04-v1-orders
            </span>
            <span className="text-[12px] text-[#9A9890]">
              依車種產生對應合約書 · 確認後進入交車作業
            </span>
            <span
              className="ml-auto px-2 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68] font-mono"
              data-testid="orders-contract-no"
            >
              {contractNo}
            </span>
          </header>

          {/* Quote Snapshot Banner */}
          {snapshot && (
            <div
              className="bg-[#EAF4FB] border border-[#85B7EB] rounded-md px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap"
              data-testid="orders-snapshot-banner"
            >
              <div className="text-[12px] text-[#0C3E70] flex items-center gap-3 flex-wrap">
                <span>
                  📋 來自報價單{" "}
                  <b className="font-mono" data-testid="orders-snapshot-quote-no">
                    {snapshot.quoteNo}
                  </b>
                </span>
                <span className="text-[#185FA5]">·</span>
                <span>客戶 {snapshot.customerName}</span>
                <span className="text-[#185FA5]">·</span>
                <span>車款 {snapshot.model}</span>
                <span className="text-[#185FA5]">·</span>
                <span>
                  總額{" "}
                  <b className="font-mono">
                    NT${formatNumber(snapshot.totalAmount)}
                  </b>
                </span>
              </div>
              <button
                type="button"
                onClick={() => router.push("/sales/quote")}
                className="text-[11.5px] font-semibold text-[#185FA5] hover:underline"
                data-testid="orders-back-to-quote"
              >
                ← 返回報價單
              </button>
            </div>
          )}

          {/* Step Bar */}
          <div
            className="flex bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="orders-step-bar"
          >
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

          {/* Contract Sub Tabs */}
          <div
            className="flex bg-white border border-[#EEECE6] rounded-lg overflow-hidden"
            data-testid="orders-subtabs"
          >
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
                  data-testid={`orders-subtab-${o.v}`}
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

          {/* New Car Contract */}
          {kind === "new" && (
            <section data-testid="orders-pane-new" className="space-y-3">
              <SectionCard
                icon="📋"
                iconBg="bg-[#EAF4FB]"
                title="DUCATI 新車訂購合約書"
                subtitle={`合約編號：${contractNo}`}
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
                      className={inputCls}
                      value={customerName}
                      readOnly
                      data-testid="orders-new-buyer-name"
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
                      onChange={(e) => setBuyerPhone(e.target.value)}
                    />
                  </Field>
                  <Field label="電子郵件">
                    <input
                      type="text"
                      className={inputCls}
                      value={buyerEmail}
                      onChange={(e) => setBuyerEmail(e.target.value)}
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
                    <input
                      type="text"
                      className={`${inputCls} bg-[#F4F3F0]`}
                      value={
                        snapshot?.model
                          ? `${snapshot.model}（2026年款）`
                          : "Panigale V4（2026年款）"
                      }
                      readOnly
                      data-testid="orders-new-model"
                    />
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
                        data-testid={`orders-new-payment-${p.id}`}
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

                <SignGrid roles={["買受人簽名", `銷售顧問（RS）`, "經銷商授權代表"]} rsName={rsName} />
              </SectionCard>

              <div className="flex justify-end gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => router.push("/sales/quote")}
                  className={btnGhost}
                >
                  ← 返回報價單
                </button>
                <button
                  type="button"
                  onClick={confirmContract}
                  className={btnTeal}
                  data-testid="orders-new-confirm"
                >
                  ✅ 合約確認，進入交車作業 →
                </button>
              </div>
            </section>
          )}

          {/* Used Car Contract */}
          {kind === "used" && (
            <section data-testid="orders-pane-used" className="space-y-3">
              <div
                className="bg-[#FFF8E1] border-[1.5px] border-[#F0C97E] rounded-md px-3.5 py-3 text-[11.5px] text-[#5A4500] leading-relaxed"
                data-testid="orders-used-disclaimer"
              >
                <div className="text-[12px] font-bold text-[#7A3A00] mb-1">
                  ⚠️ 中古車買賣重要告知
                </div>
                本合約適用於大型重型機車二手買賣交易。車輛以「現況出售（As-Is）」為原則，買受人已充分了解並接受車輛現況。賣方已如實告知已知瑕疵，並依認證等級提供相應保障。
              </div>

              <SectionCard
                icon="📜"
                iconBg="bg-[#FDF3E3]"
                title="大型重型機車買賣切結合約書"
                subtitle={`合約編號：${contractNo}`}
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
                      value="DUCATI 台北展示中心"
                      readOnly
                    />
                  </Field>
                  <Field label="買受人（乙方）">
                    <input
                      type="text"
                      className={inputCls}
                      value={customerName}
                      readOnly
                      data-testid="orders-used-buyer-name"
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
                      onChange={(e) => setBuyerPhone(e.target.value)}
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
                <button
                  type="button"
                  onClick={() => router.push("/sales/quote")}
                  className={btnGhost}
                >
                  ← 返回報價單
                </button>
                <button
                  type="button"
                  onClick={confirmContract}
                  className={btnTeal}
                  data-testid="orders-used-confirm"
                >
                  ✅ 合約確認，安排過戶與交車 →
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
          data-testid="orders-toast"
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
                {r.includes("見證") ? today : "DUCATI 台北展示中心"}
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

// ============================================================
// 工具函式 + 樣式 token
// ============================================================

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}

const inputCls =
  "w-full px-2.5 py-1.5 rounded-md border border-[#D5D3CB] text-[12.5px] outline-none focus:border-[#85B7EB] bg-white";

const btnTeal =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-[#0F6E56] text-white hover:bg-[#0a5742] transition-colors";
const btnGhost =
  "h-[30px] px-4 rounded-md text-[12.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] transition-colors";
const btnGhostSm =
  "h-[26px] px-3 rounded-md text-[11.5px] font-semibold bg-white border border-[#D5D3CB] text-[#4A4A48] hover:bg-[#F4F3F0] transition-colors";
