import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

import { getDefaultTenantUuid } from "./queries";

// ============================================================
// Public API
// ============================================================

export type InstantiateResult =
  | { ok: true; data: { entry_id: string; entry_no: string; lines_count: number } }
  | { ok: false; error: string };

export type InstantiateOptions = {
  /** 預設 'draft'。設 true 會在寫完 lines 後嘗試 post（DB trigger 會驗借貸平衡 + period 鎖期） */
  autoPost?: boolean;
  /** 預設 today。must match an OPEN accounting_periods row when autoPost=true */
  entryDate?: string;
  /** entry header description；不傳則用 transaction_type.name_zh_tw */
  description?: string;
  /** 帶入 created_by / posted_by；不傳則 NULL */
  userId?: string;
  /** 若想 override transaction_type.cash_flow_section（例如同 type 但本筆是 investing）*/
  cashFlowSectionOverride?: "operating" | "investing" | "financing" | null;
};

export type InstantiateCtx = Record<string, unknown>;

/**
 * 業務動作 → 自動產 journal_entry + lines
 *
 * 流程：
 *   1. fetch transaction_type
 *   2. validate ctx against required_inputs
 *   3. apply default formulas（e.g. tax_amount = net_amount * 0.05）
 *   4. batch fetch master rows referenced by coa_resolver
 *   5. resolve each line：coa_id / amount / dimensions / description
 *   6. insert journal_entries (draft)
 *   7. insert journal_entry_lines
 *   8. autoPost? → status='posted'（DB trigger 驗借貸 + period 鎖期）
 */
export async function instantiateTransaction(
  typeCode: string,
  ctx: InstantiateCtx,
  options: InstantiateOptions = {},
): Promise<InstantiateResult> {
  const sb = createServiceClient();
  const tenant = await getDefaultTenantUuid();

  // 1. fetch transaction_type
  const { data: tt, error: ttErr } = await sb
    .from("transaction_types")
    .select(
      "id, code, name_zh_tw, gl_template, required_inputs, cash_flow_section, is_active",
    )
    .eq("tenant_id", tenant)
    .eq("code", typeCode)
    .single();
  if (ttErr || !tt) return { ok: false, error: `transaction_type "${typeCode}" 不存在` };
  if (!tt.is_active) return { ok: false, error: `transaction_type "${typeCode}" 已停用` };

  const template = tt.gl_template as GlTemplate;
  const required = (tt.required_inputs as Record<string, RequiredInputSpec>) ?? {};

  // 2. validate + 3. apply default formulas
  const ctxNorm: Record<string, unknown> = { ...ctx };
  const validation = validateAndDefaults(ctxNorm, required);
  if (!validation.ok) return validation;

  // 4. batch fetch masters used by coa_resolver
  const masters = await fetchMasters(sb, template, ctxNorm);
  if (!masters.ok) return masters;

  // 5. fetch system_accounting_settings (single row per tenant)
  const { data: sys, error: sysErr } = await sb
    .from("system_accounting_settings")
    .select("*")
    .eq("tenant_id", tenant)
    .single();
  if (sysErr || !sys) {
    return { ok: false, error: `system_accounting_settings 缺失：${sysErr?.message ?? "no row"}` };
  }

  // 6. resolve each line
  const ctxNumbers = toNumericCtx(ctxNorm);
  const linesToInsert: Array<{
    line_no: number;
    coa_id: string;
    debit: number;
    credit: number;
    dimensions: Record<string, string>;
    description: string | null;
  }> = [];

  for (const lineDef of template.lines) {
    const coaRes = resolveCoa(lineDef.coa_resolver, ctxNorm, masters.data, sys);
    if (!coaRes.ok) return { ok: false, error: `line ${lineDef.line_no}: ${coaRes.error}` };

    let amount: number;
    try {
      amount = evalFormula(lineDef.amount_formula, ctxNumbers);
    } catch (err) {
      return {
        ok: false,
        error: `line ${lineDef.line_no} formula 失敗：${(err as Error).message}`,
      };
    }
    if (!Number.isFinite(amount) || amount < 0) {
      return { ok: false, error: `line ${lineDef.line_no}: amount=${amount} 非有效正數` };
    }

    const dimensions = resolveDimensions(lineDef.dim_sources ?? {}, ctxNorm);
    const description = renderDescription(lineDef.description_template, ctxNorm, masters.data);

    linesToInsert.push({
      line_no: lineDef.line_no,
      coa_id: coaRes.coaId,
      debit: lineDef.side === "D" ? amount : 0,
      credit: lineDef.side === "C" ? amount : 0,
      dimensions,
      description,
    });
  }

  // Pre-check 借貸平衡（DB trigger 也會抓、這裡先撈到友善訊息）
  const totalDebit = linesToInsert.reduce((s, l) => s + l.debit, 0);
  const totalCredit = linesToInsert.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    return {
      ok: false,
      error: `borrow/credit 不平：D=${totalDebit.toFixed(2)} C=${totalCredit.toFixed(2)}（template 設計有誤）`,
    };
  }

  // 7. insert journal_entries header (draft)
  const entryNo = generateEntryNo(typeCode);
  const entryDate = options.entryDate ?? new Date().toISOString().slice(0, 10);
  const cashFlowSection =
    options.cashFlowSectionOverride !== undefined
      ? options.cashFlowSectionOverride
      : tt.cash_flow_section;

  const { data: entry, error: entryErr } = await sb
    .from("journal_entries")
    .insert({
      tenant_id: tenant,
      entry_no: entryNo,
      entry_date: entryDate,
      description: options.description ?? `${tt.name_zh_tw}（auto）`,
      status: "draft",
      transaction_type_id: tt.id,
      cash_flow_section: cashFlowSection,
      created_by: options.userId ?? null,
    })
    .select("id, entry_no")
    .single();
  if (entryErr) {
    return { ok: false, error: `寫入 entry header 失敗：${entryErr.message}` };
  }

  // 8. insert lines
  const linesWithEntry = linesToInsert.map((l) => ({ ...l, entry_id: entry.id }));
  const { error: linesErr } = await sb.from("journal_entry_lines").insert(linesWithEntry);
  if (linesErr) {
    // rollback：刪掉剛建的 entry
    await sb.from("journal_entries").delete().eq("id", entry.id);
    return { ok: false, error: `寫入 lines 失敗：${linesErr.message}` };
  }

  // 9. optional auto-post（DB trigger 驗借貸平衡 + period 鎖期）
  if (options.autoPost) {
    const { error: postErr } = await sb
      .from("journal_entries")
      .update({ status: "posted", posted_by: options.userId ?? null })
      .eq("id", entry.id);
    if (postErr) {
      return { ok: false, error: `auto-post 失敗：${postErr.message}（entry 保留為 draft）` };
    }
  }

  return {
    ok: true,
    data: {
      entry_id: entry.id,
      entry_no: entry.entry_no,
      lines_count: linesWithEntry.length,
    },
  };
}

// ============================================================
// Template shape types
// ============================================================

type GlTemplate = {
  lines: Array<{
    line_no: number;
    side: "D" | "C";
    coa_resolver: CoaResolver;
    amount_formula: string;
    description_template?: string;
    dim_sources?: Record<string, string>;
  }>;
};

type CoaResolver =
  | {
      type: "master_field";
      /** e.g. "items.gl_inventory_coa_id" */
      source: string;
      /** e.g. "ctx.item_id" */
      lookup_via: string;
      fallback?: CoaResolver;
    }
  | {
      type: "system_default";
      /** e.g. "default_bank_coa_id" — system_accounting_settings 的 column 名 */
      source: string;
      fallback?: CoaResolver;
    }
  | {
      type: "tax_code_coa";
      /** e.g. "VAT_5_INPUT" — tax_codes.tax_code */
      source: string;
      fallback?: CoaResolver;
    }
  | {
      type: "fixed_coa";
      /** e.g. "1102101" — chart_of_accounts.account_code */
      source: string;
      fallback?: CoaResolver;
    };

type RequiredInputSpec = {
  type: "uuid" | "numeric" | "text";
  lookup_table?: string;
  required?: boolean;
  min?: number;
  default_formula?: string;
};

// ============================================================
// Validation + defaults
// ============================================================

function validateAndDefaults(
  ctx: Record<string, unknown>,
  spec: Record<string, RequiredInputSpec>,
): { ok: true } | { ok: false; error: string } {
  // 先跑兩輪：第一輪檢查 required；第二輪 fill default_formula（因為 default 可能依賴 required 欄位）
  for (const [field, def] of Object.entries(spec)) {
    if (def.required && (ctx[field] === undefined || ctx[field] === null || ctx[field] === "")) {
      return { ok: false, error: `ctx.${field} 必填` };
    }
    if (ctx[field] !== undefined && ctx[field] !== null) {
      if (def.type === "numeric") {
        const n = Number(ctx[field]);
        if (!Number.isFinite(n)) return { ok: false, error: `ctx.${field} 必須是數字` };
        if (typeof def.min === "number" && n < def.min) {
          return { ok: false, error: `ctx.${field} 不可小於 ${def.min}` };
        }
        ctx[field] = n;
      }
      if (def.type === "uuid" && typeof ctx[field] !== "string") {
        return { ok: false, error: `ctx.${field} 必須是 uuid string` };
      }
    }
  }

  // 補 default_formula（用上面已驗證過的 ctx 算）
  for (const [field, def] of Object.entries(spec)) {
    if ((ctx[field] === undefined || ctx[field] === null) && def.default_formula) {
      try {
        ctx[field] = evalFormula(def.default_formula, toNumericCtx(ctx));
      } catch (err) {
        return {
          ok: false,
          error: `ctx.${field} default_formula 失敗：${(err as Error).message}`,
        };
      }
    }
  }

  return { ok: true };
}

// ============================================================
// Master batch fetch
// ============================================================

type MasterRow = Record<string, unknown> & { id: string };
type MasterCache = Record<string /* table */, Map<string /* id */, MasterRow>>;

async function fetchMasters(
  sb: ReturnType<typeof createServiceClient>,
  template: GlTemplate,
  ctx: Record<string, unknown>,
): Promise<{ ok: true; data: MasterCache } | { ok: false; error: string }> {
  // 收集每個 (table, column) 需要的 ids
  const needs: Record<string, { columns: Set<string>; ids: Set<string> }> = {};
  for (const line of template.lines) {
    if (line.coa_resolver.type === "master_field") {
      const [table, column] = line.coa_resolver.source.split(".");
      const idField = line.coa_resolver.lookup_via.replace(/^ctx\./, "");
      const id = ctx[idField];
      if (!id || typeof id !== "string") {
        // lookup_via 是 optional 場景（fallback 會 cover）；先 skip、resolveCoa 階段再 fail-fast
        continue;
      }
      if (!needs[table]) needs[table] = { columns: new Set(), ids: new Set() };
      needs[table].columns.add(column);
      needs[table].ids.add(id);
    }
  }

  const cache: MasterCache = {};
  for (const [table, { columns, ids }] of Object.entries(needs)) {
    const colList = ["id", ...columns];
    // name 欄位順手撈、給 description_template 用（不在的話 select 會 error、但這幾張主檔都有 name 或 model_name）
    // → 為穩定起見只撈 PK + 需要的 coa 欄位，name 之類延後 enhance
    const { data, error } = await sb
      .from(table)
      .select(colList.join(","))
      .in("id", Array.from(ids));
    if (error) {
      return { ok: false, error: `撈 master ${table} 失敗：${error.message}` };
    }
    const map = new Map<string, MasterRow>();
    for (const row of (data as unknown as MasterRow[]) ?? []) {
      map.set(row.id, row);
    }
    cache[table] = map;
  }
  return { ok: true, data: cache };
}

// ============================================================
// COA resolver
// ============================================================

function resolveCoa(
  resolver: CoaResolver,
  ctx: Record<string, unknown>,
  masters: MasterCache,
  sys: Record<string, unknown>,
): { ok: true; coaId: string } | { ok: false; error: string } {
  let coaId: string | null | undefined = null;

  if (resolver.type === "master_field") {
    const [table, column] = resolver.source.split(".");
    const idField = resolver.lookup_via.replace(/^ctx\./, "");
    const id = ctx[idField];
    if (typeof id === "string") {
      const row = masters[table]?.get(id);
      coaId = (row?.[column] as string | null | undefined) ?? null;
    }
  } else if (resolver.type === "system_default") {
    coaId = (sys[resolver.source] as string | null | undefined) ?? null;
  } else if (resolver.type === "tax_code_coa") {
    // tax_codes is not pre-fetched; resolved at runtime. For POC, lookup synchronously fails — 預留
    return {
      ok: false,
      error: `tax_code_coa resolver 尚未實作（template 用了 source="${resolver.source}"）`,
    };
  } else if (resolver.type === "fixed_coa") {
    return {
      ok: false,
      error: `fixed_coa resolver 尚未實作（需 account_code → id lookup，template source="${resolver.source}"）`,
    };
  }

  if (coaId) return { ok: true, coaId };

  if (resolver.fallback) return resolveCoa(resolver.fallback, ctx, masters, sys);

  return {
    ok: false,
    error: `coa_resolver 解析失敗（${resolver.type}: ${resolver.source}）— 主檔欄位空 + 無 fallback`,
  };
}

// ============================================================
// Safe formula parser
// ============================================================

/**
 * 只支援 +-*\/() 和 ctx 變數名（純小寫底線數字）。
 * 嚴格驗證：先替換變數成數字、再驗 substituted 字串只剩數字+運算子+小數點，最後用 Function constructor 算。
 * 不接受識別符 / 字串 / 函式呼叫 / 屬性存取。
 */
function evalFormula(formula: string, ctxNumbers: Record<string, number>): number {
  const trimmed = formula.trim();
  if (!trimmed) throw new Error("formula 為空");

  // 第一關：白名單字元（變數名 + 運算子 + 數字 + 括號 + 空白）
  if (!/^[a-zA-Z_][\w]*$|^[\w\s+\-*/().]+$/.test(trimmed)) {
    if (!/^[\w\s+\-*/().]+$/.test(trimmed)) {
      throw new Error(`formula 含非法字元: ${trimmed}`);
    }
  }

  // 第二關：替換 ctx 變數成數字
  const substituted = trimmed.replace(/[a-zA-Z_][a-zA-Z_0-9]*/g, (name) => {
    const v = ctxNumbers[name];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`formula 變數未定義或非數值: ${name}`);
    }
    return String(v);
  });

  // 第三關：替換後必須只剩數字/運算子/括號/空白/小數點
  if (!/^[\d\s+\-*/().]+$/.test(substituted)) {
    throw new Error(`formula 替換後仍含非數值字元: ${substituted}`);
  }

  // 第四關：算術運算（已通過嚴格 regex，Function constructor 安全）
  const fn = new Function(`"use strict"; return (${substituted});`);
  const result = fn();
  if (typeof result !== "number" || !Number.isFinite(result)) {
    throw new Error(`formula 結果非有限數: ${formula} → ${result}`);
  }
  return result;
}

function toNumericCtx(ctx: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "string" && v && !Number.isNaN(Number(v))) out[k] = Number(v);
  }
  return out;
}

// ============================================================
// Dimensions + description rendering
// ============================================================

function resolveDimensions(
  sources: Record<string, string>,
  ctx: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [dimCode, ctxPath] of Object.entries(sources)) {
    const field = ctxPath.replace(/^ctx\./, "");
    const v = ctx[field];
    if (typeof v === "string" && v) out[dimCode.toUpperCase()] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[dimCode.toUpperCase()] = String(v);
  }
  return out;
}

function renderDescription(
  template: string | undefined,
  ctx: Record<string, unknown>,
  _masters: MasterCache,
): string | null {
  if (!template) return null;
  // 簡化版：只替換 {ctx_key} 為 ctx[key]；不解析 master 欄位（後續 enhance）
  return template.replace(/\{(\w+)\}/g, (_m, key) => {
    const v = ctx[key];
    if (v === undefined || v === null) return "";
    return String(v);
  });
}

// ============================================================
// helpers
// ============================================================

function generateEntryNo(typeCode: string): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  const prefix = typeCode.slice(0, 4).toUpperCase();
  return `JE-${prefix}-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}
