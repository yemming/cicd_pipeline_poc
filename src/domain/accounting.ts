/**
 * 會計 / CoA domain helper — server-only。
 *
 * 統一入口：所有 UI / page.tsx 都從這裡 import accounting queries & actions，
 * 不要直接 import `@/lib/accounting/*`（POC 紀律 — 見 CLAUDE.md §資料存取架構）。
 *
 * 提供：
 *   - listPostableAccounts()  下拉可選的過帳科目（客戶詳情、料號設定…）
 *   - 從 `@/lib/accounting/queries` re-export 所有 list/get 查詢與型別
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";

// Re-export 所有 queries 與型別，UI 一律從 @/domain/accounting 進來
export * from "@/lib/accounting/queries";

export type AccountOption = {
  id: string;
  account_code: string;
  name_zh_tw: string;
};

export async function listPostableAccounts(): Promise<AccountOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, name_zh_tw")
    .eq("is_active", true)
    .eq("is_postable", true)
    .order("account_code");
  if (error) throw new Error(`listPostableAccounts: ${error.message}`);
  return (data ?? []) as AccountOption[];
}
