"use server";

import { revalidatePath } from "next/cache";

import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentUserAndAdmin } from "@/lib/feedback-admin";
import { getDefaultTenantUuid } from "./queries";

export type JournalActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const PAGE_PATH = "/admin/accounting/journal-entries";

async function requireAdmin(): Promise<
  | { ok: true; userId: string }
  | { ok: false; error: string }
> {
  const { userId, isAdmin } = await getCurrentUserAndAdmin();
  if (!userId) return { ok: false, error: "請先登入" };
  if (!isAdmin) return { ok: false, error: "需要 admin 權限" };
  return { ok: true, userId };
}

// 自動產 entry_no：JE-YYYYMMDD-HHMMSS（同秒撞號機率極低；user 可手動覆蓋）
function generateEntryNo(): string {
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `JE-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function revalidateAll(entryId?: string) {
  revalidatePath(PAGE_PATH, "page");
  if (entryId) revalidatePath(`${PAGE_PATH}/${entryId}`, "page");
}

// ============================================================
// Header (journal_entries)
// ============================================================

export type EntryHeaderInput = {
  entry_no?: string | null;
  entry_date: string;
  description?: string | null;
};

export async function createDraftEntryAction(
  input: EntryHeaderInput,
): Promise<JournalActionResult<{ id: string; entry_no: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  if (!input.entry_date) return { ok: false, error: "傳票日期必填" };
  const entryNo = (input.entry_no ?? "").trim() || generateEntryNo();

  const tenant = await getDefaultTenantUuid();
  const sb = createServiceClient();
  const { data, error } = await sb
    .from("journal_entries")
    .insert({
      tenant_id: tenant,
      entry_no: entryNo,
      entry_date: input.entry_date,
      description: input.description?.trim() || null,
      status: "draft",
      created_by: auth.userId,
    })
    .select("id, entry_no")
    .single();
  if (error) {
    if (error.code === "23505")
      return { ok: false, error: `傳票編號「${entryNo}」已存在` };
    return { ok: false, error: error.message };
  }

  revalidateAll();
  return { ok: true, data: { id: data.id, entry_no: data.entry_no } };
}

export type EntryHeaderPatch = {
  entry_no?: string;
  entry_date?: string;
  description?: string | null;
};

export async function updateEntryHeaderAction(
  id: string,
  patch: EntryHeaderPatch,
): Promise<JournalActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!id) return { ok: false, error: "缺少 id" };

  const sb = createServiceClient();
  const { data: row, error: getErr } = await sb
    .from("journal_entries")
    .select("status")
    .eq("id", id)
    .single();
  if (getErr || !row) return { ok: false, error: getErr?.message ?? "找不到分錄" };
  if (row.status !== "draft")
    return { ok: false, error: `${row.status} 狀態的分錄不可編輯（請改用反向沖銷）` };

  const upd: Record<string, unknown> = {};
  if (typeof patch.entry_no === "string" && patch.entry_no.trim())
    upd.entry_no = patch.entry_no.trim();
  if (typeof patch.entry_date === "string" && patch.entry_date)
    upd.entry_date = patch.entry_date;
  if (typeof patch.description !== "undefined")
    upd.description = patch.description?.trim() || null;
  if (Object.keys(upd).length === 0)
    return { ok: false, error: "沒有要更新的欄位" };

  const { error } = await sb.from("journal_entries").update(upd).eq("id", id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "傳票編號重複" };
    return { ok: false, error: error.message };
  }

  revalidateAll(id);
  return { ok: true, data: { id } };
}

export async function deleteDraftEntryAction(
  id: string,
): Promise<JournalActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const sb = createServiceClient();
  const { data: row, error: getErr } = await sb
    .from("journal_entries")
    .select("status")
    .eq("id", id)
    .single();
  if (getErr || !row) return { ok: false, error: getErr?.message ?? "找不到分錄" };
  if (row.status !== "draft")
    return { ok: false, error: `${row.status} 狀態的分錄不可刪除（請改用反向沖銷）` };

  const { error } = await sb.from("journal_entries").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  revalidateAll();
  return { ok: true, data: { id } };
}

// ============================================================
// Lines (journal_entry_lines)
// ============================================================

export type LineInput = {
  entry_id: string;
  coa_id: string;
  line_no?: number;
  debit: number;
  credit: number;
  dimensions: Record<string, string | number>;
  description?: string | null;
};

async function ensureEntryDraft(
  sb: ReturnType<typeof createServiceClient>,
  entryId: string,
): Promise<JournalActionResult<{ id: string }>> {
  const { data, error } = await sb
    .from("journal_entries")
    .select("id, status")
    .eq("id", entryId)
    .single();
  if (error || !data)
    return { ok: false, error: error?.message ?? "找不到分錄" };
  if (data.status !== "draft")
    return { ok: false, error: `${data.status} 狀態的分錄不可改行（請反向沖銷）` };
  return { ok: true, data: { id: data.id } };
}

export async function addLineAction(
  input: LineInput,
): Promise<JournalActionResult<{ id: string; line_no: number }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const debit = Number(input.debit) || 0;
  const credit = Number(input.credit) || 0;
  if (debit < 0 || credit < 0)
    return { ok: false, error: "金額不可為負" };
  if (!(debit > 0 && credit === 0) && !(credit > 0 && debit === 0))
    return { ok: false, error: "一行只能借或貸（其中之一 > 0、另一個 = 0）" };
  if (!input.coa_id) return { ok: false, error: "請選擇科目" };

  const sb = createServiceClient();

  const draftCheck = await ensureEntryDraft(sb, input.entry_id);
  if (!draftCheck.ok) return draftCheck;

  // 確認 coa 是 postable
  const { data: coa, error: coaErr } = await sb
    .from("chart_of_accounts")
    .select("is_postable, is_active, name_zh_tw")
    .eq("id", input.coa_id)
    .single();
  if (coaErr || !coa)
    return { ok: false, error: coaErr?.message ?? "找不到該科目" };
  if (!coa.is_postable)
    return { ok: false, error: `「${coa.name_zh_tw}」不可入帳（僅 L5 可入帳）` };
  if (!coa.is_active)
    return { ok: false, error: `「${coa.name_zh_tw}」已停用，不可入帳` };

  // 自動 line_no：MAX(line_no)+1
  let lineNo = input.line_no;
  if (!lineNo || lineNo <= 0) {
    const { data: maxRow } = await sb
      .from("journal_entry_lines")
      .select("line_no")
      .eq("entry_id", input.entry_id)
      .order("line_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    lineNo = (maxRow?.line_no ?? 0) + 1;
  }

  const cleanDims = sanitizeDimensions(input.dimensions);

  const { data, error } = await sb
    .from("journal_entry_lines")
    .insert({
      entry_id: input.entry_id,
      line_no: lineNo,
      coa_id: input.coa_id,
      debit,
      credit,
      dimensions: cleanDims,
      description: input.description?.trim() || null,
    })
    .select("id, line_no")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: `行號 ${lineNo} 已存在` };
    return { ok: false, error: error.message };
  }

  revalidateAll(input.entry_id);
  return { ok: true, data: { id: data.id, line_no: data.line_no } };
}

export type LinePatch = {
  coa_id?: string;
  debit?: number;
  credit?: number;
  dimensions?: Record<string, string | number>;
  description?: string | null;
};

export async function updateLineAction(
  lineId: string,
  patch: LinePatch,
): Promise<JournalActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!lineId) return { ok: false, error: "缺少行 id" };

  const sb = createServiceClient();
  const { data: line, error: lineErr } = await sb
    .from("journal_entry_lines")
    .select("entry_id, debit, credit")
    .eq("id", lineId)
    .single();
  if (lineErr || !line)
    return { ok: false, error: lineErr?.message ?? "找不到該行" };

  const draftCheck = await ensureEntryDraft(sb, line.entry_id);
  if (!draftCheck.ok) return draftCheck;

  const upd: Record<string, unknown> = {};
  if (typeof patch.coa_id === "string" && patch.coa_id) {
    const { data: coa, error: coaErr } = await sb
      .from("chart_of_accounts")
      .select("is_postable, is_active, name_zh_tw")
      .eq("id", patch.coa_id)
      .single();
    if (coaErr || !coa)
      return { ok: false, error: coaErr?.message ?? "找不到該科目" };
    if (!coa.is_postable)
      return { ok: false, error: `「${coa.name_zh_tw}」不可入帳` };
    if (!coa.is_active)
      return { ok: false, error: `「${coa.name_zh_tw}」已停用` };
    upd.coa_id = patch.coa_id;
  }

  const newDebit = typeof patch.debit === "number" ? Number(patch.debit) || 0 : Number(line.debit) || 0;
  const newCredit = typeof patch.credit === "number" ? Number(patch.credit) || 0 : Number(line.credit) || 0;
  if (typeof patch.debit === "number" || typeof patch.credit === "number") {
    if (newDebit < 0 || newCredit < 0)
      return { ok: false, error: "金額不可為負" };
    if (!(newDebit > 0 && newCredit === 0) && !(newCredit > 0 && newDebit === 0))
      return { ok: false, error: "一行只能借或貸" };
    upd.debit = newDebit;
    upd.credit = newCredit;
  }
  if (typeof patch.dimensions === "object" && patch.dimensions !== null) {
    upd.dimensions = sanitizeDimensions(patch.dimensions);
  }
  if (typeof patch.description !== "undefined") {
    upd.description = patch.description?.trim() || null;
  }
  if (Object.keys(upd).length === 0)
    return { ok: false, error: "沒有要更新的欄位" };

  const { error } = await sb.from("journal_entry_lines").update(upd).eq("id", lineId);
  if (error) return { ok: false, error: error.message };

  revalidateAll(line.entry_id);
  return { ok: true, data: { id: lineId } };
}

export async function removeLineAction(
  lineId: string,
): Promise<JournalActionResult<{ id: string; entry_id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  if (!lineId) return { ok: false, error: "缺少行 id" };

  const sb = createServiceClient();
  const { data: line, error: lineErr } = await sb
    .from("journal_entry_lines")
    .select("entry_id")
    .eq("id", lineId)
    .single();
  if (lineErr || !line)
    return { ok: false, error: lineErr?.message ?? "找不到該行" };

  const draftCheck = await ensureEntryDraft(sb, line.entry_id);
  if (!draftCheck.ok) return draftCheck;

  const { error } = await sb.from("journal_entry_lines").delete().eq("id", lineId);
  if (error) return { ok: false, error: error.message };

  revalidateAll(line.entry_id);
  return { ok: true, data: { id: lineId, entry_id: line.entry_id } };
}

// ============================================================
// 過帳 / 反向沖銷
// ============================================================

export async function postEntryAction(
  id: string,
): Promise<JournalActionResult<{ id: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const sb = createServiceClient();
  const { data: row, error: getErr } = await sb
    .from("journal_entries")
    .select("status")
    .eq("id", id)
    .single();
  if (getErr || !row) return { ok: false, error: getErr?.message ?? "找不到分錄" };
  if (row.status !== "draft")
    return { ok: false, error: `${row.status} 狀態的分錄無法再次過帳` };

  const { error } = await sb
    .from("journal_entries")
    .update({ status: "posted", posted_by: auth.userId })
    .eq("id", id);
  if (error) {
    // DB trigger 拋的訊息（借貸不平 / 缺維度 / 不可入帳科目 / 無行）
    return { ok: false, error: humanizePostingError(error.message) };
  }

  revalidateAll(id);
  return { ok: true, data: { id } };
}

export async function reverseEntryAction(
  id: string,
  reverseDate?: string,
): Promise<JournalActionResult<{ new_id: string; new_entry_no: string }>> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;

  const sb = createServiceClient();

  const { data: orig, error: origErr } = await sb
    .from("journal_entries")
    .select("id, tenant_id, entry_no, entry_date, description, status")
    .eq("id", id)
    .single();
  if (origErr || !orig)
    return { ok: false, error: origErr?.message ?? "找不到分錄" };
  if (orig.status !== "posted")
    return { ok: false, error: `只能反向沖銷已過帳的分錄（目前 ${orig.status}）` };

  const { data: lines, error: linesErr } = await sb
    .from("journal_entry_lines")
    .select("line_no, coa_id, debit, credit, dimensions, description")
    .eq("entry_id", id)
    .order("line_no");
  if (linesErr) return { ok: false, error: linesErr.message };
  if (!lines?.length) return { ok: false, error: "原分錄無行可反向" };

  const newEntryNo = `${orig.entry_no}-REV`;
  const newDate = reverseDate || new Date().toISOString().slice(0, 10);

  // 1. 建反向 draft
  const { data: newEntry, error: newErr } = await sb
    .from("journal_entries")
    .insert({
      tenant_id: orig.tenant_id,
      entry_no: newEntryNo,
      entry_date: newDate,
      description: `反向沖銷 ${orig.entry_no}${orig.description ? `：${orig.description}` : ""}`,
      status: "draft",
      created_by: auth.userId,
    })
    .select("id, entry_no")
    .single();
  if (newErr) {
    if (newErr.code === "23505")
      return { ok: false, error: `反向沖銷編號 ${newEntryNo} 已存在` };
    return { ok: false, error: newErr.message };
  }

  // 2. 反向 lines（debit ↔ credit）
  const reversedLines = lines.map((l) => ({
    entry_id: newEntry.id,
    line_no: l.line_no,
    coa_id: l.coa_id,
    debit: Number(l.credit) || 0,
    credit: Number(l.debit) || 0,
    dimensions: l.dimensions ?? {},
    description: l.description ? `反向：${l.description}` : null,
  }));
  const { error: insLineErr } = await sb
    .from("journal_entry_lines")
    .insert(reversedLines);
  if (insLineErr) {
    await sb.from("journal_entries").delete().eq("id", newEntry.id);
    return { ok: false, error: `寫入反向行失敗：${insLineErr.message}` };
  }

  // 3. 反向 entry 直接 post（trigger 會驗證；對稱平衡 + 同 dim 一定過）
  const { error: postErr } = await sb
    .from("journal_entries")
    .update({ status: "posted", posted_by: auth.userId })
    .eq("id", newEntry.id);
  if (postErr) {
    await sb.from("journal_entries").delete().eq("id", newEntry.id);
    return { ok: false, error: `過帳反向分錄失敗：${humanizePostingError(postErr.message)}` };
  }

  // 4. 原 entry 標 reversed
  const { error: revErr } = await sb
    .from("journal_entries")
    .update({ status: "reversed", reversed_by_entry_id: newEntry.id })
    .eq("id", id);
  if (revErr) return { ok: false, error: `更新原分錄狀態失敗：${revErr.message}` };

  revalidateAll(id);
  revalidateAll(newEntry.id);
  return { ok: true, data: { new_id: newEntry.id, new_entry_no: newEntry.entry_no } };
}

// ============================================================
// helpers
// ============================================================

function sanitizeDimensions(
  dims: Record<string, string | number> | null | undefined,
): Record<string, string | number> {
  if (!dims || typeof dims !== "object") return {};
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(dims)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (t) out[k.toUpperCase()] = t;
    } else if (typeof v === "number" && Number.isFinite(v)) {
      out[k.toUpperCase()] = v;
    }
  }
  return out;
}

function humanizePostingError(raw: string): string {
  // 把 plpgsql RAISE EXCEPTION 訊息翻成中文 banner
  if (raw.includes("unbalanced")) {
    const m = raw.match(/debit=([0-9.]+), credit=([0-9.]+)/);
    if (m) return `借貸不平：借 ${m[1]} ≠ 貸 ${m[2]}，請檢查分錄`;
    return "借貸不平衡，無法過帳";
  }
  if (raw.includes("has no lines")) return "此分錄沒有任何行，無法過帳";
  if (raw.includes("zero amount")) return "此分錄總金額為 0，無法過帳";
  if (raw.includes("non-postable accounts")) {
    const m = raw.match(/lines \[([^\]]+)\]/);
    return `第 ${m?.[1] ?? "?"} 行使用了不可入帳的科目（必須 L5_DETAIL）`;
  }
  if (raw.includes("missing required dimensions")) {
    const m = raw.match(/missing required dimensions: (.+)$/);
    return `缺必填維度：${m?.[1] ?? "（未知）"}`;
  }
  return `過帳失敗：${raw}`;
}
