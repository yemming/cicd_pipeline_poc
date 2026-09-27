import { stat } from "node:fs/promises";
import path from "node:path";

import { NextResponse } from "next/server";

// 每次 request 都在 runtime 讀 env，避免被 build 成靜態結果
export const dynamic = "force-dynamic";

/**
 * GET /api/version — 回傳目前部署的版本資訊（公開、無敏感資料）。
 * - commit：Docker build 時由 Zeabur 注入的 ZEABUR_GIT_COMMIT_SHA 烘進 APP_COMMIT_SHA（見 Dockerfile）
 * - builtAt：`next build` 產出的 .next/BUILD_ID 檔案時間（可用 APP_BUILT_AT 覆寫）
 * - node：runtime Node.js 版本
 * 任何欄位取不到都回 "unknown"，絕不 throw。
 */
function resolveCommit(): string {
  const candidates = [
    process.env.APP_COMMIT_SHA,
    process.env.GIT_COMMIT_SHA,
    process.env.ZEABUR_GIT_COMMIT_SHA,
    process.env.GITHUB_SHA,
    process.env.VERCEL_GIT_COMMIT_SHA,
  ];
  for (const c of candidates) {
    const v = c?.trim();
    if (v && v !== "unknown") return v;
  }
  return "unknown";
}

async function resolveBuiltAt(): Promise<string> {
  const fromEnv = process.env.APP_BUILT_AT?.trim();
  if (fromEnv) return fromEnv;
  try {
    const s = await stat(path.join(/* turbopackIgnore: true */ process.cwd(), ".next", "BUILD_ID"));
    return s.mtime.toISOString();
  } catch {
    return "unknown";
  }
}

export async function GET() {
  let builtAt = "unknown";
  try {
    builtAt = await resolveBuiltAt();
  } catch {
    // 保底：永遠不讓這支 route 500
  }
  return NextResponse.json(
    {
      commit: resolveCommit(),
      builtAt,
      node: process.version,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
