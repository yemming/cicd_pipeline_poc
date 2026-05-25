/**
 * E2E 測試用 service-role DB helper。
 *
 * 用途：CROSS-01/02 這類「會寫 DB 副作用」的真 UI 測試，跑完要把 fixture 工單上累積的
 * 追加項目 / 庫存預留 / 待料旗標清乾淨，否則第二次跑時可用量被前次預留扣掉 → 缺料/足量
 * 判定漂移、斷言不穩定。
 *
 * ⚠️ 僅供 E2E 測試 setup/teardown，**不在 prod、不在 app 程式碼引用**。
 * Playwright 不自動載 .env.local，這裡自己讀（service-role key 繞過 RLS 做清理）。
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// Playwright 測試 process 沒有 Next 的 env，手動從 .env.local 補（不覆蓋既有）
function loadDotEnvLocal(): void {
  try {
    const txt = readFileSync(".env.local", "utf8");
    for (const raw of txt.split("\n")) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const key = line.slice(0, eq).trim();
      let val = line.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // 沒有 .env.local 就算了（CI 走真 env）
  }
}

let cached: SupabaseClient | null = null;

/** service-role client（繞過 RLS，只給測試清理用） */
export function adminDb(): SupabaseClient {
  if (cached) return cached;
  loadDotEnvLocal();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("fixture-db: 缺 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY（檢查 .env.local）");
  }
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

/** 第十二輪 G2/CROSS-01-02 用的固定維修中工單 ro_code（seed 於 round-12，lead = T1 陳建明） */
export const CROSS_FIXTURE_RO_CODE = "E2E-CROSS-RO-T1";
export const BRAND = "indian";

/** 依 ro_code 取 fixture RO id（找不到回 null，呼叫端應視為「fixture 未 seed」） */
export async function getCrossFixtureRoId(): Promise<string | null> {
  const db = adminDb();
  const { data } = await db
    .from("repair_orders")
    .select("id")
    .eq("brand_id", BRAND)
    .eq("ro_code", CROSS_FIXTURE_RO_CODE)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * 把 fixture 工單清回乾淨狀態：刪該 RO 的所有 inventory_reservations + repair_order_addons，
 * 並移除 metadata.waiting_parts 旗標。讓 CROSS-01/02 每次跑都從同一基準開始。
 */
export async function resetCrossFixtureRO(): Promise<void> {
  const db = adminDb();
  const roId = await getCrossFixtureRoId();
  if (!roId) return;
  await db.from("inventory_reservations").delete().eq("ro_id", roId);
  await db.from("repair_order_addons").delete().eq("ro_id", roId);
  const { data } = await db.from("repair_orders").select("metadata").eq("id", roId).single();
  const meta = { ...((data?.metadata as Record<string, unknown>) ?? {}) };
  delete meta.waiting_parts;
  await db.from("repair_orders").update({ metadata: meta }).eq("id", roId);
}

/** 讀 fixture RO 的待料旗標 + 某 addon 的預留量（給 CROSS-01/02 斷後端副作用用） */
export async function readCrossFixtureSideEffects(): Promise<{
  waitingParts: unknown;
  reservations: Array<{ item_code: string | null; reserved_qty: number; status: string }>;
}> {
  const db = adminDb();
  const roId = await getCrossFixtureRoId();
  if (!roId) return { waitingParts: null, reservations: [] };
  const { data: ro } = await db.from("repair_orders").select("metadata").eq("id", roId).single();
  const { data: rsv } = await db
    .from("inventory_reservations")
    .select("reserved_qty, status, items(code)")
    .eq("ro_id", roId);
  const reservations = (rsv ?? []).map((r) => {
    const rec = r as { reserved_qty: number | string; status: string; items: { code: string } | null };
    return {
      item_code: rec.items?.code ?? null,
      reserved_qty: Number(rec.reserved_qty),
      status: rec.status,
    };
  });
  return {
    waitingParts: (ro?.metadata as Record<string, unknown> | null)?.waiting_parts ?? null,
    reservations,
  };
}

// ── G4 · 估價核准→中古庫存 fixture helper ─────────────────────────

// ── 第十三輪 · CROSS-03/04/05 真 UI 重啟 fixture helper ───────────────
//
// 三條跨模組 hook（#5/#6/#7）的後端已 100% 實裝（round-11 API 級驗通）。本輪改「真 UI 重啟」：
// 用 Playwright 驅動真實頁面觸發 hook，DB 斷副作用。每條一組 seed/reset/read，
// 全自包含（seed 先 reset、afterEach 全刪），不依賴持久 fixture（T1 例外：只借它的 customer/vehicle/sa actor）。
//
// 解析策略：item / warehouse 一律用 code runtime 解析、actor 從 T1 RO 借，**不寫死 UUID**。

/** 依 code 取 Indian item id */
export async function getItemIdByCode(code: string): Promise<string | null> {
  const db = adminDb();
  const { data } = await db
    .from("items")
    .select("id")
    .eq("brand_id", BRAND)
    .eq("code", code)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** 依 code 取 Indian warehouse id */
export async function getWarehouseIdByCode(code: string): Promise<string | null> {
  const db = adminDb();
  const { data } = await db
    .from("warehouses")
    .select("id")
    .eq("brand_id", BRAND)
    .eq("code", code)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** 借 T1 fixture RO 的 customer/vehicle/sa/lead 當新 fixture RO 的 actor（避免寫死 UUID） */
async function getFixtureActors(): Promise<{
  customer_id: string;
  vehicle_id: string;
  sa_id: string;
  lead_technician_id: string;
}> {
  const db = adminDb();
  const { data } = await db
    .from("repair_orders")
    .select("customer_id, vehicle_id, sa_id, lead_technician_id")
    .eq("brand_id", BRAND)
    .eq("ro_code", CROSS_FIXTURE_RO_CODE)
    .maybeSingle();
  if (!data?.customer_id) {
    throw new Error(
      `fixture-db: 找不到 T1 actor（${CROSS_FIXTURE_RO_CODE}）— 請先 seed 該維修中工單`,
    );
  }
  return {
    customer_id: data.customer_id as string,
    vehicle_id: data.vehicle_id as string,
    sa_id: data.sa_id as string,
    lead_technician_id: data.lead_technician_id as string,
  };
}

async function roIdByCode(code: string): Promise<string | null> {
  const db = adminDb();
  const { data } = await db
    .from("repair_orders")
    .select("id")
    .eq("brand_id", BRAND)
    .eq("ro_code", code)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ── CROSS-03（hook#5）調撥到貨 → 待料工單自動解除 ──────────────────────
//   fixture：一張待料工單（metadata.waiting_parts 旗標 + loop entry open + 已預留達 needed）
//            + 一張 in_transit 調撥單載同 item 到目標倉。warehouse 收貨 → hook#5 解待料。
export const CROSS03_RO_CODE = "E2E-CROSS-RO-WAIT";
export const CROSS03_TR_NO = "E2E-CROSS03-TR";
export const CROSS03_ITEM_CODE = "OEM-ENG-001"; // V4 引擎活塞
const CROSS03_TARGET_WH = "WH-001"; // 主零件倉（待料工單需求倉 = 調撥目標倉）
const CROSS03_SOURCE_WH = "WH-CONS"; // 寄存倉（調撥來源）

/** 全刪 CROSS-03 fixture（待料 RO + reservation + loop entry + 調撥單 + 收貨 GR） */
export async function resetCross03(): Promise<void> {
  const db = adminDb();
  const roId = await roIdByCode(CROSS03_RO_CODE);
  if (roId) {
    await db.from("inventory_reservations").delete().eq("ro_id", roId);
  }
  await db.from("parts_workorder_loop_entries").delete().eq("brand_id", BRAND).eq("ro_no", CROSS03_RO_CODE);
  // 調撥單 + 明細 + 收貨時產生的 GR
  const { data: trs } = await db.from("stock_transfers").select("id").eq("brand_id", BRAND).eq("tr_no", CROSS03_TR_NO);
  const trIds = (trs ?? []).map((t) => t.id as string);
  if (trIds.length) {
    await db.from("stock_transfer_lines").delete().in("tr_id", trIds);
    await db.from("stock_receipts").delete().in("source_doc_id", trIds);
    await db.from("stock_transfers").delete().in("id", trIds);
  }
  if (roId) await db.from("repair_orders").delete().eq("id", roId);
}

/** Seed CROSS-03 fixture，回傳收貨要用的 transferId + 待料 roId */
export async function seedCross03(): Promise<{ transferId: string; roId: string }> {
  await resetCross03();
  const db = adminDb();
  const now = new Date().toISOString();
  const actors = await getFixtureActors();
  const itemId = await getItemIdByCode(CROSS03_ITEM_CODE);
  const targetWh = await getWarehouseIdByCode(CROSS03_TARGET_WH);
  const sourceWh = await getWarehouseIdByCode(CROSS03_SOURCE_WH);
  if (!itemId || !targetWh || !sourceWh) {
    throw new Error("seedCross03: 解析 item/warehouse 失敗（檢查 OEM-ENG-001 / WH-001 / WH-CONS）");
  }

  // 1. 待料工單（維修中）
  const { data: roRow, error: roErr } = await db
    .from("repair_orders")
    .insert({
      brand_id: BRAND,
      ro_code: CROSS03_RO_CODE,
      prefix_p1: "MN",
      prefix_p2: "WR",
      sequence_no: 99002,
      issue_date: now.slice(0, 10),
      status: "維修中",
      lead_technician_id: actors.lead_technician_id,
      customer_id: actors.customer_id,
      vehicle_id: actors.vehicle_id,
      sa_id: actors.sa_id,
      estimated_labor_units: 2.0,
      opened_at: now,
      metadata: { e2e_seed: true, purpose: "round13-CROSS-03-waiting-fixture" },
    })
    .select("id")
    .single();
  if (roErr || !roRow) throw new Error(`seedCross03: 建待料工單失敗：${roErr?.message}`);
  const roId = roRow.id as string;

  // 2. 缺料告警 loop entry（open）
  const { data: loopRow, error: loopErr } = await db
    .from("parts_workorder_loop_entries")
    .insert({
      brand_id: BRAND,
      ro_no: CROSS03_RO_CODE,
      missing_parts: "V4 引擎活塞 標準件 × 1（需 1 / 已預留 0）",
      status: "pending",
      is_overdue: false,
      days_pending: 0,
      sort_order: 0,
    })
    .select("id")
    .single();
  if (loopErr || !loopRow) throw new Error(`seedCross03: 建 loop entry 失敗：${loopErr?.message}`);
  const loopEntryId = loopRow.id as string;

  // 3. 已預留達 needed（reservedNow=1 ≥ needed=1）→ 收貨觸發重檢時判定「補足」
  const { error: rsvErr } = await db.from("inventory_reservations").insert({
    brand_id: BRAND,
    item_id: itemId,
    warehouse_id: targetWh,
    reserved_qty: 1,
    consumed_qty: 0,
    source_type: "repair_order",
    source_id: roId,
    ro_id: roId,
    status: "active",
  });
  if (rsvErr) throw new Error(`seedCross03: 建預留失敗：${rsvErr.message}`);

  // 4. 待料旗標（stale：reserved 記 0 / shortage 1，待收貨事件清掉）
  await db
    .from("repair_orders")
    .update({
      metadata: {
        e2e_seed: true,
        purpose: "round13-CROSS-03-waiting-fixture",
        waiting_parts: {
          flag: true,
          since: now,
          updated_at: now,
          items: {
            [itemId]: {
              item_id: itemId,
              warehouse_id: targetWh,
              item_name: "V4 引擎活塞 標準件",
              needed: 1,
              reserved: 0,
              shortage: 1,
              loop_entry_id: loopEntryId,
              updated_at: now,
            },
          },
        },
      },
    })
    .eq("id", roId);

  // 5. in_transit 調撥單（載同 item 到目標倉）
  const { data: trRow, error: trErr } = await db
    .from("stock_transfers")
    .insert({
      brand_id: BRAND,
      tr_no: CROSS03_TR_NO,
      source_warehouse_id: sourceWh,
      target_warehouse_id: targetWh,
      transfer_type: "inter_store",
      status: "in_transit",
      qty_requested_total: 1,
      qty_shipped_total: 1,
      ship_date: now.slice(0, 10),
      metadata: { e2e_seed: true },
    })
    .select("id")
    .single();
  if (trErr || !trRow) throw new Error(`seedCross03: 建調撥單失敗：${trErr?.message}`);
  const transferId = trRow.id as string;

  const { error: tlErr } = await db.from("stock_transfer_lines").insert({
    brand_id: BRAND,
    tr_id: transferId,
    line_no: 1,
    item_id: itemId,
    qty_requested: 1,
    qty_shipped: 1,
    qty_received: 0,
    uom: "個",
  });
  if (tlErr) throw new Error(`seedCross03: 建調撥明細失敗：${tlErr.message}`);

  return { transferId, roId };
}

/** 讀 CROSS-03 待料解除結果：旗標是否清掉 + loop entry 是否 resolved */
export async function readCross03(roId: string): Promise<{
  waitingFlag: boolean;
  hasWaitingItem: boolean;
  loopResolved: boolean;
}> {
  const db = adminDb();
  const { data: ro } = await db.from("repair_orders").select("metadata").eq("id", roId).single();
  const wp = ((ro?.metadata as Record<string, unknown> | null)?.waiting_parts ?? null) as
    | { flag?: boolean; items?: Record<string, unknown> }
    | null;
  const { data: loop } = await db
    .from("parts_workorder_loop_entries")
    .select("status")
    .eq("brand_id", BRAND)
    .eq("ro_no", CROSS03_RO_CODE)
    .maybeSingle();
  return {
    waitingFlag: Boolean(wp?.flag),
    hasWaitingItem: Boolean(wp?.items && Object.keys(wp.items).length > 0),
    loopResolved: (loop?.status as string | undefined) === "resolved",
  };
}

// ── CROSS-04（hook#6）竣工複檢通過 → 保固索賠舊件自動登錄 ──────────────────
//   fixture：WC 保固工單（prefix_p1='WC'）+ 一條保固零件 line + 已簽名複檢單。
//            aftersales_lead 點「完成竣工複檢」→ hook#6 登 old_parts（帶 ro_id）。
export const CROSS04_RO_CODE = "E2E-CROSS-RO-WC";
export const CROSS04_FI_NO = "E2E-FI-WC";
export const CROSS04_PART_CODE = "E2E-P-002"; // 煞車系統零件（A 類保固件）

/** 全刪 CROSS-04 fixture（old_parts + 複檢單 + RO line + WC RO） */
export async function resetCross04(): Promise<void> {
  const db = adminDb();
  const roId = await roIdByCode(CROSS04_RO_CODE);
  if (roId) {
    await db.from("old_parts").delete().eq("ro_id", roId);
    await db.from("final_inspections").delete().eq("repair_order_id", roId);
    await db.from("repair_order_lines").delete().eq("repair_order_id", roId);
    await db.from("repair_orders").delete().eq("id", roId);
  }
}

/** Seed CROSS-04 fixture，回傳要驅動完成的 fiId + roId + 保固件 itemId */
export async function seedCross04(): Promise<{ fiId: string; roId: string; itemId: string }> {
  await resetCross04();
  const db = adminDb();
  const now = new Date().toISOString();
  const actors = await getFixtureActors();
  const itemId = await getItemIdByCode(CROSS04_PART_CODE);
  if (!itemId) throw new Error(`seedCross04: 找不到保固件 ${CROSS04_PART_CODE}`);

  const { data: roRow, error: roErr } = await db
    .from("repair_orders")
    .insert({
      brand_id: BRAND,
      ro_code: CROSS04_RO_CODE,
      prefix_p1: "WC", // 保固單 → 觸發 hook#6
      prefix_p2: "WR",
      sequence_no: 99003,
      issue_date: now.slice(0, 10),
      status: "維修中",
      lead_technician_id: actors.lead_technician_id,
      customer_id: actors.customer_id,
      vehicle_id: actors.vehicle_id,
      sa_id: actors.sa_id,
      estimated_labor_units: 2.0,
      opened_at: now,
      metadata: { e2e_seed: true, purpose: "round13-CROSS-04-warranty-fixture" },
    })
    .select("id")
    .single();
  if (roErr || !roRow) throw new Error(`seedCross04: 建 WC 工單失敗：${roErr?.message}`);
  const roId = roRow.id as string;

  // 保固零件 line（kind=part / is_warranty=true / 有 item_id → hook#6 會撈它登舊件）
  const { error: lineErr } = await db.from("repair_order_lines").insert({
    repair_order_id: roId,
    brand_id: BRAND,
    line_no: 1,
    kind: "part",
    item_id: itemId,
    part_code: CROSS04_PART_CODE,
    part_name: "煞車系統 零件 #002 (A類)",
    qty: 1,
    unit_price: 0,
    amount: 0,
    is_warranty: true,
    source: "initial",
  });
  if (lineErr) throw new Error(`seedCross04: 建保固 line 失敗：${lineErr.message}`);

  // 複檢單：已簽名（completeAction 只 gate signed_at）、status 進行中
  const { data: fiRow, error: fiErr } = await db
    .from("final_inspections")
    .insert({
      brand_id: BRAND,
      repair_order_id: roId,
      inspection_no: CROSS04_FI_NO,
      status: "in_progress",
      line_results: [],
      signed_at: now,
      signature_text: "E2E 複檢簽核",
      inspector_name: "E2E 售後主管",
    })
    .select("id")
    .single();
  if (fiErr || !fiRow) throw new Error(`seedCross04: 建複檢單失敗：${fiErr?.message}`);

  return { fiId: fiRow.id as string, roId, itemId };
}

/** 讀 CROSS-04 登舊件結果：該 RO 的 old_parts */
export async function readCross04(roId: string): Promise<
  Array<{ id: string; item_id: string; status: string; wc_no: string; ro_id: string | null }>
> {
  const db = adminDb();
  const { data } = await db
    .from("old_parts")
    .select("id, item_id, status, wc_no, ro_id")
    .eq("ro_id", roId);
  return (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      id: rec.id as string,
      item_id: rec.item_id as string,
      status: rec.status as string,
      wc_no: rec.wc_no as string,
      ro_id: (rec.ro_id as string | null) ?? null,
    };
  });
}

// ── CROSS-05（hook#7）關單 → 售後 NPS 回訪 call_task 自動建立 ──────────────
//   fixture：帶 customer 的工單（待結帳）。sa 切「已關單」→ hook#7 建 aftersales/nps_interview。
export const CROSS05_RO_CODE = "E2E-CROSS-RO-CLOSE";

/** 全刪 CROSS-05 fixture（NPS call_task + RO） */
export async function resetCross05(): Promise<void> {
  const db = adminDb();
  const roId = await roIdByCode(CROSS05_RO_CODE);
  if (roId) {
    await db.from("call_tasks").delete().eq("metadata->>source_ro", roId);
    await db.from("repair_orders").delete().eq("id", roId);
  }
}

/** Seed CROSS-05 fixture，回傳要關單的 roId + 掛的 customerId */
export async function seedCross05(): Promise<{ roId: string; customerId: string }> {
  await resetCross05();
  const db = adminDb();
  const now = new Date().toISOString();
  const actors = await getFixtureActors();

  const { data: roRow, error: roErr } = await db
    .from("repair_orders")
    .insert({
      brand_id: BRAND,
      ro_code: CROSS05_RO_CODE,
      prefix_p1: "MN",
      prefix_p2: "WR",
      sequence_no: 99004,
      issue_date: now.slice(0, 10),
      status: "待結帳", // 切「已關單」是合法下一步
      lead_technician_id: actors.lead_technician_id,
      customer_id: actors.customer_id,
      vehicle_id: actors.vehicle_id,
      sa_id: actors.sa_id,
      estimated_labor_units: 2.0,
      opened_at: now,
      metadata: { e2e_seed: true, purpose: "round13-CROSS-05-close-fixture" },
    })
    .select("id")
    .single();
  if (roErr || !roRow) throw new Error(`seedCross05: 建工單失敗：${roErr?.message}`);
  return { roId: roRow.id as string, customerId: actors.customer_id };
}

/** 讀 CROSS-05 關單副作用：該 RO 衍生的 NPS call_task */
export async function readCross05(roId: string): Promise<
  Array<{ kind: string; call_type: string | null; status: string; customer_id: string }>
> {
  const db = adminDb();
  const { data } = await db
    .from("call_tasks")
    .select("kind, call_type, status, customer_id")
    .eq("metadata->>source_ro", roId);
  return (data ?? []).map((r) => {
    const rec = r as Record<string, unknown>;
    return {
      kind: rec.kind as string,
      call_type: (rec.call_type as string | null) ?? null,
      status: rec.status as string,
      customer_id: rec.customer_id as string,
    };
  });
}

/** 依 eval_no 取 Indian 估價單 id（找不到回 null） */
export async function getEvalIdByNo(evalNo: string): Promise<string | null> {
  const db = adminDb();
  const { data } = await db
    .from("used_car_evaluations")
    .select("id")
    .eq("brand_id", BRAND)
    .eq("eval_no", evalNo)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * 把估價單清回「待核准」基準：刪掉該 eval 衍生的中古庫存、estimation status→submitted、
 * 清 approved_at/by 與 metadata.generated_inventory_id。讓 G4 approve 測試每次從同基準跑。
 */
export async function resetEvalFixture(evalNo: string): Promise<void> {
  const db = adminDb();
  const evalId = await getEvalIdByNo(evalNo);
  if (!evalId) return;
  await db.from("used_car_inventory").delete().eq("metadata->>source_evaluation_id", evalId);
  const { data } = await db.from("used_car_evaluations").select("metadata").eq("id", evalId).single();
  const meta = { ...((data?.metadata as Record<string, unknown>) ?? {}) };
  delete meta.generated_inventory_id;
  await db
    .from("used_car_evaluations")
    .update({ status: "submitted", approved_at: null, approved_by: null, metadata: meta })
    .eq("id", evalId);
}

/** 讀某 eval 衍生的中古庫存（給 G4 approve 測試斷言：count / status / 金額 / 雙向關聯） */
export async function readEvalDerivedInventory(evalNo: string): Promise<{
  evalStatus: string | null;
  generatedInventoryId: unknown;
  inventory: Array<{
    id: string;
    status: string;
    acquisition_price: number | null;
    listing_price: number | null;
    margin: number | null;
    condition_grade: string | null;
  }>;
}> {
  const db = adminDb();
  const evalId = await getEvalIdByNo(evalNo);
  if (!evalId) return { evalStatus: null, generatedInventoryId: null, inventory: [] };
  const { data: ev } = await db
    .from("used_car_evaluations")
    .select("status, metadata")
    .eq("id", evalId)
    .single();
  const { data: inv } = await db
    .from("used_car_inventory")
    .select("id, status, acquisition_price, listing_price, margin, condition_grade")
    .eq("metadata->>source_evaluation_id", evalId);
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    evalStatus: (ev?.status as string | null) ?? null,
    generatedInventoryId: (ev?.metadata as Record<string, unknown> | null)?.generated_inventory_id ?? null,
    inventory: (inv ?? []).map((r) => {
      const rec = r as Record<string, unknown>;
      return {
        id: rec.id as string,
        status: rec.status as string,
        acquisition_price: num(rec.acquisition_price),
        listing_price: num(rec.listing_price),
        margin: num(rec.margin),
        condition_grade: (rec.condition_grade as string | null) ?? null,
      };
    }),
  };
}
