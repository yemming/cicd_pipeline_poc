/**
 * 會計 / CoA 共用 helper — server-only。
 *
 * 提供「下拉可選的過帳科目」共用點：客戶詳情、料號設定、未來的供應商 / 員工
 * 都要選 receivable / payable / 各類 control account。先用最小 API：
 *   - listPostableAccounts()  全 brand 共用（chart_of_accounts 沒 brand 維度）
 *
 * 既有的 `src/domain/items.ts → listPostableAccountsForItem()` 邏輯一致，B5 收尾
 * 時內部會改 call 此檔；外部簽名保持向後相容。
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";

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
