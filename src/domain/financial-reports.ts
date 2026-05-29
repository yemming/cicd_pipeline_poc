import "server-only";

import { createServiceClient } from "@/lib/supabase/service";
import { getDefaultTenantUuid, type CoaRow } from "@/lib/accounting/queries";

/**
 * P4 財務報表 domain helper — UI 唯一入口。
 *
 * 本輪只做 TB（試算表）。口徑＝NetSuite「期末科目餘額試算表」：
 * 每科目顯示截至 as_of 的累計淨額（net = ΣDebit − ΣCredit, post-inception），
 * net>0 進借方欄、net<0 取絕對值進貸方欄。整體 ΣnetLeaf=0 → 永遠平衡。
 *
 * 聚合（葉節點 L5）下放 RPC fn_gl_account_balances；五層 rollup 在此用 parent_code 在 TS 跑。
 * IS / BS / CF / aging 後續輪重用同一 RPC + 同檔。
 */

type CoaLevel = CoaRow["level"];
type L1Category = CoaRow["l1_category"];

/** level → 縮排深度（0..4），與 account_code 長度脫鉤、純看層級 */
const LEVEL_DEPTH: Record<CoaLevel, number> = {
  L1_CATEGORY: 0,
  L2_SUBCATEGORY: 1,
  L3_MOEA: 2,
  L4_PARENT: 3,
  L5_DETAIL: 4,
};

export type TrialBalanceRow = {
  id: string;
  account_code: string;
  name_zh_tw: string;
  display_indent_name: string | null;
  level: CoaLevel;
  /** 縮排深度 0(L1)..4(L5) */
  depth: number;
  l1_category: L1Category;
  normal_balance: "D" | "C";
  is_postable: boolean;
  /** rollup 後 net>0 的金額，否則 0 */
  debit_balance: number;
  /** rollup 後 net<0 的絕對值，否則 0 */
  credit_balance: number;
  /** 此科目（含其子樹）是否有過帳活動 */
  has_activity: boolean;
};

export type TrialBalanceResult = {
  rows: TrialBalanceRow[];
  /** 借方合計（只加葉節點，避免父子雙計） */
  grand_total_debit: number;
  /** 貸方合計（只加葉節點） */
  grand_total_credit: number;
  balanced: boolean;
  /** 借−貸（理論上 0；不為 0 即子帳有問題） */
  diff: number;
  as_of: string;
  date_from: string | null;
  subsidiary_id: string | null;
};

export type PeriodOption = {
  id: string;
  fiscal_year: number;
  period_number: number;
  start_date: string;
  end_date: string;
  label: string;
};

export type SubsidiaryOption = {
  id: string;
  name: string;
};

/** Supabase 把 numeric 欄位回成字串，金額一律 Number() 收斂（house idiom） */
function num(v: unknown): number {
  return Number(v) || 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** fallback：as_of 未指定時用台北今日（頁面正常會傳明確期末日） */
function todayTaipei(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei" }).format(
    new Date(),
  );
}

type CoaTreeRow = {
  id: string;
  account_code: string;
  parent_code: string | null;
  level: CoaLevel;
  name_zh_tw: string;
  display_indent_name: string | null;
  l1_category: L1Category;
  normal_balance: "D" | "C";
  is_postable: boolean;
};

/**
 * 試算表。
 * @param filters.as_of      截止日（含）；未給用台北今日
 * @param filters.date_from  起算日（含）；未給＝post-inception 累計
 * @param filters.subsidiary_id  法人 uuid；'all'/未給＝全法人
 */
export async function getTrialBalance(
  filters: {
    as_of?: string;
    date_from?: string;
    subsidiary_id?: string;
  } = {},
): Promise<TrialBalanceResult> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();

  const asOf = filters.as_of ?? todayTaipei();
  const dateFrom = filters.date_from ?? null;
  const subsidiaryId =
    filters.subsidiary_id && filters.subsidiary_id !== "all"
      ? filters.subsidiary_id
      : null;

  // 1. RPC：葉節點(L5) ΣDebit/ΣCredit
  const { data: aggData, error: aggErr } = await sb.rpc(
    "fn_gl_account_balances",
    {
      p_tenant: tenant,
      p_date_to: asOf,
      p_date_from: dateFrom,
      p_subsidiary: subsidiaryId,
    },
  );
  if (aggErr) throw new Error(`fn_gl_account_balances: ${aggErr.message}`);
  const leaves = (aggData ?? []) as Array<{
    coa_id: string;
    debit: number | string;
    credit: number | string;
  }>;

  // 2. 全 COA 樹（is_active）— account_code 排序即樹狀 pre-order（prefix 編碼）
  const { data: coaData, error: coaErr } = await sb
    .from("chart_of_accounts")
    .select(
      "id, account_code, parent_code, level, name_zh_tw, display_indent_name, l1_category, normal_balance, is_postable",
    )
    .eq("tenant_id", tenant)
    .eq("is_active", true)
    .order("account_code");
  if (coaErr) throw new Error(`coa tree: ${coaErr.message}`);
  const coaRows = (coaData ?? []) as unknown as CoaTreeRow[];

  const byCode = new Map<string, CoaTreeRow>();
  const idToCode = new Map<string, string>();
  for (const r of coaRows) {
    byCode.set(r.account_code, r);
    idToCode.set(r.id, r.account_code);
  }

  // 3. rollup：葉 net 沿 parent_code 累加到自己 + 所有祖先
  const netByCode = new Map<string, number>();
  const touched = new Set<string>();
  // grand total 直接由 RPC 葉節點 sign-split 算（與 COA 樹脫鉤，孤兒葉也不漏算）
  let grandDebit = 0;
  let grandCredit = 0;

  for (const lf of leaves) {
    const net = num(lf.debit) - num(lf.credit);
    if (net > 0) grandDebit += net;
    else if (net < 0) grandCredit += -net;

    const code = idToCode.get(lf.coa_id);
    if (!code) continue; // 孤兒（過帳到非 active 科目）：仍計入 grand total，僅不顯示於樹
    let cur: string | null | undefined = code;
    const guard = new Set<string>(); // 防 parent_code 自環
    while (cur && byCode.has(cur) && !guard.has(cur)) {
      guard.add(cur);
      netByCode.set(cur, (netByCode.get(cur) ?? 0) + net);
      touched.add(cur);
      cur = byCode.get(cur)!.parent_code;
    }
  }

  const rows: TrialBalanceRow[] = coaRows.map((r) => {
    const net = netByCode.get(r.account_code) ?? 0;
    return {
      id: r.id,
      account_code: r.account_code,
      name_zh_tw: r.name_zh_tw,
      display_indent_name: r.display_indent_name,
      level: r.level,
      depth: LEVEL_DEPTH[r.level] ?? 0,
      l1_category: r.l1_category,
      normal_balance: r.normal_balance,
      is_postable: r.is_postable,
      debit_balance: net > 0 ? round2(net) : 0,
      credit_balance: net < 0 ? round2(-net) : 0,
      has_activity: touched.has(r.account_code),
    };
  });

  const gDebit = round2(grandDebit);
  const gCredit = round2(grandCredit);
  const diff = round2(gDebit - gCredit);

  return {
    rows,
    grand_total_debit: gDebit,
    grand_total_credit: gCredit,
    balanced: Math.abs(diff) < 0.01,
    diff,
    as_of: asOf,
    date_from: dateFrom,
    subsidiary_id: subsidiaryId,
  };
}

/** filter bar：MONTH 會計期間下拉（截止期間） */
export async function listReportPeriods(): Promise<PeriodOption[]> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();
  const { data, error } = await sb
    .from("accounting_periods")
    .select("id, fiscal_year, period_number, start_date, end_date")
    .eq("tenant_id", tenant)
    .eq("period_type", "MONTH")
    .order("start_date");
  if (error) throw new Error(`report periods: ${error.message}`);
  return (
    (data ?? []) as Array<{
      id: string;
      fiscal_year: number;
      period_number: number;
      start_date: string;
      end_date: string;
    }>
  ).map((p) => ({
    id: p.id,
    fiscal_year: p.fiscal_year,
    period_number: p.period_number,
    start_date: p.start_date,
    end_date: p.end_date,
    label: `${p.fiscal_year}-${String(p.period_number).padStart(2, "0")}（截至 ${p.end_date}）`,
  }));
}

/** filter bar：法人下拉（排除虛擬 root 控股） */
export async function listReportSubsidiaries(): Promise<SubsidiaryOption[]> {
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("subsidiaries")
    .select("id, short_name, legal_name")
    .eq("is_active", true)
    .eq("is_root", false)
    .order("short_name");
  if (error) throw new Error(`report subsidiaries: ${error.message}`);
  return (
    (data ?? []) as Array<{
      id: string;
      short_name: string | null;
      legal_name: string | null;
    }>
  ).map((s) => ({ id: s.id, name: s.short_name || s.legal_name || s.id }));
}
