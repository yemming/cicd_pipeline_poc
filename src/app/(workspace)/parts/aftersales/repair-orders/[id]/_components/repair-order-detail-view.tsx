"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { useSetPageHeader } from "@/components/page-header-context";
import { EntityImageGallery } from "@/components/image-upload/entity-image-gallery";
import {
  cancelRepairOrderAction,
  updateRepairOrderStatusAction,
  notifyRepairOrderProgressAction,
  recordContactAttemptAction,
  type ContactAttemptInput,
} from "@/lib/aftersales/repair-order-actions";
import { requestCancelOrderApprovalAction } from "@/lib/aftersales/approval-request-actions";
import { RO_STATUS_OPTIONS, priorityDef } from "@/domain/repair-orders.constants";
import type { RepairOrderListRow, RoEvent } from "@/domain/repair-orders";

// 純算數格式化 Asia/Taipei wall-clock（避開 toLocaleString 在 Node ICU / browser ICU
// 對 dayPeriod / narrow nbsp 不一致造成的 SSR / CSR hydration mismatch）
function fmtTaipeiDateTime(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return "";
  const d = new Date(t + 8 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

function statusBadge(status: string): string {
  switch (status) {
    case "進行中":
      return "bg-[#EAF4FB] text-[#185FA5]";
    case "維修中":
      return "bg-[#FDF3E3] text-[#854F0B]";
    case "待結帳":
      return "bg-[#EBF3FF] text-[#1A3A5C]";
    case "已關單":
      return "bg-[#EAF3DE] text-[#3B6D11]";
    case "已取消":
      return "bg-[#F2F2F2] text-[#6B6A68]";
    default:
      return "bg-[#F2F2F2] text-[#6B6A68]";
  }
}

// RP4 層二：事件標籤翻譯與顏色
function roEventLabel(e: RoEvent): string {
  switch (e.action) {
    case "ro_created":             return "工單建立";
    case "dispatched":             return "技師派工";
    case "status_changed": {
      const p = (e.payload ?? {}) as { from?: string; to?: string };
      return p.from && p.to ? `狀態轉換：${p.from} → ${p.to}` : "狀態變更";
    }
    case "final_inspection_passed":   return "複檢通過 → 待結帳";
    case "final_inspection_rejected": return "複檢退回重工";
    case "discount_applied": {
      const p = (e.payload ?? {}) as { discount_pct_before?: number; discount_pct_after?: number; payable?: number };
      const from = p.discount_pct_before ?? 0;
      const to = p.discount_pct_after ?? 0;
      return `折扣調整：${from}% → ${to}%${p.payable != null ? `（應收 NT$${Number(p.payable).toLocaleString()}）` : ""}`;
    }
    case "checkout_completed":     return "結帳關單";
    case "addon_decision": {
      const p = (e.payload ?? {}) as { addon_name?: string; customer_decision?: string; estimated_fee?: number };
      const dec = p.customer_decision === "agreed" ? "同意" : p.customer_decision === "rejected" ? "拒絕" : p.customer_decision === "deferred" ? "暫緩" : p.customer_decision ?? "—";
      return `追加項目決策：${p.addon_name ?? "—"} → ${dec}${p.estimated_fee != null ? `（NT$${Number(p.estimated_fee).toLocaleString()}）` : ""}`;
    }
    case "contact_attempt": {
      const p = (e.payload ?? {}) as { method?: string; result?: string };
      const parts = [p.method, p.result].filter(Boolean).join(" / ");
      return `聯繫嘗試${parts ? `：${parts}` : ""}`;
    }
    default:                       return String((e as { action?: string }).action ?? "未知事件");
  }
}

function roEventDotColor(e: RoEvent): string {
  switch (e.action) {
    case "ro_created":               return "bg-[#185FA5] border-[#185FA5]";
    case "dispatched":               return "bg-[#854F0B] border-[#854F0B]";
    case "status_changed": {
      const p = (e.payload ?? {}) as { to?: string };
      if (p.to === "已關單") return "bg-[#3B6D11] border-[#3B6D11]";
      if (p.to?.includes("取消") || p.to?.includes("退回")) return "bg-[#CC0000] border-[#CC0000]";
      return "bg-[#854F0B] border-[#854F0B]";
    }
    case "final_inspection_passed":  return "bg-[#3B6D11] border-[#3B6D11]";
    case "final_inspection_rejected":return "bg-[#CC0000] border-[#CC0000]";
    case "discount_applied":         return "bg-[#854F0B] border-[#854F0B]";
    case "checkout_completed":       return "bg-[#3B6D11] border-[#3B6D11]";
    case "addon_decision": {
      const p = (e.payload ?? {}) as { customer_decision?: string };
      if (p.customer_decision === "agreed") return "bg-[#3B6D11] border-[#3B6D11]";
      if (p.customer_decision === "rejected") return "bg-[#CC0000] border-[#CC0000]";
      return "bg-[#854F0B] border-[#854F0B]";
    }
    default:                         return "bg-[#D5D3CB] border-[#9A9890]";
  }
}

function Kv({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="text-[11px] text-[#9A9890]">{label}</div>
      <div
        className={`text-[12.5px] text-[#2C2C2A] ${mono ? "font-mono" : ""}`}
      >
        {value ?? <span className="text-[#9A9890]">—</span>}
      </div>
    </div>
  );
}

export function RepairOrderDetailView({
  ro,
  canEdit,
  roEvents: roEventsProp = [],
}: {
  ro: RepairOrderListRow;
  canEdit: boolean;
  /** P1 升表：由 server 傳入，merge 新表+舊 metadata（向後相容） */
  roEvents?: RoEvent[];
}) {
  useSetPageHeader({
    title: ro.ro_code,
    breadcrumb: [
      { label: "售後修護", href: "/parts/aftersales" },
      { label: "正式工單 RO", href: "/parts/aftersales/repair-orders" },
      { label: ro.ro_code },
    ],
  });

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [banner, setBanner] = useState<{ ok: boolean; msg: string } | null>(null);
  /** 狀態切換確認 modal — 為 null 時關閉 */
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  /** RP5 中途取消授權 modal */
  const [cancelApprovalModal, setCancelApprovalModal] = useState(false);
  const [cancelApprovalNotes, setCancelApprovalNotes] = useState("");
  /** B5-02 聯繫嘗試記錄 modal */
  const [contactModal, setContactModal] = useState(false);
  const [contactMethod, setContactMethod] = useState<ContactAttemptInput["contact_method"]>("電話");
  const [contactResult, setContactResult] = useState<ContactAttemptInput["contact_result"]>("接通");
  const [contactNotes, setContactNotes] = useState("");

  function showBanner(b: { ok: boolean; msg: string }) {
    setBanner(b);
    if (b.ok) setTimeout(() => setBanner(null), 2200);
  }

  function askStatus(next: string) {
    if (!canEdit || isPending) return;
    if (next === ro.status) return;
    setPendingStatus(next);
  }

  function confirmStatus() {
    const next = pendingStatus;
    if (!next) return;
    startTransition(async () => {
      const res = await updateRepairOrderStatusAction(ro.id, next);
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已切換為「${next}」` });
        setPendingStatus(null);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
        setPendingStatus(null);
      }
    });
  }

  function doCancel() {
    if (!canEdit || isPending) return;
    if (!confirm(`確認取消工單 ${ro.ro_code}？`)) return;
    const reason = prompt("取消原因（可留白）") ?? "";
    startTransition(async () => {
      const res = await cancelRepairOrderAction(ro.id, reason);
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 工單已取消" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  /** RP5 中途取消授權：送出申請後工單不立即取消，等主管核准 */
  function doCancelApprovalRequest() {
    if (!cancelApprovalNotes.trim()) {
      showBanner({ ok: false, msg: "請填寫中途取消原因（稽核必填）" });
      return;
    }
    setCancelApprovalModal(false);
    startTransition(async () => {
      const res = await requestCancelOrderApprovalAction(ro.id, cancelApprovalNotes.trim());
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 中途取消申請已送主管審批，工單暫不取消" });
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  /** B5-02 聯繫嘗試：送出記錄 */
  function doRecordContact() {
    setContactModal(false);
    startTransition(async () => {
      const res = await recordContactAttemptAction({
        ro_id: ro.id,
        contact_method: contactMethod,
        contact_result: contactResult,
        notes: contactNotes || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: `✓ 已記錄聯繫嘗試（${contactMethod} / ${contactResult}）` });
        setContactNotes("");
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  const meta = (ro.metadata ?? {}) as Record<string, unknown>;
  const accountingCategory =
    typeof meta.accounting_category_resolved === "string"
      ? (meta.accounting_category_resolved as string)
      : null;
  const verdict =
    typeof meta.verdict === "string" ? (meta.verdict as string) : null;
  const supervisorApproval = meta.supervisor_approval as
    | { required: boolean; approved_at?: string | null; approver_id?: string | null }
    | undefined;

  const warranty = (ro.warranty_status_snapshot ?? {}) as Record<string, unknown>;
  const warrantyValid = warranty.is_valid === true;

  const pdef = priorityDef(ro.priority);
  const isRework = meta.is_rework === true;
  const reworkOf = typeof meta.rework_of === "string" ? (meta.rework_of as string) : null;

  // RP4 層二（P1 升表）：直接使用 server 傳入的 roEvents（merge 新表+舊 metadata）
  const roEvents: RoEvent[] = roEventsProp;
  const warrantyAuth = meta.warranty_auth as
    | { authorized_by?: string; reason?: string | null; authorized_at?: string }
    | undefined;

  function notifyStage(stage: string) {
    if (!canEdit || isPending) return;
    startTransition(async () => {
      const res = await notifyRepairOrderProgressAction(ro.id, stage);
      showBanner(
        res.ok
          ? { ok: true, msg: `✓ 已推播「${stage}」進度給車主` }
          : { ok: false, msg: res.error },
      );
    });
  }

  return (
    <main className="px-6 py-5 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-[12px] text-[#9A9890]">
          <Link href="/parts/aftersales/repair-orders" className="hover:text-[#185FA5]">
            正式工單 RO
          </Link>
          <span>›</span>
          <span className="text-[#5A5955] font-mono">{ro.ro_code}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Link
            href="/parts/aftersales/repair-orders"
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            返回列表
          </Link>
          {canEdit && (
            <Link
              href="/parts/aftersales/repair-orders/new"
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
            >
              新增 RO
            </Link>
          )}
          <button
            type="button"
            onClick={() =>
              window.open(`/print/repair-order/${ro.id}`, "_blank")
            }
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            🖨️ 列印 / PDF
          </button>
          {/* B5-02：聯繫嘗試記錄（任何狀態都可記錄，無論 canEdit） */}
          <button
            type="button"
            onClick={() => {
              setContactMethod("電話");
              setContactResult("接通");
              setContactNotes("");
              setContactModal(true);
            }}
            disabled={isPending}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-[#EAF4FB] border border-[#A9CCE8] text-[#185FA5] hover:bg-[#d4eaf8] shadow-sm disabled:opacity-50"
            title="記錄與車主的聯繫嘗試（B5-02）"
          >
            📞 記錄聯繫
          </button>
          {canEdit && !["已取消", "已關單", "已關閉-中途取消", "已關閉-保固待確認"].includes(ro.status) && (
            <>
              {/* RP5：中途取消需主管授權，開 modal 送審 */}
              <button
                type="button"
                onClick={() => {
                  setCancelApprovalNotes("");
                  setCancelApprovalModal(true);
                }}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] hover:bg-[#fce9c5] shadow-sm disabled:opacity-50"
                title="中途取消需主管授權，送出申請後等候核准"
              >
                中途取消（申請授權）
              </button>
              {/* 管理員直接取消（快速通道，不需授權） */}
              <button
                type="button"
                onClick={doCancel}
                disabled={isPending}
                className="h-[30px] px-4 rounded-full text-[12px] bg-[#FDECEA] border border-[#F5AEAD] text-[#CC0000] hover:bg-[#fbdcd9] shadow-sm disabled:opacity-50"
                title="管理員直接取消（不需授權，走 cancelRepairOrderAction）"
              >
                直接取消
              </button>
            </>
          )}
        </div>
      </div>

      {/* Title card */}
      <header className="bg-white border border-[#EEECE6] rounded-lg p-4">
        <div className="flex items-stretch gap-4">
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            <div>
              <div className="text-[11px] tracking-wider text-[#9A9890]">
                正式維修工單 (Repair Order)
              </div>
              <h1 className="text-[18px] font-semibold text-[#2C2C2A] leading-tight font-mono">
                {ro.ro_code}
              </h1>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap text-[12px]">
                <span
                  className={`inline-flex whitespace-nowrap px-1.5 py-0.5 rounded-md text-[11px] font-medium ${statusBadge(ro.status)}`}
                >
                  {ro.status}
                </span>
                <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EBF3FF] text-[#1A3A5C]">
                  {ro.prefix_p1}-{ro.prefix_p2}
                </span>
                <span
                  className={`inline-flex whitespace-nowrap px-1.5 py-0.5 rounded-md text-[11px] font-medium ${pdef.chip}`}
                >
                  {pdef.emoji} {pdef.label}
                </span>
                {isRework && (
                  <span
                    className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]"
                    title={reworkOf ? `關聯原單 ${reworkOf.slice(0, 8)}…` : undefined}
                  >
                    返工
                  </span>
                )}
                {warrantyAuth?.authorized_by && (
                  <span
                    className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDECEA] text-[#CC0000]"
                    title={`主管授權：${warrantyAuth.authorized_by}${warrantyAuth.reason ? ` · ${warrantyAuth.reason}` : ""}`}
                  >
                    保固特案授權
                  </span>
                )}
                {accountingCategory && (
                  <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] bg-[#F0EFFE] text-[#534AB7]">
                    {accountingCategory}
                  </span>
                )}
                {verdict === "needs_supervisor" && (
                  <span className="inline-flex px-1.5 py-0.5 rounded-md text-[11px] bg-[#FDF3E3] text-[#854F0B]">
                    需主管確認
                  </span>
                )}
              </div>
            </div>
            {canEdit && ro.status !== "已取消" && (
              <div className="flex flex-wrap gap-1.5">
                {RO_STATUS_OPTIONS.filter((s) => s !== "已取消" && s !== ro.status).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => askStatus(s)}
                    disabled={isPending}
                    className="h-[26px] px-3 rounded-full text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
                  >
                    切「{s}」
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="shrink-0 w-[260px] h-[120px] rounded-lg bg-[#F8F7F4] border border-[#EEECE6] flex flex-col items-center justify-center text-center">
            <div className="text-[11px] text-[#9A9890]">預估金額（含稅）</div>
            <div className="text-[24px] font-semibold text-[#1A3A5C] font-mono">
              NT${Number(ro.estimated_subtotal ?? 0).toLocaleString()}
            </div>
            <div className="text-[11px] text-[#9A9890] mt-1">
              預估 LU {Number(ro.estimated_labor_units ?? 0).toFixed(1)}
            </div>
          </div>
        </div>
      </header>

      {/* 主/側二欄：左主資訊 / 右側 SA 狀態時程（M03-3 spec） */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr,320px] gap-3">
        <div className="space-y-3 min-w-0">
      {/* 基本資料 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 基本資料</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="車主姓名" value={ro.customer_name} />
          <Kv label="聯絡電話" value={ro.customer_phone} mono />
          <Kv label="開單日期" value={ro.issue_date} />
          <Kv label="車型" value={ro.vehicle_model_name} />
          <Kv label="車牌號碼" value={ro.vehicle_license_plate} mono />
          <Kv
            label="進廠里程"
            value={ro.mileage_in != null ? `${ro.mileage_in.toLocaleString()} km` : null}
            mono
          />
        </div>
      </section>

      {/* 事故 / 維修現場照片 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 維修現場照片</span>
          <span className="text-[11px] text-[#9A9890] ml-2">最多 20 張，建議拍車體損傷、零件異常、保固爭議現場存證</span>
        </header>
        <div className="px-4 py-4">
          <EntityImageGallery
            entity="repair-order"
            entityId={ro.id}
            images={ro.images ?? []}
            alt={`${ro.ro_code} 維修現場照片`}
            canEdit={canEdit}
            width={420}
            height={280}
            maxImages={20}
            emptyHint="尚未上傳照片"
          />
        </div>
      </section>

      {/* 保固狀態 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 保固快照（開單時點）</span>
        </header>
        <div className="px-4 py-3">
          <div
            className={`rounded px-3 py-2 text-[12px] ${
              warrantyValid
                ? "bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
                : "bg-[#F2F2F2] text-[#6B6A68] border border-[#E0DFDB]"
            }`}
          >
            🛡 保固狀態：
            <b>{warrantyValid ? "有效" : "無 / 已過期"}</b>
            {warranty.expires_at ? <span> · 到期：{String(warranty.expires_at)}</span> : null}
            {warranty.mileage_limit ? <span> · 里程限制：{String(warranty.mileage_limit)}</span> : null}
          </div>
        </div>
      </section>

      {/* 工單分類 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 工單分類 / 會計軸</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv label="業務類型 (P1)" value={ro.prefix_p1} />
          <Kv label="付款性質 (P2)" value={ro.prefix_p2} />
          <Kv label="會計類別" value={accountingCategory ?? "—"} />
          <Kv label="驗證結論" value={verdict ?? "—"} />
          <Kv
            label="主管簽核"
            value={
              supervisorApproval?.required
                ? supervisorApproval.approved_at
                  ? `已核准 ${supervisorApproval.approved_at}`
                  : "尚未核准"
                : "免簽"
            }
          />
          <Kv label="開單時間" value={ro.opened_at ? fmtTaipeiDateTime(ro.opened_at) : null} />
        </div>
      </section>

      {/* 串接資訊 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 上下游串接</span>
        </header>
        <div className="px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3">
          <Kv
            label="來源預約"
            value={
              ro.appointment_id ? (
                <Link
                  className="text-[#185FA5] hover:underline"
                  href={`/parts/aftersales/appointments/${ro.appointment_id}`}
                >
                  appointment {ro.appointment_id.slice(0, 8)}…
                </Link>
              ) : null
            }
          />
          <Kv label="來源預檢單" value={ro.pre_inspection_id ? ro.pre_inspection_id.slice(0, 8) + "…" : null} />
          <Kv label="關單時間" value={ro.closed_at ? fmtTaipeiDateTime(ro.closed_at) : null} />
        </div>
      </section>

      {/* 子模組入口 — 04~08 全部串接 */}
      <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
        <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
          <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 子模組流程</span>
        </header>
        <div className="px-4 py-3 flex flex-wrap gap-2">
          {/* 03 維修項目 / PDI / 整備 */}
          {ro.prefix_p1 === "PD" && ro.related_used_car_id ? (
            <Link
              href={`/parts/aftersales/workorders/recon/${ro.id}`}
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
            >
              🔧 整備工單（24 項）→
            </Link>
          ) : ro.prefix_p1 === "PD" ? (
            <Link
              href={`/parts/aftersales/workorders/pdi/${ro.id}`}
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-[#0F6E56] text-white hover:bg-[#0a5742] shadow-sm"
            >
              🔧 PDI 整備（30 項）→
            </Link>
          ) : (
            <Link
              href={`/parts/aftersales/repair-orders/${ro.id}/lines`}
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-[#1A3A5C] text-white hover:bg-[#0F2A45] shadow-sm"
            >
              🔧 03 維修項目明細 →
            </Link>
          )}

          {/* 04 追加項目（filtered by ro_id） */}
          <Link
            href={`/parts/aftersales/addons?ro_id=${ro.id}`}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            ➕ 04 追加項目 →
          </Link>

          {/* 06 竣工複檢 */}
          <Link
            href={`/parts/aftersales/final-inspections?ro_id=${ro.id}`}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            🔍 06 竣工複檢 →
          </Link>

          {/* 08 結帳收款 */}
          <Link
            href={`/parts/aftersales/checkout?ro_id=${ro.id}`}
            className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] shadow-sm"
          >
            💳 08 結帳收款 →
          </Link>

          {/* 主管授權（RP5）— 僅在有授權申請時顯示 */}
          {supervisorApproval?.required === true && (
            <Link
              href={`/parts/aftersales/approvals/${ro.id}`}
              className="h-[30px] px-4 rounded-full text-[12px] inline-flex items-center bg-[#FDF3E3] border border-[#F0C97E] text-[#854F0B] hover:bg-[#fce9c5] shadow-sm"
            >
              📋 主管授權記錄 →
            </Link>
          )}
        </div>
      </section>
        </div>

        {/* 右側欄：SA / 狀態時程 / 派工資訊 */}
        <aside className="space-y-3">
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 服務顧問 (SA)</span>
            </header>
            <div className="px-4 py-3 space-y-2 text-[12.5px]">
              <Kv label="SA 名" value={ro.sa_name} />
              <Kv label="主修技師" value={ro.lead_technician_name} />
            </div>
          </section>

          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 狀態摘要</span>
              {canEdit && (
                <span className="text-[10px] text-[#9A9890]">點各階段「📲 通知車主」即時推播</span>
              )}
            </header>
            <div className="px-4 py-3">
              <ol className="relative border-l-2 border-[#EEECE6] ml-2 space-y-3">
                <TimelineStep
                  done={!!ro.opened_at}
                  label="已開單受理"
                  time={ro.opened_at ? fmtTaipeiDateTime(ro.opened_at) : null}
                  onNotify={canEdit ? () => notifyStage("已開單受理") : undefined}
                  notifying={isPending}
                />
                <TimelineStep
                  done={ro.status === "維修中" || ro.status === "待結帳" || ro.status === "已關單"}
                  label="進廠維修中"
                  time={null}
                  onNotify={canEdit ? () => notifyStage("進廠維修中") : undefined}
                  notifying={isPending}
                />
                <TimelineStep
                  done={ro.status === "待結帳" || ro.status === "已關單"}
                  label="維修完成・待結帳"
                  time={null}
                  onNotify={canEdit ? () => notifyStage("維修完成・可結帳取車") : undefined}
                  notifying={isPending}
                />
                <TimelineStep
                  done={ro.status === "已關單"}
                  label="完工關單"
                  time={ro.closed_at ? fmtTaipeiDateTime(ro.closed_at) : null}
                  cancelled={ro.status === "已取消"}
                  onNotify={canEdit ? () => notifyStage("完工・感謝您的惠顧") : undefined}
                  notifying={isPending}
                />
              </ol>
            </div>
          </section>

          {/* RP4 層二：工單事件時間軸（append-only 稽核紀錄）*/}
          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4] flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 事件時間軸（稽核紀錄）</span>
              <span className="text-[10px] text-[#9A9890]">
                {roEvents.length} 筆 · append-only（repair_order_events）
              </span>
            </header>
            <div className="px-4 py-3">
              {roEvents.length === 0 ? (
                <p className="text-[12px] text-[#9A9890]">尚無事件記錄（新動作執行後自動追加）</p>
              ) : (
                <ol className="relative border-l-2 border-[#EEECE6] ml-2 space-y-3">
                  {roEvents.map((ev, idx) => (
                    <li key={idx} className="ml-3 pl-3 relative">
                      <span
                        className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 ${roEventDotColor(ev)}`}
                      />
                      <div className="text-[12.5px] text-[#2C2C2A] font-medium leading-snug">
                        {roEventLabel(ev)}
                      </div>
                      <div className="text-[11px] text-[#9A9890] font-mono">
                        {fmtTaipeiDateTime(ev.at)}
                        {ev.actor_id && (
                          <span className="ml-2 text-[#D5D3CB]">uid:{ev.actor_id.slice(0, 8)}…</span>
                        )}
                      </div>
                      {/* 拒絕原因、退回原因等次要資訊 */}
                      {ev.action === "addon_decision" && (ev.payload as { rejection_reason?: string })?.rejection_reason && (
                        <div className="text-[11px] text-[#9A9890] mt-0.5">
                          拒絕原因：{(ev.payload as { rejection_reason?: string }).rejection_reason}
                        </div>
                      )}
                      {ev.action === "final_inspection_rejected" && (ev.payload as { reason?: string })?.reason && (
                        <div className="text-[11px] text-[#9A9890] mt-0.5">
                          退回原因：{(ev.payload as { reason?: string }).reason}
                        </div>
                      )}
                      {ev.action === "status_changed" && (ev.payload as { reason?: string })?.reason && (
                        <div className="text-[11px] text-[#9A9890] mt-0.5">
                          原因：{(ev.payload as { reason?: string }).reason}
                        </div>
                      )}
                      {ev.action === "contact_attempt" && (ev.payload as { notes?: string })?.notes && (
                        <div className="text-[11px] text-[#9A9890] mt-0.5">
                          備註：{(ev.payload as { notes?: string }).notes}
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>

          <section className="bg-white border border-[#EEECE6] rounded-lg overflow-hidden">
            <header className="px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <span className="text-[13px] font-semibold text-[#2C2C2A]">▼ 金額快覽</span>
            </header>
            <div className="px-4 py-3 space-y-2 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-[#5A5955]">明細小計</span>
                <span className="font-mono">NT${Number(ro.lines_subtotal ?? 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#5A5955]">含稅總計</span>
                <span className="font-mono font-semibold text-[#1A3A5C]">
                  NT${Number(ro.lines_total ?? 0).toLocaleString()}
                </span>
              </div>
              <Link
                href={`/parts/aftersales/repair-orders/${ro.id}/lines`}
                className="block text-center mt-2 h-[28px] leading-[28px] rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
              >
                查看明細 →
              </Link>
            </div>
          </section>
        </aside>
      </div>

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

      {/* 狀態切換確認 modal（M03-3 spec：狀態變更需確認） */}
      {pendingStatus && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={() => !isPending && setPendingStatus(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-[420px] max-w-[90vw] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#F8F7F4]">
              <div className="text-[13px] font-semibold text-[#2C2C2A]">確認狀態變更</div>
            </header>
            <div className="px-4 py-4 space-y-3 text-[12.5px] text-[#2C2C2A]">
              <p>
                即將把工單{" "}
                <span className="font-mono font-semibold text-[#1A3A5C]">{ro.ro_code}</span>{" "}
                狀態切換為：
              </p>
              <div className="flex items-center gap-2 justify-center py-2">
                <span
                  className={`inline-flex px-2.5 py-1 rounded-md text-[12px] font-medium ${statusBadge(ro.status)}`}
                >
                  {ro.status}
                </span>
                <span className="text-[#9A9890]">→</span>
                <span
                  className={`inline-flex px-2.5 py-1 rounded-md text-[12px] font-medium ${statusBadge(pendingStatus)}`}
                >
                  {pendingStatus}
                </span>
              </div>
              {pendingStatus === "待結帳" && (
                <p className="text-[11.5px] text-[#854F0B] bg-[#FDF3E3] border border-[#F0C97E] rounded px-2 py-1.5">
                  ⚠️ 切到「待結帳」代表維修已完成，請先確認工項 / 零件明細齊全。
                </p>
              )}
              {pendingStatus === "已關單" && (
                <p className="text-[11.5px] text-[#3B6D11] bg-[#EAF3DE] border border-[#C5DC9F] rounded px-2 py-1.5">
                  關單後僅可查閱，金額與項目將無法再修改。
                </p>
              )}
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingStatus(null)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmStatus}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#1A3A5C] text-white hover:bg-[#0F2A45] disabled:opacity-60"
              >
                {isPending ? "切換中⋯" : "確認切換"}
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* RP5 中途取消授權 Modal */}
      {cancelApprovalModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !isPending && setCancelApprovalModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-[480px] max-w-[90vw] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#FDF3E3] flex items-center gap-2">
              <span className="text-[16px]">⚠️</span>
              <div className="text-[13px] font-semibold text-[#854F0B]">
                申請中途取消授權（RP5）
              </div>
              <span className="ml-auto text-[10px] text-[#854F0B] font-mono">{ro.ro_code}</span>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955]">
                中途取消工單需主管授權。送出申請後，工單狀態保持不變，主管核准後才可執行取消。
              </p>
              <div className="bg-[#FDF3E3] border border-[#F0C97E] rounded px-3 py-2 text-[12px] text-[#854F0B]">
                ⚠️ 核准後請在「狀態快切」選「已關閉-中途取消」完成最終取消。
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] text-[#9A9890] font-medium">
                  取消原因（稽核必填）
                </label>
                <textarea
                  value={cancelApprovalNotes}
                  onChange={(e) => setCancelApprovalNotes(e.target.value)}
                  rows={3}
                  placeholder="例：客戶因個人因素要求中止維修，車輛已取回，費用已協商…"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none"
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelApprovalModal(false)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={doCancelApprovalRequest}
                disabled={isPending || !cancelApprovalNotes.trim()}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#854F0B] text-white hover:bg-[#6b3f08] disabled:opacity-50"
              >
                {isPending ? "送出中⋯" : "送出申請"}
              </button>
            </footer>
          </div>
        </div>
      )}
      {/* B5-02 聯繫嘗試記錄 Modal */}
      {contactModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => !isPending && setContactModal(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-[#EEECE6] w-[440px] max-w-[90vw] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-3 border-b border-[#EEECE6] bg-[#EAF4FB] flex items-center gap-2">
              <span className="text-[16px]">📞</span>
              <div className="text-[13px] font-semibold text-[#185FA5]">記錄聯繫嘗試（B5-02）</div>
              <span className="ml-auto text-[10px] text-[#185FA5] font-mono">{ro.ro_code}</span>
            </header>
            <div className="px-4 py-4 space-y-3">
              <p className="text-[12.5px] text-[#5A5955]">
                記錄 SA 與車主的聯繫嘗試，僅追加稽核記錄，不改變工單狀態。
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">聯繫方式</label>
                  <select
                    value={contactMethod}
                    onChange={(e) => setContactMethod(e.target.value as ContactAttemptInput["contact_method"])}
                    className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
                  >
                    <option value="電話">電話</option>
                    <option value="LINE">LINE</option>
                    <option value="簡訊">簡訊</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-[#9A9890] font-medium">聯繫結果</label>
                  <select
                    value={contactResult}
                    onChange={(e) => setContactResult(e.target.value as ContactAttemptInput["contact_result"])}
                    className="w-full h-[32px] border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none bg-white"
                  >
                    <option value="接通">接通</option>
                    <option value="未接">未接</option>
                    <option value="留言">留言</option>
                    <option value="回覆">回覆</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-[#9A9890] font-medium">備註（選填）</label>
                <textarea
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                  rows={2}
                  placeholder="例：已告知待料，預計明後天取車…"
                  className="w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none resize-none"
                />
              </div>
            </div>
            <footer className="px-4 py-3 border-t border-[#EEECE6] bg-[#F8F7F4] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setContactModal(false)}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] disabled:opacity-50"
              >
                取消
              </button>
              <button
                type="button"
                onClick={doRecordContact}
                disabled={isPending}
                className="h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#185FA5] text-white hover:bg-[#0d4a8b] disabled:opacity-50"
              >
                {isPending ? "記錄中⋯" : "確認記錄"}
              </button>
            </footer>
          </div>
        </div>
      )}
    </main>
  );
}

function TimelineStep({
  done,
  label,
  time,
  cancelled,
  onNotify,
  notifying,
}: {
  done: boolean;
  label: string;
  time: string | null;
  cancelled?: boolean;
  onNotify?: () => void;
  notifying?: boolean;
}) {
  const dotCls = cancelled
    ? "bg-[#F2F2F2] border-[#9A9890]"
    : done
      ? "bg-[#3B6D11] border-[#3B6D11]"
      : "bg-white border-[#D5D3CB]";
  const labelCls = cancelled
    ? "text-[#9A9890] line-through"
    : done
      ? "text-[#2C2C2A] font-medium"
      : "text-[#9A9890]";
  return (
    <li className="ml-3 pl-3 relative">
      <span
        className={`absolute -left-[7px] top-1 w-3 h-3 rounded-full border-2 ${dotCls}`}
      />
      <div className="flex items-center justify-between gap-2">
        <div className={`text-[12.5px] ${labelCls}`}>{label}</div>
        {onNotify && !cancelled && (
          <button
            type="button"
            onClick={onNotify}
            disabled={notifying}
            className="shrink-0 h-[22px] px-2 rounded-full text-[10.5px] bg-white border border-[#D5D3CB] text-[#185FA5] hover:border-[#185FA5] disabled:opacity-50"
            title="即時推播此階段進度給車主（LINE）"
          >
            📲 通知車主
          </button>
        )}
      </div>
      {time && <div className="text-[11px] text-[#9A9890] font-mono">{time}</div>}
    </li>
  );
}
