import "server-only";

import { createServiceClient } from "@/lib/supabase/service";

import { instantiateTransaction, type InstantiateCtx } from "./instantiate-engine";

/**
 * postDocToGl — 把 GL 過帳「加掛」到任一子帳單據，而不改寫單據既有的存檔/確認邏輯。
 *
 * 用法（子帳 domain helper 在「確認/過帳」動作裡呼叫）：
 *   const r = await postDocToGl({
 *     table: "vendor_bills", docId, typeCode: "VENDOR_BILL",
 *     ctx: { ...func 化金額..., subsidiary_id, vendor_id, ... },
 *     entryDate: bill_date, userId,
 *   });
 *   if (!r.ok) return { ok:false, error:r.error };  // 單據維持 draft、surface 錯誤
 *
 * 成功後會把 journal_entry_id / gl_posted / gl_posted_at 回寫到該單據 row。
 * 失敗（template 設計錯、借貸不平、期間鎖期、缺維度…）不回寫，單據保持原狀。
 *
 * 注意：ctx 內金額一律已是「本位幣（functional currency）」— caller 先乘匯率，
 * 引擎數學不動（見 instantiate-engine）。
 */
export type PostDocResult =
  | { ok: true; entryId: string; entryNo: string; linesCount: number }
  | { ok: false; error: string };

export async function postDocToGl(opts: {
  /** 子帳單據資料表名（回寫 journal_entry_id 用） */
  table: string;
  docId: string;
  /** transaction_types.code */
  typeCode: string;
  ctx: InstantiateCtx;
  entryDate?: string;
  userId?: string;
  description?: string;
  cashFlowSectionOverride?: "operating" | "investing" | "financing" | null;
}): Promise<PostDocResult> {
  const sb = createServiceClient();

  // 冪等：已過帳就不重複過（避免重複按造成雙重入帳）
  const { data: doc, error: docErr } = await sb
    .from(opts.table)
    .select("id, journal_entry_id, gl_posted")
    .eq("id", opts.docId)
    .maybeSingle();
  if (docErr) return { ok: false, error: `讀取 ${opts.table} 失敗：${docErr.message}` };
  if (!doc) return { ok: false, error: `${opts.table} 找不到單據 ${opts.docId}` };
  if (doc.gl_posted && doc.journal_entry_id) {
    return { ok: false, error: "此單據已過帳，請勿重複過帳" };
  }

  const res = await instantiateTransaction(opts.typeCode, opts.ctx, {
    autoPost: true,
    entryDate: opts.entryDate,
    userId: opts.userId,
    description: opts.description,
    cashFlowSectionOverride: opts.cashFlowSectionOverride,
  });
  if (!res.ok) return { ok: false, error: res.error };

  const { error: writeErr } = await sb
    .from(opts.table)
    .update({
      journal_entry_id: res.data.entry_id,
      gl_posted: true,
      gl_posted_at: new Date().toISOString(),
    })
    .eq("id", opts.docId);
  if (writeErr) {
    // GL 已過帳成功，但回寫失敗 — 回報讓 caller 決定（分錄已存在、可人工補連結）
    return {
      ok: false,
      error: `GL 已過帳(${res.data.entry_no})但回寫 ${opts.table}.journal_entry_id 失敗：${writeErr.message}`,
    };
  }

  return {
    ok: true,
    entryId: res.data.entry_id,
    entryNo: res.data.entry_no,
    linesCount: res.data.lines_count,
  };
}

/**
 * reverseDocGl — 取消/作廢子帳單據時，反向沖銷其 GL 分錄。
 * service-role 直接做（不經 requireAdmin），因為呼叫端 domain 動作自己做權限檢查。
 * 沖銷後把單據的 gl_posted 設回 false（journal_entry_id 保留供稽核追溯）。
 */
export async function reverseDocGl(opts: {
  table: string;
  docId: string;
  reverseDate?: string;
  userId?: string;
}): Promise<PostDocResult> {
  const sb = createServiceClient();

  const { data: doc, error: docErr } = await sb
    .from(opts.table)
    .select("id, journal_entry_id, gl_posted")
    .eq("id", opts.docId)
    .maybeSingle();
  if (docErr) return { ok: false, error: `讀取 ${opts.table} 失敗：${docErr.message}` };
  if (!doc) return { ok: false, error: `${opts.table} 找不到單據 ${opts.docId}` };
  if (!doc.journal_entry_id || !doc.gl_posted) {
    return { ok: false, error: "此單據尚未過帳，無分錄可沖銷" };
  }

  const { data: orig, error: origErr } = await sb
    .from("journal_entries")
    .select("id, entry_no, entry_date, description, status")
    .eq("id", doc.journal_entry_id)
    .single();
  if (origErr || !orig) return { ok: false, error: origErr?.message ?? "找不到原分錄" };
  if (orig.status !== "posted") {
    return { ok: false, error: `只能沖銷已過帳的分錄（目前 ${orig.status}）` };
  }

  const { data: lines, error: linesErr } = await sb
    .from("journal_entry_lines")
    .select("line_no, coa_id, debit, credit, dimensions, description")
    .eq("entry_id", orig.id)
    .order("line_no");
  if (linesErr) return { ok: false, error: linesErr.message };
  if (!lines?.length) return { ok: false, error: "原分錄無行可沖銷" };

  const tenant = await getEntryTenant(sb, orig.id);
  if (!tenant) return { ok: false, error: "找不到原分錄 tenant" };

  const newEntryNo = `${orig.entry_no}-REV`;
  const newDate = opts.reverseDate || new Date().toISOString().slice(0, 10);

  // 1. 建反向 draft（借貸對調）
  const { data: rev, error: revErr } = await sb
    .from("journal_entries")
    .insert({
      tenant_id: tenant,
      entry_no: newEntryNo,
      entry_date: newDate,
      description: `沖銷 ${orig.entry_no}：${orig.description ?? ""}`.trim(),
      status: "draft",
      reversed_by_entry_id: orig.id,
      created_by: opts.userId ?? null,
    })
    .select("id, entry_no")
    .single();
  if (revErr) return { ok: false, error: `建沖銷分錄失敗：${revErr.message}` };

  const revLines = lines.map((l) => ({
    entry_id: rev.id,
    line_no: l.line_no,
    coa_id: l.coa_id,
    debit: l.credit,
    credit: l.debit,
    dimensions: l.dimensions,
    description: l.description,
  }));
  const { error: revLinesErr } = await sb.from("journal_entry_lines").insert(revLines);
  if (revLinesErr) {
    await sb.from("journal_entries").delete().eq("id", rev.id);
    return { ok: false, error: `寫沖銷行失敗：${revLinesErr.message}` };
  }

  // 2. post 沖銷分錄
  const { error: postErr } = await sb
    .from("journal_entries")
    .update({ status: "posted", posted_by: opts.userId ?? null })
    .eq("id", rev.id);
  if (postErr) {
    await sb.from("journal_entries").delete().eq("id", rev.id);
    return { ok: false, error: `過帳沖銷分錄失敗：${postErr.message}` };
  }

  // 3. 原分錄標記 reversed + 單據 gl_posted 設回 false
  await sb.from("journal_entries").update({ status: "reversed" }).eq("id", orig.id);
  await sb.from(opts.table).update({ gl_posted: false }).eq("id", opts.docId);

  return { ok: true, entryId: rev.id, entryNo: rev.entry_no, linesCount: revLines.length };
}

async function getEntryTenant(
  sb: ReturnType<typeof createServiceClient>,
  entryId: string,
): Promise<string | null> {
  const { data } = await sb
    .from("journal_entries")
    .select("tenant_id")
    .eq("id", entryId)
    .maybeSingle();
  return (data?.tenant_id as string | undefined) ?? null;
}
