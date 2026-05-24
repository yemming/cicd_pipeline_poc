"use server";

/**
 * Domain Helper — RO 待料（waiting parts）：跨模組 hook #4 / #5 的共用落點
 *
 * 第十一輪 C1-C3b 落地。proposal：docs/proposals/feature-cross-module-hooks-phase1.md（#4 / #5 段）
 *
 * Ming 拍板（鎖定）：
 *   - 路線 A：B3 inventory_reservations 維持獨立 ledger，本檔只「呼叫」B3 helper，不自己操作預留。
 *   - 待料狀態 = repair_orders.metadata.waiting_parts flag（不加 RO status enum）。
 *   - 規則先寫死、不進 business_rules。
 *   - #5 解除接既有 work-order loop（src/domain/alerts.ts 的 parts_workorder_loop_entries），不直推 LINE。
 *
 * 兩個 hook 是一對（標待料 / 解待料），共用同一套 waiting_parts jsonb 結構與 work-order loop 操作，
 * 故集中於本檔（避免 #4 / #5 分散在 repair-orders.ts / inventory-reservations.ts 兩處導致結構漂移）。
 *
 * waiting_parts jsonb 結構（存在 repair_orders.metadata.waiting_parts）：
 *   {
 *     flag: true,                          // 待料旗標（看板可篩）
 *     since: "<ISO>",                      // 首次標待料時間
 *     updated_at: "<ISO>",
 *     items: {                             // 以 item_id 為 key → 同 RO 同 item 冪等（更新非疊加）
 *       "<item_id>": {
 *         item_id, warehouse_id,
 *         item_name,
 *         needed,                          // 本次需求量
 *         reserved,                        // B3 已預留量
 *         shortage,                        // 缺口 = needed - reserved（> 0 才是待料）
 *         loop_entry_id,                   // 對應 parts_workorder_loop_entries.id（缺料告警）
 *         updated_at
 *       }
 *     }
 *   }
 *
 * 天條：UI 永遠走本 helper、禁止直連 supabase；helper 內部 import supabase 是它的工作。
 * 本檔的副作用由 hook 用 after() 包起來呼叫，失敗只記 log、絕不回滾主流程。
 */

import { createClient } from "@/lib/supabase/server";
import { getActiveScope } from "@/lib/scope/active-scope";
import { getReservedQty } from "@/domain/inventory-reservations";

// ─────────────────────────────────────────────────────────────
// 型別
// ─────────────────────────────────────────────────────────────

export type WaitingPartItem = {
  item_id: string;
  warehouse_id: string;
  item_name: string | null;
  needed: number;
  reserved: number;
  shortage: number;
  loop_entry_id: string | null;
  updated_at: string;
};

export type WaitingPartsMeta = {
  flag: boolean;
  since: string;
  updated_at: string;
  items: Record<string, WaitingPartItem>;
};

type WaitingResult =
  | { ok: true; shortage: number; waiting: boolean }
  | { ok: false; error: string };

// ─────────────────────────────────────────────────────────────
// 內部：讀 / 寫 repair_orders.metadata.waiting_parts
// ─────────────────────────────────────────────────────────────

function emptyWaiting(now: string): WaitingPartsMeta {
  return { flag: false, since: now, updated_at: now, items: {} };
}

function normalizeWaiting(raw: unknown, now: string): WaitingPartsMeta {
  if (raw && typeof raw === "object") {
    const w = raw as Partial<WaitingPartsMeta>;
    return {
      flag: Boolean(w.flag),
      since: typeof w.since === "string" ? w.since : now,
      updated_at: typeof w.updated_at === "string" ? w.updated_at : now,
      items:
        w.items && typeof w.items === "object"
          ? (w.items as Record<string, WaitingPartItem>)
          : {},
    };
  }
  return emptyWaiting(now);
}

// ─────────────────────────────────────────────────────────────
// #4 庫存不足 → RO 標待料（CROSS-02）
// ─────────────────────────────────────────────────────────────

/**
 * 標待料：某 RO 需要某 item 但可用量 < 需求量時呼叫。
 *
 * 流程（呼叫端 addAddon 已先用 B3 reserve() 預留「能預留的量」）：
 *   1. 算缺口 shortage = needed − reserved（reserved 取 B3 getReservedQty 的剩餘 active 預留量）
 *   2. shortage <= 0 → 不是待料，若先前有標過此 item 則清掉該 item（補足了）
 *   3. shortage > 0 → 寫 repair_orders.metadata.waiting_parts.items[item_id] + 設 flag
 *      + 建 / 更新一筆 work-order loop 缺料告警（parts_workorder_loop_entries）
 *
 * 冪等：以 item_id 為 key 更新而非疊加；loop entry 用 ro_code+item 查重，已存在就 update。
 * 系統觸發（after()）：本 helper 內部不檢查 ALERT_CONFIG（那是人工操作 alert 設定才需要），
 *   直接寫表 —— hook 是系統自動副作用，技師/倉管 session 不一定有 alert 設定權限。
 */
export async function markWaitingParts(input: {
  ro_id: string;
  item_id: string;
  warehouse_id: string;
  needed: number;
  item_name?: string | null;
}): Promise<WaitingResult> {
  const { ro_id, item_id, warehouse_id, needed } = input;
  if (!ro_id || !item_id || !warehouse_id) {
    return { ok: false, error: "缺少 ro_id / item_id / warehouse_id" };
  }
  if (!(needed > 0)) return { ok: false, error: "需求量必須大於 0" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;
  const now = new Date().toISOString();

  // 撈 RO（含 metadata + ro_code + sa 顯示名供 loop entry 用）
  const { data: ro, error: roErr } = await supabase
    .from("repair_orders")
    .select("id, ro_code, metadata, sa_id")
    .eq("id", ro_id)
    .eq("brand_id", brandId)
    .maybeSingle();
  if (roErr) return { ok: false, error: `撈工單失敗：${roErr.message}` };
  if (!ro) return { ok: false, error: "找不到工單" };

  // B3 已預留量（剩餘 active reserved − consumed），算缺口
  const reserved = await getReservedQty(item_id, warehouse_id);
  const shortage = Math.max(0, needed - reserved);

  const meta = (ro.metadata ?? {}) as Record<string, unknown>;
  const waiting = normalizeWaiting(meta.waiting_parts, now);

  // 解析 item 顯示名（呼叫端沒帶就查 items）
  let itemName = input.item_name ?? null;
  if (!itemName) {
    const { data: it } = await supabase
      .from("items")
      .select("name")
      .eq("id", item_id)
      .eq("brand_id", brandId)
      .maybeSingle();
    itemName = it?.name ?? null;
  }

  if (shortage <= 0) {
    // 不缺料：若先前標過此 item，清掉（補足了）→ 解 loop entry
    const prev = waiting.items[item_id];
    if (prev) {
      if (prev.loop_entry_id) {
        await supabase
          .from("parts_workorder_loop_entries")
          .update({ status: "resolved", is_overdue: false, updated_at: now })
          .eq("id", prev.loop_entry_id)
          .eq("brand_id", brandId);
      }
      delete waiting.items[item_id];
      await persistWaiting(supabase, brandId, ro_id, meta, waiting, now);
    }
    return { ok: true, shortage: 0, waiting: false };
  }

  // 缺料：建 / 更新 work-order loop 缺料告警
  const prev = waiting.items[item_id];
  const missingLabel = `${itemName ?? item_id} × ${shortage}（需 ${needed} / 已預留 ${reserved}）`;
  let loopEntryId = prev?.loop_entry_id ?? null;

  if (loopEntryId) {
    // 更新既有 loop entry（缺口數量變了）
    const { error: upErr } = await supabase
      .from("parts_workorder_loop_entries")
      .update({
        missing_parts: missingLabel,
        status: "pending",
        is_overdue: false,
        updated_at: now,
      })
      .eq("id", loopEntryId)
      .eq("brand_id", brandId);
    if (upErr) loopEntryId = prev?.loop_entry_id ?? null; // 更新失敗保留舊 id，不致命
  } else {
    // 同 ro_code 可能已有此 item 的 pending entry（防呼叫兩次重複建）→ 先查
    const { data: existing } = await supabase
      .from("parts_workorder_loop_entries")
      .select("id")
      .eq("brand_id", brandId)
      .eq("ro_no", ro.ro_code)
      .eq("status", "pending")
      .ilike("missing_parts", `${(itemName ?? item_id).replace(/[%_]/g, "")}%`)
      .limit(1)
      .maybeSingle();
    if (existing?.id) {
      loopEntryId = existing.id;
      await supabase
        .from("parts_workorder_loop_entries")
        .update({ missing_parts: missingLabel, updated_at: now })
        .eq("id", existing.id)
        .eq("brand_id", brandId);
    } else {
      const { data: created, error: cErr } = await supabase
        .from("parts_workorder_loop_entries")
        .insert({
          brand_id: brandId,
          ro_no: ro.ro_code,
          missing_parts: missingLabel,
          shortage_reason: "工單追加備件、可用量不足",
          days_pending: 0,
          status: "pending",
          is_overdue: false,
          sort_order: 99,
          metadata: { source: "cross-hook-4", ro_id, item_id },
        })
        .select("id")
        .single();
      if (cErr) {
        // loop entry 建失敗不致命（待料 flag 仍要標）；記 log
        console.error("[hook#4] 建缺料告警失敗（不影響標待料）", cErr.message);
      } else {
        loopEntryId = created.id;
      }
    }
  }

  waiting.items[item_id] = {
    item_id,
    warehouse_id,
    item_name: itemName,
    needed,
    reserved,
    shortage,
    loop_entry_id: loopEntryId,
    updated_at: now,
  };
  waiting.flag = true;

  const persisted = await persistWaiting(supabase, brandId, ro_id, meta, waiting, now);
  if (!persisted.ok) return persisted;
  return { ok: true, shortage, waiting: true };
}

// ─────────────────────────────────────────────────────────────
// #5 補貨 / 到貨 → 解除待料（CROSS-03）
// ─────────────────────────────────────────────────────────────

/**
 * 補貨入庫後，解除等這個 item 的待料工單。
 *
 * 流程：
 *   1. 用 B3 getReservedQty 取該 item × warehouse 目前剩餘 active 預留
 *   2. 掃所有 metadata.waiting_parts 含此 item 的 RO（先用 inventory_reservations 反查候選 RO，
 *      再逐張讀 metadata 確認）
 *   3. 對每張：若 reserved 已 ≥ needed（補足）→ 清掉該 item、解對應 loop entry；
 *      仍不足（部分到貨）→ 更新 reserved / shortage、保留 flag
 *   4. 整張 RO 已無待料 item → 清 flag
 *
 * 冪等：已 resolved 的 loop entry 不重複解；item 已清掉就不再處理。
 * 部分到貨：只更新數量、不清 flag。
 */
export async function releaseWaitingForItem(input: {
  item_id: string;
  warehouse_id: string;
}): Promise<{ ok: true; resolved_ros: string[]; updated_ros: string[] } | { ok: false; error: string }> {
  const { item_id, warehouse_id } = input;
  if (!item_id || !warehouse_id) return { ok: false, error: "缺少 item_id / warehouse_id" };

  const supabase = await createClient();
  const brandId = (await getActiveScope()).brand_id;
  const now = new Date().toISOString();

  // 找候選待料 RO：inventory_reservations 有此 item 的 active 預留、且帶 ro_id
  // （#4 標待料時 reserve 帶了 ro_id；找這些 RO 來查 metadata.waiting_parts）
  const { data: resRows, error: resErr } = await supabase
    .from("inventory_reservations")
    .select("ro_id")
    .eq("brand_id", brandId)
    .eq("item_id", item_id)
    .eq("warehouse_id", warehouse_id)
    .eq("status", "active")
    .not("ro_id", "is", null);
  if (resErr) return { ok: false, error: `反查待料工單失敗：${resErr.message}` };

  const candidateRoIds = Array.from(
    new Set((resRows ?? []).map((r) => r.ro_id).filter((x): x is string => !!x)),
  );

  // 額外兜底：直接掃 metadata.waiting_parts 含此 item_id 的 RO（防 reserve 已被 consume 但 metadata 還掛著）
  const { data: metaRos } = await supabase
    .from("repair_orders")
    .select("id")
    .eq("brand_id", brandId)
    .contains("metadata", { waiting_parts: { items: { [item_id]: {} } } })
    .limit(200);
  for (const r of metaRos ?? []) {
    if (!candidateRoIds.includes(r.id)) candidateRoIds.push(r.id);
  }

  if (candidateRoIds.length === 0) {
    return { ok: true, resolved_ros: [], updated_ros: [] };
  }

  // 補貨後該 item × warehouse 目前的剩餘 active 預留總量（給比對「補足了沒」）
  const reservedNow = await getReservedQty(item_id, warehouse_id);

  const resolvedRos: string[] = [];
  const updatedRos: string[] = [];

  for (const roId of candidateRoIds) {
    const { data: ro } = await supabase
      .from("repair_orders")
      .select("id, metadata")
      .eq("id", roId)
      .eq("brand_id", brandId)
      .maybeSingle();
    if (!ro) continue;

    const meta = (ro.metadata ?? {}) as Record<string, unknown>;
    const waiting = normalizeWaiting(meta.waiting_parts, now);
    const wItem = waiting.items[item_id];
    if (!wItem) continue; // 此 RO 不在等這個 item（已解過 / 兜底誤入）

    // 補足判定：到貨後剩餘預留 ≥ 此筆需求 → 視為補足，解此 item
    const satisfied = reservedNow >= wItem.needed;

    if (satisfied) {
      if (wItem.loop_entry_id) {
        await supabase
          .from("parts_workorder_loop_entries")
          .update({ status: "resolved", is_overdue: false, days_pending: 0, updated_at: now })
          .eq("id", wItem.loop_entry_id)
          .eq("brand_id", brandId)
          .neq("status", "resolved"); // 已 resolved 不重複（冪等）
      }
      delete waiting.items[item_id];
      resolvedRos.push(roId);
    } else {
      // 部分到貨：更新數量、保留 flag
      wItem.reserved = reservedNow;
      wItem.shortage = Math.max(0, wItem.needed - reservedNow);
      wItem.updated_at = now;
      waiting.items[item_id] = wItem;
      if (wItem.loop_entry_id) {
        await supabase
          .from("parts_workorder_loop_entries")
          .update({
            missing_parts: `${wItem.item_name ?? item_id} × ${wItem.shortage}（部分到貨：需 ${wItem.needed} / 已預留 ${reservedNow}）`,
            updated_at: now,
          })
          .eq("id", wItem.loop_entry_id)
          .eq("brand_id", brandId);
      }
      updatedRos.push(roId);
    }

    // 整張 RO 已無待料 item → 清 flag
    waiting.flag = Object.keys(waiting.items).length > 0;
    await persistWaiting(supabase, brandId, roId, meta, waiting, now);
  }

  return { ok: true, resolved_ros: resolvedRos, updated_ros: updatedRos };
}

// ─────────────────────────────────────────────────────────────
// 內部：把 waiting 寫回 repair_orders.metadata（merge，不覆蓋其他 metadata key）
// ─────────────────────────────────────────────────────────────

async function persistWaiting(
  supabase: Awaited<ReturnType<typeof createClient>>,
  brandId: string,
  roId: string,
  baseMeta: Record<string, unknown>,
  waiting: WaitingPartsMeta,
  now: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  waiting.updated_at = now;
  const nextMeta = { ...baseMeta, waiting_parts: waiting };
  const { error } = await supabase
    .from("repair_orders")
    .update({ metadata: nextMeta })
    .eq("id", roId)
    .eq("brand_id", brandId);
  if (error) return { ok: false, error: `寫回待料狀態失敗：${error.message}` };
  return { ok: true };
}
