"use client";

/**
 * P-08 客戶部門私房欄位區段 — 給 customer detail page 用。
 *
 * 渲染條件由 server 端 [src/domain/customer-private.ts] 控制：
 *   - 沒權限 → 傳 null 進來 → 直接不渲染（看不到區段卡）
 *   - 有權限 → 顯示對應 section（sales / service）
 *
 * 編輯走 [src/lib/customer-private/actions.ts] 的 upsert action，
 * UI 行為符合 CLAUDE.md §UX 互動規範（pending 鎖 + spinner + banner）。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  upsertSalesPrivateAction,
  upsertServicePrivateAction,
} from "@/lib/customer-private/actions";
import type { SalesPrivate, ServicePrivate } from "@/domain/customer-private";

type Banner = { ok: boolean; msg: string } | null;

const cardCls =
  "bg-white border border-[#EEECE6] rounded-lg overflow-hidden";
const headerCls = "px-4 py-2.5 border-b border-[#EEECE6] bg-[#F8F7F4]";
const bodyCls = "px-4 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-3";
const labelCls = "block text-[11px] text-[#9A9890] font-medium mb-1";
const inputCls =
  "h-[30px] w-full border border-[#D5D3CB] rounded px-2 text-[12.5px] focus:border-[#185FA5] outline-none";
const textareaCls =
  "w-full border border-[#D5D3CB] rounded px-2 py-1.5 text-[12.5px] focus:border-[#185FA5] outline-none min-h-[60px]";
const btnGreen =
  "h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-[#0F6E56] text-white hover:bg-[#0a5742] disabled:opacity-60";
const btnWhite =
  "h-[30px] px-3.5 rounded text-[12.5px] font-medium bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]";

function bannerCls(ok: boolean): string {
  return ok
    ? "fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 bg-[#EAF3DE] text-[#3B6D11] border border-[#C5DC9F]"
    : "fixed bottom-6 right-6 px-4 py-2 rounded shadow-lg text-[13px] z-50 bg-[#FDECEA] text-[#CC0000] border border-[#F5AEAD]";
}

// ──────────────────────────────────────────────────────────────────────────
// Sales private section
// ──────────────────────────────────────────────────────────────────────────

type SalesPrivateSectionProps = {
  customerId: string;
  initial: SalesPrivate | null;
  canEdit: boolean;
};

export function SalesPrivateSection({
  customerId,
  initial,
  canEdit,
}: SalesPrivateSectionProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [creditLimit, setCreditLimit] = useState<string>(
    initial?.credit_limit !== null && initial?.credit_limit !== undefined
      ? String(initial.credit_limit)
      : "",
  );
  const [salesNotes, setSalesNotes] = useState<string>(
    initial?.sales_notes ?? "",
  );

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function onSave() {
    const cl = creditLimit.trim() === "" ? null : Number(creditLimit);
    if (cl !== null && !Number.isFinite(cl)) {
      showBanner({ ok: false, msg: "授信額度必須為數字" });
      return;
    }
    startTransition(async () => {
      const res = await upsertSalesPrivateAction(customerId, {
        credit_limit: cl,
        sales_notes: salesNotes.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存銷售私房欄位" });
        setEditing(false);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function onCancel() {
    setCreditLimit(
      initial?.credit_limit !== null && initial?.credit_limit !== undefined
        ? String(initial.credit_limit)
        : "",
    );
    setSalesNotes(initial?.sales_notes ?? "");
    setEditing(false);
  }

  return (
    <>
      <section
        className={`${cardCls} ${pending ? "pointer-events-none opacity-60" : ""}`}
      >
        <header
          className={`${headerCls} flex items-center justify-between gap-3`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ 銷售私房資料
            </span>
            <span className="px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#FDECEA] text-[#CC0000]">
              P-08 銷售部門可見
            </span>
          </div>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </button>
          )}
          {editing && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onSave}
                disabled={pending}
                className={btnGreen}
              >
                {pending ? "儲存中⋯" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={pending}
                className={btnWhite}
              >
                取消
              </button>
            </div>
          )}
        </header>
        <div className={bodyCls}>
          <div>
            <label className={labelCls}>授信額度（credit_limit）</label>
            {editing ? (
              <input
                type="number"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                placeholder="不限"
                className={inputCls}
              />
            ) : (
              <span className="text-[12.5px] text-[#2C2C2A] font-mono">
                {initial?.credit_limit !== null &&
                initial?.credit_limit !== undefined
                  ? `NT$ ${Number(initial.credit_limit).toLocaleString()}`
                  : "—"}
              </span>
            )}
          </div>
          <div className="md:col-span-2">
            <label className={labelCls}>業務私人 note（sales_notes）</label>
            {editing ? (
              <textarea
                value={salesNotes}
                onChange={(e) => setSalesNotes(e.target.value)}
                placeholder="折扣談判、特殊偏好、競品比較⋯"
                className={textareaCls}
              />
            ) : (
              <span className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap leading-relaxed">
                {initial?.sales_notes || "—"}
              </span>
            )}
          </div>
        </div>
      </section>
      {banner && <div className={bannerCls(banner.ok)}>{banner.msg}</div>}
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Service private section
// ──────────────────────────────────────────────────────────────────────────

type ServicePrivateSectionProps = {
  customerId: string;
  initial: ServicePrivate | null;
  canEdit: boolean;
};

export function ServicePrivateSection({
  customerId,
  initial,
  canEdit,
}: ServicePrivateSectionProps) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();
  const [banner, setBanner] = useState<Banner>(null);
  const [healthNotes, setHealthNotes] = useState<string>(
    initial?.health_notes ?? "",
  );
  const [serviceNotes, setServiceNotes] = useState<string>(
    initial?.service_notes ?? "",
  );

  function showBanner(b: Banner) {
    setBanner(b);
    if (b?.ok) setTimeout(() => setBanner(null), 2200);
  }

  function onSave() {
    startTransition(async () => {
      const res = await upsertServicePrivateAction(customerId, {
        health_notes: healthNotes.trim() || null,
        service_notes: serviceNotes.trim() || null,
      });
      if (res.ok) {
        showBanner({ ok: true, msg: "✓ 已儲存售後私房欄位" });
        setEditing(false);
        router.refresh();
      } else {
        showBanner({ ok: false, msg: res.error });
      }
    });
  }

  function onCancel() {
    setHealthNotes(initial?.health_notes ?? "");
    setServiceNotes(initial?.service_notes ?? "");
    setEditing(false);
  }

  const complaintCount = Array.isArray(initial?.complaint_history)
    ? initial!.complaint_history.length
    : 0;

  return (
    <>
      <section
        className={`${cardCls} ${pending ? "pointer-events-none opacity-60" : ""}`}
      >
        <header
          className={`${headerCls} flex items-center justify-between gap-3`}
        >
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[#2C2C2A]">
              ▼ 售後私房資料
            </span>
            <span className="px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-[#EAF4FB] text-[#185FA5]">
              P-08 售後部門可見
            </span>
          </div>
          {canEdit && !editing && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890]"
            >
              編輯
            </button>
          )}
          {editing && (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onSave}
                disabled={pending}
                className={btnGreen}
              >
                {pending ? "儲存中⋯" : "儲存變更"}
              </button>
              <button
                type="button"
                onClick={onCancel}
                disabled={pending}
                className={btnWhite}
              >
                取消
              </button>
            </div>
          )}
        </header>
        <div className={bodyCls}>
          <div className="md:col-span-2">
            <label className={labelCls}>
              健康 / 敏感狀況（health_notes）
            </label>
            {editing ? (
              <textarea
                value={healthNotes}
                onChange={(e) => setHealthNotes(e.target.value)}
                placeholder="過敏、疾病、行動不便等接待注意事項"
                className={textareaCls}
              />
            ) : (
              <span className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap leading-relaxed">
                {initial?.health_notes || "—"}
              </span>
            )}
          </div>
          <div>
            <label className={labelCls}>客訴紀錄</label>
            <span className="text-[12.5px] text-[#2C2C2A] font-mono">
              {complaintCount > 0 ? `${complaintCount} 筆` : "—"}
            </span>
          </div>
          <div className="md:col-span-3">
            <label className={labelCls}>售後私人 note（service_notes）</label>
            {editing ? (
              <textarea
                value={serviceNotes}
                onChange={(e) => setServiceNotes(e.target.value)}
                placeholder="保養偏好、技師備註、服務歷史⋯"
                className={textareaCls}
              />
            ) : (
              <span className="text-[12.5px] text-[#2C2C2A] whitespace-pre-wrap leading-relaxed">
                {initial?.service_notes || "—"}
              </span>
            )}
          </div>
        </div>
      </section>
      {banner && <div className={bannerCls(banner.ok)}>{banner.msg}</div>}
    </>
  );
}
