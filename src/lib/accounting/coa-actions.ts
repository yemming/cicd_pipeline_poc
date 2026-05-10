"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";

export type CoaActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdmin(): Promise<string | null> {
  const { isAdmin } = await getCurrentUserAndAdmin();
  if (!isAdmin) return "需要 admin 權限";
  return null;
}

export async function setCoaActiveAction(
  id: string,
  active: boolean,
): Promise<CoaActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const sb = createServiceClient();
  // 不允許停用 system_default 鎖定的 L1-L3 結構（is_locked = TRUE）
  const { data: row, error: getErr } = await sb
    .from("chart_of_accounts")
    .select("is_locked, level")
    .eq("id", id)
    .single();
  if (getErr || !row) return { ok: false, error: getErr?.message ?? "找不到科目" };
  if (row.is_locked) return { ok: false, error: "L1-L3 結構鎖定，不可停用" };

  const { error } = await sb
    .from("chart_of_accounts")
    .update({ is_active: active })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/accounting/coa", "page");
  return { ok: true, data: { id } };
}

export type CoaMetaPatch = {
  netsuite_account_internal_id?: string | null;
  netsuite_account_number?: string | null;
  required_dimensions?: string[];
  ai_tags?: Record<string, unknown>;
  description?: string | null;
};

export async function updateCoaMetaAction(
  id: string,
  patch: CoaMetaPatch,
): Promise<CoaActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const update: Record<string, unknown> = {};
  if (typeof patch.netsuite_account_internal_id !== "undefined") {
    update.netsuite_account_internal_id = patch.netsuite_account_internal_id || null;
  }
  if (typeof patch.netsuite_account_number !== "undefined") {
    update.netsuite_account_number = patch.netsuite_account_number || null;
  }
  if (Array.isArray(patch.required_dimensions)) {
    update.required_dimensions = patch.required_dimensions;
  }
  if (patch.ai_tags && typeof patch.ai_tags === "object") {
    update.ai_tags = patch.ai_tags;
  }
  if (typeof patch.description !== "undefined") {
    update.description = patch.description;
  }
  if (Object.keys(update).length === 0) {
    return { ok: false, error: "沒有要更新的欄位" };
  }

  const sb = createServiceClient();
  const { error } = await sb.from("chart_of_accounts").update(update).eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/accounting/coa", "page");
  return { ok: true, data: { id } };
}

// ============================================================
// 新增 L5 入帳科目（L4 parent 下建子）
// ============================================================

export type CoaCreateInput = {
  parent_id: string;          // 必為 L4_PARENT 帳戶
  account_code: string;       // L5 完整代碼，例如 "1101104"
  name_zh_tw: string;
  name_en?: string | null;
  normal_balance?: "D" | "C"; // 預設沿用 parent
  dealer_category?:
    | "GENERAL"
    | "VEHICLE_SALES"
    | "VEHICLE_INV"
    | "SERVICE"
    | "PARTS"
    | "INSURANCE"
    | "FINANCE"; // 可覆蓋 parent
  description?: string | null;
  required_dimensions?: string[]; // 預設 ['SUBSIDIARY','STORE']
};

export async function createCoaAccountAction(
  input: CoaCreateInput,
): Promise<CoaActionResult<{ id: string; account_code: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  if (!input.parent_id) return { ok: false, error: "缺少 parent_id" };
  const code = (input.account_code ?? "").trim();
  if (!/^\d{7}$/.test(code))
    return { ok: false, error: "L5 科目代碼需為 7 位數字（例如 1101104）" };
  if (!input.name_zh_tw?.trim()) return { ok: false, error: "中文名稱必填" };

  const sb = createServiceClient();

  // 撈 parent 確保是 L4_PARENT 且 inherit 欄位
  const { data: parent, error: parentErr } = await sb
    .from("chart_of_accounts")
    .select(
      "tenant_id, level, l1_category, dealer_category, l1_code, l2_code, l3_code, l4_code, account_code, normal_balance, depth, tax_treatment",
    )
    .eq("id", input.parent_id)
    .single();
  if (parentErr || !parent)
    return { ok: false, error: parentErr?.message ?? "找不到 parent" };
  if (parent.level !== "L4_PARENT")
    return { ok: false, error: `只能在 L4_PARENT 下新建 L5；目前 parent 是 ${parent.level}` };
  if (!code.startsWith(parent.account_code))
    return {
      ok: false,
      error: `L5 代碼前 5 碼必須等於 parent ${parent.account_code}（你給的是 ${code.slice(0, 5)}）`,
    };

  const dims =
    input.required_dimensions && input.required_dimensions.length > 0
      ? input.required_dimensions.map((d) => d.toUpperCase())
      : ["SUBSIDIARY", "STORE"];

  const { data, error } = await sb
    .from("chart_of_accounts")
    .insert({
      tenant_id: parent.tenant_id,
      account_code: code,
      parent_code: parent.account_code,
      parent_id: input.parent_id,
      level: "L5_DETAIL",
      depth: parent.depth + 1,
      l1_code: parent.l1_code,
      l2_code: parent.l2_code,
      l3_code: parent.l3_code,
      l4_code: parent.l4_code,
      l5_code: code,
      name_zh_tw: input.name_zh_tw.trim(),
      name_en: input.name_en?.trim() || null,
      l1_category: parent.l1_category,
      dealer_category: input.dealer_category ?? parent.dealer_category,
      tax_treatment: parent.tax_treatment ?? "NORMAL",
      is_postable: true,
      normal_balance: input.normal_balance ?? parent.normal_balance,
      is_active: true,
      is_locked: false,
      is_system_default: false,
      required_dimensions: dims,
      ai_tags: {},
      benchmark_enabled: false,
      description: input.description?.trim() || null,
      display_order: 999,
    })
    .select("id, account_code")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: `科目代碼「${code}」已存在` };
    return { ok: false, error: `建立失敗：${error.message}` };
  }

  revalidatePath("/admin/accounting/coa", "page");
  return { ok: true, data };
}

export async function deleteCoaAccountAction(
  id: string,
): Promise<CoaActionResult<{ id: string }>> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };
  if (!id) return { ok: false, error: "缺少 id" };

  const sb = createServiceClient();

  // 1. 鎖定欄位擋
  const { data: row, error: getErr } = await sb
    .from("chart_of_accounts")
    .select("is_locked, is_system_default, name_zh_tw")
    .eq("id", id)
    .single();
  if (getErr || !row) return { ok: false, error: getErr?.message ?? "找不到科目" };
  if (row.is_locked) return { ok: false, error: "L1-L3 結構鎖定，不可刪除" };
  if (row.is_system_default)
    return { ok: false, error: `「${row.name_zh_tw}」為系統預設科目，不可刪除（可改用停用）` };

  // 2. 檢查 children
  const { count: childCount } = await sb
    .from("chart_of_accounts")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);
  if ((childCount ?? 0) > 0)
    return { ok: false, error: `仍有 ${childCount} 個下層子科目，請先刪除它們` };

  // 3. 檢查 GL columns 引用（customers / suppliers / items）+ journal_entry_lines
  const [custCount, suppCount, itemCount, jelCount] = await Promise.all([
    sb.from("customers").select("id", { count: "exact", head: true }).eq("ar_account_coa_id", id),
    sb.from("suppliers").select("id", { count: "exact", head: true }).eq("ap_account_coa_id", id),
    sb.from("items").select("id", { count: "exact", head: true }).eq("inventory_account_coa_id", id),
    sb.from("journal_entry_lines").select("id", { count: "exact", head: true }).eq("coa_id", id),
  ]);
  const refs: string[] = [];
  if ((custCount.count ?? 0) > 0) refs.push(`${custCount.count} 筆客戶 AR 設定`);
  if ((suppCount.count ?? 0) > 0) refs.push(`${suppCount.count} 筆供應商 AP 設定`);
  if ((itemCount.count ?? 0) > 0) refs.push(`${itemCount.count} 筆品項存貨設定`);
  if ((jelCount.count ?? 0) > 0) refs.push(`${jelCount.count} 筆分錄行已使用`);
  if (refs.length > 0)
    return {
      ok: false,
      error: `無法刪除：尚有 ${refs.join("、")}。請改用「停用」保留歷史，或先清除引用。`,
    };

  const { error } = await sb.from("chart_of_accounts").delete().eq("id", id);
  if (error) return { ok: false, error: `刪除失敗：${error.message}` };

  revalidatePath("/admin/accounting/coa", "page");
  return { ok: true, data: { id } };
}

// L4 parent options 給新增 modal 的 dropdown 用
export type CoaParentOption = {
  id: string;
  account_code: string;
  name_zh_tw: string;
  l1_category: string;
  dealer_category: string;
  normal_balance: "D" | "C";
};

export async function listL4ParentsAction(): Promise<
  CoaActionResult<CoaParentOption[]>
> {
  const deny = await requireAdmin();
  if (deny) return { ok: false, error: deny };

  const sb = createServiceClient();
  const { data, error } = await sb
    .from("chart_of_accounts")
    .select("id, account_code, name_zh_tw, l1_category, dealer_category, normal_balance")
    .eq("level", "L4_PARENT")
    .eq("is_active", true)
    .order("account_code");
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as unknown as CoaParentOption[] };
}
