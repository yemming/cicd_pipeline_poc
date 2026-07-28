/**
 * 維修工單 admin 後台 helper — server-only。
 *
 * 涵蓋 /admin/master-data/work-orders/[id] 編輯頁需要的 fetch：
 *   - 工單行（work_order_items）
 *   - active 倉庫（發料對話框用）
 *   - 該工單已發料 issue 列表（避免重複發料）
 *
 * 注意：
 *   - getWorkOrderById 仍在 lib/master-data/queries.ts，B5 收尾再整併
 *   - listActiveWarehouses 暫放這裡（自包），B5 dedupe 時再決定要不要搬到 warehouse.ts
 *   - server actions 在 lib/master-data/workorder-actions.ts，不動
 */

import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { loanOutstandingTier, type LoanOutstandingTier } from "@/domain/repair-orders.constants";
import type { Warehouse, WorkOrderItem } from "@/lib/parts/types";

export type WorkOrderIssueSummary = {
  id: string;
  gi_no: string;
  status: string;
  qty_issued_total: number;
  amount_total: number;
  warehouse_id: string;
  issue_date: string;
};

export async function listActiveWarehouses(): Promise<Warehouse[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("warehouses")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("is_active", true)
    .order("code");
  if (error) throw new Error(`listActiveWarehouses: ${error.message}`);
  return data ?? [];
}

export async function listWorkOrderItems(workOrderId: string): Promise<WorkOrderItem[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_order_items")
    .select("*")
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("work_order_id", workOrderId)
    .order("line_no");
  if (error) throw new Error(`listWorkOrderItems: ${error.message}`);
  return data ?? [];
}

export type WorkOrderWithRO = {
  id: string;
  ro_no: string | null;
  repair_order_id: string | null;
  repair_order: { id: string; ro_code: string } | null;
};

export async function getWorkOrderWithRepairOrder(
  workOrderId: string,
): Promise<WorkOrderWithRO | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("work_orders")
    .select("id, ro_no, repair_order_id, repair_orders(id, ro_code)")
    .eq("id", workOrderId)
    .eq("brand_id", (await getActiveScope()).brand_id)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as unknown as {
    id: string;
    ro_no: string | null;
    repair_order_id: string | null;
    repair_orders: { id: string; ro_code: string } | null;
  };
  return {
    id: row.id,
    ro_no: row.ro_no,
    repair_order_id: row.repair_order_id,
    repair_order: row.repair_orders ?? null,
  };
}

// ⚠️ 參數是 work_orders.id（不是 repair_orders.id）。stock_issues.ro_id 的
//    FK 指向 work_orders，故此處用 work_orders.id 比對正確。命名刻意用
//    workOrderId 避免與 inventory_reservations.ro_id（= repair_orders.id）混淆。
export async function listIssuesForWorkOrder(
  workOrderId: string,
): Promise<WorkOrderIssueSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_issues")
    .select(
      "id, gi_no, status, qty_issued_total, amount_total, warehouse_id, issue_date",
    )
    .eq("brand_id", (await getActiveScope()).brand_id)
    .eq("ro_id", workOrderId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(`listIssuesForWorkOrder: ${error.message}`);
  return (data ?? []) as WorkOrderIssueSummary[];
}

// ─────────────────────────────────────────────────────────────
// repair_orders → work_orders 橋接（原為 Russell 6/17 補充要求項目一的 TL
// 專用橋接，M3 串接三驗收發現一般 SA 開單流程新建的 RP 等工單同樣不會產生
// work_orders，已將守門條件從「僅 TL」放寬為所有 prefix_p1，理由相同）
//
// 為什麼：任何 repair_order 的零件明細都必須走正式 /parts/issue/repair-pick
//   倉管發料流程（倉管是零件庫房絕對管理人、任何進出都要經其簽核），不能
//   繞過去自行出料。repair-pick 的清單與預覽都以 work_orders +
//   work_order_items(kind='parts') 驅動；但 repair_orders 建單當下只有透過
//   「共用 appointment_id」才可能已存在對應 work_order（見
//   repair-order-actions.ts 3b），沒有 appointment_id 的（例如臨櫃新開單）
//   或 appointment 尚未產生 work_order 的，永遠不會出現在倉管的領料清單。
//
// 本 helper 把 repair_order「橋接」成一筆 work_orders（repair_order_id
//   回填）+ 依當前 part lines 同步 work_order_items，該工單便自動進倉管的
//   待領料清單，倉管對它正式發料（persistPick 扣庫、記 stock_issues、認 COGS）。
//   沒有零件明細的工單（例如純工資的定保）會建出 0 筆 parts 的空殼，
//   listPendingPartsWorkorders 對 parts 行數為 0 的工單本就不列出，故無害。
//
// 冪等：依 repair_order_id 找既有橋接工單，沒有才建；work_order_items 全量
//   重建（只動本橋接工單的 kind='parts' 行），所以 SA 加 / 改 / 刪零件明細
//   後重呼叫即同步最新。
// ─────────────────────────────────────────────────────────────

export type RoBridgeResult =
  | { ok: true; work_order_id: string; parts_line_count: number }
  | { ok: false; error: string };

export async function syncRoWorkOrderBridge(roId: string): Promise<RoBridgeResult> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1) 驗 RO 存在 + 同 brand
  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("id, ro_code, prefix_p1, customer_id, vehicle_id, created_by")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (roErr || !ro) return { ok: false, error: "找不到工單或無權存取" };
  if (!ro.vehicle_id) {
    return { ok: false, error: "工單需先綁定車輛才能送倉管領料" };
  }

  // 2) 當前借料明細（kind='part' 且綁 item_id、qty > 0）
  const { data: lines, error: linesErr } = await supabase
    .from("repair_order_lines")
    .select("line_no, item_id, part_name, qty, unit_price")
    .eq("repair_order_id", roId)
    .eq("brand_id", brand)
    .eq("kind", "part")
    .not("item_id", "is", null)
    .order("line_no");
  if (linesErr) return { ok: false, error: `讀取借料明細失敗：${linesErr.message}` };
  const partLines = (lines ?? []).filter((l) => Number(l.qty ?? 0) > 0);

  // 3) upsert work_orders（以 repair_order_id 為橋接鍵）
  const { data: existingWo } = await supabase
    .from("work_orders")
    .select("id")
    .eq("brand_id", brand)
    .eq("repair_order_id", roId)
    .maybeSingle();

  let workOrderId = (existingWo as { id: string } | null)?.id;
  if (!workOrderId) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: ins, error: insErr } = await supabase
      .from("work_orders")
      .insert({
        brand_id: brand,
        ro_no: ro.ro_code as string,
        customer_id: (ro.customer_id as string | null) ?? null, // TL 內部借用無客戶
        vehicle_id: ro.vehicle_id as string,
        status: "dispatched", // 已派工：待倉管領料
        repair_order_id: roId,
        external_source: "ro_bridge",
        created_by: user?.id ?? (ro.created_by as string | null) ?? null,
        metadata: {
          is_tl: ro.prefix_p1 === "TL",
          source: "ro_bridge",
          ro_code: ro.ro_code,
        },
      })
      .select("id")
      .single();
    if (insErr || !ins) {
      return { ok: false, error: `建立橋接工單失敗：${insErr?.message ?? "unknown"}` };
    }
    workOrderId = ins.id as string;
  }

  // 4) 全量重建 work_order_items(kind='parts')（只動本橋接工單的 parts 行）
  const { error: delErr } = await supabase
    .from("work_order_items")
    .delete()
    .eq("brand_id", brand)
    .eq("work_order_id", workOrderId)
    .eq("kind", "parts");
  if (delErr) return { ok: false, error: `同步借料明細失敗：${delErr.message}` };

  if (partLines.length > 0) {
    const { error: itemsErr } = await supabase.from("work_order_items").insert(
      partLines.map((l, i) => {
        const qty = Number(l.qty ?? 0);
        const price = Number(l.unit_price ?? 0);
        return {
          brand_id: brand,
          work_order_id: workOrderId,
          line_no: i + 1,
          kind: "parts",
          item_id: l.item_id as string,
          description: (l.part_name as string | null) ?? "借出零件",
          qty,
          unit_price: price,
          amount: Math.round(qty * price * 100) / 100,
        };
      }),
    );
    if (itemsErr) return { ok: false, error: `寫入借料明細失敗：${itemsErr.message}` };
  }

  return {
    ok: true,
    work_order_id: workOrderId,
    parts_line_count: partLines.length,
  };
}

// ─────────────────────────────────────────────────────────────
// 借料未還狀態（Russell 6/17 要求二 + 裁示三：逐件感知，畫面不得含糊）
//
// 「未還」逐件量化，避免兩個邊界情境誤導倉管（B-01：顯示不能把警示蓋掉）：
//   未還量(item) = 已出庫量 − 已確認回庫量(confirmed) − 已處置量(charge/absorb/transfer)
//   - 已出庫：橋接 work_order 的 completed ro_picking stock_issue_lines 之 qty_issued。
//   - 已確認回庫：parts_return_requests(source_ro_id=TL, status='confirmed') 之 qty_confirmed。
//   - 已處置：tl-close 對該 part line 選 charge_customer / absorb_internally / transfer_to_ro
//     （這些零件「不會回到本次借料」，已被會計/轉單消化，不算未還）。
//   - pending/overdue 退料「不」扣（B-01：倉管實體點收前，零件還在外面）。
//
// 邊界一（分批出庫）：現行為「原子出庫」（一張 work_order 只能領一次），同張 TL 的
//   零件共用同一出庫日，天數不會把不同出庫日混算。但仍逐件記各自 posted_at + 天數，
//   tier 取「最久未還件」決定（最保守、對的人看到最該擔心的那一筆）。
// 邊界二（部分歸還）：借多還少時，已 confirmed 的件 outstanding 歸零、退出未還清單；
//   只要還有任一件 outstanding>0，chip 持續顯示「借料未還」、天數不因有退料動作而降，
//   絕不會誤顯示「沒事」。
//
// 天數從各件「出庫日（該件最早 stock_issues.posted_at）」起算。
// ─────────────────────────────────────────────────────────────

export type TlLoanPart = {
  item_id: string;
  item_name: string;
  outstanding_qty: number; // 仍在外面（未還）的數量
  issued_at: string; // 該件出庫時間（ISO）
  days: number; // 該件已借天數
  tier: LoanOutstandingTier;
};

export type TlLoanStatus = {
  outstanding: boolean; // 是否「借料未還」（有任一件未還）
  issued: boolean; // 是否已出庫
  unreturned_item_count: number; // 未還的品項數
  unreturned_qty_total: number; // 未還的總件數
  max_days: number; // 最久未還件的天數
  worst_tier: LoanOutstandingTier; // 由最久未還件決定（chip 顏色）
  in_transit_count: number; // 申請退料中、待倉管點收（pending/overdue）筆數
  parts: TlLoanPart[]; // 未還明細（逐件，給畫面攤開不含糊）
};

const NONE_LOAN: TlLoanStatus = {
  outstanding: false,
  issued: false,
  unreturned_item_count: 0,
  unreturned_qty_total: 0,
  max_days: 0,
  worst_tier: "info",
  in_transit_count: 0,
  parts: [],
};

// ─────────────────────────────────────────────────────────────
// 借料未還核心計算（pure）— 細節頁與列表頁共用「唯一一份」邏輯。
// 逐件 outstanding = 已出庫(issued) − 已確認回庫(confirmed) − 已處置(resolved)；
// pending/overdue 退料在途「不扣」（B-01：人還沒看見實物回庫前不能當已還）。
// 天數從各件最早出庫日起算，tier 取「最久未還件」決定。
// ─────────────────────────────────────────────────────────────
function computeTlLoanStatus(input: {
  issueRows: { id: string; posted_at: string }[];
  giLines: { gi_id: string; item_id: string; qty_issued: number | null }[];
  returns: { item_id: string | null; qty_confirmed: number | null; status: string }[];
  roLines: { item_id: string; qty: number | null; metadata: unknown }[];
  nameMap: Map<string, string>;
  now: number;
}): TlLoanStatus {
  const { issueRows, giLines, returns, roLines, nameMap, now } = input;
  if (issueRows.length === 0) return NONE_LOAN; // 還沒出庫 → 沒有「借料未還」
  const postedByGi = new Map(issueRows.map((r) => [r.id, r.posted_at]));

  // 出庫明細逐件：累計 issued qty + 取該件最早出庫日
  const issuedByItem = new Map<string, { qty: number; earliest: string }>();
  for (const l of giLines) {
    if (!l.item_id) continue;
    const posted = postedByGi.get(l.gi_id);
    if (posted === undefined) continue; // 該 gi 不屬於本工單已完成出庫
    const cur = issuedByItem.get(l.item_id);
    if (cur) {
      cur.qty += Number(l.qty_issued ?? 0);
      if (posted < cur.earliest) cur.earliest = posted;
    } else {
      issuedByItem.set(l.item_id, { qty: Number(l.qty_issued ?? 0), earliest: posted });
    }
  }
  if (issuedByItem.size === 0) return NONE_LOAN;

  // 已確認回庫量（confirmed）逐件；以及 pending/overdue 在途筆數
  const confirmedByItem = new Map<string, number>();
  let inTransit = 0;
  for (const r of returns) {
    if (r.status === "confirmed") {
      const k = r.item_id ?? "";
      confirmedByItem.set(k, (confirmedByItem.get(k) ?? 0) + Number(r.qty_confirmed ?? 0));
    } else if (r.status === "pending" || r.status === "overdue") {
      inTransit += 1;
    }
  }

  // tl-close 已處置量（charge_customer / absorb_internally / transfer_to_ro）逐件
  const resolvedByItem = new Map<string, number>();
  const RESOLVED = new Set(["charge_customer", "absorb_internally", "transfer_to_ro"]);
  for (const l of roLines) {
    if (!l.item_id) continue;
    const meta = (l.metadata ?? {}) as { tl_disposition?: { decision?: string } };
    const decision = meta.tl_disposition?.decision;
    if (decision && RESOLVED.has(decision)) {
      resolvedByItem.set(l.item_id, (resolvedByItem.get(l.item_id) ?? 0) + Number(l.qty ?? 0));
    }
  }

  // 逐件算 outstanding = issued − confirmed − resolved（pending 不扣）
  const parts: TlLoanPart[] = [];
  for (const [itemId, info] of issuedByItem) {
    const outstandingQty =
      info.qty - (confirmedByItem.get(itemId) ?? 0) - (resolvedByItem.get(itemId) ?? 0);
    if (outstandingQty <= 0) continue; // 已全數回庫/處置 → 不算未還
    const days = Math.max(0, Math.floor((now - new Date(info.earliest).getTime()) / 86400000));
    parts.push({
      item_id: itemId,
      item_name: nameMap.get(itemId) ?? "（借出零件）",
      outstanding_qty: Math.round(outstandingQty * 100) / 100,
      issued_at: info.earliest,
      days,
      tier: loanOutstandingTier(days),
    });
  }

  if (parts.length === 0) {
    // 全數已還/已處置；但若仍有 pending 在途，視為未還（B-01）
    return { ...NONE_LOAN, issued: true, in_transit_count: inTransit, outstanding: inTransit > 0 };
  }

  parts.sort((a, b) => b.days - a.days); // 最久的排前
  const maxDays = parts[0].days;
  return {
    outstanding: true,
    issued: true,
    unreturned_item_count: parts.length,
    unreturned_qty_total: Math.round(parts.reduce((s, p) => s + p.outstanding_qty, 0) * 100) / 100,
    max_days: maxDays,
    worst_tier: loanOutstandingTier(maxDays),
    in_transit_count: inTransit,
    parts,
  };
}

/**
 * 借料未還狀態 — 批次版（列表層級用，避免 N+1）。
 * 給一批 repair_orders.id，回 Map<roId, TlLoanStatus>；非 TL / 未出庫的 ro 不放進 map。
 * 與單筆 getTlOutstandingLoanStatus 共用同一份 computeTlLoanStatus，邏輯保證一致。
 * 固定 4 個 round-trip，與工單數無關。
 */
export async function getTlOutstandingLoanStatusBatch(
  roIds: string[],
): Promise<Map<string, TlLoanStatus>> {
  const result = new Map<string, TlLoanStatus>();
  const uniqueRoIds = Array.from(new Set(roIds.filter(Boolean)));
  if (uniqueRoIds.length === 0) return result;

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1) 篩出 TL 工單 + 對應橋接 work_order
  const [roRes, woRes] = await Promise.all([
    supabase.from("repair_orders").select("id, prefix_p1").eq("brand_id", brand).in("id", uniqueRoIds),
    supabase
      .from("work_orders")
      .select("id, repair_order_id")
      .eq("brand_id", brand)
      .in("repair_order_id", uniqueRoIds),
  ]);
  const tlRoIds = new Set(
    ((roRes.data ?? []) as { id: string; prefix_p1: string }[])
      .filter((r) => r.prefix_p1 === "TL")
      .map((r) => r.id),
  );
  if (tlRoIds.size === 0) return result;

  const roByWo = new Map<string, string>(); // woId -> roId
  for (const w of (woRes.data ?? []) as { id: string; repair_order_id: string }[]) {
    if (tlRoIds.has(w.repair_order_id)) roByWo.set(w.id, w.repair_order_id);
  }
  const woIds = Array.from(roByWo.keys());
  const activeRoIds = Array.from(new Set(roByWo.values()));
  if (woIds.length === 0) return result;

  // 2) 已完成出庫 + 退料 + RO part lines（皆只需 roIds / woIds）
  const [issuesRes, returnsRes, roLinesRes] = await Promise.all([
    supabase
      .from("stock_issues")
      .select("id, ro_id, posted_at")
      .eq("brand_id", brand)
      .in("ro_id", woIds)
      .eq("type", "ro_picking")
      .eq("status", "completed"),
    supabase
      .from("parts_return_requests")
      .select("item_id, qty_confirmed, status, source_ro_id")
      .eq("brand_id", brand)
      .in("source_ro_id", activeRoIds),
    supabase
      .from("repair_order_lines")
      .select("item_id, qty, metadata, repair_order_id")
      .eq("brand_id", brand)
      .eq("kind", "part")
      .in("repair_order_id", activeRoIds)
      .not("item_id", "is", null),
  ]);

  // 已完成出庫依 roId 分組（並建 gi → roId）
  const issuesByRo = new Map<string, { id: string; posted_at: string }[]>();
  const giToRo = new Map<string, string>();
  for (const i of (issuesRes.data ?? []) as { id: string; ro_id: string; posted_at: string | null }[]) {
    if (!i.posted_at) continue;
    const roId = roByWo.get(i.ro_id);
    if (!roId) continue;
    giToRo.set(i.id, roId);
    const arr = issuesByRo.get(roId) ?? [];
    arr.push({ id: i.id, posted_at: i.posted_at });
    issuesByRo.set(roId, arr);
  }
  const allGiIds = Array.from(giToRo.keys());

  // 3) 出庫明細依 roId 分組
  const giLinesByRo = new Map<
    string,
    { gi_id: string; item_id: string; qty_issued: number | null }[]
  >();
  const allItemIds = new Set<string>();
  if (allGiIds.length > 0) {
    const { data: giLines } = await supabase
      .from("stock_issue_lines")
      .select("gi_id, item_id, qty_issued")
      .eq("brand_id", brand)
      .in("gi_id", allGiIds)
      .not("item_id", "is", null);
    for (const l of (giLines ?? []) as {
      gi_id: string;
      item_id: string;
      qty_issued: number | null;
    }[]) {
      const roId = giToRo.get(l.gi_id);
      if (!roId || !l.item_id) continue;
      const arr = giLinesByRo.get(roId) ?? [];
      arr.push({ gi_id: l.gi_id, item_id: l.item_id, qty_issued: l.qty_issued });
      giLinesByRo.set(roId, arr);
      allItemIds.add(l.item_id);
    }
  }

  // 4) 品名
  const nameMap = new Map<string, string>();
  if (allItemIds.size > 0) {
    const { data: items } = await supabase
      .from("items")
      .select("id, name")
      .in("id", Array.from(allItemIds));
    for (const it of (items ?? []) as { id: string; name: string }[]) nameMap.set(it.id, it.name);
  }

  // 退料 / RO part lines 依 roId 分組
  const returnsByRo = new Map<
    string,
    { item_id: string | null; qty_confirmed: number | null; status: string }[]
  >();
  for (const r of (returnsRes.data ?? []) as {
    item_id: string | null;
    qty_confirmed: number | null;
    status: string;
    source_ro_id: string;
  }[]) {
    const arr = returnsByRo.get(r.source_ro_id) ?? [];
    arr.push({ item_id: r.item_id, qty_confirmed: r.qty_confirmed, status: r.status });
    returnsByRo.set(r.source_ro_id, arr);
  }
  const roLinesByRo = new Map<string, { item_id: string; qty: number | null; metadata: unknown }[]>();
  for (const l of (roLinesRes.data ?? []) as {
    item_id: string;
    qty: number | null;
    metadata: unknown;
    repair_order_id: string;
  }[]) {
    const arr = roLinesByRo.get(l.repair_order_id) ?? [];
    arr.push({ item_id: l.item_id, qty: l.qty, metadata: l.metadata });
    roLinesByRo.set(l.repair_order_id, arr);
  }

  const now = Date.now();
  for (const roId of activeRoIds) {
    const issueRows = issuesByRo.get(roId) ?? [];
    if (issueRows.length === 0) continue; // 未出庫 → 視為無借料未還，不放進 map
    result.set(
      roId,
      computeTlLoanStatus({
        issueRows,
        giLines: giLinesByRo.get(roId) ?? [],
        returns: returnsByRo.get(roId) ?? [],
        roLines: roLinesByRo.get(roId) ?? [],
        nameMap,
        now,
      }),
    );
  }
  return result;
}

/** 借料未還狀態 — 單筆（細節頁用）。委派批次版，保證與列表層級邏輯完全一致。 */
export async function getTlOutstandingLoanStatus(roId: string): Promise<TlLoanStatus> {
  if (!roId) return NONE_LOAN;
  const m = await getTlOutstandingLoanStatusBatch([roId]);
  return m.get(roId) ?? NONE_LOAN;
}
