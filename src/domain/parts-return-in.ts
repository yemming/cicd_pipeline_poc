"use server";

/**
 * Domain Helper — Parts Return-In（領料退貨入庫 §5.4 / M04U-19）
 *
 * 領料退貨入庫 = 維修廠/工單師傅領料後未用完退回倉庫（service → parts 的逆流）。
 * 統一走 stock_receipts (type='ro_return') + stock_receipt_lines 基建，
 * 不另開表。建單可從既有 stock_issue 拉明細部分退入，或自由建單。
 *
 * 業務流程：
 *  1. 從 list 點「新增退料入庫」→ /parts/receipt/return-in/new 選一張 issue → 各 line 填退入數
 *  2. submit → createReturnInReceipt() 建 stock_receipts(type='ro_return', status='completed')
 *     + stock_receipt_lines + stock_items(status='available') 回庫
 *  3. 作廢 → 沿用 receipts.voidReceipt（守門：stock_items 必須仍 available）
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { hasPermission, requirePermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { RETURN_IN_PAGE_SIZE_DEFAULT } from "./parts-return-in.constants";

// ─────────────────────────────────────────────────────────────
// Result 型別
// ─────────────────────────────────────────────────────────────

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// 型別 — list row / detail / kpi
// ─────────────────────────────────────────────────────────────

export type ReturnInRow = {
  id: string;
  gr_no: string;
  warehouse_id: string;
  warehouse_name: string | null;
  source_doc_id: string | null;
  source_doc_type: string | null;
  source_label: string | null; // 「領料 ISS-xxx」/「工單 RO-xxx」拼接顯示
  return_reason: string | null;
  receipt_date: string;
  status: string;
  qty_total: number;
  amount_total: number;
  notes: string | null;
  posted_at: string | null;
  created_at: string;
};

export type ReturnInFilter = {
  status?: string;
  warehouse_id?: string;
  reason?: string;
  q?: string;
  date_from?: string;
  date_to?: string;
};

export type ReturnInKpis = {
  totalCount: number; // 範圍內已過帳筆數
  draftCount: number;
  postedCount: number;
  cancelledCount: number;
  totalQty: number;
  totalAmount: number;
  thisMonthCount: number;
  thisMonthAmount: number;
};

export type WarehouseOption = { id: string; name: string };

export type ReturnReasonDatum = {
  reason: string;
  count: number;
  amount: number;
};

export type ReturnInPageBundle = {
  rows: ReturnInRow[];
  totalCount: number;
  kpis: ReturnInKpis;
  warehouses: WarehouseOption[];
  reasonMix: ReturnReasonDatum[];
  canEdit: boolean;
};

// ─────────────────────────────────────────────────────────────
// list — rows + 自動 join source / warehouse
// ─────────────────────────────────────────────────────────────

async function fetchRows(
  filter: ReturnInFilter,
  options: { page?: number; pageSize?: number } = {},
): Promise<{ rows: ReturnInRow[]; totalCount: number }> {
  const supabase = await createClient();
  const scope = await getActiveScope();
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.max(1, options.pageSize ?? RETURN_IN_PAGE_SIZE_DEFAULT);
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = supabase
    .from("stock_receipts")
    .select(
      "id, gr_no, warehouse_id, source_doc_id, source_doc_type, receipt_date, status, qty_received_total, amount_total, notes, posted_at, created_at, metadata",
      { count: "exact" },
    )
    .eq("brand_id", scope.brand_id)
    .eq("type", "ro_return")
    .order("receipt_date", { ascending: false })
    .order("gr_no", { ascending: false });

  if (filter.status) q = q.eq("status", filter.status);
  if (filter.warehouse_id) q = q.eq("warehouse_id", filter.warehouse_id);
  if (filter.q) q = q.ilike("gr_no", `%${filter.q}%`);
  if (filter.date_from) q = q.gte("receipt_date", filter.date_from);
  if (filter.date_to) q = q.lte("receipt_date", filter.date_to);
  q = q.range(from, to);

  const { data, error, count } = await q;
  if (error) throw error;
  const list = data ?? [];

  // reason filter 走 metadata.return_reason、SQL 端用 ->> 比對
  const filteredByReason = filter.reason
    ? list.filter((r) => {
        const m = (r.metadata ?? {}) as Record<string, unknown>;
        return (m.return_reason as string | undefined) === filter.reason;
      })
    : list;

  if (filteredByReason.length === 0) return { rows: [], totalCount: count ?? 0 };

  const wIds = Array.from(
    new Set(filteredByReason.map((r) => r.warehouse_id).filter((x): x is string => !!x)),
  );
  const issueIds = filteredByReason
    .filter((r) => r.source_doc_type === "stock_issue" && r.source_doc_id)
    .map((r) => r.source_doc_id as string);

  const [wRes, iRes] = await Promise.all([
    wIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", wIds)
      : Promise.resolve({ data: [], error: null }),
    issueIds.length > 0
      ? supabase.from("stock_issues").select("id, gi_no").in("id", issueIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));
  const iMap = new Map((iRes.data ?? []).map((i) => [i.id, i.gi_no]));

  const rows: ReturnInRow[] = filteredByReason.map((r) => {
    const meta = (r.metadata ?? {}) as Record<string, unknown>;
    const reason = (meta.return_reason as string | null | undefined) ?? null;
    let sourceLabel: string | null = null;
    if (r.source_doc_type === "stock_issue" && r.source_doc_id) {
      const gi = iMap.get(r.source_doc_id);
      sourceLabel = gi ? `領料 ${gi}` : "領料單";
    } else if (r.source_doc_type === "work_order") {
      sourceLabel = "工單退料";
    } else if (r.source_doc_type) {
      sourceLabel = r.source_doc_type;
    }

    return {
      id: r.id,
      gr_no: r.gr_no,
      warehouse_id: r.warehouse_id,
      warehouse_name: r.warehouse_id ? wMap.get(r.warehouse_id) ?? null : null,
      source_doc_id: r.source_doc_id,
      source_doc_type: r.source_doc_type,
      source_label: sourceLabel,
      return_reason: reason,
      receipt_date: r.receipt_date,
      status: r.status,
      qty_total: Number(r.qty_received_total ?? 0),
      amount_total: Number(r.amount_total ?? 0),
      notes: r.notes,
      posted_at: r.posted_at,
      created_at: r.created_at,
    };
  });

  return { rows, totalCount: count ?? rows.length };
}

// ─────────────────────────────────────────────────────────────
// Page bundle — list + kpis + warehouses + reasonMix（全 brand 範圍）
// ─────────────────────────────────────────────────────────────

export async function getReturnInPageBundle(
  filter: ReturnInFilter = {},
  options: { page?: number; pageSize?: number } = {},
): Promise<ReturnInPageBundle> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const [{ rows, totalCount }, canEdit, kpiRes, whRes] = await Promise.all([
    fetchRows(filter, options),
    hasPermission(PERMISSIONS.RECEIPT_CREATE),
    supabase
      .from("stock_receipts")
      .select("status, amount_total, qty_received_total, receipt_date, metadata")
      .eq("brand_id", scope.brand_id)
      .eq("type", "ro_return"),
    supabase
      .from("warehouses")
      .select("id, name")
      .eq("brand_id", scope.brand_id)
      .eq("is_active", true)
      .order("name"),
  ]);

  const all = kpiRes.data ?? [];
  let draftCount = 0;
  let postedCount = 0;
  let cancelledCount = 0;
  let totalQty = 0;
  let totalAmount = 0;
  let thisMonthCount = 0;
  let thisMonthAmount = 0;
  const reasonAgg = new Map<string, { count: number; amount: number }>();

  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;

  for (const r of all) {
    const s = r.status ?? "";
    if (s === "draft") draftCount += 1;
    else if (s === "cancelled") cancelledCount += 1;
    else if (s === "completed" || s === "posted") {
      postedCount += 1;
      totalQty += Number(r.qty_received_total ?? 0);
      totalAmount += Number(r.amount_total ?? 0);
      if (r.receipt_date && r.receipt_date >= monthStart) {
        thisMonthCount += 1;
        thisMonthAmount += Number(r.amount_total ?? 0);
      }
    }
    // reason 聚合：含 draft 也算（讓建單後就立刻有貢獻）；但 cancelled 排除
    if (s !== "cancelled") {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      const reason = (meta.return_reason as string | undefined) ?? "未分類";
      const cur = reasonAgg.get(reason) ?? { count: 0, amount: 0 };
      cur.count += 1;
      cur.amount += Number(r.amount_total ?? 0);
      reasonAgg.set(reason, cur);
    }
  }

  const reasonMix: ReturnReasonDatum[] = Array.from(reasonAgg.entries())
    .map(([reason, agg]) => ({
      reason,
      count: agg.count,
      amount: Math.round(agg.amount * 100) / 100,
    }))
    .sort((a, b) => b.count - a.count);

  const kpis: ReturnInKpis = {
    totalCount: all.length - cancelledCount,
    draftCount,
    postedCount,
    cancelledCount,
    totalQty,
    totalAmount: Math.round(totalAmount * 100) / 100,
    thisMonthCount,
    thisMonthAmount: Math.round(thisMonthAmount * 100) / 100,
  };

  return {
    rows,
    totalCount,
    kpis,
    warehouses: (whRes.data ?? []) as WarehouseOption[],
    reasonMix,
    canEdit,
  };
}

// ─────────────────────────────────────────────────────────────
// 撈可退入的領料單（建單頁面用）
// ─────────────────────────────────────────────────────────────

export type IssueCandidate = {
  id: string;
  gi_no: string;
  warehouse_id: string;
  warehouse_name: string | null;
  issue_date: string;
  qty_issued_total: number;
  line_count: number;
};

export async function listReturnableIssues(): Promise<IssueCandidate[]> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: issues, error } = await supabase
    .from("stock_issues")
    .select("id, gi_no, warehouse_id, issue_date, qty_issued_total")
    .eq("brand_id", scope.brand_id)
    .eq("status", "completed")
    .order("issue_date", { ascending: false })
    .limit(50);
  if (error) throw error;
  if (!issues || issues.length === 0) return [];

  const wIds = Array.from(new Set(issues.map((i) => i.warehouse_id)));
  const issueIds = issues.map((i) => i.id);

  const [wRes, linesRes] = await Promise.all([
    supabase.from("warehouses").select("id, name").in("id", wIds),
    supabase.from("stock_issue_lines").select("gi_id, id").in("gi_id", issueIds),
  ]);
  const wMap = new Map((wRes.data ?? []).map((w) => [w.id, w.name]));
  const lineCountMap = new Map<string, number>();
  for (const ln of linesRes.data ?? []) {
    lineCountMap.set(ln.gi_id, (lineCountMap.get(ln.gi_id) ?? 0) + 1);
  }

  return issues.map((i) => ({
    id: i.id,
    gi_no: i.gi_no,
    warehouse_id: i.warehouse_id,
    warehouse_name: wMap.get(i.warehouse_id) ?? null,
    issue_date: i.issue_date,
    qty_issued_total: Number(i.qty_issued_total ?? 0),
    line_count: lineCountMap.get(i.id) ?? 0,
  }));
}

export type IssueLineCandidate = {
  id: string;
  line_no: number;
  item_id: string;
  item_code: string | null;
  item_name: string | null;
  bin_id: string | null;
  bin_label: string | null;
  qty_issued: number;
  /** 本領料單此明細「未作廢退入單」已退入累計數 */
  already_returned: number;
  /** 尚可退入數 = qty_issued - already_returned（≥ 0）*/
  qty_returnable: number;
  unit_cost: number;
  uom: string;
  serial_no: string | null;
  batch_no: string | null;
};

export type IssueWithLines = {
  issue: IssueCandidate;
  lines: IssueLineCandidate[];
};

/**
 * 累計某張領料單「未作廢」退入單各明細的已退數（key = stock_issue_lines.id）。
 * 用於建單防超退 + 前端顯示「已退 / 可退」。作廢單已沖回庫存，故排除。
 */
async function sumReturnedByIssueLine(
  brandId: string,
  issueId: string,
): Promise<Map<string, number>> {
  const supabase = await createClient();
  const map = new Map<string, number>();
  const { data: priorReceipts } = await supabase
    .from("stock_receipts")
    .select("id")
    .eq("brand_id", brandId)
    .eq("source_doc_id", issueId)
    .eq("type", "ro_return")
    .neq("status", "cancelled");
  const grIds = (priorReceipts ?? []).map((r) => r.id);
  if (grIds.length === 0) return map;
  const { data: priorLines } = await supabase
    .from("stock_receipt_lines")
    .select("source_line_id, qty_received")
    .in("gr_id", grIds)
    .eq("source_line_type", "gi_line");
  for (const pl of priorLines ?? []) {
    if (!pl.source_line_id) continue;
    map.set(
      pl.source_line_id,
      (map.get(pl.source_line_id) ?? 0) + Number(pl.qty_received ?? 0),
    );
  }
  return map;
}

export async function getIssueForReturn(issueId: string): Promise<IssueWithLines | null> {
  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: issue, error } = await supabase
    .from("stock_issues")
    .select("id, gi_no, warehouse_id, issue_date, qty_issued_total, status")
    .eq("id", issueId)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (error) throw error;
  if (!issue) return null;
  if (issue.status !== "completed") return null;

  const { data: rawLines } = await supabase
    .from("stock_issue_lines")
    .select(
      "id, line_no, item_id, bin_id, qty_issued, unit_cost, uom, serial_no, batch_no",
    )
    .eq("gi_id", issueId)
    .order("line_no", { ascending: true });
  const lines = rawLines ?? [];

  // 各明細已退累計（排除作廢退入單），算出尚可退入數供前端顯示與 max 限制
  const returnedByLine = await sumReturnedByIssueLine(scope.brand_id, issueId);

  const itemIds = Array.from(new Set(lines.map((l) => l.item_id)));
  const binIds = Array.from(new Set(lines.map((l) => l.bin_id).filter((x): x is string => !!x)));
  const [itemRes, binRes, wRes] = await Promise.all([
    itemIds.length > 0
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    binIds.length > 0
      ? supabase.from("warehouse_bins").select("id, code").in("id", binIds)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("warehouses").select("id, name").eq("id", issue.warehouse_id).maybeSingle(),
  ]);
  const itemMap = new Map((itemRes.data ?? []).map((it) => [it.id, { code: it.code, name: it.name }]));
  const binMap = new Map((binRes.data ?? []).map((b) => [b.id, b.code]));

  return {
    issue: {
      id: issue.id,
      gi_no: issue.gi_no,
      warehouse_id: issue.warehouse_id,
      warehouse_name: wRes.data?.name ?? null,
      issue_date: issue.issue_date,
      qty_issued_total: Number(issue.qty_issued_total ?? 0),
      line_count: lines.length,
    },
    lines: lines.map((l) => ({
      id: l.id,
      line_no: l.line_no,
      item_id: l.item_id,
      item_code: itemMap.get(l.item_id)?.code ?? null,
      item_name: itemMap.get(l.item_id)?.name ?? null,
      bin_id: l.bin_id,
      bin_label: l.bin_id ? binMap.get(l.bin_id) ?? null : null,
      qty_issued: Number(l.qty_issued ?? 0),
      already_returned: returnedByLine.get(l.id) ?? 0,
      qty_returnable: Math.max(
        0,
        Math.round((Number(l.qty_issued ?? 0) - (returnedByLine.get(l.id) ?? 0)) * 100) / 100,
      ),
      unit_cost: Number(l.unit_cost ?? 0),
      uom: l.uom,
      serial_no: l.serial_no,
      batch_no: l.batch_no,
    })),
  };
}

// ─────────────────────────────────────────────────────────────
// Create — 從 stock_issue 拉退料明細建退入單
// ─────────────────────────────────────────────────────────────

// 退料類型（設計稿三選一 UI 對應值）
export type ReturnType = "complete" | "writeoff" | "cancel_order";

export type CreateReturnInInput = {
  issue_id: string;
  receipt_date?: string;
  return_reason: string;
  /**
   * 退料類型：
   *  - complete    = 完整退料（零件完好可重新入庫）
   *  - writeoff    = 損耗核銷（已開封/安裝一半，需主管授權）
   *  - cancel_order = 工單取消退料（整張工單中途取消）
   * 不傳時 fallback 到 'complete'
   */
  return_type?: ReturnType;
  /** 損耗核銷時的核銷原因（writeoff 時必填）*/
  writeoff_reason?: string;
  /** 損耗核銷主管授權人 id（writeoff 時必填）*/
  approver_id?: string | null;
  notes?: string;
  lines: Array<{ line_id: string; qty_returned: number }>;
};

export async function createReturnInReceipt(
  input: CreateReturnInInput,
): Promise<Result<{ id: string; gr_no: string }>> {
  await requirePermission(PERMISSIONS.RECEIPT_CREATE);

  if (!input?.issue_id) return { ok: false, error: "缺領料單 id" };
  if (!input.return_reason?.trim()) return { ok: false, error: "請選擇退料原因" };
  const linesIn = (input.lines ?? []).filter((l) => l.qty_returned > 0);
  if (linesIn.length === 0) return { ok: false, error: "至少要輸入一筆退入數量" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  // 1. 撈 issue + lines 預檢
  const { data: issue, error: issueErr } = await supabase
    .from("stock_issues")
    .select("id, gi_no, status, warehouse_id, brand_id")
    .eq("id", input.issue_id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (issueErr || !issue) {
    return { ok: false, error: `找不到領料單：${issueErr?.message ?? "no row"}` };
  }
  if (issue.status !== "completed") {
    return { ok: false, error: `領料單狀態 ${issue.status} 不可退入（需 completed）` };
  }

  const lineIds = linesIn.map((l) => l.line_id);
  const { data: issueLines, error: linesErr } = await supabase
    .from("stock_issue_lines")
    .select("id, item_id, bin_id, qty_issued, unit_cost, uom, serial_no, batch_no")
    .in("id", lineIds)
    .eq("brand_id", scope.brand_id);
  if (linesErr || !issueLines) {
    return { ok: false, error: `撈領料明細失敗：${linesErr?.message ?? ""}` };
  }
  const ilMap = new Map(issueLines.map((l) => [l.id, l]));

  // 防超退：累計本領料單先前「未作廢」退入單的已退數（按 source_line_id 分組），
  // 擋「已退 + 本次 > 領料數」——否則同一張領料單可重複開退入單把庫存灌水。
  // 作廢單（status='cancelled'）已把 stock_items 沖回，故排除、可重退。
  const priorByLine = await sumReturnedByIssueLine(scope.brand_id, issue.id);

  for (const l of linesIn) {
    const il = ilMap.get(l.line_id);
    if (!il) return { ok: false, error: `領料明細 ${l.line_id.slice(0, 8)} 不存在` };
    const issuedQty = Number(il.qty_issued);
    const alreadyReturned = priorByLine.get(l.line_id) ?? 0;
    if (alreadyReturned + l.qty_returned > issuedQty) {
      const remain = Math.max(0, Math.round((issuedQty - alreadyReturned) * 100) / 100);
      return {
        ok: false,
        error: `退入數超出可退量（領料 ${issuedQty}、已退 ${alreadyReturned}、本次最多可退 ${remain}）`,
      };
    }
  }

  // 2. 產 GR 號（GR{yyyymmdd}-{NNN}）
  const today = new Date();
  const dateStr =
    today.getFullYear().toString() +
    String(today.getMonth() + 1).padStart(2, "0") +
    String(today.getDate()).padStart(2, "0");
  const { data: lastGr } = await supabase
    .from("stock_receipts")
    .select("gr_no")
    .eq("brand_id", scope.brand_id)
    .like("gr_no", `GR${dateStr}-%`)
    .order("gr_no", { ascending: false })
    .limit(1)
    .maybeSingle();
  let seq = 1;
  if (lastGr?.gr_no) {
    const m = lastGr.gr_no.match(/-(\d+)$/);
    if (m) seq = parseInt(m[1], 10) + 1;
  }
  const gr_no = `GR${dateStr}-${String(seq).padStart(3, "0")}`;

  // 3. 計算總量 / 總金額
  const totalQty = linesIn.reduce((s, l) => s + l.qty_returned, 0);
  const totalAmount = linesIn.reduce((s, l) => {
    const il = ilMap.get(l.line_id)!;
    return s + l.qty_returned * Number(il.unit_cost ?? 0);
  }, 0);

  // 4. Insert stock_receipts（type='ro_return'）
  const reason = input.return_reason.trim();
  const returnType = input.return_type ?? "complete";

  // 損耗核銷（writeoff）驗證：需要核銷原因
  if (returnType === "writeoff" && !input.writeoff_reason?.trim()) {
    return { ok: false, error: "損耗核銷需填寫核銷原因" };
  }

  const { data: { user } } = await supabase.auth.getUser();

  // 損耗核銷：status='draft' 等待主管授權；其餘直接 completed
  const receiptStatus = returnType === "writeoff" ? "draft" : "completed";
  const postedAt = returnType === "writeoff" ? null : new Date().toISOString();

  const metadataPayload: Record<string, unknown> = {
    return_reason: reason,
    return_type: returnType,
  };
  if (returnType === "writeoff") {
    metadataPayload.writeoff_reason = input.writeoff_reason?.trim() ?? "";
    metadataPayload.approver_id = input.approver_id ?? null;
    metadataPayload.approved_at = null; // 等主管批
  }
  if (returnType === "cancel_order") {
    metadataPayload.cancel_order_note = "工單中途取消，零件整批退回";
  }

  const { data: gr, error: grErr } = await supabase
    .from("stock_receipts")
    .insert({
      brand_id: scope.brand_id,
      gr_no,
      type: "ro_return",
      warehouse_id: issue.warehouse_id,
      receipt_date: input.receipt_date ?? today.toISOString().slice(0, 10),
      qty_received_total: totalQty,
      amount_total: Math.round(totalAmount * 100) / 100,
      source_doc_id: issue.id,
      source_doc_type: "stock_issue",
      status: receiptStatus,
      posted_at: postedAt,
      posted_by: user?.id ?? null,
      notes: input.notes?.trim() || `領料 ${issue.gi_no} 部分退入庫`,
      metadata: metadataPayload,
    })
    .select("id")
    .single();
  if (grErr || !gr) return { ok: false, error: `建立退入單失敗：${grErr?.message ?? ""}` };

  // 5. Insert stock_receipt_lines（source_line_type='gi_line'）
  const linesToInsert = linesIn.map((l, idx) => {
    const il = ilMap.get(l.line_id)!;
    const unitCost = Number(il.unit_cost ?? 0);
    return {
      gr_id: gr.id,
      line_no: idx + 1,
      item_id: il.item_id,
      qty_received: l.qty_returned,
      unit_cost: unitCost,
      uom: il.uom ?? "PCS",
      bin_id: il.bin_id,
      line_amount: Math.round(l.qty_returned * unitCost * 100) / 100,
      source_line_id: l.line_id,
      source_line_type: "gi_line",
    };
  });
  const { data: grLines, error: lnErr } = await supabase
    .from("stock_receipt_lines")
    .insert(linesToInsert)
    .select("id, item_id, qty_received, unit_cost, bin_id");
  if (lnErr || !grLines) {
    await supabase.from("stock_receipts").delete().eq("id", gr.id);
    return { ok: false, error: `建立明細失敗：${lnErr?.message ?? ""}` };
  }

  // 6. Insert stock_items（status='available' 回庫）
  // 損耗核銷（writeoff）不回庫、等主管授權後再由另一個 action 處理；
  // 完整退料 / 工單取消退料 直接回庫。
  if (returnType !== "writeoff") {
    const stockRows = grLines.map((gl, idx) => {
      const il = ilMap.get(linesIn[idx].line_id)!;
      return {
        brand_id: scope.brand_id,
        item_id: gl.item_id,
        warehouse_id: issue.warehouse_id,
        bin_id: gl.bin_id,
        qty: gl.qty_received,
        unit_cost: gl.unit_cost,
        status: "available",
        source_receipt_line_id: gl.id,
        serial_no: il.serial_no,
        batch_no: il.batch_no,
        notes: `領料 ${issue.gi_no} 退入庫（${gr_no}）`,
      };
    });
    const { error: siErr } = await supabase.from("stock_items").insert(stockRows);
    if (siErr) {
      // 入庫失敗、回滾 receipts + lines
      await supabase.from("stock_receipt_lines").delete().eq("gr_id", gr.id);
      await supabase.from("stock_receipts").delete().eq("id", gr.id);
      return { ok: false, error: `庫存還原失敗：${siErr.message}` };
    }
  }

  revalidatePath("/parts/receipt/return-in");
  revalidatePath("/parts/issue/repair-pick");
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id: gr.id, gr_no } };
}

// ─────────────────────────────────────────────────────────────
// Void — 沿用 receipts.voidReceipt 邏輯（守門：stock_items 必須 available）
// ─────────────────────────────────────────────────────────────

export async function voidReturnInReceipt(
  id: string,
  reason: string,
): Promise<Result<{ id: string }>> {
  await requirePermission(PERMISSIONS.RECEIPT_CREATE);
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "請填寫作廢原因" };

  const supabase = await createClient();
  const scope = await getActiveScope();

  const { data: gr, error: grErr } = await supabase
    .from("stock_receipts")
    .select("id, status, type")
    .eq("id", id)
    .eq("brand_id", scope.brand_id)
    .maybeSingle();
  if (grErr) return { ok: false, error: grErr.message };
  if (!gr) return { ok: false, error: "找不到退入單" };
  if (gr.type !== "ro_return") return { ok: false, error: "此單據非領料退入" };
  if (gr.status === "cancelled") return { ok: false, error: "此單已作廢" };
  if (gr.status !== "completed" && gr.status !== "posted") {
    return { ok: false, error: `狀態 ${gr.status} 不可作廢` };
  }

  // 撈 stock_items 守門
  const { data: lines } = await supabase
    .from("stock_receipt_lines")
    .select("id")
    .eq("gr_id", id);
  const lineIds = (lines ?? []).map((l) => l.id);
  if (lineIds.length === 0) return { ok: false, error: "此單無明細，不可作廢" };

  const { data: stockItems } = await supabase
    .from("stock_items")
    .select("id, status, source_receipt_line_id")
    .in("source_receipt_line_id", lineIds);
  const consumed = (stockItems ?? []).filter((s) => s.status !== "available");
  if (consumed.length > 0) {
    return {
      ok: false,
      error: `${consumed.length} 筆退入庫存已被消耗（已出貨/領料），不可作廢；請先處理後續單據`,
    };
  }

  if (stockItems && stockItems.length > 0) {
    const { error: delErr } = await supabase
      .from("stock_items")
      .delete()
      .in(
        "id",
        stockItems.map((s) => s.id),
      );
    if (delErr) return { ok: false, error: `庫存沖回失敗：${delErr.message}` };
  }

  const { data: { user } } = await supabase.auth.getUser();
  const { error: voidErr } = await supabase
    .from("stock_receipts")
    .update({
      status: "cancelled",
      voided_at: new Date().toISOString(),
      voided_by: user?.id ?? null,
      void_reason: trimmed,
    })
    .eq("id", id);
  if (voidErr) return { ok: false, error: `標記作廢失敗：${voidErr.message}` };

  revalidatePath("/parts/receipt/return-in");
  revalidatePath(`/parts/receipt/return-in/${id}`);
  revalidatePath("/parts/operations/balance");
  return { ok: true, data: { id } };
}
