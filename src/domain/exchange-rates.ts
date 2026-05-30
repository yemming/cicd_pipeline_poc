import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

import { getDefaultTenantUuid } from "@/lib/accounting/queries";

/**
 * 匯率 domain facade — 單據過帳時把交易幣別換算成本位幣（func）的唯一入口。
 *
 * 規則：
 * - 同幣別（from === to）直接回 1
 * - 查 exchange_rates 最接近 rate_date（<= 指定日）的一筆
 * - 查無 → 回 1 並在 server log 警告（POC 階段不擋；正式環境應改丟錯或補抓即期匯率）
 */
export async function getRate(
  fromCurrency: string,
  toCurrency: string,
  rateDate?: string,
  rateType: string = "spot",
): Promise<number> {
  if (fromCurrency === toCurrency) return 1;

  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();
  const onDate = rateDate ?? new Date().toISOString().slice(0, 10);

  const { data } = await sb
    .from("exchange_rates")
    .select("rate")
    .eq("tenant_id", tenant)
    .eq("from_currency", fromCurrency)
    .eq("to_currency", toCurrency)
    .eq("rate_type", rateType)
    .lte("rate_date", onDate)
    .order("rate_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data?.rate) {
    console.warn(
      `[exchange-rates] 查無 ${fromCurrency}→${toCurrency} @${onDate}（${rateType}），暫回 1`,
    );
    return 1;
  }
  return Number(data.rate);
}
