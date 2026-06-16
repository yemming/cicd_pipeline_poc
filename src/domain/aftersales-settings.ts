/**
 * Domain helper — 售後/營運時間設定
 *
 * 退料閉環與 TL 借用工單需要「當天下班時間」作為待確認/結案截止點（due_by）。
 * 來源：system_settings.settings.closing_time（"HH:mm"，Asia/Taipei）。
 * POC 階段 settings 多半為空 → fallback 18:00。
 *
 * Taipei 固定 UTC+8（無 DST），故 today HH:mm Taipei == UTC Date.UTC(y,m,d,HH-8,mm)。
 */

import { createClient } from "@/lib/supabase/server";

const DEFAULT_CLOSING_TIME = "18:00"; // Asia/Taipei

/**
 * 純函式：給定 closing_time "HH:mm"，回傳「今天該時刻（Asia/Taipei）」的 UTC ISO 字串。
 * 跨午夜/負時偏移由 Date.UTC 自動正規化。
 */
export function todayClosingIso(closingTime: string = DEFAULT_CLOSING_TIME): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(closingTime.trim());
  const hh = m ? Number(m[1]) : 18;
  const mm = m ? Number(m[2]) : 0;
  const now = new Date();
  // 取得 Taipei 當前日曆日
  const taipei = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = taipei.getFullYear();
  const mon = taipei.getMonth();
  const d = taipei.getDate();
  // Taipei HH:mm == UTC (HH-8):mm（UTC+8 固定）
  const utcMs = Date.UTC(y, mon, d, hh - 8, mm, 0, 0);
  return new Date(utcMs).toISOString();
}

/**
 * 讀 system_settings.settings.closing_time，算出今天下班截止時間（UTC ISO）。
 * 找不到設定 → 18:00 Asia/Taipei。
 */
export async function getTodayClosingTime(): Promise<string> {
  try {
    const sb = await createClient();
    const { data } = await sb
      .from("system_settings")
      .select("settings")
      .limit(1)
      .maybeSingle();
    const settings = ((data?.settings ?? {}) as Record<string, unknown>) || {};
    const ct =
      typeof settings.closing_time === "string" && settings.closing_time.trim()
        ? settings.closing_time.trim()
        : DEFAULT_CLOSING_TIME;
    return todayClosingIso(ct);
  } catch {
    return todayClosingIso(DEFAULT_CLOSING_TIME);
  }
}
