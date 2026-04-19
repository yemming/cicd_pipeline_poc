import type { SupabaseClient } from "@supabase/supabase-js";
import type { NotificationEvent, TemplateDefinition } from "../types";
import {
  listActiveByEvent,
  type ResolvedSubscription,
} from "../repositories/subscription.repo";
import { getTemplate } from "../templates/registry";

export interface ResolvedRecipient {
  subscription: ResolvedSubscription["subscription"];
  target: ResolvedSubscription["target"];
  channelCode: ResolvedSubscription["channelCode"];
  template: TemplateDefinition;
}

/**
 * 給定事件 → 解析出所有要發送的 (target + template) 組合。
 *
 * 流程：
 *   1. 從 DB 撈出 event_code + is_active 的 subscriptions（含 join target/channel）
 *   2. 依 filter_rules 過濾（MVP：只支援 dealer_id 精確比對）
 *   3. 為每個 subscription 解析 template（DB 覆寫 > code registry）
 *   4. 無對應 template 的直接略過（印 warning），不擋其他 recipient
 */
export async function resolveRecipients(
  supabase: SupabaseClient,
  event: NotificationEvent,
): Promise<ResolvedRecipient[]> {
  const subs = await listActiveByEvent(supabase, event.code);
  const matched = subs.filter((s) => matchFilterRules(s.subscription.filter_rules, event));

  const recipients: ResolvedRecipient[] = [];
  for (const s of matched) {
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
  return recipients;
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
