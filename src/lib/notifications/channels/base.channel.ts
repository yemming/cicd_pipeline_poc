import type {
  ChannelCode,
  ChannelSendResult,
  NotificationChannel,
  TargetRef,
  TemplateDefinition,
} from "../types";

/**
 * Channel 抽象基底：共用 retry wrapper + render passthrough。
 * Phase 2 LINE / Google Chat channel 只需實作 doSend。
 */
export abstract class BaseChannel implements NotificationChannel {
  abstract readonly code: ChannelCode;

  protected abstract doSend(
    target: TargetRef,
    renderedBody: unknown,
  ): Promise<ChannelSendResult>;

  async send(target: TargetRef, body: unknown): Promise<ChannelSendResult> {
    return withRetry(
      () => this.doSend(target, body),
      { maxAttempts: 3, backoffMs: [1000, 2000, 4000] },
    );
  }

  render(template: TemplateDefinition, payload: Record<string, unknown>): unknown {
    return template.render(payload);
  }
}

export interface RetryOptions {
  maxAttempts: number;
  backoffMs: number[];
}

/**
 * 通用 retry wrapper：
 * - 回傳 ok=false + retryable=true  → 等 backoff 再重試
 * - 回傳 ok=false + retryable=false → 直接回傳（4xx 非 429）
 * - 回傳 ok=true                    → 成功
 * - throw                           → 視為 retryable，同上退避
 */
export async function withRetry(
  fn: () => Promise<ChannelSendResult>,
  opts: RetryOptions,
): Promise<ChannelSendResult> {
  let lastResult: ChannelSendResult | null = null;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      const res = await fn();
      if (res.ok) return res;
      lastResult = res;

      // 明確不可 retry → 直接回
      if (res.error && res.error.retryable === false) return res;
      // 最後一次就別等了
      if (attempt === opts.maxAttempts) break;

      const wait = opts.backoffMs[Math.min(attempt - 1, opts.backoffMs.length - 1)];
      await sleep(wait);
    } catch (e) {
      lastError = e;
      if (attempt === opts.maxAttempts) break;
      const wait = opts.backoffMs[Math.min(attempt - 1, opts.backoffMs.length - 1)];
      await sleep(wait);
    }
  }

  if (lastResult) return lastResult;
  return {
    ok: false,
    error: {
      code: "RETRY_EXHAUSTED",
      message: lastError instanceof Error ? lastError.message : String(lastError ?? "unknown"),
      retryable: true,
      raw: lastError,
    },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
