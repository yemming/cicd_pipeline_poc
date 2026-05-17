"use client";

/**
 * 訂單詳情頁 — /sales/orders/[id]
 *
 * 支援 view / edit 兩種模式。
 * 狀態切換（簽約 / 作廢 / 交車完成）直接在此頁操作。
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  updateSalesOrderAction,
  setSalesOrderStatusAction,
  deleteSalesOrderAction,
  submitForApprovalAction,
} from "@/lib/sales/order-actions";
import {
  CONTRACT_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_CHIP,
  PAYMENT_METHOD_LABELS,
  USED_CERT_LEVELS,
  TRANSFER_OPTIONS,
  type ContractType,
  type OrderStatus,
  type PaymentMethod,
} from "@/domain/sales-orders.constants";
import type { SalesOrderDetail } from "@/domain/sales-orders.constants";

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

type Mode = "view" | "edit";

type Props = {
  order: SalesOrderDetail;
  canEdit: boolean;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function fmtNT(n: number | null): string {
  if (n == null) return "—";
  // 手刻千分位 — 不靠 toLocaleString，避免 server/client locale 差導致 hydration mismatch
  const s = String(Math.round(Number(n)));
  const neg = s.startsWith("-") ? "-" : "";
  const abs = neg ? s.slice(1) : s;
  const withCommas = abs.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `NT$ ${neg}${withCommas}`;
}

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return s.slice(0, 10);
}

// Asia/Taipei 偏移固定為 +08:00，無 DST、無 locale 差異 → server / client 必定一致
function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "—";
  const tpe = new Date(d.getTime() + 8 * 60 * 60 * 1000);
  const yyyy = tpe.getUTCFullYear();
  const mm = String(tpe.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(tpe.getUTCDate()).padStart(2, "0");
  const hh = String(tpe.getUTCHours()).padStart(2, "0");
  const mi = String(tpe.getUTCMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}`;
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}
      >
        {value ?? "—"}
      </div>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
      <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
        <span className="text-[13px] font-semibold text-[#2C2C2A]">
          ▼ {title}
        </span>
      </header>
      <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
        {children}
      </div>
    </section>
  );
}

const inputCls =
  "w-full px-2 py-1.5 rounded border border-[#D5D3CB] text-[12.5px] outline-none focus:border-[#185FA5] bg-white";

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function OrderDetailView({ order, canEdit }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [isPending, startTransition] = useTransition();
  const [isIssuingInvoice, startIssueTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);

  // Edit form state (initialized from order)
  const [editVehicleColor, setEditVehicleColor] = useState(order.vehicle_color ?? "");
  const [editVin, setEditVin] = useState(order.vehicle_vin ?? "");
  const [editEngineNo, setEditEngineNo] = useState(order.vehicle_engine_no ?? "");
  const [editPaymentMethod, setEditPaymentMethod] = useState(order.payment_method ?? "");
  const [editDownPayment, setEditDownPayment] = useState(
    order.down_payment != null ? String(order.down_payment) : "",
  );
  const [editDeliveryDate, setEditDeliveryDate] = useState(order.delivery_date ?? "");
  const [editSpecialNotes, setEditSpecialNotes] = useState(order.special_notes ?? "");
  const [editConditionNotes, setEditConditionNotes] = useState(order.condition_notes ?? "");
  const [editUsedBrandModel, setEditUsedBrandModel] = useState(order.used_brand_model ?? "");
  const [editUsedCertLevel, setEditUsedCertLevel] = useState(order.used_cert_level ?? "");
  const [editDealPrice, setEditDealPrice] = useState(
    order.deal_price != null ? String(order.deal_price) : "",
  );
  const [editFinalPaymentDate, setEditFinalPaymentDate] = useState(order.final_payment_date ?? "");
  const [editTransferBy, setEditTransferBy] = useState(order.transfer_by ?? "");
  const [editRsName, setEditRsName] = useState(order.rs_name ?? "");

  function showBanner(ok: boolean, msg: string) {
    setBanner({ ok, msg });
    if (ok) setTimeout(() => setBanner(null), 2200);
  }

  // Status chip
  const statusChip =
    ORDER_STATUS_CHIP[order.status as OrderStatus] ?? {
      bg: "bg-[#F2F2F2]",
      text: "text-[#6B6A68]",
    };

  // ── Actions ──────────────────────────────────────────────────

  function handleSave() {
    startTransition(async () => {
      const patch =
        order.contract_type === "new"
          ? {
              vehicle_color: editVehicleColor || null,
              vehicle_vin: editVin || null,
              vehicle_engine_no: editEngineNo || null,
              payment_method: editPaymentMethod || null,
              down_payment: editDownPayment
                ? parseFloat(editDownPayment.replace(/,/g, ""))
                : null,
              delivery_date: editDeliveryDate || null,
              special_notes: editSpecialNotes || null,
              rs_name: editRsName || null,
            }
          : {
              used_brand_model: editUsedBrandModel || null,
              used_cert_level: editUsedCertLevel || null,
              deal_price: editDealPrice
                ? parseFloat(editDealPrice.replace(/,/g, ""))
                : null,
              down_payment: editDownPayment
                ? parseFloat(editDownPayment.replace(/,/g, ""))
                : null,
              final_payment_date: editFinalPaymentDate || null,
              transfer_by: editTransferBy || null,
              condition_notes: editConditionNotes || null,
              rs_name: editRsName || null,
            };

      const res = await updateSalesOrderAction(order.id, patch);
      if (res.ok) {
        showBanner(true, "✓ 已儲存");
        setMode("view");
        router.refresh();
      } else {
        showBanner(false, `✗ 儲存失敗：${res.error}`);
      }
    });
  }

  function handleSetStatus(status: "signed" | "cancelled" | "fulfilled") {
    const labelMap: Record<string, string> = {
      signed: "簽約",
      cancelled: "作廢",
      fulfilled: "交車完成",
    };
    if (!confirm(`確定將此訂單設為「${labelMap[status]}」？`)) return;
    startTransition(async () => {
      const res = await setSalesOrderStatusAction(order.id, status);
      if (res.ok) {
        showBanner(true, `✓ 狀態已更新為「${labelMap[status]}」`);
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  function handleDelete() {
    if (!confirm(`確定要刪除訂單 ${order.order_no}？此操作不可逆。`)) return;
    startTransition(async () => {
      const res = await deleteSalesOrderAction(order.id);
      if (res.ok) {
        router.push("/sales/orders");
      } else {
        showBanner(false, `✗ 刪除失敗：${res.error}`);
      }
    });
  }

  function handleIssueInvoice() {
    // 帶 orderId query 跳到 /einvoice/issue，由 server component fetch 後預填表單
    startIssueTransition(() => {
      router.push(`/einvoice/issue?orderId=${order.id}`);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  return (
    <div
      className={`px-6 py-5 space-y-3 ${isPending || isIssuingInvoice ? "pointer-events-none opacity-60" : ""}`}
    >
      {/* Banner */}
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

      {/* ── Breadcrumb + CRUD pill bar ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/sales/orders" className="hover:text-[#185FA5]">
            訂單中心
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{order.order_no}</span>
          {mode === "edit" && (
            <span className="ml-2 px-2 py-0.5 text-[11px] rounded-md bg-[#FDF3E3] text-[#854F0B] font-medium">
              編輯模式
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {mode === "view" ? (
            <>
              <Link
                href="/sales/orders"
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm inline-flex items-center"
              >
                返回列表
              </Link>
              <Link
                href="/sales/orders/new"
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm inline-flex items-center"
              >
                ＋ 新增合約
              </Link>
              {canEdit && order.status !== "cancelled" && order.status !== "fulfilled" && (
                <button
                  onClick={() => setMode("edit")}
                  className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
                >
                  修改
                </button>
              )}
              {canEdit && order.status === "draft" && (
                <button
                  onClick={handleDelete}
                  disabled={isPending}
                  className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                >
                  刪除
                </button>
              )}
              {canEdit && order.status === "draft" && (
                <button
                  onClick={() => handleSetStatus("signed")}
                  disabled={isPending}
                  className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#EAF4FB] border border-[#85B7EB] text-[#185FA5] hover:bg-[#d4eaf8] shadow-sm disabled:opacity-50"
                >
                  簽約
                </button>
              )}
              {canEdit && order.status === "signed" && (
                <button
                  onClick={() => handleSetStatus("fulfilled")}
                  disabled={isPending}
                  className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#EAF3DE] border border-[#C5DC9F] text-[#3B6D11] hover:bg-[#d9f0c8] shadow-sm disabled:opacity-50"
                >
                  交車完成
                </button>
              )}
              {canEdit &&
                (order.status === "draft" || order.status === "signed") && (
                  <button
                    onClick={() => handleSetStatus("cancelled")}
                    disabled={isPending}
                    className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
                  >
                    作廢
                  </button>
                )}
              {canEdit &&
                (order.status === "signed" || order.status === "fulfilled") && (
                  <button
                    onClick={handleIssueInvoice}
                    disabled={isIssuingInvoice || isPending}
                    className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
                    title="跳到電子發票開立頁、自動帶入此訂單的買方 / 品項 / 金額"
                  >
                    {isIssuingInvoice ? "開立中⋯" : "開立發票"}
                  </button>
                )}
            </>
          ) : (
            <>
              <button
                onClick={() => setMode("view")}
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
              >
                取消
              </button>
              <button
                onClick={handleSave}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm disabled:opacity-50"
              >
                {isPending ? "儲存中⋯" : "儲存變更"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Title Card ── */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                {CONTRACT_TYPE_LABELS[order.contract_type as ContractType] ??
                  order.contract_type}
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight">
                {order.customer_name ?? "（無客戶）"}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span className="font-mono text-[#5A5955]">{order.order_no}</span>
                <span
                  className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${statusChip.bg} ${statusChip.text}`}
                >
                  {ORDER_STATUS_LABELS[order.status as OrderStatus] ?? order.status}
                </span>
              </div>
            </div>
            {/* Action pills */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() =>
                  alert("PDF 匯出功能（開發中）")
                }
                className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                📄 匯出 PDF
              </button>
              {order.status === "signed" && (
                <Link
                  href="/sales/delivery"
                  className="h-[26px] px-3 rounded-full text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] inline-flex items-center"
                >
                  → 前往交車作業
                </Link>
              )}
            </div>
          </div>
          {/* Status timeline */}
          <div className="shrink-0 flex flex-col justify-center gap-1 text-[11px] text-[#9A9890] min-w-[160px]">
            <div>
              建立：
              <span className="text-[#5A5955] font-mono">{fmtDate(order.created_at)}</span>
            </div>
            {order.signed_at && (
              <div>
                簽約：
                <span className="text-[#185FA5] font-mono">
                  {fmtDate(order.signed_at)}
                </span>
              </div>
            )}
            {order.fulfilled_at && (
              <div>
                交車：
                <span className="text-[#3B6D11] font-mono">
                  {fmtDate(order.fulfilled_at)}
                </span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Sections ── */}
      <SectionCard title="買受人資料">
        <Kv label="姓名" value={order.customer_name} />
        <Kv label="身分證字號" value={order.buyer_national_id} mono />
        <Kv label="聯絡電話" value={order.customer_phone} mono />
        <Kv label="電子郵件" value={order.customer_email} />
        <Kv label="戶籍地址" value={order.customer_address} />
        <Kv label="銷售顧問" value={
          mode === "edit" ? (
            <input
              type="text"
              className={inputCls}
              value={editRsName}
              onChange={(e) => setEditRsName(e.target.value)}
            />
          ) : (
            order.rs_name
          )
        } />
      </SectionCard>

      {/* New car sections */}
      {order.contract_type === "new" && (
        <>
          <SectionCard title="車輛資料（新車）">
            <Kv label="車款型號" value={order.vehicle_model_name} />
            <Kv
              label="車身顏色"
              value={
                mode === "edit" ? (
                  <input
                    type="text"
                    className={inputCls}
                    value={editVehicleColor}
                    onChange={(e) => setEditVehicleColor(e.target.value)}
                  />
                ) : (
                  order.vehicle_color
                )
              }
            />
            <Kv
              label="車身號碼（VIN）"
              value={
                mode === "edit" ? (
                  <input
                    type="text"
                    className={inputCls}
                    value={editVin}
                    onChange={(e) => setEditVin(e.target.value)}
                  />
                ) : (
                  order.vehicle_vin
                )
              }
              mono
            />
            <Kv
              label="引擎號碼"
              value={
                mode === "edit" ? (
                  <input
                    type="text"
                    className={inputCls}
                    value={editEngineNo}
                    onChange={(e) => setEditEngineNo(e.target.value)}
                  />
                ) : (
                  order.vehicle_engine_no
                )
              }
              mono
            />
          </SectionCard>

          <SectionCard title="付款與交車">
            <Kv
              label="付款方式"
              value={
                mode === "edit" ? (
                  <select
                    className={inputCls}
                    value={editPaymentMethod}
                    onChange={(e) => setEditPaymentMethod(e.target.value)}
                  >
                    <option value="">— 選擇 —</option>
                    <option value="cash">現金全額</option>
                    <option value="card">刷卡一次</option>
                    <option value="loan">銀行貸款</option>
                    <option value="installment">分期付款</option>
                  </select>
                ) : (
                  PAYMENT_METHOD_LABELS[order.payment_method as PaymentMethod] ??
                  order.payment_method
                )
              }
            />
            <Kv
              label="訂金金額"
              value={
                mode === "edit" ? (
                  <input
                    type="text"
                    className={inputCls}
                    value={editDownPayment}
                    onChange={(e) => setEditDownPayment(e.target.value)}
                  />
                ) : (
                  fmtNT(order.down_payment)
                )
              }
              mono
            />
            <Kv
              label="預計交車日期"
              value={
                mode === "edit" ? (
                  <input
                    type="date"
                    className={inputCls}
                    value={editDeliveryDate}
                    onChange={(e) => setEditDeliveryDate(e.target.value)}
                  />
                ) : (
                  fmtDate(order.delivery_date)
                )
              }
              mono
            />
          </SectionCard>

          <SectionCard title="特殊約定">
            <div className="col-span-3">
              {mode === "edit" ? (
                <textarea
                  className={`${inputCls} h-[72px] resize-none`}
                  value={editSpecialNotes}
                  onChange={(e) => setEditSpecialNotes(e.target.value)}
                />
              ) : (
                <div className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap">
                  {order.special_notes ?? "—"}
                </div>
              )}
            </div>
          </SectionCard>
        </>
      )}

      {/* Used car sections */}
      {order.contract_type === "used" && (
        <>
          <SectionCard title="車輛資料（中古車）">
            <Kv
              label="廠牌/車款"
              value={
                mode === "edit" ? (
                  <input
                    type="text"
                    className={inputCls}
                    value={editUsedBrandModel}
                    onChange={(e) => setEditUsedBrandModel(e.target.value)}
                  />
                ) : (
                  order.used_brand_model
                )
              }
            />
            <Kv label="出廠年份" value={order.used_year} mono />
            <Kv label="車牌號碼" value={order.used_plate} mono />
            <Kv label="排氣量（cc）" value={order.used_cc} />
            <Kv label="車身號碼（VIN）" value={order.vehicle_vin} mono />
            <Kv label="行駛里程（km）" value={order.used_mileage} />
            <Kv
              label="認證等級"
              value={
                mode === "edit" ? (
                  <select
                    className={inputCls}
                    value={editUsedCertLevel}
                    onChange={(e) => setEditUsedCertLevel(e.target.value)}
                  >
                    {USED_CERT_LEVELS.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                ) : (
                  order.used_cert_level
                )
              }
            />
          </SectionCard>

          <SectionCard title="成交價格與過戶">
            <Kv
              label="成交價格"
              value={
                mode === "edit" ? (
                  <input
                    type="text"
                    className={inputCls}
                    value={editDealPrice}
                    onChange={(e) => setEditDealPrice(e.target.value)}
                  />
                ) : (
                  fmtNT(order.deal_price)
                )
              }
              mono
            />
            <Kv
              label="訂金"
              value={
                mode === "edit" ? (
                  <input
                    type="text"
                    className={inputCls}
                    value={editDownPayment}
                    onChange={(e) => setEditDownPayment(e.target.value)}
                  />
                ) : (
                  fmtNT(order.down_payment)
                )
              }
              mono
            />
            <Kv
              label="尾款日期"
              value={
                mode === "edit" ? (
                  <input
                    type="date"
                    className={inputCls}
                    value={editFinalPaymentDate}
                    onChange={(e) => setEditFinalPaymentDate(e.target.value)}
                  />
                ) : (
                  fmtDate(order.final_payment_date)
                )
              }
              mono
            />
            <Kv
              label="過戶辦理"
              value={
                mode === "edit" ? (
                  <select
                    className={inputCls}
                    value={editTransferBy}
                    onChange={(e) => setEditTransferBy(e.target.value)}
                  >
                    {TRANSFER_OPTIONS.map((o) => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                ) : (
                  order.transfer_by
                )
              }
            />
          </SectionCard>

          <SectionCard title="車輛現況切結">
            <div className="col-span-3">
              {mode === "edit" ? (
                <textarea
                  className={`${inputCls} h-[80px] resize-none`}
                  value={editConditionNotes}
                  onChange={(e) => setEditConditionNotes(e.target.value)}
                />
              ) : (
                <div className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap">
                  {order.condition_notes ?? "—"}
                </div>
              )}
            </div>
          </SectionCard>
        </>
      )}

      {/* Metadata */}
      <section className="bg-white border border-[#EEECE6] rounded-lg px-4 py-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-[11px] text-[#9A9890]">
          <div>
            建立時間：
            <span className="font-mono">{fmtDateTime(order.created_at)}</span>
          </div>
          <div>
            最後更新：
            <span className="font-mono">{fmtDateTime(order.updated_at)}</span>
          </div>
          {order.signed_at && (
            <div>
              簽約時間：
              <span className="font-mono text-[#185FA5]">
                {fmtDateTime(order.signed_at)}
              </span>
            </div>
          )}
          {order.fulfilled_at && (
            <div>
              交車時間：
              <span className="font-mono text-[#3B6D11]">
                {fmtDateTime(order.fulfilled_at)}
              </span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
