"use server";

/**
 * Server actions — ro_checkouts
 *
 * Spec：08_結帳收款.html (4-step wizard)
 *  - createFromRoAction：從 RO 建立結帳（自動帶 fee_summary）
 *  - confirmFeesAction（step1）
 *  - applyDiscountAction（step1：折扣）
 *  - signAction / clearSignAction（step2）
 *  - confirmPaymentAction（step3：method + invoice）
 *  - completeAction（step4：關 RO）
 *  - markReceiptPrintedAction
 *  - deleteAction
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { createFollowUpTask } from "@/domain/sales-call-tasks";
// RP2：簽名上傳 Storage + 主管解鎖
import { uploadSignatureDataUrl, isStorageUrl } from "@/lib/aftersales/signature-upload";
import { getCurrentUserDepartment } from "@/lib/rbac/department";

// 包F：下次保養提醒參數（里程 +6000km / 時間 +6 個月，提前 5 個月建 CRM 回訪）
// TODO: 從 brand_config 或 business_rules 表動態讀取（不同品牌/業務類型的保養里程週期不同）
const NEXT_SERVICE_INTERVAL_KM = 6000;
const NEXT_SERVICE_INTERVAL_MONTHS = 6;
const NEXT_SERVICE_REMINDER_DAYS = 150;

import {
  applyDiscount,
  buildCheckoutNo,
  buildFeeSummary,
  type CustomerSignature,
  type FeeSummary,
  type Invoice,
  type Payment,
  type PaymentMethod,
  type InvoiceKind,
} from "@/domain/ro-checkouts.constants";
import { loadFeeSourceForRo } from "@/domain/ro-checkouts";
import { pickForRepairOrderAddon } from "@/domain/issues";
import { appendRepairOrderEvent } from "@/domain/repair-orders";
import {
  requestApproval,
  hasApprovedApproval,
} from "@/domain/aftersales-approvals";
// RP4 Layer1 稽核日誌
import { writeAuditLog } from "@/domain/audit-logs";
// RP8 站內通知
import { createInappNotification } from "@/domain/user-notifications";
// RP4 Layer3：關單時持久化結帳憑證 PDF
import { persistRepairOrderPdf } from "@/domain/ro-documents";

export type ActionResult<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

const PAGE = "/parts/aftersales/checkout";

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
function todayInTaipei(): { yymmdd: string; iso: string } {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = pad(tz.getMonth() + 1);
  const day = pad(tz.getDate());
  return { yymmdd: `${String(y).slice(2)}${m}${day}`, iso: `${y}-${m}-${day}` };
}

async function nextSequenceFor(brand: string, yymmdd: string): Promise<number> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ro_checkouts")
    .select("checkout_no")
    .eq("brand_id", brand)
    .like("checkout_no", `CK-${yymmdd}-%`);
  if (error) throw error;
  const max = ((data ?? []) as { checkout_no: string }[])
    .map((r) => parseInt(r.checkout_no.split("-").pop() ?? "0", 10))
    .reduce((a, b) => Math.max(a, b), 0);
  return max + 1;
}

async function loadById(id: string) {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("ro_checkouts")
    .select("*")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error || !data) return { ok: false as const, error: "找不到結帳單" };
  return { ok: true as const, brand, row: data };
}

/* ──────────────── create ──────────────── */

export async function createFromRoAction(roId: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("id, brand_id, ro_code, status")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr || !ro) return { ok: false, error: "找不到工單" };

  const { data: existed } = await supabase
    .from("ro_checkouts")
    .select("id")
    .eq("repair_order_id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (existed) return { ok: false, error: "此工單已建立結帳單，請直接開啟" };

  const { lines, addons } = await loadFeeSourceForRo(roId);
  const feeSummary = buildFeeSummary(lines, addons);

  const { yymmdd } = todayInTaipei();
  const seq = await nextSequenceFor(brand, yymmdd);
  const checkout_no = buildCheckoutNo(yymmdd, seq);

  const { data: ck, error: ckErr } = await supabase
    .from("ro_checkouts")
    .insert({
      brand_id: brand,
      repair_order_id: roId,
      checkout_no,
      status: "in_progress",
      fee_summary: feeSummary,
      customer_signature: {},
      payment: {},
      invoice: {},
    })
    .select("id")
    .single();
  if (ckErr || !ck) return { ok: false, error: ckErr?.message ?? "建立失敗" };

  revalidatePath(PAGE);
  revalidatePath(`${PAGE}/${ck.id}`);
  return { ok: true, data: { id: ck.id } };
}

/* ──────────────── step 1: 費用 ──────────────── */

export async function refreshFeeSummaryAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status !== "in_progress") return { ok: false, error: "已超過費用確認階段，無法重新計算" };

  const { lines, addons } = await loadFeeSourceForRo(ctx.row.repair_order_id);
  const fresh = buildFeeSummary(lines, addons);
  const previous = (ctx.row.fee_summary ?? {}) as FeeSummary;
  const merged = applyDiscount(fresh, previous.discount_pct ?? 0);

  const supabase = await createClient();
  const { error } = await supabase
    .from("ro_checkouts")
    .update({ fee_summary: merged, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

/**
 * RP5 折扣上限查詢 — 查此 brand 的 discount_authority 規則，
 * 回傳 SA 角色的 max_overall_pct（若無設定回 null = 不限）。
 * 目前以最保守的有設定值為 SA 上限（POC 階段）。
 */
async function getSaDiscountLimit(brand: string): Promise<number | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("business_rules")
    .select("config")
    .eq("brand_id", brand)
    .eq("rule_kind", "discount_authority")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  if (!data || data.length === 0) return null;

  // 取所有設有 max_overall_pct 的規則中最嚴格者（最低值）作為 SA 上限
  const limits = (data as Array<{ config: Record<string, unknown> }>)
    .map((r) => {
      const cfg = r.config as { max_overall_pct?: number | null; role_label?: string };
      return cfg.max_overall_pct;
    })
    .filter((v): v is number => typeof v === "number" && v >= 0);
  if (limits.length === 0) return null;
  // 找最小值（最嚴格的 SA 上限）
  return Math.min(...limits);
}

export async function applyDiscountAction(
  id: string,
  pct: number,
  /** RP5: 申請說明（呼叫方可選填，超限送審時帶入 requestApproval.notes） */
  approvalNotes?: string | null,
): Promise<ActionResult<{ id: string; approval_required?: boolean; approval_id?: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status !== "in_progress") return { ok: false, error: "已二簽後不可改折扣" };

  const supabase = await createClient();
  const brand = ctx.brand;
  const roId = ctx.row.repair_order_id as string;
  const summary = (ctx.row.fee_summary ?? {}) as FeeSummary;

  // ── RP5 折扣授權檢查 ──
  // pct > 0 時查 SA 折扣上限；若超限且無已批准的授權，改走送審流程
  if (pct > 0) {
    const saLimit = await getSaDiscountLimit(brand);
    if (saLimit !== null && pct > saLimit) {
      // 檢查是否已有核准的 discount_exceed 授權
      const alreadyApproved = await hasApprovedApproval(roId, "discount_exceed");
      if (!alreadyApproved) {
        // 送審：requestApproval（若已有 pending 會回 error 提示不重複送）
        const approvalRes = await requestApproval({
          ro_id: roId,
          scenario: "discount_exceed",
          notes: approvalNotes?.trim() || `SA 申請 ${pct}% 折扣，超出授權上限 ${saLimit}%`,
          context: {
            requested_pct: pct,
            sa_limit_pct: saLimit,
            checkout_id: id,
          },
        });
        if (!approvalRes.ok) {
          // 若已有 pending，給友善提示
          return {
            ok: false,
            error: approvalRes.error,
          };
        }
        // 送審成功 → 回 approval_required，UI 顯示「已送主管審批」
        return {
          ok: true,
          data: {
            id,
            approval_required: true,
            approval_id: approvalRes.data.approval_id,
          },
        };
      }
      // 已有核准 → 記錄在 payload（稽核可見）
    }
  }

  // ── 正常套用折扣 ──
  const next = applyDiscount(summary, pct);
  const { error } = await supabase
    .from("ro_checkouts")
    .update({ fee_summary: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // ── RP4 事件時間軸 + 稽核日誌：記錄折扣變更（非阻塞） ──
  {
    const {
      data: { user: _discountUser },
    } = await supabase.auth.getUser();
    const discountActorId = _discountUser?.id ?? null;
    const prevPct = (summary as FeeSummary).discount_pct ?? 0;
    after(async () => {
      const approved = pct > 0 ? await hasApprovedApproval(roId, "discount_exceed") : false;
      await appendRepairOrderEvent(
        roId,
        {
          action: "discount_applied",
          payload: {
            checkout_id: id,
            discount_pct_before: prevPct,
            discount_pct_after: pct,
            payable: next.payable ?? null,
            approved,
          },
        },
        discountActorId,
      );
      // RP4 Layer1：寫稽核日誌
      await writeAuditLog({
        table_name: "ro_checkouts",
        record_id: id,
        action: "discount_applied",
        actor_id: discountActorId,
        brand_id: brand,
        before: { discount_pct: prevPct },
        after: { discount_pct: pct, payable: next.payable ?? null, approved },
      });
    });
  }

  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

export async function confirmFeesAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const summary = (ctx.row.fee_summary ?? {}) as FeeSummary;
  if (!summary.payable && summary.payable !== 0) {
    return { ok: false, error: "費用尚未計算，請先重新計算費用" };
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("ro_checkouts")
    .update({
      fee_summary: { ...summary, customer_no_dispute: true },
      fees_confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

/* ──────────────── step 2: 簽名 ──────────────── */

export async function signAction(
  id: string,
  payload: {
    signature_text: string;
    customer_name?: string;
    /** RP2：前端傳 JPEG base64 dataURL；server 端上傳 Storage 回 URL */
    screenshot_url?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (!ctx.row.fees_confirmed_at) {
    return { ok: false, error: "請先在 step1 確認費用明細" };
  }

  // RP2：若是 dataURL（base64），上傳 Storage；已是 URL 則直接用
  let screenshotUrl: string | null = null;
  if (payload.screenshot_url) {
    if (isStorageUrl(payload.screenshot_url)) {
      screenshotUrl = payload.screenshot_url;
    } else {
      screenshotUrl = await uploadSignatureDataUrl(
        payload.screenshot_url,
        ctx.brand,
        "ro-checkout",
        id,
        "customer",
      );
    }
  }

  const sig: CustomerSignature = {
    signature_text: payload.signature_text,
    customer_name: payload.customer_name,
    signed_at: new Date().toISOString(),
    screenshot_url: screenshotUrl,
  };
  const supabase = await createClient();
  // RP2 鎖定：簽名後費用明細設 signed_locked=true（metadata），UI 讀此欄位決定唯讀
  const prevMeta = (ctx.row.metadata ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("ro_checkouts")
    .update({
      customer_signature: sig,
      status: "signed",
      metadata: { ...prevMeta, sig_locked: true },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

/**
 * RP2 主管解鎖：clearSignAction 需要：
 * 1. 主管權限（is_dept_manager / is_cross_admin）或 RO_APPROVE
 * 2. 必填原因（reason）
 * 3. 寫入 repair_order_events 記錄（稽核）
 * 4. 解鎖後前端強制重新簽名
 */
export async function clearSignAction(
  id: string,
  payload: { reason: string },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status !== "signed") return { ok: false, error: "已收款後不可清除簽名" };

  // RP2：主管解鎖 gate
  const dept = await getCurrentUserDepartment();
  const isSupervisor = dept.is_dept_manager || dept.is_cross_admin;
  if (!isSupervisor) {
    return { ok: false, error: "清除簽名需要主管授權（售後主管、店長或管理員）" };
  }
  if (!payload.reason?.trim()) {
    return { ok: false, error: "請填寫解鎖原因（稽核記錄）" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const actorId = user?.id ?? null;

  const prevMeta = (ctx.row.metadata ?? {}) as Record<string, unknown>;
  const { error } = await supabase
    .from("ro_checkouts")
    .update({
      customer_signature: {},
      status: "in_progress",
      metadata: {
        ...prevMeta,
        sig_locked: false,
        sig_unlock_history: [
          ...((prevMeta.sig_unlock_history as unknown[]) ?? []),
          {
            unlocked_at: new Date().toISOString(),
            unlocked_by: actorId,
            reason: payload.reason.trim(),
          },
        ],
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // RP2 + RP4：稽核事件（非阻塞）
  const roId = ctx.row.repair_order_id as string;
  after(async () => {
    await appendRepairOrderEvent(
      roId,
      {
        action: "checkout_sig_cleared",
        payload: {
          checkout_id: id,
          reason: payload.reason.trim(),
          cleared_by: actorId,
        },
      },
      actorId,
    );
    // RP4 Layer1：寫稽核日誌（主管解鎖簽名）
    await writeAuditLog({
      table_name: "ro_checkouts",
      record_id: id,
      action: "checkout_sig_cleared",
      actor_id: actorId,
      brand_id: ctx.brand,
      before: { status: "signed" },
      after: { status: "in_progress", reason: payload.reason.trim() },
    });
  });

  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

/* ──────────────── step 3: 收款 + 發票 ──────────────── */

export async function confirmPaymentAction(
  id: string,
  payload: {
    payment_method: PaymentMethod;
    invoice_kind: InvoiceKind;
    invoice_tax_id?: string;
    invoice_carrier?: string;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status !== "signed") {
    return { ok: false, error: "請先完成車主第二次簽名" };
  }
  if (payload.invoice_kind === "company" && !payload.invoice_tax_id?.trim()) {
    return { ok: false, error: "公司戶發票必須填寫統一編號" };
  }
  const summary = (ctx.row.fee_summary ?? {}) as FeeSummary;
  const payment: Payment = {
    method: payload.payment_method,
    paid_at: new Date().toISOString(),
    amount: summary.payable ?? 0,
  };
  const invoice: Invoice = {
    kind: payload.invoice_kind,
    tax_id: payload.invoice_tax_id?.trim() || undefined,
    carrier: payload.invoice_carrier?.trim() || undefined,
    invoice_no: `EI-${Date.now().toString().slice(-10)}`,
    issued_at: new Date().toISOString(),
  };
  const supabase = await createClient();
  const { error } = await supabase
    .from("ro_checkouts")
    .update({
      payment,
      invoice,
      status: "paid",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

/* ──────────────── step 4: 關單 ──────────────── */

export async function completeAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status !== "paid") return { ok: false, error: "請先完成收款再關單" };
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from("ro_checkouts")
    .update({ status: "completed", closed_at: now, updated_at: now })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // ── 關單分歧修復（P1）：統一使用「已關單」，與 updateRepairOrderStatusAction 的 hook 觸發條件對齊。
  // 原本寫「已結案」導致 D+3/D+7 電訪任務、addon 預留實體出庫 hook 都掛在「已關單」分支但結帳路徑
  // 永遠觸發不到，現在改成「已關單」確保兩條路徑的連鎖效果一致。──
  await supabase
    .from("repair_orders")
    .update({ status: "已關單", closed_at: now })
    .eq("id", ctx.row.repair_order_id)
    .eq("brand_id", ctx.brand);

  const repairOrderId = ctx.row.repair_order_id as string;
  const brand = ctx.brand;

  // ── RP4 事件時間軸：記錄結帳完成關單（非阻塞） ──
  {
    const {
      data: { user: _completeUser },
    } = await supabase.auth.getUser();
    const completeActorId = _completeUser?.id ?? null;
    const feeSummary = (ctx.row.fee_summary ?? {}) as FeeSummary;
    after(async () => {
      await appendRepairOrderEvent(
        repairOrderId,
        {
          action: "checkout_completed",
          payload: {
            checkout_id: id,
            payable: feeSummary.payable ?? null,
            discount_pct: feeSummary.discount_pct ?? 0,
            closed_at: now,
          },
        },
        completeActorId,
      );
    });
  }

  // ── 包F：結案 → 寫下次保養提醒到人車檔 + 建 CRM 回訪（非阻塞、吞錯不影響關單）──
  after(async () => {
    try {
      const sb = await createClient();
      const { data: ro } = await sb
        .from("repair_orders")
        .select("vehicle_id, customer_id, ro_code, mileage_in")
        .eq("id", repairOrderId)
        .eq("brand_id", brand)
        .maybeSingle();
      if (!ro?.vehicle_id) return;

      // 取車輛現里程（優先 RO 進廠里程，否則車檔現里程）
      const { data: veh } = await sb
        .from("customer_vehicles")
        .select("current_mileage")
        .eq("id", ro.vehicle_id)
        .maybeSingle();
      const baseMileage =
        Number(ro.mileage_in ?? 0) || Number(veh?.current_mileage ?? 0) || 0;
      const nextMileage = baseMileage > 0 ? baseMileage + NEXT_SERVICE_INTERVAL_KM : null;

      const due = new Date();
      due.setMonth(due.getMonth() + NEXT_SERVICE_INTERVAL_MONTHS);
      const nextDate = due.toISOString().slice(0, 10);

      await sb
        .from("customer_vehicles")
        .update({
          next_service_mileage: nextMileage,
          next_service_date: nextDate,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ro.vehicle_id);

      // CRM 回訪任務：提前 5 個月提醒客戶回廠保養（dedupe by source_ro）
      if (ro.customer_id) {
        await createFollowUpTask({
          customer_id: ro.customer_id,
          kind: "aftersales",
          call_type: "maintenance_reminder",
          days_from_now: NEXT_SERVICE_REMINDER_DAYS,
          notes: `下次保養提醒：工單 ${ro.ro_code} 結案，建議里程 ${
            nextMileage ?? "—"
          } km / ${nextDate} 前回廠保養`,
          metadata: {
            source: "ro_checkout_complete",
            source_ro: repairOrderId,
            ro_code: ro.ro_code,
            next_service_mileage: nextMileage,
            next_service_date: nextDate,
            vehicle_id: ro.vehicle_id,
          },
          dedupeMetaKey: "source_ro",
        });
      }
    } catch (e) {
      console.error("[包F 下次保養提醒] 寫入失敗（不影響關單）", e);
    }
  });

  // ── hook#7（C-22 同步）：結帳關單 → 建 D+3 / D+7 售後電訪任務（非阻塞）──
  // 鏡像 repair-order-actions.ts updateRepairOrderStatusAction 的「已關單」分支，
  // 讓結帳路徑與手動切狀態路徑的連鎖效果一致。
  // dedupeKey=source_ro：同 RO 重觸發冪等，不重複建任務。
  after(async () => {
    try {
      const sb = await createClient();
      const { data: ro } = await sb
        .from("repair_orders")
        .select("customer_id, vehicle_id, ro_code")
        .eq("id", repairOrderId)
        .eq("brand_id", brand)
        .maybeSingle();
      if (!ro?.customer_id) return; // 沒掛客戶的工單不建電訪

      const baseMeta = {
        source: "repair_order_close_hook",
        source_ro: repairOrderId,
        ro_code: ro.ro_code,
        vehicle_id: ro.vehicle_id ?? null,
      };
      const followUps: Array<{
        call_type: "aftersales_d3" | "aftersales_d7";
        days: number;
        label: string;
      }> = [
        { call_type: "aftersales_d3", days: 3, label: "D+3 售後滿意度回訪" },
        { call_type: "aftersales_d7", days: 7, label: "D+7 售後深度確認" },
      ];
      for (const fu of followUps) {
        const res = await createFollowUpTask({
          customer_id: ro.customer_id,
          kind: "aftersales",
          call_type: fu.call_type,
          days_from_now: fu.days,
          notes: `系統自動建立：工單 ${ro.ro_code} 關單後 ${fu.label}`,
          metadata: baseMeta,
          dedupeMetaKey: "source_ro",
        });
        if (!res.ok) {
          console.error(
            `[hook#7 結帳關單→${fu.call_type}] 建立失敗（不影響關單）`,
            res.error,
          );
        }
      }
    } catch (e) {
      console.error("[hook#7 結帳關單→D+3/D+7] 副作用例外（不影響關單）", e);
    }
  });

  // ── hook#8（C-28 同步）：結帳關單 → addon 預留實體出庫（非阻塞）──
  // 鏡像 repair-order-actions.ts 的 hook#8，讓結帳路徑與手動切狀態路徑都能真實觸發出庫。
  // 冪等：以 source_doc_type='repair_order' + source_doc_id=ro_id 在 stock_issues 查重，
  //   同 RO 已有 completed 領料單則跳過、不重複出庫。
  after(async () => {
    try {
      const sb = await createClient();

      // 冪等 check：同 RO 已出庫過則跳過
      const { data: existingIssue } = await sb
        .from("stock_issues")
        .select("id")
        .eq("brand_id", brand)
        .eq("source_doc_type", "repair_order")
        .eq("source_doc_id", repairOrderId)
        .eq("status", "completed")
        .limit(1)
        .maybeSingle();
      if (existingIssue?.id) {
        console.log(
          `[hook#8 C-28] RO ${repairOrderId} 已有 addon 出庫紀錄（${existingIssue.id}），跳過`,
        );
        return;
      }

      const { data: roRow } = await sb
        .from("repair_orders")
        .select("ro_code, customer_id")
        .eq("id", repairOrderId)
        .eq("brand_id", brand)
        .maybeSingle();
      if (!roRow) return;

      const { data: reservations, error: rsvErr } = await sb
        .from("inventory_reservations")
        .select("id, item_id, warehouse_id, reserved_qty")
        .eq("brand_id", brand)
        .eq("ro_id", repairOrderId)
        .eq("source_type", "repair_order_addon")
        .eq("status", "active");
      if (rsvErr) {
        console.error("[hook#8 C-28] 撈 reservations 失敗（不影響關單）", rsvErr);
        return;
      }
      if (!reservations || reservations.length === 0) return;

      // 按 warehouse_id 分組（多倉各建一張 GI 單）
      const byWarehouse = new Map<
        string,
        Array<{ item_id: string; qty_needed: number; reservation_id: string }>
      >();
      for (const r of reservations) {
        const wId = r.warehouse_id as string;
        if (!byWarehouse.has(wId)) byWarehouse.set(wId, []);
        byWarehouse.get(wId)!.push({
          item_id: r.item_id as string,
          qty_needed: Number(r.reserved_qty),
          reservation_id: r.id as string,
        });
      }

      for (const [warehouseId, lines] of byWarehouse) {
        const issueRes = await pickForRepairOrderAddon({
          warehouse_id: warehouseId,
          ro_id: repairOrderId,
          ro_code: roRow.ro_code as string,
          customer_id: (roRow.customer_id as string | null) ?? null,
          lines,
        });
        if (!issueRes.ok) {
          console.error(
            `[hook#8 C-28] RO ${roRow.ro_code} 倉 ${warehouseId} 出庫失敗（不影響關單）`,
            issueRes.error,
          );
          continue;
        }
        console.log(
          `[hook#8 C-28] RO ${roRow.ro_code} 出庫成功`,
          issueRes.data.gi_no,
        );

        // 出庫成功 → 把該倉 reservation 翻 consumed
        const nowIso = new Date().toISOString();
        for (const line of lines) {
          const { error: consumeErr } = await sb
            .from("inventory_reservations")
            .update({
              status: "consumed",
              consumed_qty: line.qty_needed,
              released_at: nowIso,
              release_reason: "issued",
              updated_at: nowIso,
            })
            .eq("id", line.reservation_id)
            .eq("brand_id", brand)
            .eq("status", "active");
          if (consumeErr) {
            console.error(
              `[hook#8 C-28] consume reservation ${line.reservation_id} 失敗`,
              consumeErr,
            );
          }
        }
      }
    } catch (e) {
      console.error("[hook#8 C-28] addon 出庫副作用例外（不影響關單）", e);
    }
  });

  // ── RP8 站內通知：關單 → 通知執行關單的 SA ──
  // 通知「本人」（關單的操作者）工單已完成關單，確認路徑。
  // 注意：ctx.row.repair_order_id 已在上方取出為 repairOrderId。
  after(async () => {
    try {
      const sb = await createClient();
      const {
        data: { user: closingUser },
      } = await sb.auth.getUser();
      if (!closingUser?.id) return;

      const { data: ro } = await sb
        .from("repair_orders")
        .select("ro_code, customer_id")
        .eq("id", repairOrderId)
        .maybeSingle();

      let customerName = "";
      if (ro?.customer_id) {
        const { data: cust } = await sb
          .from("customers")
          .select("name")
          .eq("id", ro.customer_id)
          .maybeSingle();
        customerName = cust?.name ? `（${cust.name}）` : "";
      }

      await createInappNotification({
        recipient_user_id: closingUser.id,
        event_code: "aftersales.ro.closed",
        title: `工單關單完成 ${ro?.ro_code ?? ""}`,
        body: `${ro?.ro_code ?? ""}${customerName} 已完成結帳關單，D+3 電訪任務已建立。`,
        href: `/parts/aftersales/repair-orders/${repairOrderId}`,
        priority: "grey", // 關單是好消息、灰色資訊級
        source_ro_id: repairOrderId,
        source_ro_code: ro?.ro_code ?? undefined,
        brand_id: brand,
      });
    } catch (e) {
      console.error("[RP8 關單通知] 副作用例外（不影響關單）", e);
    }
  });

  // ── RP4 Layer3：關單 → 非阻塞持久化結帳憑證 PDF 到 Storage ──
  // 用 after() 確保不阻擋主流程；失敗只 log，不影響關單結果。
  // APP_URL 優先（Zeabur 明確設定）；本機 dev 預設 localhost:3100（本輪 dev port）。
  // render.ts 在 mac 本機可能因 @sparticuz/chromium 缺 linux binary 而失敗，
  // persistRepairOrderPdf 內部已 try/catch 吞錯。
  {
    const appOriginForPdf =
      process.env.APP_URL?.trim().replace(/\/+$/, "") ?? "http://localhost:3100";
    after(async () => {
      try {
        const result = await persistRepairOrderPdf({
          roId: repairOrderId,
          checkoutId: id,
          brand,
          appOrigin: appOriginForPdf,
          // cookieHeader 留空 → persistRepairOrderPdf 內部自動從 next/headers 讀取
        });
        if (result) {
          console.log(`[RP4 Layer3] RO ${repairOrderId} closeout PDF 持久化成功`);
        } else {
          console.warn(`[RP4 Layer3] RO ${repairOrderId} closeout PDF 持久化失敗（不影響關單）`);
        }
      } catch (e) {
        console.error("[RP4 Layer3] persistRepairOrderPdf 例外（不影響關單）", e);
      }
    });
  }

  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  revalidatePath("/parts/aftersales/repair-orders");
  return { ok: true, data: { id } };
}

/**
 * 包F：委託取車授權（Step1B）—— 記錄非車主本人代取的受託人資訊到 metadata.entrustment。
 * is_entrusted=false 表示車主本人取車（清除委託資料）。
 * auth_method: 授權方式（'phone'現場電話 / 'line_screenshot' LINE截圖 / 'presystem' 系統預登記）
 * agent_sig_url: 受託人電子簽名 JPEG base64 dataURL（server 端上傳 Storage）
 */
export async function setPickupEntrustmentAction(
  id: string,
  input: {
    is_entrusted: boolean;
    agent_name?: string | null;
    relation?: string | null;
    id_note?: string | null;
    auth_method?: "phone" | "line_screenshot" | "presystem" | null;
    agent_sig_url?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (input.is_entrusted && !input.agent_name?.trim()) {
    return { ok: false, error: "請填寫受託人姓名" };
  }

  // 若帶了受託人簽名 dataURL，上傳 Storage
  let agentSigStorageUrl: string | null = null;
  if (input.is_entrusted && input.agent_sig_url) {
    if (isStorageUrl(input.agent_sig_url)) {
      agentSigStorageUrl = input.agent_sig_url;
    } else {
      agentSigStorageUrl = await uploadSignatureDataUrl(
        input.agent_sig_url,
        ctx.brand,
        "ro-checkout",
        id,
        "agent-sig",
      );
    }
  }

  const supabase = await createClient();
  const meta = (ctx.row.metadata ?? {}) as Record<string, unknown>;
  const next = {
    ...meta,
    entrustment: input.is_entrusted
      ? {
          is_entrusted: true,
          agent_name: input.agent_name!.trim(),
          relation: input.relation?.trim() || null,
          id_note: input.id_note?.trim() || null,
          auth_method: input.auth_method ?? null,
          agent_sig_url: agentSigStorageUrl,
          authorized_at: new Date().toISOString(),
        }
      : { is_entrusted: false },
  };
  const { error } = await supabase
    .from("ro_checkouts")
    .update({ metadata: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

export async function markReceiptPrintedAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  const supabase = await createClient();
  const { error } = await supabase
    .from("ro_checkouts")
    .update({ receipt_printed_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id } };
}

/**
 * RP4 Layer3：取結帳憑證 PDF 下載 URL（signed URL，有效 60 分鐘）。
 * 若尚未生成 → 回 null；UI 只顯示「有 URL 才顯示連結」。
 */
export async function getCloseoutPdfUrlAction(
  id: string,
): Promise<ActionResult<{ url: string } | { url: null }>> {
  await requirePermission(PERMISSIONS.RO_VIEW);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;

  const meta = (ctx.row.metadata ?? {}) as Record<string, unknown>;
  const storagePath = typeof meta.closeout_pdf_storage_path === "string"
    ? meta.closeout_pdf_storage_path
    : null;

  if (!storagePath) {
    return { ok: true, data: { url: null } };
  }

  // 動態 import 避免循環依賴（domain 不互引）
  const { getCloseoutPdfSignedUrl } = await import("@/domain/ro-documents");
  const signedUrl = await getCloseoutPdfSignedUrl(storagePath);
  return { ok: true, data: { url: signedUrl ?? null } };
}

export async function deleteAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status === "completed") return { ok: false, error: "已關單的結帳單不可刪除" };
  const supabase = await createClient();
  const { error } = await supabase.from("ro_checkouts").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

/**
 * RP2 ④ 追加項目授權客戶簽名（最小可用）。
 * 適用情境：SA 電話或當面取得客戶口頭授權，此處記錄電子簽名存 Storage。
 * 資料存 metadata.addon_auth_sig。
 * TODO promote to typed column/table (needs DDL)
 */
export async function saveAddonAuthSignatureAction(
  id: string,
  payload: {
    screenshot_url: string;        // JPEG base64 dataURL
    customer_name?: string | null;
    addon_items_snapshot?: string; // 被授權的追加項目簡述
  },
): Promise<ActionResult<{ id: string; storage_url: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (!payload.screenshot_url?.trim()) {
    return { ok: false, error: "請先完成追加授權簽名" };
  }

  // 上傳 Storage
  let storageUrl: string | null = null;
  if (isStorageUrl(payload.screenshot_url)) {
    storageUrl = payload.screenshot_url;
  } else {
    storageUrl = await uploadSignatureDataUrl(
      payload.screenshot_url,
      ctx.brand,
      "ro-checkout",
      id,
      "addon-auth",
    );
  }
  if (!storageUrl) {
    return { ok: false, error: "簽名圖片上傳失敗，請重試" };
  }

  const supabase = await createClient();
  const prevMeta = (ctx.row.metadata ?? {}) as Record<string, unknown>;
  const addonAuthSig = {
    screenshot_url: storageUrl,
    customer_name: payload.customer_name ?? null,
    signed_at: new Date().toISOString(),
    addon_items_snapshot: payload.addon_items_snapshot ?? null,
  };
  const { error } = await supabase
    .from("ro_checkouts")
    .update({
      metadata: { ...prevMeta, addon_auth_sig: addonAuthSig },
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  return { ok: true, data: { id, storage_url: storageUrl } };
}
