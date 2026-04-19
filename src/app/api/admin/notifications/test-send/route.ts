import { after } from "next/server";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { notifications } from "@/lib/notifications";
import type { EventCode } from "@/lib/notifications";
import { ensureAdmin } from "@/lib/notifications/http";

// POST /api/admin/notifications/test-send
//
// 兩種模式：
//   1. direct 模式：指定 channelCode + targetRef → 直接送（繞過訂閱）
//      body: { mode: 'direct', channelCode, targetRef, eventCode, payload, templateCode? }
//   2. dispatch 模式：走完整訂閱 resolver 流程，驗 Phase 3 end-to-end
//      body: { mode: 'dispatch', eventCode, payload }
//
// 預設 async=false（同步等 response），回傳 deliveryId + sent/failed 統計。
// async=true 時用 next/server 的 after() 非阻塞，立刻回 202 + 請用 /api/admin/notifications/deliveries 查結果。

const directSchema = z.object({
  mode: z.literal("direct"),
  channelCode: z.enum(["line", "google-chat"]),
  targetRef: z.string().min(1),
  eventCode: z.string().min(1),
  templateCode: z.string().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});

const dispatchSchema = z.object({
  mode: z.literal("dispatch").default("dispatch"),
  eventCode: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
  dealerId: z.string().optional(),
  async: z.boolean().default(false),
});

const bodySchema = z.union([directSchema, dispatchSchema]);

export async function POST(req: NextRequest) {
  const guard = await ensureAdmin(req);
  if (guard) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "request body 不是合法 JSON" } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_BODY",
          message: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
        },
      },
      { status: 400 },
    );
  }

  const body = parsed.data;

  // direct 模式
  if (body.mode === "direct") {
    const { deliveryId, result } = await notifications.sendDirect({
      channelCode: body.channelCode,
      targetRef: body.targetRef,
      templateCode: body.templateCode,
      eventCode: body.eventCode as EventCode,
      payload: body.payload,
    });
    return NextResponse.json({
      mode: "direct",
      deliveryId,
      ok: result.ok,
      providerMessageId: result.providerMessageId,
      error: result.error,
    });
  }

  // dispatch 模式
  const dispatchEvent = {
    code: body.eventCode as EventCode,
    payload: body.payload,
    dealerId: body.dealerId,
  };

  if (body.async) {
    // Next 16 after()：回 response 之後才跑 dispatch，驗證非阻塞
    after(async () => {
      try {
        const r = await notifications.dispatch(dispatchEvent);
        console.log(
          "[test-send async] %s — attempted=%d sent=%d failed=%d",
          body.eventCode,
          r.attempted,
          r.sent,
          r.failed,
        );
      } catch (e) {
        console.error("[test-send async] dispatch error", e);
      }
    });
    return NextResponse.json({ mode: "dispatch-async", accepted: true }, { status: 202 });
  }

  const t0 = Date.now();
  const result = await notifications.dispatch(dispatchEvent);
  const ms = Date.now() - t0;
  return NextResponse.json({ mode: "dispatch-sync", elapsedMs: ms, ...result });
}
