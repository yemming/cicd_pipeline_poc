import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

// Phase 0 一次性用途：把 Bot 加進 LINE 群組後，隨便在群組發一句話，
// 此 endpoint 會把 event.source.groupId / userId 印到 server log，方便抓 ID 寫入 DB。
// Phase 3 之後 Notification Hub 只做 push、不需要接收，此 endpoint 保留為 noop / 除錯用。

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
  // constant-time compare
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

export async function POST(req: NextRequest) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.error("[LINE webhook] LINE_CHANNEL_SECRET 未設定");
    return NextResponse.json({ error: "server_not_configured" }, { status: 500 });
  }

  // LINE Platform 需要讀 raw body 驗簽
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

  // Phase 0 側錄：events 寫入專案 root 的 .line-webhook.log，方便 CLI 直接撈 groupId
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
    if (ev.source?.type === "group" && ev.source.groupId) {
      console.log("║     👉 GROUP ID → %s", ev.source.groupId);
      console.log("║     把上面這串 groupId 貼給我，寫進 notification_targets.target_ref");
    }
  }
  console.log("╚══════════════════════════════════════════════════════════════════");

  // LINE 要求 2xx 才算處理成功
  return NextResponse.json({ ok: true });
}

// LINE 後台驗證 webhook 時會發 GET，回 200 讓它 happy
export async function GET() {
  return NextResponse.json({ ok: true, hint: "LINE webhook endpoint — POST only in production" });
}
