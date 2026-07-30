import type { SupabaseClient } from "@supabase/supabase-js";
import { getActiveScope } from "@/lib/scope/active-scope";
import { writeAuditLog } from "@/domain/audit-logs";
import { createInappNotifications } from "@/domain/user-notifications";
import {
  listActiveEmployeesByRole,
  listEmployeeUserIdsByRole,
  listRoleOptions,
} from "@/domain/line-binding";
import type { NotificationEvent, NotificationTargetRow, TemplateDefinition } from "../types";
import {
  listActiveByEvent,
  listActiveRoleSubscriptionsByEvent,
  type ResolvedSubscription,
} from "../repositories/subscription.repo";
import { getTemplate } from "../templates/registry";

export interface ResolvedRecipient {
  subscription: ResolvedSubscription["subscription"];
  target: ResolvedSubscription["target"];
  channelCode: ResolvedSubscription["channelCode"];
  template: TemplateDefinition;
}

/** 角色路由沒人可送時，避免同一筆訂閱在短時間內重複發告警轟炸管理員（例如同一事件短時間觸發多次）。 */
const roleFailureAlertedRecently = new Map<string, number>();
const ROLE_FAILURE_ALERT_COOLDOWN_MS = 30 * 60 * 1000; // 30 分鐘

/**
 * 給定事件 → 解析出所有要發送的 (target + template) 組合。
 *
 * 流程：
 *   1. 決定 brandId：優先吃 event.dealerId（呼叫端明確指定，cron/webhook 一定要傳，
 *      不然會 fallback 到 activeScope() 讀 cookie，cron/webhook 沒有 session cookie
 *      時會再退到 env 預設品牌——這正是過去「通知都送到同一品牌」的根因之一）。
 *   2. target_id 導向（群組/webhook）：listActiveByEvent，跟以前一樣。
 *   3. target_role 導向（角色路由，Russell 2026-07-28 第二版指令新增）：
 *      查有這個角色代碼、在職、已綁 LINE 的員工，每人各自算一個 recipient；
 *      一個都沒有時寫 audit log + 站內通知提醒 manager 角色的人去催綁定。
 *   4. 依 filter_rules 過濾（MVP：只支援 dealer_id 精確比對）
 *   5. 為每個 subscription 解析 template（DB 覆寫 > code registry）
 *   6. 無對應 template 的直接略過（印 warning），不擋其他 recipient
 */
export async function resolveRecipients(
  supabase: SupabaseClient,
  event: NotificationEvent,
): Promise<ResolvedRecipient[]> {
  const brandId = event.dealerId ?? (await getActiveScope()).brand_id;

  const [groupSubs, roleSubs] = await Promise.all([
    listActiveByEvent(supabase, event.code, brandId),
    listActiveRoleSubscriptionsByEvent(supabase, event.code, brandId),
  ]);

  const recipients: ResolvedRecipient[] = [];

  // ── 既有：target_id 導向（群組 / webhook） ──
  for (const s of groupSubs) {
    if (!matchFilterRules(s.subscription.filter_rules, event)) continue;
    const tpl = await getTemplate(supabase, {
      eventCode: event.code,
      channelCode: s.channelCode,
      code: s.subscription.template_code,
    });
    if (!tpl) {
      console.warn(
        "[notifications] 無模板：event=%s channel=%s（subscription %s 略過）",
        event.code,
        s.channelCode,
        s.subscription.id,
      );
      continue;
    }
    recipients.push({
      subscription: s.subscription,
      target: s.target,
      channelCode: s.channelCode,
      template: tpl,
    });
  }

  // ── 新增：target_role 導向（角色 → 個人 LINE） ──
  for (const sub of roleSubs) {
    if (!matchFilterRules(sub.filter_rules, event)) continue;
    const roleCode = sub.target_role;
    if (!roleCode) continue; // 理論上不會發生（query 已濾 not null），型別保險

    const employees = await listActiveEmployeesByRole(brandId, roleCode);

    if (employees.length === 0) {
      await alertRoleRoutingHasNoRecipient(brandId, event, roleCode, sub.id);
      continue;
    }

    const tpl = await getTemplate(supabase, {
      eventCode: event.code,
      channelCode: "line",
      code: sub.template_code,
    });
    if (!tpl) {
      console.warn(
        "[notifications] 無模板：event=%s channel=line（角色路由 subscription %s 略過）",
        event.code,
        sub.id,
      );
      continue;
    }

    const nowIso = new Date().toISOString();
    for (const emp of employees) {
      const syntheticTarget: NotificationTargetRow = {
        id: `role:${roleCode}:${emp.employeeId}`,
        channel_id: "",
        target_type: "user",
        target_ref: emp.lineUserId,
        display_name: emp.name,
        metadata: {},
        is_active: true,
        created_at: nowIso,
        updated_at: nowIso,
      };
      recipients.push({
        subscription: sub,
        target: syntheticTarget,
        channelCode: "line",
        template: tpl,
      });
    }
  }

  return recipients;
}

/**
 * 角色路由找不到任何已綁定 LINE 的員工時：寫 audit log（可稽核）+ 站內通知
 * manager（店長/區經理）角色的人去催員工完成綁定。30 分鐘內同一角色+事件只
 * 警示一次，避免同一事件短時間觸發多次時洗版。
 */
async function alertRoleRoutingHasNoRecipient(
  brandId: string,
  event: NotificationEvent,
  roleCode: string,
  subscriptionId: string,
): Promise<void> {
  const cooldownKey = `${brandId}:${event.code}:${roleCode}`;
  const last = roleFailureAlertedRecently.get(cooldownKey);
  const now = Date.now();
  if (last && now - last < ROLE_FAILURE_ALERT_COOLDOWN_MS) return;
  roleFailureAlertedRecently.set(cooldownKey, now);

  await writeAuditLog({
    table_name: "notification_subscriptions",
    record_id: subscriptionId,
    action: "NOTIFICATION_LINE_NO_BINDING",
    brand_id: brandId,
    after: { event_code: event.code, target_role: roleCode },
  });

  try {
    const roleLabel =
      (await listRoleOptions()).find((r) => r.code === roleCode)?.label ?? roleCode;
    const managerUserIds = await listEmployeeUserIdsByRole(brandId, "manager");
    if (managerUserIds.length === 0) return; // 連 manager 都沒人，只能靠 audit log 事後查

    await createInappNotifications(
      managerUserIds.map((userId) => ({
        recipient_user_id: userId,
        event_code: event.code,
        title: "⚠️ LINE 通知未送達",
        body: `「${event.code}」事件的通知，因為沒有${roleLabel}綁定 LINE，通知未能發送。請提醒相關員工到「個人設定 → 通知」完成 LINE 綁定。`,
        priority: "orange",
        brand_id: brandId,
      })),
    );
  } catch (e) {
    console.error("[notifications] 角色路由無收件人的站內告警發送失敗（不影響主流程）", e);
  }
}

/**
 * filter_rules 比對（MVP 規格：只支援 dealer_id）
 * 未來擴充方向：actor 角色、payload key 白名單、時段、地區 etc.
 */
function matchFilterRules(
  rules: Record<string, unknown>,
  event: NotificationEvent,
): boolean {
  if (!rules || Object.keys(rules).length === 0) return true;

  if ("dealer_id" in rules) {
    const want = rules.dealer_id;
    if (typeof want === "string" && want.length > 0) {
      if (event.dealerId !== want) return false;
    }
  }
  return true;
}
