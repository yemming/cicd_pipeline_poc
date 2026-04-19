import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelCode,
  EventCode,
  NotificationTemplateRow,
  TemplateDefinition,
  TemplateFormat,
} from "../types";
import { findTemplateOverride } from "../repositories/template.repo";
import { renderDbTemplate } from "./kits";

import { workOrderCreatedLine, workOrderCreatedGoogleChat } from "./work-order-created";
import { workOrderStatusChangedLine, workOrderStatusChangedGoogleChat } from "./work-order-status-changed";
import { serviceRequestCreatedLine, serviceRequestCreatedGoogleChat } from "./service-request-created";
import { vehiclePdiCompletedLine, vehiclePdiCompletedGoogleChat } from "./vehicle-pdi-completed";
import { customerHandoverScheduledLine, customerHandoverScheduledGoogleChat } from "./customer-handover-scheduled";
import { feedbackTicketCreatedLine, feedbackTicketCreatedGoogleChat } from "./feedback-ticket-created";

// Code-registered 預設模板集合（本 repo 內建、版本隨 git 追蹤）
const CODE_TEMPLATES: TemplateDefinition[] = [
  workOrderCreatedLine,
  workOrderCreatedGoogleChat,
  workOrderStatusChangedLine,
  workOrderStatusChangedGoogleChat,
  serviceRequestCreatedLine,
  serviceRequestCreatedGoogleChat,
  vehiclePdiCompletedLine,
  vehiclePdiCompletedGoogleChat,
  customerHandoverScheduledLine,
  customerHandoverScheduledGoogleChat,
  feedbackTicketCreatedLine,
  feedbackTicketCreatedGoogleChat,
];

/** 以 `eventCode:channelCode` / `code` 建兩個索引 */
const byEventChannel = new Map<string, TemplateDefinition>();
const byCode = new Map<string, TemplateDefinition>();
for (const tpl of CODE_TEMPLATES) {
  byEventChannel.set(`${tpl.eventCode}:${tpl.channelCode}`, tpl);
  byCode.set(tpl.code, tpl);
}

export function listCodeTemplates(): TemplateDefinition[] {
  return [...CODE_TEMPLATES];
}

export function getCodeTemplate(
  eventCode: EventCode,
  channelCode: ChannelCode,
  code?: string | null,
): TemplateDefinition | null {
  if (code) {
    const byCodeHit = byCode.get(code);
    if (byCodeHit) return byCodeHit;
  }
  return byEventChannel.get(`${eventCode}:${channelCode}`) ?? null;
}

/**
 * 取模板：DB 覆寫 > code registry。
 * DB 的 body 支援 `{{varName}}` 字面量插值。
 */
export async function getTemplate(
  supabase: SupabaseClient,
  opts: { eventCode: EventCode; channelCode: ChannelCode; code?: string | null },
): Promise<TemplateDefinition | null> {
  const override = await findTemplateOverride(supabase, opts);
  if (override) return rowToDefinition(override);

  return getCodeTemplate(opts.eventCode, opts.channelCode, opts.code);
}

function rowToDefinition(row: NotificationTemplateRow): TemplateDefinition {
  return {
    code: row.code,
    eventCode: row.event_code,
    channelCode: row.channel_code,
    format: row.format as TemplateFormat,
    description: row.description ?? undefined,
    render: (payload) => renderDbTemplate(row.body, payload),
  };
}
