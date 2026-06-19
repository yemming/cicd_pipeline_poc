"use server";

// ─────────────────────────────────────────────────────────────
// 驗收差異（Receiving Discrepancies）domain helper
//
// 採購入庫(PO-GRN)頁的「驗收差異三入口」資料層：
//   - recordShortage          數量短收（供應商績效資料源）
//   - recordDamageRejection   損壞拒收（含拍照 photo_urls）
//   - batchImportDeliveryNote 批次匯入送貨單比對（CSV/TSV parse 後陣列）
//   - listRecentDiscrepancies 列最近差異記錄（給 board 顯示）
//   - getDiscrepancyEntryData 三入口 modal 用的候選資料（料號 / 供應商）
//
// 天條：本檔內部可 import supabase（domain helper 的工作）；UI 一律走這裡。
// 全部以 getActiveScope().brand_id 為界（dev 主要 brand='indian'）。
// requirePermission 沿用入庫頁的 RECEIPT_CREATE（寫入）/ RECEIPT_VIEW（讀）。
// ─────────────────────────────────────────────────────────────

import { after } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";
import { createInappNotification } from "@/domain/user-notifications";

export type Result<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export type DiscrepancyKind = "short" | "damage" | "wrong_item";

export type ReceivingDiscrepancyInput = {
  item_id: string;
  qty_diff: number;
  reason?: string | null;
  po_id?: string | null;
  po_line_id?: string | null;
  supplier_id?: string | null;
  gr_id?: string | null;
  photo_urls?: string[];
  metadata?: Record<string, unknown>;
  // 「料號送錯」用：實際到貨料號（與 PO 訂購料號不同）
  actual_item_code?: string;
};

export type ReceivingDiscrepancyRow = {
  id: string;
  brand_id: string;
  gr_id: string | null;
  po_id: string | null;
  po_line_id: string | null;
  item_id: string | null;
  supplier_id: string | null;
  kind: DiscrepancyKind;
  qty_diff: number;
  reason: string | null;
  photo_urls: string[];
  status: "open" | "resolved" | "notified";
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
  // joined（顯示用）
  item_code: string | null;
  item_name: string | null;
  supplier_name: string | null;
};

export type ItemOption = { id: string; code: string; name: string };
export type SupplierOption = { id: string; name: string };

export type DiscrepancyEntryData = {
  items: ItemOption[];
  suppliers: SupplierOption[];
};

export type BatchImportRow = {
  code: string; // 料號 code
  qty: number; // 到貨數
};

export type BatchImportSummary = {
  comparedN: number; // 比對的列數（有對到開放中 PO line 的）
  diffN: number; // 有差異、已寫入 receiving_discrepancies 的列數
  unmatchedCodes: string[]; // 找不到對應開放 PO line 的料號
  details: Array<{
    code: string;
    item_name: string | null;
    ordered_open: number; // 該料號開放中 PO line 尚未收齊的數量
    arrived: number; // 送貨單到貨數
    qty_diff: number; // 短收 = 正數（ordered_open - arrived），負 = 多到（這裡只記短收）
  }>;
};

// 內部小工具：把 jsonb photo_urls 正規化成 string[]
function normPhotoUrls(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  return [];
}

// ─────────────────────────────────────────────────────────────
// 三入口 modal 候選資料：料號下拉 + 供應商下拉
// ─────────────────────────────────────────────────────────────
export async function getDiscrepancyEntryData(): Promise<DiscrepancyEntryData> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const [itemsRes, supRes] = await Promise.all([
    supabase
      .from("items")
      .select("id, code, name")
      .eq("brand_id", brand)
      .eq("is_active", true)
      .order("code")
      .limit(1000),
    supabase
      .from("suppliers")
      .select("id, name")
      .eq("brand_id", brand)
      .order("name")
      .limit(500),
  ]);
  if (itemsRes.error) throw new Error(`getDiscrepancyEntryData/items: ${itemsRes.error.message}`);
  if (supRes.error) throw new Error(`getDiscrepancyEntryData/suppliers: ${supRes.error.message}`);

  const items = ((itemsRes.data ?? []) as Array<{ id: string; code: string | null; name: string | null }>).map(
    (i) => ({ id: i.id, code: i.code ?? "", name: i.name ?? "" }),
  );
  const suppliers = ((supRes.data ?? []) as Array<{ id: string; name: string | null }>).map((s) => ({
    id: s.id,
    name: s.name ?? "",
  }));
  return { items, suppliers };
}

// ─────────────────────────────────────────────────────────────
// 共用 insert（recordShortage / recordDamageRejection 都用）
// ─────────────────────────────────────────────────────────────
async function insertDiscrepancy(
  kind: DiscrepancyKind,
  input: ReceivingDiscrepancyInput,
): Promise<Result<{ id: string }>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有登錄驗收差異的權限" };
  }
  if (!input.item_id) return { ok: false, error: "請選擇料號" };
  const qty = Number(input.qty_diff);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, error: "差異數量須為大於 0 的數字" };
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  const { data, error } = await supabase
    .from("receiving_discrepancies")
    .insert({
      brand_id: brand,
      kind,
      item_id: input.item_id,
      qty_diff: qty,
      reason: input.reason?.trim() || null,
      po_id: input.po_id || null,
      po_line_id: input.po_line_id || null,
      supplier_id: input.supplier_id || null,
      gr_id: input.gr_id || null,
      photo_urls: input.photo_urls ?? [],
      status: "open",
      metadata: input.metadata ?? {},
    })
    .select("id")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { id: (data as { id: string }).id } };
}

// ─────────────────────────────────────────────────────────────
// 數量短收 → kind='short'（供應商績效資料源）
// ─────────────────────────────────────────────────────────────
export async function recordShortage(
  input: ReceivingDiscrepancyInput,
): Promise<Result<{ id: string }>> {
  return insertDiscrepancy("short", input);
}

// ─────────────────────────────────────────────────────────────
// 損壞拒收 → kind='damage'（含 photo_urls）
// after() 發站內通知給操作者（採購/倉管），非阻塞
// ─────────────────────────────────────────────────────────────
export async function recordDamageRejection(
  input: ReceivingDiscrepancyInput,
): Promise<Result<{ id: string }>> {
  const supabase = await createClient();
  const res = await insertDiscrepancy("damage", input);
  if (!res.ok) return res;

  // 取得操作者 uid，發站內通知（非阻塞）
  const { data: { user: actor } } = await supabase.auth.getUser();
  const actorId = actor?.id ?? null;
  const brand = (await getActiveScope()).brand_id;

  if (actorId) {
    after(async () => {
      try {
        // 查料號顯示名稱（給通知 body 用）
        const { data: itemRow } = await supabase
          .from("items")
          .select("code, name")
          .eq("id", input.item_id)
          .maybeSingle();
        const itemLabel = itemRow
          ? `${itemRow.code ?? ""} ${itemRow.name ?? ""}`.trim()
          : input.item_id;
        await createInappNotification({
          recipient_user_id: actorId,
          event_code: "receiving.damage_rejected",
          title: "損壞拒收登錄成功",
          body: `料號 ${itemLabel} 損壞拒收 ${input.qty_diff} 件已記錄，請通知供應商安排補貨或退款。`,
          priority: "orange",
          href: "/parts/receipt/po-grn",
          brand_id: brand,
        });
      } catch (e) {
        console.error("[receiving.damage_rejected] 站內通知失敗（不影響主流程）", e);
      }
    });
  }

  return res;
}

// ─────────────────────────────────────────────────────────────
// 料號送錯 → kind='wrong_item'
// 記錄實際到貨料號與 PO 訂購料號的差異（不阻斷正常收貨，備註性質）
// ─────────────────────────────────────────────────────────────
export async function recordWrongItemRejection(
  input: ReceivingDiscrepancyInput,
): Promise<Result<{ id: string }>> {
  if (!input.actual_item_code?.trim()) {
    return { ok: false, error: "請填寫實際到貨料號" };
  }
  // 查 PO 訂購料號（給 metadata 記錄對比）
  const supabase = await createClient();
  const { data: orderedItem } = await supabase
    .from("items")
    .select("code, name")
    .eq("id", input.item_id)
    .maybeSingle();
  const orderedCode = orderedItem?.code ?? input.item_id;

  const mergedInput: ReceivingDiscrepancyInput = {
    ...input,
    reason: input.reason?.trim() || `訂購料號 ${orderedCode}，實到料號 ${input.actual_item_code.trim()}`,
    metadata: {
      ...(input.metadata ?? {}),
      ordered_item_code: orderedCode,
      actual_item_code: input.actual_item_code.trim(),
    },
  };

  return insertDiscrepancy("wrong_item", mergedInput);
}

// ─────────────────────────────────────────────────────────────
// 批次匯入送貨單比對
//   rows：CSV/TSV parse 後的 [{ code, qty }]
//   邏輯：以 code 找該 brand 的 item → 找該 item 開放中(approved/partial_received)
//        PO line 的「尚未收齊數量(qty_ordered - qty_received)」彙總為 ordered_open
//        到貨數 < ordered_open → 短收，寫入 kind='short'
//   回傳比對摘要（comparedN / diffN / unmatched / details）
// ─────────────────────────────────────────────────────────────
export async function batchImportDeliveryNote(
  rows: BatchImportRow[],
): Promise<Result<BatchImportSummary>> {
  if (!(await hasPermission(PERMISSIONS.RECEIPT_CREATE))) {
    return { ok: false, error: "沒有登錄驗收差異的權限" };
  }
  const clean = (rows ?? [])
    .map((r) => ({ code: (r.code ?? "").trim(), qty: Number(r.qty) }))
    .filter((r) => r.code && Number.isFinite(r.qty));
  if (clean.length === 0) {
    return { ok: false, error: "沒有可比對的資料列（需要：料號 + 到貨數）" };
  }

  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  // 1) code → item
  const codes = Array.from(new Set(clean.map((r) => r.code)));
  const { data: itemRows, error: itemErr } = await supabase
    .from("items")
    .select("id, code, name")
    .eq("brand_id", brand)
    .in("code", codes);
  if (itemErr) return { ok: false, error: `items: ${itemErr.message}` };
  const itemByCode = new Map(
    ((itemRows ?? []) as Array<{ id: string; code: string | null; name: string | null }>).map((i) => [
      i.code ?? "",
      { id: i.id, name: i.name ?? null },
    ]),
  );

  const matchedItemIds = Array.from(itemByCode.values()).map((i) => i.id);

  // 2) 撈這些 item 在開放中 PO 的 lines（尚未收齊）
  type OpenLine = {
    id: string;
    po_id: string;
    item_id: string;
    qty_ordered: number;
    qty_received: number;
  };
  let openLines: OpenLine[] = [];
  if (matchedItemIds.length > 0) {
    const { data: lineRows, error: lineErr } = await supabase
      .from("purchase_order_lines")
      .select(
        "id, po_id, item_id, qty_ordered, qty_received, purchase_orders!inner ( status, vendor_id )",
      )
      .eq("brand_id", brand)
      .in("item_id", matchedItemIds)
      .in("purchase_orders.status", ["approved", "partial"]);
    if (lineErr) return { ok: false, error: `po lines: ${lineErr.message}` };
    openLines = ((lineRows ?? []) as unknown as Array<{
      id: string;
      po_id: string;
      item_id: string;
      qty_ordered: number;
      qty_received: number;
    }>).map((l) => ({
      id: l.id,
      po_id: l.po_id,
      item_id: l.item_id,
      qty_ordered: Number(l.qty_ordered ?? 0),
      qty_received: Number(l.qty_received ?? 0),
    }));
  }

  // 以 item_id 彙總 open 數量 + 記一個代表 po_id / po_line_id 供寫入歸因
  const openByItem = new Map<
    string,
    { ordered_open: number; po_id: string | null; po_line_id: string | null }
  >();
  for (const l of openLines) {
    const remaining = Math.max(0, l.qty_ordered - l.qty_received);
    const prev = openByItem.get(l.item_id);
    if (prev) {
      prev.ordered_open += remaining;
    } else {
      openByItem.set(l.item_id, {
        ordered_open: remaining,
        po_id: l.po_id,
        po_line_id: l.id,
      });
    }
  }

  // 3) 逐列比對
  const details: BatchImportSummary["details"] = [];
  const unmatchedCodes: string[] = [];
  const toInsert: Array<Record<string, unknown>> = [];
  let comparedN = 0;

  // 同 code 多列 → 合併到貨數
  const arrivedByCode = new Map<string, number>();
  for (const r of clean) {
    arrivedByCode.set(r.code, (arrivedByCode.get(r.code) ?? 0) + r.qty);
  }

  for (const [code, arrived] of arrivedByCode.entries()) {
    const item = itemByCode.get(code);
    if (!item) {
      unmatchedCodes.push(code);
      continue;
    }
    const open = openByItem.get(item.id);
    if (!open || open.ordered_open <= 0) {
      // 有此料號但無開放 PO line → 無從比對
      unmatchedCodes.push(code);
      continue;
    }
    comparedN += 1;
    const qtyDiff = open.ordered_open - arrived; // >0 = 短收
    const row = {
      code,
      item_name: item.name,
      ordered_open: open.ordered_open,
      arrived,
      qty_diff: qtyDiff,
    };
    details.push(row);
    if (qtyDiff > 0) {
      toInsert.push({
        brand_id: brand,
        kind: "short",
        item_id: item.id,
        qty_diff: qtyDiff,
        reason: `批次匯入送貨單比對：開放應收 ${open.ordered_open}、到貨 ${arrived}`,
        po_id: open.po_id,
        po_line_id: open.po_line_id,
        status: "open",
        photo_urls: [],
        metadata: { source: "batch_delivery_note", arrived, ordered_open: open.ordered_open },
      });
    }
  }

  // 4) 寫入差異列
  if (toInsert.length > 0) {
    const { error: insErr } = await supabase
      .from("receiving_discrepancies")
      .insert(toInsert);
    if (insErr) return { ok: false, error: `寫入差異失敗：${insErr.message}` };
  }

  return {
    ok: true,
    data: {
      comparedN,
      diffN: toInsert.length,
      unmatchedCodes,
      details,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// 列最近差異記錄（給 board 顯示）
// ─────────────────────────────────────────────────────────────
export type ListDiscrepanciesFilter = {
  kind?: DiscrepancyKind;
  status?: string;
  limit?: number;
};

export async function listRecentDiscrepancies(
  filter: ListDiscrepanciesFilter = {},
): Promise<ReceivingDiscrepancyRow[]> {
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;

  let q = supabase
    .from("receiving_discrepancies")
    .select("*")
    .eq("brand_id", brand)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Math.min(filter.limit ?? 20, 200)));
  if (filter.kind) q = q.eq("kind", filter.kind);
  if (filter.status) q = q.eq("status", filter.status);

  const { data, error } = await q;
  if (error) throw new Error(`listRecentDiscrepancies: ${error.message}`);

  const raw = (data ?? []) as Array<Record<string, unknown>>;
  if (raw.length === 0) return [];

  // joined：item code/name + supplier name
  const itemIds = Array.from(
    new Set(raw.map((r) => r.item_id).filter((x): x is string => typeof x === "string")),
  );
  const supIds = Array.from(
    new Set(raw.map((r) => r.supplier_id).filter((x): x is string => typeof x === "string")),
  );

  const [itemsRes, supRes] = await Promise.all([
    itemIds.length > 0
      ? supabase.from("items").select("id, code, name").in("id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    supIds.length > 0
      ? supabase.from("suppliers").select("id, name").in("id", supIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const itemMap = new Map(
    ((itemsRes.data ?? []) as Array<{ id: string; code: string | null; name: string | null }>).map((i) => [
      i.id,
      { code: i.code ?? null, name: i.name ?? null },
    ]),
  );
  const supMap = new Map(
    ((supRes.data ?? []) as Array<{ id: string; name: string | null }>).map((s) => [s.id, s.name ?? null]),
  );

  return raw.map((r) => {
    const itemId = (r.item_id as string | null) ?? null;
    const supId = (r.supplier_id as string | null) ?? null;
    const ji = itemId ? itemMap.get(itemId) : undefined;
    return {
      id: r.id as string,
      brand_id: r.brand_id as string,
      gr_id: (r.gr_id as string | null) ?? null,
      po_id: (r.po_id as string | null) ?? null,
      po_line_id: (r.po_line_id as string | null) ?? null,
      item_id: itemId,
      supplier_id: supId,
      kind: r.kind as DiscrepancyKind,
      qty_diff: Number(r.qty_diff ?? 0),
      reason: (r.reason as string | null) ?? null,
      photo_urls: normPhotoUrls(r.photo_urls),
      status: (r.status as ReceivingDiscrepancyRow["status"]) ?? "open",
      metadata: (r.metadata as Record<string, unknown> | null) ?? null,
      created_at: (r.created_at as string | null) ?? null,
      updated_at: (r.updated_at as string | null) ?? null,
      item_code: ji?.code ?? null,
      item_name: ji?.name ?? null,
      supplier_name: supId ? supMap.get(supId) ?? null : null,
    };
  });
}
