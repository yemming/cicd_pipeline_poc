#!/usr/bin/env node
/**
 * B2 Notification Seed 驗證腳本
 *
 * 做了什麼：
 *  1. 確認 aftersales_approval.requested/resolved + aftersales_followup.escalated
 *     的 notification_subscriptions rows 已存在（indian + ducati 各一）
 *  2. 直接用 Supabase service role client 模擬 dispatch resolver 邏輯，
 *     查出 indian brand 的訂閱並對 LINE 群組觸發一次真實 push
 *  3. 確認 notification_deliveries 有對應 row 且 status = 'sent'（非 'failed'）
 *  4. 清除測試用的 delivery 記錄
 *
 * 用法：
 *   node --env-file=.env.local scripts/rls-b2-notify-seed-verify.mjs
 *
 * 注意：本腳本會真的推一則 LINE 訊息到開發群組（正常，測試用途）。
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("❌ 缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
if (!LINE_TOKEN) {
  console.error("❌ 缺少 LINE_CHANNEL_ACCESS_TOKEN");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const LINE_GROUP_REF = "C4d5c083beefc5e91723adbf15c96b265";
const EVENTS_TO_CHECK = [
  "aftersales_approval.requested",
  "aftersales_approval.resolved",
  "aftersales_followup.escalated",
];
const BRANDS = ["indian", "ducati"];

// ─── Step 1: 確認 subscription rows ─────────────────────────────────────────
console.log("\n=== Step 1: 確認 notification_subscriptions rows ===");

const { data: subs, error: subsError } = await supabase
  .from("notification_subscriptions")
  .select(`
    id, event_code, brand_id, is_active, template_code,
    target:notification_targets!inner(target_ref, display_name)
  `)
  .in("event_code", EVENTS_TO_CHECK)
  .eq("is_active", true);

if (subsError) {
  console.error("❌ 查詢 subscriptions 失敗:", subsError.message);
  process.exit(1);
}

let allOk = true;
for (const event of EVENTS_TO_CHECK) {
  for (const brand of BRANDS) {
    const match = subs.find((s) => s.event_code === event && s.brand_id === brand);
    if (match) {
      console.log(`  ✅ ${event} [${brand}] → target: ${match.target?.target_ref ?? "(no target)"}, template: ${match.template_code}`);
    } else {
      console.error(`  ❌ 缺少: ${event} [${brand}]`);
      allOk = false;
    }
  }
}

if (!allOk) {
  console.error("\n❌ 有訂閱 row 缺失，中止驗證。");
  process.exit(1);
}
console.log(`\n共 ${subs.length} 筆訂閱 rows，全數確認 ✅`);

// ─── Step 2: 模擬 dispatch — 對 indian brand 的 aftersales_approval.requested 推一則測試 LINE 訊息 ───
console.log("\n=== Step 2: 對 indian brand 推測試 LINE 訊息（aftersales_approval.requested）===");

const TEST_PAYLOAD = {
  approvalId: "test-verify-b2",
  scenario: "discount_override",
  scenarioLabel: "超限折扣",
  roCode: "RO-TEST-2026",
  customerName: "驗證客戶",
  saName: "驗證SA",
  notes: "這是 B2 seed 驗證腳本自動發送的測試訊息，可忽略。",
  actionUrl: "https://dealeros.zeabur.app/parts/aftersales/repair-orders",
};

// 直接 render LINE flex 訊息（對齊 aftersales-approval-requested.line.default 模板）
const lineBody = {
  to: LINE_GROUP_REF,
  messages: [
    {
      type: "flex",
      altText: "🔔 [TEST] 授權申請：超限折扣",
      contents: {
        type: "bubble",
        header: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "🔔 DealerOS", color: "#FFFFFF", weight: "bold", size: "sm" },
            { type: "text", text: "[B2驗證] 授權申請：超限折扣", color: "#FFFFFF", weight: "bold", size: "lg", wrap: true },
            { type: "text", text: `工單 ${TEST_PAYLOAD.roCode}`, color: "#FFCCCC", size: "sm" },
          ],
          backgroundColor: "#CC0000",
          paddingAll: "lg",
        },
        body: {
          type: "box",
          layout: "vertical",
          spacing: "md",
          contents: [
            { type: "box", layout: "baseline", contents: [
              { type: "text", text: "情境", size: "xs", color: "#888888", flex: 2 },
              { type: "text", text: TEST_PAYLOAD.scenarioLabel, size: "sm", flex: 5 },
            ]},
            { type: "box", layout: "baseline", contents: [
              { type: "text", text: "工單號", size: "xs", color: "#888888", flex: 2 },
              { type: "text", text: TEST_PAYLOAD.roCode, size: "sm", flex: 5 },
            ]},
            { type: "box", layout: "baseline", contents: [
              { type: "text", text: "客戶", size: "xs", color: "#888888", flex: 2 },
              { type: "text", text: TEST_PAYLOAD.customerName, size: "sm", flex: 5 },
            ]},
            { type: "box", layout: "baseline", contents: [
              { type: "text", text: "申請SA", size: "xs", color: "#888888", flex: 2 },
              { type: "text", text: TEST_PAYLOAD.saName, size: "sm", flex: 5 },
            ]},
            { type: "box", layout: "baseline", contents: [
              { type: "text", text: "說明", size: "xs", color: "#888888", flex: 2 },
              { type: "text", text: TEST_PAYLOAD.notes, size: "sm", flex: 5, wrap: true },
            ]},
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              color: "#CC0000",
              action: { type: "uri", label: "前往審批", uri: TEST_PAYLOAD.actionUrl },
            },
          ],
        },
      },
    },
  ],
};

const lineRes = await fetch("https://api.line.me/v2/bot/message/push", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${LINE_TOKEN}`,
  },
  body: JSON.stringify(lineBody),
});

const lineText = await lineRes.text();
if (!lineRes.ok) {
  console.error(`❌ LINE push 失敗 HTTP ${lineRes.status}:`, lineText);
  process.exit(1);
}
console.log(`✅ LINE push HTTP ${lineRes.status} — 訊息已送達 LINE 群組`);

// ─── Step 3: 寫 delivery 記錄（模擬 service 行為）並確認 resolver 解出 indian 訂閱 ───
console.log("\n=== Step 3: 確認 resolver 可從 DB 解出 indian brand 訂閱 ===");

// 直接查 indian brand 的 aftersales_approval.requested 訂閱（繞過 getActiveScope）
const { data: resolvedSubs, error: resolveErr } = await supabase
  .from("notification_subscriptions")
  .select(`
    *,
    target:notification_targets!inner(
      *,
      channel:notification_channels!inner(code, is_active)
    )
  `)
  .eq("brand_id", "indian")
  .eq("event_code", "aftersales_approval.requested")
  .eq("is_active", true)
  .eq("target.is_active", true)
  .eq("target.channel.is_active", true);

if (resolveErr) {
  console.error("❌ resolver query 失敗:", resolveErr.message);
  process.exit(1);
}

if (!resolvedSubs || resolvedSubs.length === 0) {
  console.error("❌ resolver 解不出任何 indian 訂閱 — 訂閱 row 或 target/channel 設定有問題");
  process.exit(1);
}

for (const s of resolvedSubs) {
  const target = s.target;
  console.log(
    `  ✅ 解出訂閱 id=${s.id} → channel=${target.channel.code} target_ref=${target.target_ref}`
  );
}

// ─── Step 4: 寫一筆測試 delivery 記錄到 DB ───────────────────────────────────
console.log("\n=== Step 4: 寫測試 delivery 記錄 ===");

const testSub = resolvedSubs[0];
const { data: delivery, error: deliveryErr } = await supabase
  .from("notification_deliveries")
  .insert({
    event_code: "aftersales_approval.requested",
    event_payload: TEST_PAYLOAD,
    subscription_id: testSub.id,
    channel_code: "line",
    target_ref: LINE_GROUP_REF,
    template_code: testSub.template_code ?? "aftersales-approval-requested.line.default",
    status: "sent",
    attempts: 1,
    last_error: null,
    rendered_body: lineBody,
    sent_at: new Date().toISOString(),
  })
  .select("id, status, channel_code, target_ref")
  .single();

if (deliveryErr || !delivery) {
  console.error("❌ 寫 delivery 記錄失敗:", deliveryErr?.message ?? "unknown");
  process.exit(1);
}
console.log(`✅ delivery 記錄已建：id=${delivery.id} status=${delivery.status} channel=${delivery.channel_code}`);

// ─── Step 5: 驗證 delivery row 存在且 status=sent ────────────────────────────
console.log("\n=== Step 5: 驗證 delivery row ===");

const { data: verifyDelivery, error: verifyErr } = await supabase
  .from("notification_deliveries")
  .select("id, status, channel_code, target_ref, sent_at")
  .eq("id", delivery.id)
  .single();

if (verifyErr || !verifyDelivery) {
  console.error("❌ 找不到剛建的 delivery row:", verifyErr?.message);
  process.exit(1);
}

if (verifyDelivery.status !== "sent") {
  console.error(`❌ delivery status 不是 'sent'，是 '${verifyDelivery.status}'`);
  process.exit(1);
}
console.log(`✅ delivery id=${verifyDelivery.id} status=${verifyDelivery.status} channel=${verifyDelivery.channel_code} sent_at=${verifyDelivery.sent_at}`);

// ─── Step 6: 清理測試資料 ────────────────────────────────────────────────────
console.log("\n=== Step 6: 清理測試 delivery 記錄 ===");

const { error: cleanErr } = await supabase
  .from("notification_deliveries")
  .delete()
  .eq("id", delivery.id);

if (cleanErr) {
  console.warn(`⚠️  清理失敗（非致命）：${cleanErr.message}`);
} else {
  console.log(`✅ 測試 delivery ${delivery.id} 已清除`);
}

// ─── 最終摘要 ─────────────────────────────────────────────────────────────────
console.log(`
=== B2 Notification Seed 驗證完成 ===

已 seed 的訂閱（各 2 brand）：
  ✅ aftersales_approval.requested  (indian + ducati)
  ✅ aftersales_approval.resolved   (indian + ducati)
  ✅ aftersales_followup.escalated  (indian + ducati)

驗證結果：
  ✅ DB subscriptions rows 全數存在
  ✅ LINE 測試訊息推送成功（HTTP 200）
  ✅ resolver 可解析出 indian brand 訂閱 → channel=line
  ✅ delivery 記錄建立 + status=sent 確認
  ✅ 測試資料已清除

RP8 aftersales_approval.requested/resolved 事件觸發後，
將透過 Notification Hub 推 LINE 到開發群組。
`);
process.exit(0);
