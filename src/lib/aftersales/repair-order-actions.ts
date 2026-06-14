"use server";

/**
 * Server actions — aftersales repair orders
 *
 * Result<T> pattern。對應 spec：docs/proposals/feature-aftersales-ro-phase1.md
 *
 * 寫入動作：
 *  - confirmRepairOrderAction：閘門頁唯一寫入動作（POC 階段不真推 LINE）
 *  - updateRepairOrderStatusAction：03-08 後續單據觸發狀態切換
 *  - cancelRepairOrderAction / deleteRepairOrderAction（admin only）
 */

import { revalidatePath } from "next/cache";
import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { createFollowUpTask } from "@/domain/sales-call-tasks";
import { notifications } from "@/lib/notifications";
import { pickForRepairOrderAddon } from "@/domain/issues";

import {
  PREFIX_COMBO_RULES,
  validateRoStatusTransition,
  type PrefixP1,
  type PrefixP2,
} from "@/domain/repair-orders.constants";
import { appendRepairOrderEvent } from "@/domain/repair-orders";
// RP5：中途取消前置授權 guard
import { hasApprovedApproval } from "@/domain/aftersales-approvals";
// RP8 T03：工單進待料 → 倉管站內通知
import { createInappNotifications } from "@/domain/user-notifications";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/parts/aftersales/repair-orders";

export type ConfirmRepairOrderInput = {
  appointment_id?: string | null;
  pre_inspection_id?: string | null;
  customer_id?: string | null;
  vehicle_id?: string | null;
  prefix_p1: PrefixP1;
  prefix_p2: PrefixP2;
  mileage_in?: number | null;
  estimated_subtotal?: number | null;
  estimated_labor_units?: number | null;
  store_id?: string | null;
  subsidiary_id?: string | null;
  warranty_status_snapshot?: Record<string, unknown> | null;
  notes?: string | null;
  /** 優先級 G-1：urgent | normal | flexible（預設 normal）*/
  priority?: "urgent" | "normal" | "flexible" | null;
  /** 返工：原始工單 id（標記返工時帶入，寫入 metadata.rework_of）*/
  rework_of?: string | null;
  /** 保固過期但仍開 WC 單時的主管授權（寫入 metadata.warranty_auth）*/
  warranty_auth?: { authorized_by: string; reason?: string | null } | null;
};

function todayIsoDate(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const day = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toYymmdd(dateStr: string): string {
  return dateStr.replace(/-/g, "").slice(2);
}

async function nextSequenceNo(
  brand_id: string,
  issue_date: string,
  p1: PrefixP1,
  p2: PrefixP2,
): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("repair_orders")
    .select("sequence_no")
    .eq("brand_id", brand_id)
    .eq("issue_date", issue_date)
    .eq("prefix_p1", p1)
    .eq("prefix_p2", p2)
    .order("sequence_no", { ascending: false })
    .limit(1);
  const top = (data ?? [])[0] as { sequence_no: number } | undefined;
  return (top?.sequence_no ?? 0) + 1;
}

export async function confirmRepairOrderAction(
  input: ConfirmRepairOrderInput,
): Promise<ActionResult<{ id: string; ro_code: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);

  // 1. 驗組合
  const rule = PREFIX_COMBO_RULES.find(
    (r) => r.p1 === input.prefix_p1 && r.p2 === input.prefix_p2,
  );
  if (rule?.verdict === "invalid") {
    return { ok: false, error: rule.description };
  }
  const verdict = rule?.verdict ?? "needs_supervisor";
  const accounting = rule?.accounting ?? null;

  // 費用歸屬：依會計類別推導（PD-IN → VEHICLE_COST → 'vehicle_cost'，費用計入整車成本、車主應付 NT$0）
  // WC-WR 等廠商索賠 → 'warranty_vendor'；其餘客付/費用認列 → 'customer'
  const feeAllocation: "customer" | "vehicle_cost" | "warranty_vendor" =
    accounting === "VEHICLE_COST"
      ? "vehicle_cost"
      : accounting === "AR_VENDOR"
        ? "warranty_vendor"
        : "customer";

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const issueDate = todayIsoDate();

  // ── 跨模組 hook #2：SA 鎖定 / 防重複指派（同步守門，非 after）──
  // proposal §#2：確認/指派前先擋。after() 是寫完才跑、擋不住重複，所以在 insert 之前查。
  // OPEN_RO_STATUSES：尚未結束的工單狀態（已關單 / 已取消 不算佔用）
  const OPEN_RO_STATUSES = ["進行中", "維修中", "待結帳"];

  // (a) 同車已有進行中工單 → 擋（一台車同時間只該有一張 open RO）
  if (input.vehicle_id) {
    const { data: openRo, error: openErr } = await supabase
      .from("repair_orders")
      .select("id, ro_code")
      .eq("brand_id", brand)
      .eq("vehicle_id", input.vehicle_id)
      .in("status", OPEN_RO_STATUSES)
      .limit(1)
      .maybeSingle();
    if (openErr) return { ok: false, error: `防重檢查失敗：${openErr.message}` };
    if (openRo) {
      return {
        ok: false,
        error: `此車已有進行中的工單（${openRo.ro_code}），請先結清再建立新單。`,
      };
    }
  }

  // (b) 同一預約防重複 confirm → 一張預約只該開一張 RO
  if (input.appointment_id) {
    const { data: dupRo, error: dupErr } = await supabase
      .from("repair_orders")
      .select("id, ro_code")
      .eq("brand_id", brand)
      .eq("appointment_id", input.appointment_id)
      .neq("status", "已取消")
      .limit(1)
      .maybeSingle();
    if (dupErr) return { ok: false, error: `防重檢查失敗：${dupErr.message}` };
    if (dupRo) {
      return {
        ok: false,
        error: `此預約已建立過工單（${dupRo.ro_code}），請勿重複確認。`,
      };
    }
  }

  // 取 actor_id（事件時間軸用，beforehand 避免在 loop 內重複取）
  const {
    data: { user: _authUserForConfirm },
  } = await supabase.auth.getUser();
  const authUserIdForEvent = _authUserForConfirm?.id ?? null;

  // 2. 簡單 retry on unique violation（POC 階段：上限 5 次）
  let lastErr: string | null = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const seq = await nextSequenceNo(brand, issueDate, input.prefix_p1, input.prefix_p2);
    const roCode = `${input.prefix_p1}-${input.prefix_p2}-${toYymmdd(issueDate)}-${String(seq).padStart(3, "0")}`;

    const metadata: Record<string, unknown> = {
      accounting_category_resolved: accounting,
      verdict,
      created_via: "gate_page_v1",
      created_from: input.pre_inspection_id ? "pre_inspection" : "appointment",
    };
    if (verdict === "needs_supervisor") {
      metadata.supervisor_approval = { required: true, approved_at: null, approver_id: null };
    }
    if (input.notes?.trim()) metadata.notes = input.notes.trim();
    // 返工：記原始工單 id，供 detail / 報表追溯（P2 已由前端切 FR）
    if (input.rework_of) {
      metadata.rework_of = input.rework_of;
      metadata.is_rework = true;
    }
    // 保固過期主管授權：開 WC 單但保固已失效時，記授權人與理由
    if (input.warranty_auth?.authorized_by?.trim()) {
      metadata.warranty_auth = {
        authorized_by: input.warranty_auth.authorized_by.trim(),
        reason: input.warranty_auth.reason?.trim() || null,
        authorized_at: new Date().toISOString(),
      };
    }

    const { data, error } = await supabase
      .from("repair_orders")
      .insert({
        brand_id: brand,
        ro_code: roCode,
        prefix_p1: input.prefix_p1,
        prefix_p2: input.prefix_p2,
        issue_date: issueDate,
        sequence_no: seq,
        appointment_id: input.appointment_id || null,
        pre_inspection_id: input.pre_inspection_id || null,
        customer_id: input.customer_id || null,
        vehicle_id: input.vehicle_id || null,
        mileage_in: input.mileage_in ?? null,
        store_id: input.store_id || null,
        subsidiary_id: input.subsidiary_id || null,
        status: "進行中",
        priority: input.priority ?? "normal",
        opened_at: new Date().toISOString(),
        fee_allocation: feeAllocation,
        estimated_subtotal: input.estimated_subtotal ?? null,
        estimated_labor_units: input.estimated_labor_units ?? null,
        warranty_status_snapshot: input.warranty_status_snapshot ?? {},
        metadata,
      })
      .select("id, ro_code")
      .single();

    if (!error) {
      // 3. 更新上游預約狀態 → 維修中（demo：保留原狀態如果不是「等待中」）
      if (input.appointment_id) {
        await supabase
          .from("appointments")
          .update({ status: "維修中", started_at: new Date().toISOString() })
          .eq("id", input.appointment_id)
          .eq("brand_id", brand)
          .in("status", ["待到廠", "已到廠", "等待中"]);

        // 3b. 橋接 work_orders.repair_order_id（C-28 FK bridge，第二條路徑）
        // 透過共用 appointment_id 找到對應 work_order 並回填；找不到不影響主流程
        await supabase
          .from("work_orders")
          .update({ repair_order_id: data.id as string })
          .eq("brand_id", brand)
          .eq("appointment_id", input.appointment_id)
          .is("repair_order_id", null);
      }

      // 4. RP4 事件時間軸：記錄工單建立事件（append-only，非阻塞）
      // actor_id 從 data 插入時的 auth context 取；after() 確保非阻塞
      after(async () => {
        const actorId = authUserIdForEvent ?? null;
        await appendRepairOrderEvent(
          data.id as string,
          {
            action: "ro_created",
            payload: {
              ro_code: data.ro_code as string,
              prefix_p1: input.prefix_p1,
              prefix_p2: input.prefix_p2,
              priority: input.priority ?? "normal",
              source: input.pre_inspection_id ? "pre_inspection" : "appointment",
              appointment_id: input.appointment_id ?? null,
            },
          },
          actorId,
        );
      });

      // 5. 副作用 placeholder：notifications.dispatch（POC 階段先不真推、留 hook）
      // TODO: after(() => notifications.dispatch({ code: 'aftersales.repair_order.created', payload: { ro_code, ...} }))

      revalidatePath(PAGE_PATH);
      revalidatePath(`${PAGE_PATH}/${data.id}`);
      revalidatePath("/parts/aftersales/appointments");
      return {
        ok: true,
        data: { id: data.id as string, ro_code: data.ro_code as string },
      };
    }

    lastErr = error.message;
    // 23505 unique violation = 並發撞號 → retry；其他 error 直接 fail
    if (!error.message.includes("duplicate") && !error.message.includes("unique")) break;
  }

  return { ok: false, error: `建立失敗：${lastErr ?? "unknown"}` };
}

/**
 * updateRepairOrderStatusAction — 狀態機轉換入口（RP1 地基）
 *
 * 護欄層：
 *   1. 驗轉換合法（validateRoStatusTransition 白名單）
 *   2. 終態不可逆 guard（"已關單"/"已取消"/"已關閉-*" 進來擋住）
 *   3. 每次轉換 append 一筆 status_history 到 metadata.status_history
 *      格式：{ from, to, actor_id, at: server_utc, reason }
 *
 * 正常關單（"已關單"）不走此 action，走 ro-checkout-actions.ts completeCheckout。
 * 建單（"進行中"）不走此 action，走 confirmRepairOrderAction。
 *
 * @param reason   可選；記錄狀態轉換原因（中途取消/退回重工 必填理由 TODO RP5）
 */
export async function updateRepairOrderStatusAction(
  id: string,
  status: string,
  reason?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // ── RP1 護欄①：先撈現在的 status + metadata ──
  const { data: existing, error: fetchErr } = await supabase
    .from("repair_orders")
    .select("status, metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: `載入工單失敗：${fetchErr.message}` };
  if (!existing) return { ok: false, error: "找不到工單" };

  const currentStatus = (existing.status as string) ?? "";
  const currentMeta = ((existing.metadata ?? {}) as Record<string, unknown>);

  // ── RP1 護欄②：轉換合法性驗證 ──
  const verdict = validateRoStatusTransition(currentStatus, status);
  if (verdict === "same") {
    // 無需轉換，直接回 ok（冪等）
    return { ok: true, data: { id } };
  }
  if (verdict === "terminal") {
    return {
      ok: false,
      error: `工單已處於終態「${currentStatus}」，無法再修改狀態。`,
    };
  }
  if (verdict === "not_allowed") {
    return {
      ok: false,
      error: `不允許的狀態轉換：${currentStatus} → ${status}。請確認業務流程。`,
    };
  }
  // verdict === "ok"，繼續

  // ── RP5 護欄：中途取消需已獲主管授權 ──
  // 只擋「已關閉-中途取消」這個目標狀態。
  // 若該 RO 已有 approved 的 cancel_order 授權記錄才放行；否則要求先送審。
  if (status === "已關閉-中途取消") {
    const hasAuth = await hasApprovedApproval(id, "cancel_order");
    if (!hasAuth) {
      return {
        ok: false,
        error: "中途取消需要主管授權，請先透過「申請中途取消授權」送出申請並等候核准後再執行。",
      };
    }
  }

  // ── RP1 護欄③：actor_id 取得 + INSERT status_history 真表 ──
  // actor_id 從 supabase auth.uid() 取（server action context 有 session）
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  const actorId = authUser?.id ?? null;
  const changedAt = new Date().toISOString(); // server UTC，防偽造

  // 先 INSERT 到 repair_order_status_history 真表（append-only）
  // RLS policy：user_has_brand INSERT 允許，一般 server client 即可
  {
    const { error: histInsertErr } = await supabase
      .from("repair_order_status_history")
      .insert({
        ro_id: id,
        brand_id: brand,
        from_status: currentStatus || null,
        to_status: status,
        actor_id: actorId,
        reason: reason?.trim() || null,
        changed_at: changedAt,
      });
    if (histInsertErr) {
      // 非阻塞：status_history 寫入失敗不阻止主流程（稽核副作用）
      console.error("[updateRepairOrderStatus] status_history INSERT 失敗", histInsertErr.message);
    }
  }

  // ── 組更新物件（不再把 status_history 塞進 metadata）──
  const upd: Record<string, unknown> = {
    status,
    metadata: currentMeta, // metadata 不再新增 status_history key
    updated_at: changedAt,
  };
  // 終態關單時間戳：正常關單由 checkout action 填；此處處理其他終態
  if (status === "已關單") upd.closed_at = changedAt;

  const { error } = await supabase
    .from("repair_orders")
    .update(upd)
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `更新失敗：${error.message}` };

  // ── RP4 事件時間軸：記錄狀態變更（非阻塞，副作用） ──
  after(async () => {
    await appendRepairOrderEvent(
      id,
      {
        action: "status_changed",
        payload: {
          from: currentStatus,
          to: status,
          reason: reason?.trim() || null,
        },
      },
      actorId,
    );
  });

  // ── RP8 T03：工單進待料 → 通知倉管（warehouse role）備料 ──
  // 非阻塞，失敗只 log，不回滾主流程。
  // 收件人：同 brand 中 role_codes 含 'warehouse' 且有綁 user_id 的員工。
  // TODO T02：等待客戶授權 > 2hr → 需 cron（目前無 DDL/排程）；
  //   骨架在 /api/cron/aftersales-approval-escalate/route.ts，
  //   日後把「auth_status=pending AND updated_at < now()-2h」的 RO 撈出來推通知即可。
  if (status === "待料" || status === "待料-車輛已還") {
    after(async () => {
      try {
        const sb = await createClient();
        const { data: ro } = await sb
          .from("repair_orders")
          .select("ro_code")
          .eq("id", id)
          .eq("brand_id", brand)
          .maybeSingle();
        if (!ro) return;

        // 找 brand 內所有含 warehouse 角色、且已綁 user_id 的員工
        const { data: warehouseEmps } = await sb
          .from("employees")
          .select("user_id")
          .eq("brand_id", brand)
          .eq("is_active", true)
          .contains("role_codes", ["warehouse"])
          .not("user_id", "is", null);
        if (!warehouseEmps || warehouseEmps.length === 0) return;

        const recipientIds = [
          ...new Set(
            (warehouseEmps as Array<{ user_id: string | null }>)
              .map((e) => e.user_id)
              .filter((v): v is string => Boolean(v)),
          ),
        ];
        if (recipientIds.length === 0) return;

        await createInappNotifications(
          recipientIds.map((uid) => ({
            recipient_user_id: uid,
            event_code: "aftersales.ro.parts_waiting",
            title: `工單進入待料 — ${ro.ro_code ?? ""}`,
            body: `工單 ${ro.ro_code ?? ""} 已轉為「${status}」，請查看並備料。`,
            href: `/parts/aftersales/repair-orders/${id}`,
            priority: "orange" as const,
            source_ro_id: id,
            source_ro_code: ro.ro_code ?? undefined,
            brand_id: brand,
          })),
        );
      } catch (e) {
        console.error("[RP8 T03 待料通知] 副作用例外（不影響）", e);
      }
    });
  }

  // ── 跨模組 hook #7（C-22）：工單關閉 → 建立 D+3 / D+7 售後電訪任務 ──
  // 非阻塞、try/catch 吞錯；helper 以 (customer + call_type + metadata.source_ro) 防同單重複觸發。
  // 範圍（Ming 拍板 / v3.0 §九 C-22）：關單 → 連建兩筆 call_task：
  //   D+3 售後滿意度（aftersales_d3）、D+7 售後深度確認（aftersales_d7）。不碰 work_orders 進廠數對齊。
  // dedupeKey=source_ro：兩筆 call_type 不同 → 互不相撞、同單重觸發各自冪等。
  if (status === "已關單") {
    after(async () => {
      try {
        const sb = await createClient();
        const { data: ro } = await sb
          .from("repair_orders")
          .select("customer_id, vehicle_id, ro_code")
          .eq("id", id)
          .eq("brand_id", brand)
          .maybeSingle();
        if (!ro?.customer_id) return; // 沒掛客戶的工單不建電訪

        const baseMeta = {
          source: "repair_order_close_hook",
          source_ro: id,
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
              `[hook#7 關單→${fu.call_type}] 建立失敗（不影響關單）`,
              res.error,
            );
          }
        }
      } catch (e) {
        console.error("[hook#7 關單→D+3/D+7] 副作用例外（不影響關單）", e);
      }
    });
  }

  // ── 跨模組 hook #8（C-28）：RO 關單 → addon 預留實體出庫 ──
  // 非阻塞、try/catch 吞錯；出庫失敗不影響關單本體。
  // 語意：撈該 RO 所有 active addon 預留 → 按 warehouse 分組 → 各建一張領料單
  //   → persistPick 扣 stock_items lots（FIFO）+ 認列 COGS_ON_ISSUE → reservation 翻 consumed。
  // 冪等：以 source_doc_type='repair_order' + source_doc_id=ro_id 在 stock_issues 查重，
  //   同 RO 已有 completed 領料單則跳過、不重複出庫。
  // consume 走直接 DB update（不走 domain/inventory-reservations.consume()），
  //   避免其 hasPermission(ISSUE_CREATE) 在 after() context 依關單者角色靜默失敗、
  //   導致「stock 已扣但 reservation 仍 active」的不一致。
  if (status === "已關單") {
    after(async () => {
      try {
        const sb = await createClient();
        const brandForHook = (await getActiveScope()).brand_id;

        // 冪等 check：同 RO 已出庫過則跳過
        const { data: existingIssue } = await sb
          .from("stock_issues")
          .select("id")
          .eq("brand_id", brandForHook)
          .eq("source_doc_type", "repair_order")
          .eq("source_doc_id", id)
          .eq("status", "completed")
          .limit(1)
          .maybeSingle();
        if (existingIssue?.id) {
          console.log(
            `[hook#8 C-28] RO ${id} 已有 addon 出庫紀錄（${existingIssue.id}），跳過`,
          );
          return;
        }

        const { data: roRow } = await sb
          .from("repair_orders")
          .select("ro_code, customer_id")
          .eq("id", id)
          .eq("brand_id", brandForHook)
          .maybeSingle();
        if (!roRow) return;

        const { data: reservations, error: rsvErr } = await sb
          .from("inventory_reservations")
          .select("id, item_id, warehouse_id, reserved_qty")
          .eq("brand_id", brandForHook)
          .eq("ro_id", id)
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
            ro_id: id,
            ro_code: roRow.ro_code as string,
            customer_id: (roRow.customer_id as string | null) ?? null,
            lines,
          });
          if (!issueRes.ok) {
            console.error(
              `[hook#8 C-28] RO ${roRow.ro_code} 倉 ${warehouseId} 出庫失敗（不影響關單）`,
              issueRes.error,
            );
            // 出庫失敗：reservation 維持 active 供人工補處理；繼續下一個倉
            continue;
          }
          console.log(
            `[hook#8 C-28] RO ${roRow.ro_code} 出庫成功`,
            issueRes.data.gi_no,
          );

          // 出庫成功 → 把該倉 reservation 翻 consumed（直接 DB update，附 optimistic lock）
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
              .eq("brand_id", brandForHook)
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
  }

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function cancelRepairOrderAction(
  id: string,
  reason?: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: existing } = await supabase
    .from("repair_orders")
    .select("metadata")
    .eq("id", id)
    .eq("brand_id", brand)
    .maybeSingle();
  const meta = ((existing?.metadata ?? {}) as Record<string, unknown>) || {};
  if (reason?.trim()) meta.cancel_reason = reason.trim();
  meta.canceled_at = new Date().toISOString();

  const { error } = await supabase
    .from("repair_orders")
    .update({ status: "已取消", metadata: meta })
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `取消失敗：${error.message}` };

  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteRepairOrderAction(
  id: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!id) return { ok: false, error: "缺少 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { error } = await supabase
    .from("repair_orders")
    .delete()
    .eq("id", id)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { id } };
}

/**
 * /service/workshop 真派工：指派主責技師
 *  - technicianId = null 即解除指派
 *  - 若 RO status 為「進行中」且原本沒指派技師，順手切到「維修中」（保守做法：兩階段都明示）
 */
export async function setLeadTechnicianAction(
  roId: string,
  technicianId: string | null,
): Promise<ActionResult<{ id: string; technician_id: string | null; status: string }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  if (!roId) return { ok: false, error: "缺少工單 id" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1. 驗 technician 屬於同 brand 且 is_active
  if (technicianId) {
    const { data: tech, error: techErr } = await supabase
      .from("aftersales_technicians")
      .select("id, brand_id, is_active")
      .eq("id", technicianId)
      .maybeSingle();
    if (techErr) return { ok: false, error: `技師驗證失敗：${techErr.message}` };
    if (!tech) return { ok: false, error: "找不到指定技師" };
    if (tech.brand_id !== brand) return { ok: false, error: "技師不屬於當前 brand" };
    if (!tech.is_active) return { ok: false, error: "技師非啟用中，無法派工" };
  }

  // 2. 取得目前 RO 狀態 + 確認屬於同 brand
  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("id, brand_id, status")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr) return { ok: false, error: `工單載入失敗：${roErr.message}` };
  if (!ro) return { ok: false, error: "找不到工單" };

  // 3. update repair_orders
  const upd: Record<string, unknown> = {
    lead_technician_id: technicianId,
    updated_at: new Date().toISOString(),
  };
  // 派工時：若狀態仍為「進行中」（初始受理），切到「維修中」(車間實際施工)
  let nextStatus = ro.status as string;
  if (technicianId && ro.status === "進行中") {
    upd.status = "維修中";
    nextStatus = "維修中";
  }

  const { error: updErr } = await supabase
    .from("repair_orders")
    .update(upd)
    .eq("id", roId)
    .eq("brand_id", brand);
  if (updErr) return { ok: false, error: `派工失敗：${updErr.message}` };

  // ── RP4 事件時間軸：記錄派工事件（非阻塞） ──
  {
    const {
      data: { user: _dispatchUser },
    } = await supabase.auth.getUser();
    const dispatchActorId = _dispatchUser?.id ?? null;
    after(async () => {
      await appendRepairOrderEvent(
        roId,
        {
          action: "dispatched",
          payload: {
            technician_id: technicianId,
            status_after: nextStatus,
          },
        },
        dispatchActorId,
      );
    });
  }

  revalidatePath("/service/workshop");
  revalidatePath(PAGE_PATH);
  revalidatePath(`${PAGE_PATH}/${roId}`);
  return {
    ok: true,
    data: { id: roId, technician_id: technicianId, status: nextStatus },
  };
}

/**
 * 包E：技師缺席批次重排 —— 把某技師名下所有「進行中」工單一次轉給另一技師（或退回未指派），
 * 並把來源技師標記為缺席（status='off'、清掉 current_ro_code）。
 *  - toTechnicianId = null：批次退回未指派（等候重新派工）
 *  - 只搬 OPEN 狀態工單（已關單 / 已取消不動）
 */
export async function reassignTechnicianRosAction(
  fromTechnicianId: string,
  toTechnicianId: string | null,
): Promise<ActionResult<{ reassigned: number }>> {
  await requirePermission(PERMISSIONS.RO_DISPATCH);
  if (!fromTechnicianId) return { ok: false, error: "缺少來源技師" };
  if (toTechnicianId && toTechnicianId === fromTechnicianId)
    return { ok: false, error: "來源與目標技師相同" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 驗目標技師同 brand + 啟用中
  if (toTechnicianId) {
    const { data: tech, error: techErr } = await supabase
      .from("aftersales_technicians")
      .select("id, brand_id, is_active")
      .eq("id", toTechnicianId)
      .maybeSingle();
    if (techErr) return { ok: false, error: `目標技師驗證失敗：${techErr.message}` };
    if (!tech || tech.brand_id !== brand)
      return { ok: false, error: "目標技師不存在或不屬於當前 brand" };
    if (!tech.is_active) return { ok: false, error: "目標技師非啟用中" };
  }

  const OPEN_RO_STATUSES = ["進行中", "維修中", "待結帳"];
  const { data: ros, error: roErr } = await supabase
    .from("repair_orders")
    .select("id")
    .eq("brand_id", brand)
    .eq("lead_technician_id", fromTechnicianId)
    .in("status", OPEN_RO_STATUSES);
  if (roErr) return { ok: false, error: `查詢工單失敗：${roErr.message}` };

  const ids = (ros ?? []).map((r) => (r as { id: string }).id);
  const nowIso = new Date().toISOString();

  if (ids.length > 0) {
    const { error: updErr } = await supabase
      .from("repair_orders")
      .update({ lead_technician_id: toTechnicianId, updated_at: nowIso })
      .in("id", ids)
      .eq("brand_id", brand);
    if (updErr) return { ok: false, error: `批次重排失敗：${updErr.message}` };
  }

  // 來源技師標記缺席（下班）+ 清當前工單
  await supabase
    .from("aftersales_technicians")
    .update({ status: "off", current_ro_code: null, updated_at: nowIso })
    .eq("id", fromTechnicianId)
    .eq("brand_id", brand);

  revalidatePath("/service/workshop");
  revalidatePath("/parts/aftersales/management/dispatch");
  revalidatePath(PAGE_PATH);
  return { ok: true, data: { reassigned: ids.length } };
}

/**
 * 進度通知車主 — SA 在工單詳情時程上手動點「通知車主」。
 * 借用既有 work_order.status_changed 通道推 LINE（POC：推到開發/服務群組；
 * 未來接客戶 LINE 綁定後改 target）。每次點擊即時推、不自動觸發。
 */
export async function notifyRepairOrderProgressAction(
  roId: string,
  stage: string,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!roId) return { ok: false, error: "缺少工單 id" };
  if (!stage?.trim()) return { ok: false, error: "缺少進度階段" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data: ro, error } = await supabase
    .from("repair_orders")
    .select("id, ro_code, status, customer_id")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) return { ok: false, error: `載入工單失敗：${error.message}` };
  if (!ro) return { ok: false, error: "找不到工單" };

  // 車主姓名（純顯示，沒掛客戶就用「車主」）
  let customerName = "車主";
  if (ro.customer_id) {
    const { data: cust } = await supabase
      .from("customers")
      .select("name")
      .eq("id", ro.customer_id)
      .maybeSingle();
    if (cust?.name) customerName = cust.name;
  }

  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  after(async () => {
    try {
      await notifications.dispatch({
        code: "work_order.status_changed",
        payload: {
          orderNo: ro.ro_code,
          from: "進度通知",
          to: `${stage}（致 ${customerName}）`,
          actor: "服務顧問 SA",
          actionUrl: `${appUrl}${PAGE_PATH}/${roId}`,
        },
      });
    } catch (e) {
      console.error("[RO 進度通知] 推播失敗（不影響）", e);
    }
  });

  return { ok: true, data: { id: roId } };
}

/**
 * B5-02 聯繫嘗試記錄（RP4 事件時間軸 contact_attempt）
 *
 * SA 記錄「電話/LINE/簡訊」聯繫嘗試與結果，append 到工單 metadata.events。
 * 不改工單狀態，純稽核記錄。
 */
export type ContactAttemptInput = {
  ro_id: string;
  /** 聯繫方式：電話 / LINE / 簡訊 */
  contact_method: "電話" | "LINE" | "簡訊";
  /** 聯繫結果：接通 / 未接 / 留言 / 回覆 */
  contact_result: "接通" | "未接" | "留言" | "回覆";
  notes?: string | null;
};

export async function recordContactAttemptAction(
  input: ContactAttemptInput,
): Promise<ActionResult<{ id: string }>> {
  await requirePermission(PERMISSIONS.RO_CREATE);
  if (!input.ro_id) return { ok: false, error: "缺少工單 ID" };
  if (!input.contact_method) return { ok: false, error: "請選擇聯繫方式" };
  if (!input.contact_result) return { ok: false, error: "請選擇聯繫結果" };

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 確認 RO 存在且屬於當前 brand
  const { data: ro } = await supabase
    .from("repair_orders")
    .select("id")
    .eq("id", input.ro_id)
    .eq("brand_id", brand)
    .maybeSingle();
  if (!ro) return { ok: false, error: "找不到工單" };

  // append-only：寫 contact_attempt 事件到 metadata.events
  await appendRepairOrderEvent(input.ro_id, {
    action: "contact_attempt",
    payload: {
      method: input.contact_method,
      result: input.contact_result,
      notes: input.notes?.trim() || null,
    },
  });

  revalidatePath(`${PAGE_PATH}/${input.ro_id}`);
  return { ok: true, data: { id: input.ro_id } };
}
