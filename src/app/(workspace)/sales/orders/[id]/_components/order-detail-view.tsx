"use client";

/**
 * 訂單詳情頁 — /sales/orders/[id]
 *
 * 支援 view / edit 兩種模式。
 * 狀態切換（簽約 / 作廢 / 交車完成）直接在此頁操作。
 * RS04 Stage 1：結構化取消 / 延期交車 / 中古車爭議 / 新車換車
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import {
  updateSalesOrderAction,
  setSalesOrderStatusAction,
  deleteSalesOrderAction,
  submitForApprovalAction,
  cancelOrderStructuredAction,
  deferDeliveryAction,
  raiseUsedCarDisputeAction,
  requestCarReplacementAction,
  saveSignaturesAction,
  lockContractAction,
  unlockContractAction,
  updateFinancingStatusAction,
  reassignSalesOrderAction,
} from "@/lib/sales/order-actions";
import { SignatureCanvas } from "@/components/signature-canvas";
import {
  CONTRACT_TYPE_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUS_CHIP,
  PAYMENT_METHOD_LABELS,
  USED_CERT_LEVELS,
  TRANSFER_OPTIONS,
  CANCEL_REASON_CODES,
  CANCEL_REASON_LABELS,
  REVIEW_PERIOD_DAYS,
  FINANCING_STATUS_LABELS,
  FINANCING_STATUS_CHIP,
  FINANCING_STATUSES,
  type ContractType,
  type OrderStatus,
  type PaymentMethod,
  type CancelReasonCode,
  type FinancingStatus,
} from "@/domain/sales-orders.constants";
import type { SalesOrderDetail } from "@/domain/sales-orders.constants";
import type { SalesPaymentRow } from "@/domain/sales-payments.constants";

// ─────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────

type Mode = "view" | "edit";

type Props = {
  order: SalesOrderDetail;
  canEdit: boolean;
  /** 是否有沒收裁量權限（SALES_ORDER_FORFEIT，主管） */
  canForfeit?: boolean;
  /** 是否有換車申請權限（SALES_ORDER_REPLACE） */
  canReplace?: boolean;
  /** 是否有解鎖合約的主管權限（FORFEIT 或 APPROVE） */
  canUnlock?: boolean;
  /** 是否有業務轉移主管權限（A-9 SALES_ORDER_REASSIGN） */
  canReassign?: boolean;
  /** 此訂單的收款記錄（由 page.tsx 撈好傳入，避免 client 直連 supabase） */
  payments?: SalesPaymentRow[];
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

export default function OrderDetailView({
  order,
  canEdit,
  canForfeit = false,
  canReplace = false,
  canUnlock = false,
  canReassign = false,
  payments = [],
}: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("view");
  const [isPending, startTransition] = useTransition();
  const [isIssuingInvoice, startIssueTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  const [activeTab, setActiveTab] = useState<"detail" | "payments" | "financing">("detail");

  // ── 簽名 Modal 狀態 ─────────────────────────────────────────
  const [activeSigRole, setActiveSigRole] = useState<"buyer" | "seller" | "witness" | null>(null);
  const [isSavingSig, startSigTransition] = useTransition();

  // ── 鎖定解鎖 Modal ──────────────────────────────────────────
  const [showUnlockModal, setShowUnlockModal] = useState(false);
  const [unlockReason, setUnlockReason] = useState("");
  const [isUnlocking, startUnlockTransition] = useTransition();
  const [isLocking, startLockTransition] = useTransition();

  // ── A-6 融資狀態 Modal ──────────────────────────────────────
  const [showFinancingModal, setShowFinancingModal] = useState(false);
  const [editFinancingStatus, setEditFinancingStatus] = useState<FinancingStatus>(
    (order.financing_status as FinancingStatus | null) ?? "not_applicable",
  );
  const [isUpdatingFinancing, startFinancingTransition] = useTransition();

  // ── A-9 業務轉移 Modal ──────────────────────────────────────
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [newRsName, setNewRsName] = useState("");
  const [reassignReason, setReassignReason] = useState("");
  const [isReassigning, startReassignTransition] = useTransition();

  // ── RS04 Modal 狀態 ──────────────────────────────────────────
  // 取消 Modal
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonCode, setCancelReasonCode] = useState<CancelReasonCode>("other");
  const [cancelForfeitRate, setCancelForfeitRate] = useState<string>("");
  const [cancelForfeitReason, setCancelForfeitReason] = useState<string>("");
  const [isCancelling, startCancelTransition] = useTransition();

  // 延期/無法交車 Modal
  const [showDeferModal, setShowDeferModal] = useState(false);
  const [deferResolution, setDeferResolution] = useState<"deferred" | "unable">("deferred");
  const [deferNewDate, setDeferNewDate] = useState<string>("");
  const [deferReason, setDeferReason] = useState<string>("");
  const [isDeferring, startDeferTransition] = useTransition();

  // 中古車交車後爭議 Modal
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState<string>("");
  const [disputeDetail, setDisputeDetail] = useState<string>("");
  const [isRaisingDispute, startDisputeTransition] = useTransition();

  // 新車換車申請 Modal
  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [replaceReason, setReplaceReason] = useState<string>("");
  const [replaceDetail, setReplaceDetail] = useState<string>("");
  const [isReplacing, startReplaceTransition] = useTransition();

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

  // ── RS04 取消（結構化） ───────────────────────────────────────

  /** 計算審閱期截止時間，給 UI 顯示用 */
  function computeReviewExpiry(): { withinPeriod: boolean; expiresAt: string | null } {
    // 如果 DB 上已有 review_expires_at，直接用
    if (order.review_expires_at) {
      const expires = new Date(order.review_expires_at);
      return {
        withinPeriod: new Date() <= expires,
        expiresAt: order.review_expires_at.slice(0, 10),
      };
    }
    // 沒有 → 用 signed_at + 預設天數推算
    if (!order.signed_at) return { withinPeriod: true, expiresAt: null };
    const days = order.review_period_days ?? REVIEW_PERIOD_DAYS[order.contract_type as "new" | "used"];
    const expires = new Date(order.signed_at);
    expires.setDate(expires.getDate() + days);
    const now = new Date();
    return {
      withinPeriod: now <= expires,
      expiresAt: expires.toISOString().slice(0, 10),
    };
  }

  function handleOpenCancelModal() {
    setCancelReasonCode("other");
    setCancelForfeitRate("");
    setCancelForfeitReason("");
    setShowCancelModal(true);
  }

  function handleCancelSubmit() {
    const { withinPeriod } = computeReviewExpiry();
    const forfeitRate = withinPeriod ? 0 : (parseFloat(cancelForfeitRate) || 0);
    if (!withinPeriod && forfeitRate > 10) {
      showBanner(false, "沒收比例不得超過 10%");
      return;
    }
    if (!withinPeriod && forfeitRate > 0 && !cancelForfeitReason.trim()) {
      showBanner(false, "沒收比例 > 0% 時必須填寫沒收說明");
      return;
    }
    startCancelTransition(async () => {
      const res = await cancelOrderStructuredAction(order.id, {
        reason_code: cancelReasonCode,
        forfeit_rate: withinPeriod ? 0 : forfeitRate,
        forfeit_reason: withinPeriod ? null : (cancelForfeitReason.trim() || null),
      });
      if (res.ok) {
        setShowCancelModal(false);
        showBanner(true, res.data.within_review_period
          ? "✓ 訂單已取消（審閱期內，100% 退款）"
          : `✓ 訂單已取消（沒收比例 ${res.data.within_review_period ? 0 : forfeitRate}%）`
        );
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ── RS04③ 延期/無法交車 ──────────────────────────────────────

  function handleOpenDeferModal() {
    setDeferResolution("deferred");
    setDeferNewDate("");
    setDeferReason("");
    setShowDeferModal(true);
  }

  function handleDeferSubmit() {
    if (!deferReason.trim()) {
      showBanner(false, "請填寫原因");
      return;
    }
    if (deferResolution === "deferred" && !deferNewDate) {
      showBanner(false, "展期時請填寫新的預計交車日");
      return;
    }
    startDeferTransition(async () => {
      const res = await deferDeliveryAction(order.id, {
        resolution: deferResolution,
        new_delivery_date: deferResolution === "deferred" ? deferNewDate : null,
        reason: deferReason.trim(),
      });
      if (res.ok) {
        setShowDeferModal(false);
        showBanner(true, deferResolution === "deferred"
          ? "✓ 交車日期已展期"
          : "✓ 無法交車已記錄，待主管處理"
        );
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ── RS04⑥ 中古車爭議 ─────────────────────────────────────────

  function handleOpenDisputeModal() {
    setDisputeReason("");
    setDisputeDetail("");
    setShowDisputeModal(true);
  }

  function handleDisputeSubmit() {
    if (!disputeReason.trim()) {
      showBanner(false, "請填寫爭議原因");
      return;
    }
    startDisputeTransition(async () => {
      const res = await raiseUsedCarDisputeAction(order.id, {
        reason: disputeReason.trim(),
        detail: disputeDetail.trim() || null,
      });
      if (res.ok) {
        setShowDisputeModal(false);
        showBanner(true, "✓ 交車後爭議已提交，訂單已凍結待處理");
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ── RS04⑦ 新車換車 ──────────────────────────────────────────

  function handleOpenReplaceModal() {
    setReplaceReason("");
    setReplaceDetail("");
    setShowReplaceModal(true);
  }

  function handleReplaceSubmit() {
    if (!replaceReason.trim()) {
      showBanner(false, "請填寫換車申請原因");
      return;
    }
    startReplaceTransition(async () => {
      const res = await requestCarReplacementAction(order.id, {
        reason: replaceReason.trim(),
        detail: replaceDetail.trim() || null,
      });
      if (res.ok) {
        setShowReplaceModal(false);
        showBanner(true, "✓ 換車申請已提交，待主管審核");
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ── 簽名保存 ────────────────────────────────────────────────

  function handleSaveSignature(role: "buyer" | "seller" | "witness", dataUrl: string) {
    startSigTransition(async () => {
      const res = await saveSignaturesAction(order.id, {
        [`signature_${role}`]: dataUrl,
      });
      if (res.ok) {
        setActiveSigRole(null);
        if (res.data.contract_locked) {
          showBanner(true, "✓ 三方簽名完成，合約已自動鎖定");
        } else {
          showBanner(true, "✓ 簽名已儲存");
        }
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  function handleClearSignature(role: "buyer" | "seller" | "witness") {
    if (!confirm(`確定要清除「${role === "buyer" ? "買受人" : role === "seller" ? "賣方" : "見證人"}」的簽名？`)) return;
    startSigTransition(async () => {
      const res = await saveSignaturesAction(order.id, {
        [`signature_${role}`]: null,
      });
      if (res.ok) {
        showBanner(true, "✓ 簽名已清除");
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ── 鎖定 ────────────────────────────────────────────────────

  function handleLockContract() {
    if (!confirm("確定手動鎖定合約？鎖定後需主管解鎖才可修改簽名。")) return;
    startLockTransition(async () => {
      const res = await lockContractAction(order.id);
      if (res.ok) {
        showBanner(true, "✓ 合約已鎖定");
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ── 解鎖 ────────────────────────────────────────────────────

  function handleUnlockSubmit() {
    if (!unlockReason.trim()) {
      showBanner(false, "請填寫解鎖原因");
      return;
    }
    startUnlockTransition(async () => {
      const res = await unlockContractAction(order.id, unlockReason.trim());
      if (res.ok) {
        setShowUnlockModal(false);
        setUnlockReason("");
        showBanner(true, "✓ 合約已解鎖，可重新修改簽名");
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ── A-6 融資狀態更新 ─────────────────────────────────────────

  function handleOpenFinancingModal() {
    setEditFinancingStatus((order.financing_status as FinancingStatus | null) ?? "not_applicable");
    setShowFinancingModal(true);
  }

  function handleFinancingSubmit() {
    startFinancingTransition(async () => {
      const res = await updateFinancingStatusAction(order.id, { financing_status: editFinancingStatus });
      if (res.ok) {
        setShowFinancingModal(false);
        showBanner(true, `✓ 融資狀態已更新為「${FINANCING_STATUS_LABELS[editFinancingStatus]}」`);
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ── A-9 業務轉移 ────────────────────────────────────────────

  function handleOpenReassignModal() {
    setNewRsName(order.rs_name ?? "");
    setReassignReason("");
    setShowReassignModal(true);
  }

  function handleReassignSubmit() {
    if (!newRsName.trim()) {
      showBanner(false, "請填寫接手業務員姓名");
      return;
    }
    startReassignTransition(async () => {
      const res = await reassignSalesOrderAction(order.id, {
        new_rs_name: newRsName.trim(),
        reason: reassignReason.trim() || null,
      });
      if (res.ok) {
        setShowReassignModal(false);
        showBanner(true, `✓ 業務已轉移給「${newRsName.trim()}」`);
        router.refresh();
      } else {
        showBanner(false, `✗ ${res.error}`);
      }
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Render helpers
  // ─────────────────────────────────────────────────────────────

  const reviewExpiry = computeReviewExpiry();

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
              <button
                type="button"
                onClick={() =>
                  window.open(`/print/sales-order/${order.id}`, "_blank")
                }
                className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm inline-flex items-center gap-1"
                title="列印 / 另存 PDF"
              >
                <span className="material-symbols-outlined text-[14px]">
                  print
                </span>
                列印
              </button>
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
              {/* RS04 結構化取消：draft/submitted/signed 均可取消 */}
              {canEdit &&
                (order.status === "draft" || order.status === "submitted" || order.status === "signed") && (
                  <button
                    onClick={handleOpenCancelModal}
                    disabled={isPending || isCancelling}
                    className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
                  >
                    {isCancelling ? "取消中⋯" : "取消合約"}
                  </button>
                )}
              {/* RS04③ 延期/無法交車 */}
              {canEdit && order.status === "signed" && (
                <button
                  onClick={handleOpenDeferModal}
                  disabled={isPending || isDeferring}
                  className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
                  title="RS04③ 廠方延遲或無法交車"
                >
                  延期交車
                </button>
              )}
              {/* RS04⑥ 中古車交車後爭議 */}
              {canEdit && order.status === "fulfilled" && order.contract_type === "used" && (
                <button
                  onClick={handleOpenDisputeModal}
                  disabled={isPending || isRaisingDispute}
                  className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                  title="RS04⑥ 中古車交車後爭議"
                >
                  提交爭議
                </button>
              )}
              {/* RS04⑦ 新車換車申請 */}
              {canReplace && order.status === "fulfilled" && order.contract_type === "new" && (
                <button
                  onClick={handleOpenReplaceModal}
                  disabled={isPending || isReplacing}
                  className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDF3E3] border border-[#E5C880] text-[#854F0B] hover:bg-[#faebc9] shadow-sm disabled:opacity-50"
                  title="RS04⑦ 新車換車申請（檸檬車）"
                >
                  申請換車
                </button>
              )}
              {/* A-9 業務轉移（主管限定） */}
              {canReassign && order.status !== "cancelled" && (
                <button
                  onClick={handleOpenReassignModal}
                  disabled={isPending || isReassigning}
                  className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
                  title="A-9 主管批次轉移業務員"
                >
                  轉移業務
                </button>
              )}
              {/* A-6 融資狀態（所有 canEdit 均可設定） */}
              {canEdit && order.contract_type === "new" && order.status !== "cancelled" && (
                <button
                  onClick={handleOpenFinancingModal}
                  disabled={isPending || isUpdatingFinancing}
                  className="h-[30px] px-4 rounded-full text-[12px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm disabled:opacity-50"
                  title="A-6 融資狀態"
                >
                  融資狀態
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

      {/* ── Tab navigation ── */}
      <div className="bg-white border border-[#EEECE6] rounded-t-lg overflow-x-auto">
        <div className="flex border-b border-[#EEECE6]">
          {(
            [
              { key: "detail", label: "合約詳情" },
              { key: "payments", label: `收款記錄${payments.length > 0 ? ` (${payments.length})` : ""}` },
              { key: "financing", label: "融資 / B-3" },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`px-4 h-[40px] text-[12.5px] whitespace-nowrap border-r last:border-r-0 border-[#EEECE6] transition-colors ${
                activeTab === key
                  ? "bg-white text-[#1A3A5C] font-semibold border-b-2 border-b-[#1A3A5C] -mb-px"
                  : "text-[#5A5955] hover:bg-[#F8F7F4]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab: 收款記錄 ── */}
      {activeTab === "payments" && (
        <section className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg overflow-hidden">
          <div className="px-4 py-4">
            {payments.length === 0 ? (
              <div className="text-[12px] text-[#9A9890] py-4 text-center">尚無收款記錄（成交後自動建立）</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="border-b border-[#EEECE6] text-left">
                      <th className="text-[11px] text-[#9A9890] pb-2 pr-4 font-medium">類型</th>
                      <th className="text-[11px] text-[#9A9890] pb-2 pr-4 font-medium">金額</th>
                      <th className="text-[11px] text-[#9A9890] pb-2 pr-4 font-medium">付款方式</th>
                      <th className="text-[11px] text-[#9A9890] pb-2 pr-4 font-medium">付款狀態</th>
                      <th className="text-[11px] text-[#9A9890] pb-2 pr-4 font-medium">結算狀態</th>
                      <th className="text-[11px] text-[#9A9890] pb-2 font-medium">付款時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const isNeg = p.total_amount < 0;
                      return (
                        <tr key={p.id} className="border-b border-[#EEECE6] last:border-b-0">
                          <td className="py-2 pr-4 text-[12px] text-[#2C2C2A]">
                            {p.source_type}
                          </td>
                          <td className={`py-2 pr-4 font-mono font-semibold ${isNeg ? "text-[#CC0000]" : "text-[#0F6E56]"}`}>
                            {fmtNT(p.total_amount)}
                          </td>
                          <td className="py-2 pr-4 text-[#5A5955]">{p.payment_method}</td>
                          <td className="py-2 pr-4">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                              p.payment_status === "paid" ? "bg-[#EAF3DE] text-[#3B6D11]" :
                              p.payment_status === "recorded_payable" ? "bg-[#FDF3E3] text-[#854F0B]" :
                              "bg-[#F2F2F2] text-[#6B6A68]"
                            }`}>
                              {p.payment_status === "paid" ? "已付款" :
                               p.payment_status === "recorded_payable" ? "應付待轉" : p.payment_status}
                            </span>
                          </td>
                          <td className="py-2 pr-4">
                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                              p.settlement_status === "settled" ? "bg-[#EAF3DE] text-[#3B6D11]" :
                              "bg-[#FDF3E3] text-[#854F0B]"
                            }`}>
                              {p.settlement_status === "settled" ? "已結算" : "待結算"}
                            </span>
                          </td>
                          <td className="py-2 text-[#9A9890] font-mono">{fmtDateTime(p.paid_at ?? null)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Tab: 融資 / B-3 ── */}
      {activeTab === "financing" && (
        <section className="bg-white border border-[#EEECE6] border-t-0 rounded-b-lg overflow-hidden">
          <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* A-6 融資狀態 */}
            <div className="border border-[#EEECE6] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">融資狀態（A-6）</span>
                {canEdit && order.contract_type === "new" && order.status !== "cancelled" && (
                  <button
                    type="button"
                    onClick={handleOpenFinancingModal}
                    disabled={isUpdatingFinancing}
                    className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                  >
                    修改
                  </button>
                )}
              </div>
              <div className="px-4 py-3 grid grid-cols-1 gap-y-2">
                <div className="flex flex-col gap-0.5">
                  <div className="text-[11px] text-[#9A9890]">融資狀態</div>
                  <div>
                    {order.financing_status ? (
                      <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                        FINANCING_STATUS_CHIP[order.financing_status as FinancingStatus]?.bg ?? "bg-[#F2F2F2]"
                      } ${
                        FINANCING_STATUS_CHIP[order.financing_status as FinancingStatus]?.text ?? "text-[#6B6A68]"
                      }`}>
                        {FINANCING_STATUS_LABELS[order.financing_status as FinancingStatus] ?? order.financing_status}
                      </span>
                    ) : (
                      <span className="text-[12px] text-[#9A9890]">—</span>
                    )}
                  </div>
                </div>
                {order.financing_applied_at && (
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[11px] text-[#9A9890]">申請時間</div>
                    <div className="text-[12.5px] font-mono text-[#2C2C2A]">{fmtDateTime(order.financing_applied_at)}</div>
                  </div>
                )}
                {order.financing_status === "pending_approval" && order.financing_applied_at && (() => {
                  const appliedAt = new Date(order.financing_applied_at);
                  // 顯示用「已送件天數」依當下時間計算（純展示，re-render 重算可接受）
                  // eslint-disable-next-line react-hooks/purity
                  const daysSince = Math.floor((Date.now() - appliedAt.getTime()) / (1000 * 60 * 60 * 24));
                  const isOverdue = daysSince >= 7;
                  return (
                    <div className={`px-3 py-2 rounded text-[12px] ${isOverdue ? "bg-[#FDECEA] text-[#CC0000]" : "bg-[#FDF3E3] text-[#854F0B]"}`}>
                      {isOverdue
                        ? `⚠ 已送件 ${daysSince} 天，超過 7 天追蹤期，請確認進度`
                        : `▸ 已送件 ${daysSince} 天（7 天追蹤期）`}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* B-3 以舊換新 / 負值差價 */}
            <div className="border border-[#EEECE6] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                <span className="text-[13px] font-semibold text-[#2C2C2A]">以舊換新 / 差價（B-3）</span>
              </div>
              <div className="px-4 py-3 grid grid-cols-1 gap-y-2">
                <div className="flex flex-col gap-0.5">
                  <div className="text-[11px] text-[#9A9890]">關聯收購訂單</div>
                  <div className="text-[12.5px] font-mono text-[#2C2C2A]">
                    {order.trade_in_linked_order_id ?? "—"}
                  </div>
                </div>
                {order.negative_equity_resolution && (
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[11px] text-[#9A9890]">負值差價處理</div>
                    <div>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDF3E3] text-[#854F0B]">
                        {order.negative_equity_resolution === "rolled_into_price" ? "併入車款價格" : "現金補差"}
                      </span>
                    </div>
                  </div>
                )}
                {!order.trade_in_linked_order_id && (
                  <div className="text-[12px] text-[#9A9890]">此訂單未關聯收購單</div>
                )}
              </div>
            </div>

            {/* A-9 業務轉移歷程 */}
            {order.reassigned_at && (
              <div className="border border-[#EEECE6] rounded-lg overflow-hidden md:col-span-2">
                <div className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
                  <span className="text-[13px] font-semibold text-[#2C2C2A]">業務轉移歷程（A-9）</span>
                </div>
                <div className="px-4 py-3 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[11px] text-[#9A9890]">原業務員</div>
                    <div className="text-[12.5px] text-[#2C2C2A]">{order.reassigned_from ?? "—"}</div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[11px] text-[#9A9890]">接手業務員</div>
                    <div className="text-[12.5px] text-[#2C2C2A] font-semibold">{order.reassigned_to ?? "—"}</div>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <div className="text-[11px] text-[#9A9890]">轉移時間</div>
                    <div className="text-[12.5px] font-mono text-[#2C2C2A]">{fmtDateTime(order.reassigned_at)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── Tab: 合約詳情（以下全部在 detail tab 下） ── */}
      {activeTab === "detail" && <>
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

      {/* ── 三方簽名區（B12 / RS04④⑤） ── */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 三方簽名</span>
          <div className="flex items-center gap-2">
            {order.contract_locked && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] bg-[#1A3A5C] text-white font-medium">
                <span className="material-symbols-outlined text-[12px]">lock</span>
                合約已鎖定
              </span>
            )}
            {/* 合約頁連結 */}
            <a
              href={`/sales/orders/${order.id}/contract`}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#EAF4FB] border border-[#85B7EB] text-[#185FA5] hover:bg-[#d4eaf8] inline-flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[12px]">description</span>
              查看合約
            </a>
            {/* 手動鎖定 */}
            {canEdit && !order.contract_locked && order.status !== "cancelled" &&
              order.signature_buyer && order.signature_seller && order.signature_witness && (
              <button
                type="button"
                onClick={handleLockContract}
                disabled={isLocking}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
              >
                {isLocking ? "鎖定中⋯" : "鎖定合約"}
              </button>
            )}
            {/* 主管解鎖 */}
            {canUnlock && order.contract_locked && order.status !== "cancelled" && (
              <button
                type="button"
                onClick={() => { setUnlockReason(""); setShowUnlockModal(true); }}
                className="h-[26px] px-2.5 rounded text-[11.5px] bg-[#FDF3E3] border border-[#E5C880] text-[#854F0B] hover:bg-[#faebc9]"
              >
                主管解鎖
              </button>
            )}
          </div>
        </header>
        <div
          className={`px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-3 ${
            isSavingSig ? "pointer-events-none opacity-60" : ""
          }`}
        >
          {(
            [
              { role: "buyer" as const, label: "買受人簽名", sig: order.signature_buyer },
              { role: "seller" as const, label: "賣方 / 銷售顧問", sig: order.signature_seller },
              { role: "witness" as const, label: "見證人 / 授權代表", sig: order.signature_witness },
            ] as const
          ).map(({ role, label, sig }) => {
            const isLocked = !!order.contract_locked;
            const isActive = activeSigRole === role;
            return (
              <div key={role} className="border border-[#D5D3CB] rounded-lg bg-[#FAFAF8] overflow-hidden">
                <div className="px-3 py-2 border-b border-[#EEECE6] bg-[#F4F3F0] flex items-center justify-between">
                  <span className="text-[11.5px] font-semibold text-[#2C2C2A]">{label}</span>
                  {sig && canEdit && !isLocked && (
                    <button
                      type="button"
                      onClick={() => handleClearSignature(role)}
                      className="text-[10.5px] text-[#CC0000] hover:underline"
                    >
                      清除
                    </button>
                  )}
                </div>
                <div className="px-3 py-3">
                  {sig ? (
                    <div className="flex flex-col items-center gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={sig}
                        alt={`${label}簽名`}
                        className="w-full max-h-[80px] object-contain border border-[#EEECE6] rounded bg-white"
                      />
                      <span className="text-[10.5px] text-[#3B6D11] font-medium">✓ 已簽名</span>
                    </div>
                  ) : isActive ? (
                    <div>
                      <SignatureCanvas
                        onSigned={(dataUrl) => handleSaveSignature(role, dataUrl)}
                      />
                      <button
                        type="button"
                        onClick={() => setActiveSigRole(null)}
                        className="mt-1 text-[11px] text-[#9A9890] hover:text-[#5A5955]"
                      >
                        取消
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => !isLocked && canEdit && setActiveSigRole(role)}
                      disabled={isLocked || !canEdit}
                      className="w-full h-[72px] border-2 border-dashed border-[#D5D3CB] rounded text-[12px] text-[#9A9890] hover:border-[#185FA5] hover:text-[#185FA5] transition-colors disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isLocked ? "🔒 合約已鎖定" : "✏️ 點此簽名"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── 解鎖 Modal ── */}
      {showUnlockModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4" style={{ pointerEvents: "auto" }}>
            <div className="text-[15px] font-semibold text-[#854F0B]">主管解鎖合約</div>
            <div className="text-[12px] text-[#9A9890]">
              解鎖後可修改或補簽三方簽名，操作記錄將寫入稽核日誌。
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">解鎖原因 *</label>
              <textarea
                className="w-full px-2 py-1.5 rounded border border-[#D5D3CB] text-[12.5px] outline-none focus:border-[#185FA5] bg-white h-[72px] resize-none"
                value={unlockReason}
                onChange={(e) => setUnlockReason(e.target.value)}
                disabled={isUnlocking}
                placeholder="請說明解鎖原因（主管責任記錄）…"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => { setShowUnlockModal(false); setUnlockReason(""); }}
                disabled={isUnlocking}
                className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleUnlockSubmit}
                disabled={isUnlocking}
                className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#854F0B] text-white hover:bg-[#6b3f08] disabled:opacity-50"
              >
                {isUnlocking ? "解鎖中⋯" : "確認解鎖"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RS04 取消資訊（已取消時顯示） */}
      {order.status === "cancelled" && order.cancel_requested_at && (
        <section className="bg-[#FDECEA] border border-[#F5AEAD] rounded-lg px-4 py-3">
          <div className="text-[13px] font-semibold text-[#CC0000] mb-2">合約取消紀錄</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-2 text-[12px]">
            <div>
              <div className="text-[11px] text-[#9A9890]">取消時間</div>
              <div className="font-mono text-[#2C2C2A]">{fmtDateTime(order.cancel_requested_at)}</div>
            </div>
            <div>
              <div className="text-[11px] text-[#9A9890]">取消原因</div>
              <div className="text-[#2C2C2A]">
                {CANCEL_REASON_LABELS[order.cancel_reason_code as CancelReasonCode] ?? order.cancel_reason_code ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[#9A9890]">審閱期</div>
              <div>
                {order.cancel_within_review_period == null ? "—" : (
                  <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium ${
                    order.cancel_within_review_period
                      ? "bg-[#EAF3DE] text-[#3B6D11]"
                      : "bg-[#FDF3E3] text-[#854F0B]"
                  }`}>
                    {order.cancel_within_review_period ? "期內取消（100% 退款）" : "期後取消"}
                  </span>
                )}
              </div>
            </div>
            {!order.cancel_within_review_period && (order.cancel_forfeit_rate ?? 0) > 0 && (
              <>
                <div>
                  <div className="text-[11px] text-[#9A9890]">沒收比例</div>
                  <div className="font-semibold text-[#CC0000]">{order.cancel_forfeit_rate}%</div>
                </div>
                <div className="md:col-span-2">
                  <div className="text-[11px] text-[#9A9890]">沒收說明</div>
                  <div className="text-[#2C2C2A]">{order.cancel_forfeit_reason ?? "—"}</div>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {/* RS04 爭議凍結提示 */}
      {order.dispute_frozen && (
        <section className="bg-[#FDF3E3] border border-[#E5C880] rounded-lg px-4 py-3">
          <div className="text-[13px] font-semibold text-[#854F0B] mb-1">⚠ 訂單爭議凍結中</div>
          <div className="text-[12px] text-[#2C2C2A]">{order.dispute_frozen_reason ?? "待主管處理"}</div>
        </section>
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
          {order.review_expires_at && order.status !== "cancelled" && (
            <div>
              審閱期截止：
              <span className={`font-mono ${reviewExpiry.withinPeriod ? "text-[#3B6D11]" : "text-[#854F0B]"}`}>
                {fmtDate(order.review_expires_at)}
                {reviewExpiry.withinPeriod ? "（期內）" : "（已過期）"}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* 關閉 detail tab 包裝 */}
      </>}

      {/* ── RS04 取消 Modal ── */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4"
            style={{ pointerEvents: "auto" }}
          >
            <div className="text-[15px] font-semibold text-[#2C2C2A]">取消合約</div>

            {/* 審閱期提示 */}
            {order.signed_at ? (
              <div className={`px-3 py-2 rounded text-[12px] ${
                reviewExpiry.withinPeriod
                  ? "bg-[#EAF3DE] text-[#3B6D11]"
                  : "bg-[#FDF3E3] text-[#854F0B]"
              }`}>
                {reviewExpiry.withinPeriod
                  ? `▸ 目前在審閱期內（截止 ${reviewExpiry.expiresAt}），取消將 100% 退款`
                  : `▸ 審閱期已過（截止 ${reviewExpiry.expiresAt}），可裁量沒收 0~10%`
                }
              </div>
            ) : (
              <div className="px-3 py-2 rounded text-[12px] bg-[#EAF3DE] text-[#3B6D11]">
                ▸ 訂單尚未簽約，取消將 100% 退款
              </div>
            )}

            {/* 取消原因 */}
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">取消原因 *</label>
              <select
                className={inputCls}
                value={cancelReasonCode}
                onChange={(e) => setCancelReasonCode(e.target.value as CancelReasonCode)}
                disabled={isCancelling}
              >
                {CANCEL_REASON_CODES.map((code) => (
                  <option key={code} value={code}>{CANCEL_REASON_LABELS[code]}</option>
                ))}
              </select>
            </div>

            {/* 期後沒收（只有超過審閱期 + 有 canForfeit 才顯示） */}
            {!reviewExpiry.withinPeriod && canForfeit && (
              <>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">
                    沒收比例（%，0~10）<span className="text-[#CC0000]">主管裁量</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    step={0.5}
                    className={inputCls}
                    value={cancelForfeitRate}
                    onChange={(e) => setCancelForfeitRate(e.target.value)}
                    disabled={isCancelling}
                    placeholder="0"
                  />
                </div>
                {parseFloat(cancelForfeitRate || "0") > 0 && (
                  <div className="space-y-1">
                    <label className="text-[11px] text-[#9A9890] font-medium">沒收說明 *</label>
                    <textarea
                      className={`${inputCls} h-[60px] resize-none`}
                      value={cancelForfeitReason}
                      onChange={(e) => setCancelForfeitReason(e.target.value)}
                      disabled={isCancelling}
                      placeholder="請說明沒收原因（主管責任記錄）"
                    />
                  </div>
                )}
              </>
            )}

            {/* 期後但無 canForfeit 顯示提示 */}
            {!reviewExpiry.withinPeriod && !canForfeit && (
              <div className="px-3 py-2 rounded text-[12px] bg-[#EAF4FB] text-[#185FA5]">
                ▸ 沒收裁量需要主管權限。若需沒收，請洽主管操作。本次取消沒收比例為 0%。
              </div>
            )}

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowCancelModal(false)}
                disabled={isCancelling}
                className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                返回
              </button>
              <button
                onClick={handleCancelSubmit}
                disabled={isCancelling}
                className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] disabled:opacity-50"
              >
                {isCancelling ? "取消中⋯" : "確認取消合約"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RS04③ 延期/無法交車 Modal ── */}
      {showDeferModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4"
            style={{ pointerEvents: "auto" }}
          >
            <div className="text-[15px] font-semibold text-[#2C2C2A]">延期 / 無法交車</div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">處理方式 *</label>
              <select
                className={inputCls}
                value={deferResolution}
                onChange={(e) => setDeferResolution(e.target.value as "deferred" | "unable")}
                disabled={isDeferring}
              >
                <option value="deferred">展期（可繼續等待）</option>
                <option value="unable">無法交車（需主管協商）</option>
              </select>
            </div>
            {deferResolution === "deferred" && (
              <div className="space-y-1">
                <label className="text-[11px] text-[#9A9890] font-medium">新預計交車日 *</label>
                <input
                  type="date"
                  className={inputCls}
                  value={deferNewDate}
                  onChange={(e) => setDeferNewDate(e.target.value)}
                  disabled={isDeferring}
                />
              </div>
            )}
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">原因說明 *</label>
              <textarea
                className={`${inputCls} h-[72px] resize-none`}
                value={deferReason}
                onChange={(e) => setDeferReason(e.target.value)}
                disabled={isDeferring}
                placeholder={deferResolution === "deferred" ? "廠方通知延期原因⋯" : "廠方無法交車的具體情況⋯"}
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowDeferModal(false)}
                disabled={isDeferring}
                className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDeferSubmit}
                disabled={isDeferring}
                className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
              >
                {isDeferring ? "送出中⋯" : "確認送出"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RS04⑥ 中古車爭議 Modal ── */}
      {showDisputeModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4"
            style={{ pointerEvents: "auto" }}
          >
            <div className="text-[15px] font-semibold text-[#CC0000]">中古車交車後爭議</div>
            <div className="text-[12px] text-[#9A9890]">
              提交後訂單將被凍結，由主管介入處理。實體爭議（退車/賠償）屬人工程序，系統僅做記錄。
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">爭議原因 *</label>
              <input
                type="text"
                className={inputCls}
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                disabled={isRaisingDispute}
                placeholder="例：交車後發現車況不符合約描述"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">詳細說明</label>
              <textarea
                className={`${inputCls} h-[80px] resize-none`}
                value={disputeDetail}
                onChange={(e) => setDisputeDetail(e.target.value)}
                disabled={isRaisingDispute}
                placeholder="具體描述問題情況⋯"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowDisputeModal(false)}
                disabled={isRaisingDispute}
                className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleDisputeSubmit}
                disabled={isRaisingDispute}
                className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#CC0000] text-white hover:bg-[#aa0000] disabled:opacity-50"
              >
                {isRaisingDispute ? "提交中⋯" : "確認提交爭議"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── RS04⑦ 新車換車申請 Modal ── */}
      {showReplaceModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4"
            style={{ pointerEvents: "auto" }}
          >
            <div className="text-[15px] font-semibold text-[#854F0B]">新車換車申請</div>
            <div className="text-[12px] text-[#9A9890]">
              換車申請送出後由主管審核。換車天數/里程門檻（檸檬車條款）待法律顧問確認，系統現階段僅做記錄。
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">換車原因 *</label>
              <input
                type="text"
                className={inputCls}
                value={replaceReason}
                onChange={(e) => setReplaceReason(e.target.value)}
                disabled={isReplacing}
                placeholder="例：交車後發現重大瑕疵"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">詳細說明</label>
              <textarea
                className={`${inputCls} h-[80px] resize-none`}
                value={replaceDetail}
                onChange={(e) => setReplaceDetail(e.target.value)}
                disabled={isReplacing}
                placeholder="具體說明換車事由⋯"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowReplaceModal(false)}
                disabled={isReplacing}
                className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleReplaceSubmit}
                disabled={isReplacing}
                className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#854F0B] text-white hover:bg-[#6b3f08] disabled:opacity-50"
              >
                {isReplacing ? "提交中⋯" : "送出換車申請"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── A-6 融資狀態 Modal ── */}
      {showFinancingModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4" style={{ pointerEvents: "auto" }}>
            <div className="text-[15px] font-semibold text-[#2C2C2A]">融資狀態更新（A-6）</div>
            <div className="text-[12px] text-[#9A9890]">
              設為「審核中」時系統記錄申請時間，7 天後顯示追蹤提示。
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">融資狀態 *</label>
              <select
                className={inputCls}
                value={editFinancingStatus}
                onChange={(e) => setEditFinancingStatus(e.target.value as FinancingStatus)}
                disabled={isUpdatingFinancing}
              >
                {FINANCING_STATUSES.map((s) => (
                  <option key={s} value={s}>{FINANCING_STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowFinancingModal(false)}
                disabled={isUpdatingFinancing}
                className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleFinancingSubmit}
                disabled={isUpdatingFinancing}
                className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-50"
              >
                {isUpdatingFinancing ? "更新中⋯" : "確認更新"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── A-9 業務轉移 Modal ── */}
      {showReassignModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4" style={{ pointerEvents: "auto" }}>
            <div className="text-[15px] font-semibold text-[#854F0B]">業務員轉移（A-9）</div>
            <div className="text-[12px] text-[#9A9890]">
              主管操作：將此訂單的業務責任轉移給另一位業務員，並同步更新相關跟進任務。操作記錄將寫入稽核日誌。
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">原業務員</label>
              <div className="text-[12.5px] text-[#5A5955] px-2 py-1.5 rounded border border-[#EEECE6] bg-[#F8F7F4]">
                {order.rs_name ?? "（未指定）"}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">接手業務員姓名 *</label>
              <input
                type="text"
                className={inputCls}
                value={newRsName}
                onChange={(e) => setNewRsName(e.target.value)}
                disabled={isReassigning}
                placeholder="輸入接手業務員姓名"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-[#9A9890] font-medium">轉移原因說明</label>
              <textarea
                className={`${inputCls} h-[60px] resize-none`}
                value={reassignReason}
                onChange={(e) => setReassignReason(e.target.value)}
                disabled={isReassigning}
                placeholder="例：業務離職、區域重新分配⋯"
              />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => setShowReassignModal(false)}
                disabled={isReassigning}
                className="h-[32px] px-4 rounded text-[12.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={handleReassignSubmit}
                disabled={isReassigning}
                className="h-[32px] px-4 rounded text-[12.5px] font-medium bg-[#854F0B] text-white hover:bg-[#6b3f08] disabled:opacity-50"
              >
                {isReassigning ? "轉移中⋯" : "確認轉移"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
