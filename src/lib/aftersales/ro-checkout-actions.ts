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

// 包F：下次保養提醒參數（Ducati 定保 demo：里程 +6000km / 時間 +6 個月，提前 5 個月建 CRM 回訪）
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

export async function applyDiscountAction(
  id: string,
  pct: number,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status !== "in_progress") return { ok: false, error: "已二簽後不可改折扣" };
  const summary = (ctx.row.fee_summary ?? {}) as FeeSummary;
  const next = applyDiscount(summary, pct);
  const supabase = await createClient();
  const { error } = await supabase
    .from("ro_checkouts")
    .update({ fee_summary: next, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  // ── RP4 事件時間軸：記錄折扣變更（非阻塞） ──
  {
    const {
      data: { user: _discountUser },
    } = await supabase.auth.getUser();
    const discountActorId = _discountUser?.id ?? null;
    const roIdForDiscount = ctx.row.repair_order_id as string;
    const prevPct = (summary as FeeSummary).discount_pct ?? 0;
    after(async () => {
      await appendRepairOrderEvent(
        roIdForDiscount,
        {
          action: "discount_applied",
          payload: {
            checkout_id: id,
            discount_pct_before: prevPct,
            discount_pct_after: pct,
            payable: next.payable ?? null,
          },
        },
        discountActorId,
      );
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
    screenshot_url?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (!ctx.row.fees_confirmed_at) {
    return { ok: false, error: "請先在 step1 確認費用明細" };
  }
  const sig: CustomerSignature = {
    signature_text: payload.signature_text,
    customer_name: payload.customer_name,
    signed_at: new Date().toISOString(),
    screenshot_url: payload.screenshot_url ?? null,
  };
  const supabase = await createClient();
  const { error } = await supabase
    .from("ro_checkouts")
    .update({
      customer_signature: sig,
      status: "signed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  return { ok: true, data: { id } };
}

export async function clearSignAction(id: string): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (ctx.row.status !== "signed") return { ok: false, error: "已收款後不可清除簽名" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("ro_checkouts")
    .update({
      customer_signature: {},
      status: "in_progress",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
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

  revalidatePath(`${PAGE}/${id}`);
  revalidatePath(PAGE);
  revalidatePath("/parts/aftersales/repair-orders");
  return { ok: true, data: { id } };
}

/**
 * 包F：委託取車授權（Step1B）—— 記錄非車主本人代取的受託人資訊到 metadata.entrustment。
 * is_entrusted=false 表示車主本人取車（清除委託資料）。
 */
export async function setPickupEntrustmentAction(
  id: string,
  input: {
    is_entrusted: boolean;
    agent_name?: string | null;
    relation?: string | null;
    id_note?: string | null;
  },
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CLOSE);
  const ctx = await loadById(id);
  if (!ctx.ok) return ctx;
  if (input.is_entrusted && !input.agent_name?.trim()) {
    return { ok: false, error: "請填寫受託人姓名" };
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
