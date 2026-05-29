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

// ============================================================
// P4 損益表 (Income Statement) — 期間損益
//
// 與 TB 兩處不同：
//  (1) 期間數（date_from~date_to）非累計餘額 — 重用 RPC 傳 p_date_from。
//  (2) 只取損益類（l1_category 4-8）；每科目金額＝「淨利貢獻」= ΣCredit − ΣDebit
//      → 收入(+)、成本費用(−)，contra-revenue(銷貨退回)與營業外收支自動分號，無需 case-by-case。
//
// L1 節點本身即各類合計（4 營收 / 5 成本 / 6 費用 / 7 營業外 / 8 稅），故僅在區塊「之間」
// 插跨區小計（毛利 / 營業利益 / 稅前淨利）與總計（本期淨利），不重複插「XX 合計」。
// ============================================================

/** 損益類 l1_category（account_code 開頭 4-8）；資產負債權益(1-3)留給 BS */
const IS_PL_CATEGORIES: ReadonlySet<L1Category> = new Set([
  "REVENUE",
  "COGS",
  "EXPENSE",
  "NON_OPERATING",
  "TAX",
]);

export type IncomeStatementRow = {
  id: string;
  /** account=科目列；subtotal=小計/總計列 */
  kind: "account" | "subtotal";
  account_code: string; // subtotal 為 ""
  name_zh_tw: string;
  level: CoaLevel | null; // subtotal 為 null
  /** 縮排深度 0(L1)..4(L5)；subtotal=0 */
  depth: number;
  l1_category: L1Category | null;
  /** 對本期淨利的貢獻：收入(+)、成本費用(−)。subtotal=該層累計小計 */
  amount: number;
  /** account：該科目(含子樹)有過帳活動；subtotal 恆 true */
  has_activity: boolean;
  /** 本期淨利那條（視覺最強調） */
  is_grand_total: boolean;
};

export type IncomeStatementResult = {
  rows: IncomeStatementRow[];
  revenue_total: number; // 營業收入
  cogs_total: number; // 營業成本（≤0）
  gross_profit: number; // 營業毛利
  opex_total: number; // 營業費用（≤0）
  operating_income: number; // 營業利益
  non_operating_total: number; // 營業外收支淨額
  income_before_tax: number; // 稅前淨利
  tax_total: number; // 所得稅（≤0）
  net_income: number; // 本期淨利
  date_from: string;
  date_to: string;
  subsidiary_id: string | null;
};

/**
 * 損益表（期間數）。
 * @param filters.date_from  期間起日（含）；YTD 由頁面給「年度首期起日」
 * @param filters.date_to    期間止日（含）
 * @param filters.subsidiary_id  法人 uuid；'all'/未給＝全法人
 */
export async function getIncomeStatement(filters: {
  date_from: string;
  date_to: string;
  subsidiary_id?: string;
}): Promise<IncomeStatementResult> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();
  const subsidiaryId =
    filters.subsidiary_id && filters.subsidiary_id !== "all"
      ? filters.subsidiary_id
      : null;

  // 1. RPC：葉節點(L5) 期間 ΣDebit/ΣCredit
  const { data: aggData, error: aggErr } = await sb.rpc(
    "fn_gl_account_balances",
    {
      p_tenant: tenant,
      p_date_to: filters.date_to,
      p_date_from: filters.date_from,
      p_subsidiary: subsidiaryId,
    },
  );
  if (aggErr) throw new Error(`fn_gl_account_balances: ${aggErr.message}`);
  const leaves = (aggData ?? []) as Array<{
    coa_id: string;
    debit: number | string;
    credit: number | string;
  }>;

  // 2. 全 COA 樹（is_active）— account_code 排序即 pre-order；損益子集另留一份
  const { data: coaData, error: coaErr } = await sb
    .from("chart_of_accounts")
    .select(
      "id, account_code, parent_code, level, name_zh_tw, display_indent_name, l1_category, normal_balance, is_postable",
    )
    .eq("tenant_id", tenant)
    .eq("is_active", true)
    .order("account_code");
  if (coaErr) throw new Error(`coa tree: ${coaErr.message}`);
  const allCoa = (coaData ?? []) as unknown as CoaTreeRow[];
  const plCoa = allCoa.filter((r) => IS_PL_CATEGORIES.has(r.l1_category));

  const byCode = new Map<string, CoaTreeRow>();
  const idToCode = new Map<string, string>();
  for (const r of plCoa) {
    byCode.set(r.account_code, r);
    idToCode.set(r.id, r.account_code);
  }
  // id→category 用全表（葉層各類合計、孤兒判定）
  const idToCat = new Map<string, L1Category>();
  for (const r of allCoa) idToCat.set(r.id, r.l1_category);

  // 3. rollup：葉 contribution(=ΣC−ΣD) 沿 parent_code 累加；各類合計直接由葉層算（與樹脫鉤）
  const amountByCode = new Map<string, number>();
  const touched = new Set<string>();
  const totalByCat = new Map<L1Category, number>();

  for (const lf of leaves) {
    const cat = idToCat.get(lf.coa_id);
    if (!cat || !IS_PL_CATEGORIES.has(cat)) continue; // BS 科目跳過
    const contribution = num(lf.credit) - num(lf.debit);
    totalByCat.set(cat, (totalByCat.get(cat) ?? 0) + contribution);

    const code = idToCode.get(lf.coa_id);
    if (!code) continue; // 孤兒損益科目：計入合計、不顯示於樹
    let cur: string | null | undefined = code;
    const guard = new Set<string>(); // 防 parent_code 自環
    while (cur && byCode.has(cur) && !guard.has(cur)) {
      guard.add(cur);
      amountByCode.set(cur, (amountByCode.get(cur) ?? 0) + contribution);
      touched.add(cur);
      cur = byCode.get(cur)!.parent_code;
    }
  }

  const catTotal = (c: L1Category) => round2(totalByCat.get(c) ?? 0);
  const revenue_total = catTotal("REVENUE");
  const cogs_total = catTotal("COGS");
  const gross_profit = round2(revenue_total + cogs_total);
  const opex_total = catTotal("EXPENSE");
  const operating_income = round2(gross_profit + opex_total);
  const non_operating_total = catTotal("NON_OPERATING");
  const income_before_tax = round2(operating_income + non_operating_total);
  const tax_total = catTotal("TAX");
  const net_income = round2(income_before_tax + tax_total);

  // 4. 組裝報表列：各 l1 區塊（L1 節點＝該類合計 + 明細子樹），區塊之間插跨區小計
  const accountRows = (category: L1Category): IncomeStatementRow[] =>
    plCoa
      .filter((r) => r.l1_category === category)
      .map((r) => ({
        id: r.id,
        kind: "account" as const,
        account_code: r.account_code,
        name_zh_tw: r.name_zh_tw,
        level: r.level,
        depth: LEVEL_DEPTH[r.level] ?? 0,
        l1_category: r.l1_category,
        amount: round2(amountByCode.get(r.account_code) ?? 0),
        has_activity: touched.has(r.account_code),
        is_grand_total: false,
      }));
  const subtotal = (
    label: string,
    amount: number,
    grand = false,
  ): IncomeStatementRow => ({
    id: `subtotal:${label}`,
    kind: "subtotal",
    account_code: "",
    name_zh_tw: label,
    level: null,
    depth: 0,
    l1_category: null,
    amount,
    has_activity: true,
    is_grand_total: grand,
  });

  const rows: IncomeStatementRow[] = [
    ...accountRows("REVENUE"),
    ...accountRows("COGS"),
    subtotal("營業毛利", gross_profit),
    ...accountRows("EXPENSE"),
    subtotal("營業利益", operating_income),
    ...accountRows("NON_OPERATING"),
    subtotal("稅前淨利", income_before_tax),
    ...accountRows("TAX"),
    subtotal("本期淨利", net_income, true),
  ];

  return {
    rows,
    revenue_total,
    cogs_total,
    gross_profit,
    opex_total,
    operating_income,
    non_operating_total,
    income_before_tax,
    tax_total,
    net_income,
    date_from: filters.date_from,
    date_to: filters.date_to,
    subsidiary_id: subsidiaryId,
  };
}

// ============================================================
// P4 資產負債表 (Balance Sheet) — 時點存量
//
// 與 IS 的關鍵差異：
//  (1) 口徑同 TB（不是 IS）：累計存量餘額（post-inception），故 RPC p_date_from=null、
//      p_date_to=as_of。**絕不可**傳 date_from（那會變成期間變動、數字全錯、不平衡）。
//  (2) 取資產/負債/權益三類（l1_category 1-3）做樹；損益五類(4-8)不進樹，
//      只在同一迴圈用 IS 口徑 ΣCredit−ΣDebit 累成「本期淨利」併入權益（current year earnings）。
//
// 會計恆等式（NetSuite 慣例）：資產 = 負債 + 權益 + 本期淨利。
// 因全部分錄借貸恆等 → assetNet + liabNet + equityNet + Σ(PL ΣD−ΣC) = 0，
// 移項後 total_assets = total_liabilities + equity_subtotal + net_income，故 balance_diff 必為 0。
//
// 展示符號（NetSuite 慣例「正常餘額顯示為正」）：
//   資產(normal D)：signed = ΣD−ΣC；負債/權益(normal C)：signed = ΣC−ΣD。
//   故三區明細都顯示正數；異常借餘的負債才出現負數（加括號），照實顯示不做 case-by-case 修正。
// ============================================================

/** BS 存量類 l1_category（account_code 開頭 1-3） */
const BS_CATEGORIES: ReadonlySet<L1Category> = new Set([
  "ASSET",
  "LIABILITY",
  "EQUITY",
]);

/** 併入權益的損益五類（account_code 開頭 4-8）；用 IS 口徑算本期淨利 */
const PL_FOR_EARNINGS: ReadonlySet<L1Category> = new Set([
  "REVENUE",
  "COGS",
  "EXPENSE",
  "NON_OPERATING",
  "TAX",
]);

export type BalanceSheetRow = {
  id: string;
  /** account=科目列；subtotal=小計/總計列 */
  kind: "account" | "subtotal";
  account_code: string; // subtotal 與本期淨利計算列為 ""
  name_zh_tw: string;
  level: CoaLevel | null; // subtotal 為 null
  /** 縮排深度 0(L1)..4(L5)；subtotal=0 */
  depth: number;
  l1_category: L1Category | null;
  /** 展示金額（正常餘額為正）：資產 ΣD−ΣC、負債/權益 ΣC−ΣD；subtotal=該區累計 */
  amount: number;
  /** account：該科目(含子樹)有過帳活動；subtotal 恆 true */
  has_activity: boolean;
  /** 資產總計 / 負債及權益總計 那兩條（視覺最強調） */
  is_grand_total: boolean;
};

export type BalanceSheetResult = {
  rows: BalanceSheetRow[];
  total_assets: number; // 資產總計
  total_liabilities: number; // 負債總計（normal C，顯示 ΣC−ΣD）
  equity_subtotal: number; // 實收/期初權益（不含本期淨利）
  net_income: number; // 本期淨利（當期損益，併入權益）
  total_equity: number; // 權益總計 = equity_subtotal + net_income
  /** 平衡差額（理論 0）：total_assets −（total_liabilities + total_equity） */
  balance_diff: number;
  balanced: boolean;
  as_of: string;
  subsidiary_id: string | null;
};

/**
 * 資產負債表（時點存量）。
 * @param filters.as_of          截止日（含）= as_of；未給用台北今日
 * @param filters.subsidiary_id  法人 uuid；'all'/未給＝全法人
 */
export async function getBalanceSheet(
  filters: {
    as_of?: string;
    subsidiary_id?: string;
  } = {},
): Promise<BalanceSheetResult> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();

  const asOf = filters.as_of ?? todayTaipei();
  const subsidiaryId =
    filters.subsidiary_id && filters.subsidiary_id !== "all"
      ? filters.subsidiary_id
      : null;

  // 1. RPC：葉節點(L5) 累計 ΣDebit/ΣCredit — 口徑同 TB（p_date_from=null = 存量）
  const { data: aggData, error: aggErr } = await sb.rpc(
    "fn_gl_account_balances",
    {
      p_tenant: tenant,
      p_date_to: asOf,
      p_date_from: null,
      p_subsidiary: subsidiaryId,
    },
  );
  if (aggErr) throw new Error(`fn_gl_account_balances: ${aggErr.message}`);
  const leaves = (aggData ?? []) as Array<{
    coa_id: string;
    debit: number | string;
    credit: number | string;
  }>;

  // 2. 全 COA 樹（is_active）— account_code 排序即 pre-order；BS 三類另留一份
  const { data: coaData, error: coaErr } = await sb
    .from("chart_of_accounts")
    .select(
      "id, account_code, parent_code, level, name_zh_tw, display_indent_name, l1_category, normal_balance, is_postable",
    )
    .eq("tenant_id", tenant)
    .eq("is_active", true)
    .order("account_code");
  if (coaErr) throw new Error(`coa tree: ${coaErr.message}`);
  const allCoa = (coaData ?? []) as unknown as CoaTreeRow[];
  const bsCoa = allCoa.filter((r) => BS_CATEGORIES.has(r.l1_category));

  const byCode = new Map<string, CoaTreeRow>();
  const idToCode = new Map<string, string>();
  for (const r of bsCoa) {
    byCode.set(r.account_code, r);
    idToCode.set(r.id, r.account_code);
  }
  // id→category 用全表（葉層各類合計、本期淨利分流、孤兒判定）
  const idToCat = new Map<string, L1Category>();
  for (const r of allCoa) idToCat.set(r.id, r.l1_category);

  // 3. rollup：BS 三類存量 signed 沿 parent_code 累加（顯示用）；
  //    同迴圈把損益五類用 IS 口徑(ΣC−ΣD)累成本期淨利（不進樹）；三類合計由葉層直接算（與樹脫鉤）
  const amountByCode = new Map<string, number>();
  const touched = new Set<string>();
  let assetNet = 0; // Σ(ASSET 葉 net)，net = ΣD−ΣC
  let liabNet = 0; // Σ(LIABILITY 葉 net)
  let equityNet = 0; // Σ(EQUITY 葉 net)
  let earnings = 0; // Σ(PL 葉 (ΣC−ΣD))

  for (const lf of leaves) {
    const cat = idToCat.get(lf.coa_id);
    if (!cat) continue;
    const debit = num(lf.debit);
    const credit = num(lf.credit);

    if (PL_FOR_EARNINGS.has(cat)) {
      // 損益：IS 口徑貢獻，只累成本期淨利、不進樹
      earnings += credit - debit;
      continue;
    }
    if (!BS_CATEGORIES.has(cat)) continue;

    const net = debit - credit; // 存量 net
    if (cat === "ASSET") assetNet += net;
    else if (cat === "LIABILITY") liabNet += net;
    else equityNet += net; // EQUITY

    // 顯示用 signed：資產取 net(ΣD−ΣC)、負債/權益取 −net(ΣC−ΣD)，讓正常餘額顯示為正
    const signed = cat === "ASSET" ? net : -net;

    const code = idToCode.get(lf.coa_id);
    if (!code) continue; // 孤兒 BS 科目：計入合計、不顯示於樹
    let cur: string | null | undefined = code;
    const guard = new Set<string>(); // 防 parent_code 自環
    while (cur && byCode.has(cur) && !guard.has(cur)) {
      guard.add(cur);
      amountByCode.set(cur, (amountByCode.get(cur) ?? 0) + signed);
      touched.add(cur);
      cur = byCode.get(cur)!.parent_code;
    }
  }

  // 4. 各區合計（NetSuite 展示口徑）
  const total_assets = round2(assetNet); // 資產 normal D：ΣD−ΣC
  const total_liabilities = round2(-liabNet); // 負債 normal C：ΣC−ΣD
  const equity_subtotal = round2(-equityNet); // 實收/期初權益：ΣC−ΣD
  const net_income = round2(earnings); // 本期淨利（IS 口徑）
  const total_equity = round2(equity_subtotal + net_income);
  const balance_diff = round2(total_assets - (total_liabilities + total_equity));
  const balanced = Math.abs(balance_diff) < 0.01;

  // 5. 組裝報表列（pre-order：account_code 排序即縮排層級）
  const accountRows = (category: L1Category): BalanceSheetRow[] =>
    bsCoa
      .filter((r) => r.l1_category === category)
      .map((r) => ({
        id: r.id,
        kind: "account" as const,
        account_code: r.account_code,
        name_zh_tw: r.name_zh_tw,
        level: r.level,
        depth: LEVEL_DEPTH[r.level] ?? 0,
        l1_category: r.l1_category,
        amount: round2(amountByCode.get(r.account_code) ?? 0),
        has_activity: touched.has(r.account_code),
        is_grand_total: false,
      }));
  const subtotal = (
    label: string,
    amount: number,
    grand = false,
  ): BalanceSheetRow => ({
    id: `subtotal:${label}`,
    kind: "subtotal",
    account_code: "",
    name_zh_tw: label,
    level: null,
    depth: 0,
    l1_category: null,
    amount,
    has_activity: true,
    is_grand_total: grand,
  });
  // 本期淨利計算列（非 COA 科目）：撐起權益區自洽、不必去 join IS 報表
  const earningsRow: BalanceSheetRow = {
    id: "synthetic:current-earnings",
    kind: "account",
    account_code: "",
    name_zh_tw: "本期淨利（當期損益）",
    level: null,
    depth: 1,
    l1_category: "EQUITY",
    amount: net_income,
    has_activity: net_income !== 0,
    is_grand_total: false,
  };

  const rows: BalanceSheetRow[] = [
    // 資產區
    ...accountRows("ASSET"),
    subtotal("資產總計", total_assets, true),
    // 負債及權益區
    ...accountRows("LIABILITY"),
    subtotal("負債總計", total_liabilities),
    ...accountRows("EQUITY"),
    earningsRow,
    subtotal("權益總計", total_equity),
    subtotal("負債及權益總計", round2(total_liabilities + total_equity), true),
  ];

  return {
    rows,
    total_assets,
    total_liabilities,
    equity_subtotal,
    net_income,
    total_equity,
    balance_diff,
    balanced,
    as_of: asOf,
    subsidiary_id: subsidiaryId,
  };
}
