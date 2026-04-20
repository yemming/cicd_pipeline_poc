import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";
import { messagingApi } from "@line/bot-sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { upsertCandidate } from "@/lib/notifications/repositories/candidate.repo";
import { getNotificationEnv } from "@/lib/notifications/env";

// 每次 webhook 觸發都會自動把看到的 LINE userId/groupId/roomId 寫進
// notification_target_candidates，admin 在 /admin/notifications/targets
// 一鍵命名 + 啟用就升級為正式 target。不再需要 grep server log 的土法。

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LineSource =
  | { type: "user"; userId?: string }
  | { type: "group"; groupId?: string; userId?: string }
  | { type: "room"; roomId?: string; userId?: string };

interface LineEvent {
  type: string;
  source?: LineSource;
  message?: { type: string; text?: string };
  timestamp?: number;
}

interface LineWebhookBody {
  destination?: string;
  events?: LineEvent[];
}

function verifySignature(rawBody: string, signature: string | null, channelSecret: string): boolean {
  if (!signature) return false;
  const expected = crypto.createHmac("sha256", channelSecret).update(rawBody).digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function describeSource(src: LineSource | undefined): string {
  if (!src) return "unknown source";
  if (src.type === "group") return `type=group groupId=${src.groupId ?? "?"} userId=${src.userId ?? "?"}`;
  if (src.type === "room") return `type=room  roomId=${src.roomId ?? "?"}  userId=${src.userId ?? "?"}`;
  return `type=user  userId=${src.userId ?? "?"}`;
}

// LINE 的 source.type 對 candidate 的 (target_type, target_ref) 做 mapping
function extractRef(src: LineSource | undefined): {
  targetType: "user" | "group" | "room";
  targetRef: string;
  sourceUserId: string | null;
} | null {
  if (!src) return null;
  if (src.type === "user" && src.userId) {
    return { targetType: "user", targetRef: src.userId, sourceUserId: src.userId };
  }
  if (src.type === "group" && src.groupId) {
    return { targetType: "group", targetRef: src.groupId, sourceUserId: src.userId ?? null };
  }
  if (src.type === "room" && src.roomId) {
    return { targetType: "room", targetRef: src.roomId, sourceUserId: src.userId ?? null };
  }
  return null;
}

let _lineClient: messagingApi.MessagingApiClient | null = null;
function lineClient(): messagingApi.MessagingApiClient | null {
  if (_lineClient) return _lineClient;
  try {
    const env = getNotificationEnv();
    _lineClient = new messagingApi.MessagingApiClient({
      channelAccessToken: env.LINE_CHANNEL_ACCESS_TOKEN,
    });
    return _lineClient;
  } catch {
    return null;
  }
}

/**
 * 嘗試用 LINE API 抓 displayName：
 *  - user (個人 / 群組裡的某個成員) → getProfile / getGroupMemberProfile
 *  - group → getGroupSummary
 *  - room → 沒有對應 API，回 null
 *  失敗一律吞掉，不擋 webhook 流程
 */
async function fetchDisplayName(
  targetType: "user" | "group" | "room",
  targetRef: string,
  sourceUserId: string | null,
): Promise<string | null> {
  const cli = lineClient();
  if (!cli) return null;
  try {
    if (targetType === "user") {
      const p = await cli.getProfile(targetRef);
      return p?.displayName ?? null;
    }
    if (targetType === "group") {
      const summary = await cli.getGroupSummary(targetRef);
      const ownerName: string | null = sourceUserId
        ? await cli
            .getGroupMemberProfile(targetRef, sourceUserId)
            .then((p) => p?.displayName ?? null)
            .catch(() => null)
        : null;
      const groupName = summary?.groupName ?? null;
      if (groupName && ownerName) return `${groupName}（成員：${ownerName}）`;
      return groupName ?? ownerName;
    }
    return null;
  } catch (e) {
    console.warn("[LINE webhook] fetchDisplayName 失敗", { targetType, targetRef }, e);
    return null;
  }
}

async function recordCandidate(ev: LineEvent): Promise<void> {
  const ref = extractRef(ev.source);
  if (!ref) return;

  // 只把這幾種有意義的事件存成候選
  let discoveredVia: "follow" | "join" | "message" | "manual";
  if (ev.type === "follow") discoveredVia = "follow";
  else if (ev.type === "join") discoveredVia = "join";
  else if (ev.type === "message") discoveredVia = "message";
  else return; // unfollow / leave / postback 等先忽略

  const supabase = createServiceClient();
  const lastText =
    ev.message?.type === "text" && ev.message.text
      ? ev.message.text.slice(0, 200)
      : null;

  // 先寫一筆（無 displayName）— 確保即使 LINE API 失敗也有資料
  await upsertCandidate(supabase, {
    channel_code: "line",
    target_type: ref.targetType,
    target_ref: ref.targetRef,
    discovered_via: discoveredVia,
    source_user_id: ref.sourceUserId,
    last_message_text: lastText,
  });

  // 再嘗試補 displayName（可能要打 LINE API，慢一點）
  const displayName = await fetchDisplayName(ref.targetType, ref.targetRef, ref.sourceUserId);
  if (displayName) {
    await upsertCandidate(supabase, {
      channel_code: "line",
      target_type: ref.targetType,
      target_ref: ref.targetRef,
      discovered_via: discoveredVia,
      source_user_id: ref.sourceUserId,
      display_name: displayName,
      last_message_text: lastText,
    });
  }
}

export async function POST(req: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.error("[LINE webhook] LINE_CHANNEL_SECRET 未設定");
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-line-signature");

  if (!verifySignature(rawBody, signature, channelSecret)) {
    console.warn("[LINE webhook] 簽章驗證失敗（signature=%s）", signature);
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  let body: LineWebhookBody;
  try {
    body = JSON.parse(rawBody) as LineWebhookBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const events = body.events ?? [];

  // 側錄保留（短期內仍方便除錯）
  try {
    const logPath = path.join(process.cwd(), ".line-webhook.log");
    const entry = `[${new Date().toISOString()}] ${JSON.stringify(body)}\n`;
    await fs.appendFile(logPath, entry, "utf8");
  } catch (e) {
    console.warn("[LINE webhook] 寫入 .line-webhook.log 失敗", e);
  }

  console.log("╔══════════════════════════════════════════════════════════════════");
  console.log("║ [LINE webhook] 收到 %d 筆 event（destination=%s）", events.length, body.destination ?? "?");
  for (const ev of events) {
    console.log("║   · %s | %s", ev.type, describeSource(ev.source));
    if (ev.message?.type === "text") {
      console.log("║     text: %s", ev.message.text);
    }
  }
  console.log("╚══════════════════════════════════════════════════════════════════");

  // 並行處理 candidate（任一失敗不擋其他事件）
  await Promise.allSettled(events.map((ev) => recordCandidate(ev)));

  return NextResponse.json({ ok: true });
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "LINE webhook endpoint — POST only in production" });
}
