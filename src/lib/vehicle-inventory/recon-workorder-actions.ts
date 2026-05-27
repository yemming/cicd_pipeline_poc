"use server";

/**
 * Server actions — 中古車整備工單執行（PD-UC）
 *
 * Result<T> pattern、無 redirect（client 自控導航）。
 * 對應頁面：/parts/aftersales/workorders/recon/[id]
 * 設計稿：docs/20260527/02_中古車整備工單.html
 *
 * 寫入動作：
 *  - saveReconChecklistAction：存 24 項 checklist（隨打隨存）→ repair_orders.metadata.recon_checklist
 *  - saveReconLinesAction：存零件 / 工時明細 → metadata.recon_parts / recon_labor
 *  - approveReconAction：核心完成核准 —— 關單 + 回寫整車成本 + 車輛轉可售
 *
 * 權限：
 *  - 執行 / 存（技師）→ PDI_EXECUTE（與新車 PDI 共用同組）
 *  - 完成核准（主管，會寫回成本 + 車變可售）→ RO_APPROVE
 *
 * 鈑烤費用（bodywork_cost）：設計稿無獨立鈑烤輸入欄位，外觀漆面修復走「工時」列記錄，
 *   故本工單只回寫 recon_labor_cost / recon_parts_cost，bodywork_cost 不動（保留 0 / 既有值）。
 */

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, hasPermission } from "@/lib/rbac/policies";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { getActiveScope } from "@/lib/scope/active-scope";

import {
  RECON_CHECKLIST_TOTAL,
  countChecklistDone,
  partsTotal,
  laborTotal,
  type ReconChecklistItemState,
  type ReconPartLine,
  type ReconLaborLine,
} from "@/domain/recon-workorder.constants";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function reconPagePath(roId: string) {
  return `/parts/aftersales/workorders/recon/${roId}`;
}

function todayIsoDate(): string {
  const d = new Date();
  const tz = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Taipei" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const day = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 取得 PD-UC 工單 + 校驗同 brand。回 { brand, ro }。
 *  只接受 prefix_p1=PD 且 related_used_car_id 非空（藉此跟新車 PDI 區隔）。 */
async function loadReconRo(
  roId: string,
): Promise<
  | { ok: true; brand: string; ro: Record<string, unknown> }
  | { ok: false; error: string }
> {
  if (!roId) return { ok: false, error: "缺少工單 id" };
  const supabase = await createClient();
  const brand = (await getActiveScope()).brand_id;
  const { data, error } = await supabase
    .from("repair_orders")
    .select("*")
    .eq("id", roId)
    .eq("brand_id", brand)
    .maybeSingle();
  if (error) return { ok: false, error: `工單載入失敗：${error.message}` };
  if (!data) return { ok: false, error: "找不到工單或無權存取" };
  const rec = data as Record<string, unknown>;
  if (rec.prefix_p1 !== "PD")
    return { ok: false, error: "此工單不是整備工單（PD）" };
  if (!(rec.related_used_car_id as string | null))
    return { ok: false, error: "此工單未關聯中古車（非 PD-UC 中古整備工單）" };
  return { ok: true, brand, ro: rec };
}

/** 把 metadata patch 合併寫回（保留既有 key） */
async function patchRoMetadata(
  roId: string,
  brand: string,
  existing: Record<string, unknown>,
  patch: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const merged = { ...existing, ...patch };
  const { error } = await supabase
    .from("repair_orders")
    .update({ metadata: merged, updated_at: new Date().toISOString() })
    .eq("id", roId)
    .eq("brand_id", brand);
  if (error) return { ok: false, error: `儲存失敗：${error.message}` };
  return { ok: true };
}

/** 存 24 項 checklist（隨打隨存） */
export async function saveReconChecklistAction(
  roId: string,
  checklist: ReconChecklistItemState[],
): Promise<ActionResult<{ id: string; progress: number }>> {
  await requirePermission(PERMISSIONS.PDI_EXECUTE);
  const loaded = await loadReconRo(roId);
  if (!loaded.ok) return loaded;
  if ((loaded.ro.status as string) === "已關單")
    return { ok: false, error: "工單已關單，無法再修改 checklist" };

  if (!Array.isArray(checklist) || checklist.length !== RECON_CHECKLIST_TOTAL)
    return { ok: false, error: `checklist 必須是 ${RECON_CHECKLIST_TOTAL} 項` };

  // 正規化：只留 idx / result / note，擋亂塞
  const clean: ReconChecklistItemState[] = checklist.map((c, i) => ({
    idx: i,
    result:
      c?.result === "ok" || c?.result === "flagged" || c?.result === "na" ? c.result : null,
    note: typeof c?.note === "string" ? c.note.slice(0, 500) : "",
  }));

  const meta = (loaded.ro.metadata ?? {}) as Record<string, unknown>;
  const done = countChecklistDone(clean);
  const progress = Math.round((done / RECON_CHECKLIST_TOTAL) * 100);

  const res = await patchRoMetadata(roId, loaded.brand, meta, {
    recon_checklist: clean,
    recon_checklist_done: done,
  });
  if (!res.ok) return res;

  revalidatePath(reconPagePath(roId));
  return { ok: true, data: { id: roId, progress } };
}

/** 存零件 / 工時明細（隨打隨存） */
export async function saveReconLinesAction(
  roId: string,
  parts: ReconPartLine[],
  labor: ReconLaborLine[],
): Promise<ActionResult<{ id: string; parts_cost: number; labor_cost: number }>> {
  await requirePermission(PERMISSIONS.PDI_EXECUTE);
  const loaded = await loadReconRo(roId);
  if (!loaded.ok) return loaded;
  if ((loaded.ro.status as string) === "已關單")
    return { ok: false, error: "工單已關單，無法再修改費用明細" };

  // 正規化
  const cleanParts: ReconPartLine[] = (Array.isArray(parts) ? parts : []).map((p) => ({
    part_no: typeof p?.part_no === "string" ? p.part_no.slice(0, 80) : "",
    name: typeof p?.name === "string" ? p.name.slice(0, 200) : "",
    qty: Math.max(0, Number(p?.qty) || 0),
    unit_price: Math.max(0, Number(p?.unit_price) || 0),
  }));
  const cleanLabor: ReconLaborLine[] = (Array.isArray(labor) ? labor : []).map((l) => ({
    name: typeof l?.name === "string" ? l.name.slice(0, 200) : "",
    technician: typeof l?.technician === "string" ? l.technician.slice(0, 80) : "",
    lu: Math.max(0, Number(l?.lu) || 0),
    rate: Math.max(0, Number(l?.rate) || 0),
  }));

  const meta = (loaded.ro.metadata ?? {}) as Record<string, unknown>;
  const partsCost = partsTotal(cleanParts);
  const laborCost = laborTotal(cleanLabor);

  const res = await patchRoMetadata(roId, loaded.brand, meta, {
    recon_parts: cleanParts,
    recon_labor: cleanLabor,
    recon_parts_cost: partsCost,
    recon_labor_cost: laborCost,
  });
  if (!res.ok) return res;

  revalidatePath(reconPagePath(roId));
  return { ok: true, data: { id: roId, parts_cost: partsCost, labor_cost: laborCost } };
}

export type ApproveReconInput = {
  /** 同時把最新 checklist + 明細帶上來一起存（避免 race），可選 */
  checklist?: ReconChecklistItemState[];
  parts?: ReconPartLine[];
  labor?: ReconLaborLine[];
  approval_note?: string | null;
  completed_date?: string | null;
};

export type ApproveReconResult = {
  ro_code: string;
  used_car_id: string | null;
  labor_cost: number;
  parts_cost: number;
  total_cost_after: number | null;
  status_after: string | null;
};

/**
 * 完成核准 —— 核心動作：
 *  a. 驗 24 項都填了（未完成擋下）
 *  b. repair_orders → 已關單 + closed_at + lines_subtotal/lines_total（記費用合計）
 *  c. 回寫 used_car_inventory：recon_labor_cost / recon_parts_cost（自動進 generated total_cost）、
 *     status pending_recon → available、listed_date、metadata.recon_progress=100
 *  d. 回傳 { ro_code, used_car_id, total_cost_after, status_after }
 */
export async function approveReconAction(
  roId: string,
  input: ApproveReconInput = {},
): Promise<ActionResult<ApproveReconResult>> {
  // 完成核准會寫回成本 + 車變可售 → 主管權限
  await requirePermission(PERMISSIONS.RO_APPROVE);
  const loaded = await loadReconRo(roId);
  if (!loaded.ok) return loaded;
  const { brand, ro } = loaded;
  const supabase = await createClient();

  if ((ro.status as string) === "已關單")
    return { ok: false, error: "工單已完成核准，請勿重複關單" };

  const meta = (ro.metadata ?? {}) as Record<string, unknown>;

  // ── 取最新資料：input 帶就用 input（前端送出時一起存），否則用 metadata 既存 ──
  const checklist: ReconChecklistItemState[] = Array.isArray(input.checklist)
    ? input.checklist
    : Array.isArray(meta.recon_checklist)
      ? (meta.recon_checklist as ReconChecklistItemState[])
      : [];
  const parts: ReconPartLine[] = Array.isArray(input.parts)
    ? input.parts
    : Array.isArray(meta.recon_parts)
      ? (meta.recon_parts as ReconPartLine[])
      : [];
  const labor: ReconLaborLine[] = Array.isArray(input.labor)
    ? input.labor
    : Array.isArray(meta.recon_labor)
      ? (meta.recon_labor as ReconLaborLine[])
      : [];

  // a. 驗 24 項都填了
  if (checklist.length !== RECON_CHECKLIST_TOTAL)
    return {
      ok: false,
      error: `整備檢查清單尚未完整（需 ${RECON_CHECKLIST_TOTAL} 項，目前 ${checklist.length} 項）`,
    };
  const done = countChecklistDone(checklist);
  if (done < RECON_CHECKLIST_TOTAL) {
    return {
      ok: false,
      error: `整備檢查清單尚有 ${RECON_CHECKLIST_TOTAL - done} 項未填寫（須全部勾選正常 / 異常 / N/A 才能核准完工）`,
    };
  }

  // 正規化費用明細
  const cleanParts: ReconPartLine[] = parts.map((p) => ({
    part_no: typeof p?.part_no === "string" ? p.part_no : "",
    name: typeof p?.name === "string" ? p.name : "",
    qty: Math.max(0, Number(p?.qty) || 0),
    unit_price: Math.max(0, Number(p?.unit_price) || 0),
  }));
  const cleanLabor: ReconLaborLine[] = labor.map((l) => ({
    name: typeof l?.name === "string" ? l.name : "",
    technician: typeof l?.technician === "string" ? l.technician : "",
    lu: Math.max(0, Number(l?.lu) || 0),
    rate: Math.max(0, Number(l?.rate) || 0),
  }));
  const cleanChecklist: ReconChecklistItemState[] = checklist.map((c, i) => ({
    idx: i,
    result:
      c?.result === "ok" || c?.result === "flagged" || c?.result === "na" ? c.result : "ok",
    note: typeof c?.note === "string" ? c.note.slice(0, 500) : "",
  }));

  const partsCost = partsTotal(cleanParts);
  const laborCost = laborTotal(cleanLabor);
  const feeTotal = partsCost + laborCost;
  const completedDate =
    typeof input.completed_date === "string" && input.completed_date
      ? input.completed_date
      : todayIsoDate();
  const approvalNote =
    typeof input.approval_note === "string" ? input.approval_note.slice(0, 1000) : null;

  const usedCarId = (ro.related_used_car_id as string | null) ?? null;

  // ── b. repair_orders → 已關單 ──
  const newMeta: Record<string, unknown> = {
    ...meta,
    recon_checklist: cleanChecklist,
    recon_checklist_done: RECON_CHECKLIST_TOTAL,
    recon_parts: cleanParts,
    recon_labor: cleanLabor,
    recon_parts_cost: partsCost,
    recon_labor_cost: laborCost,
    recon_fee_total: feeTotal,
    recon_completed_date: completedDate,
    recon_approved_at: new Date().toISOString(),
  };
  if (approvalNote) newMeta.recon_approval_note = approvalNote;

  const { error: roErr } = await supabase
    .from("repair_orders")
    .update({
      status: "已關單",
      closed_at: new Date().toISOString(),
      lines_subtotal: feeTotal,
      lines_total: feeTotal, // 整備無稅無折扣、直接計入整車成本
      metadata: newMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", roId)
    .eq("brand_id", brand);
  if (roErr) return { ok: false, error: `關單失敗：${roErr.message}` };

  // ── c. 回寫 used_car_inventory（若有關聯車）──
  let totalCostAfter: number | null = null;
  let statusAfter: string | null = null;
  if (usedCarId) {
    // 取車輛現況（驗同 brand + 還原 metadata 合併 recon_progress）
    const { data: car, error: carErr } = await supabase
      .from("used_car_inventory")
      .select("id, brand_id, status, metadata")
      .eq("id", usedCarId)
      .maybeSingle();
    if (carErr) return { ok: false, error: `關單成功，但載入車輛失敗：${carErr.message}` };
    if (!car) return { ok: false, error: "關單成功，但找不到關聯車輛主檔（回寫成本失敗）" };
    if ((car as Record<string, unknown>).brand_id !== brand)
      return { ok: false, error: "關單成功，但車輛不屬於當前 brand（回寫成本中止）" };

    const carMeta = ((car as Record<string, unknown>).metadata ?? {}) as Record<string, unknown>;
    const carStatus = (car as Record<string, unknown>).status as string;
    // 只在 pending_recon 才轉 available；其它狀態（已售 / 已保留…）保留不動但仍寫成本
    const nextStatus = carStatus === "pending_recon" ? "available" : carStatus;

    const carPatch: Record<string, unknown> = {
      recon_labor_cost: laborCost,
      recon_parts_cost: partsCost,
      status: nextStatus,
      metadata: { ...carMeta, recon_progress: 100 },
      updated_at: new Date().toISOString(),
    };
    if (nextStatus === "available") {
      carPatch.listed_date = todayIsoDate();
    }

    const { data: updatedCar, error: updCarErr } = await supabase
      .from("used_car_inventory")
      .update(carPatch)
      .eq("id", usedCarId)
      .eq("brand_id", brand)
      .select("status, total_cost")
      .maybeSingle();
    if (updCarErr)
      return { ok: false, error: `關單成功，但回寫整車成本失敗：${updCarErr.message}` };

    const uc = (updatedCar ?? {}) as { status?: string; total_cost?: number | string };
    statusAfter = uc.status ?? nextStatus;
    totalCostAfter = uc.total_cost != null ? Number(uc.total_cost) : null;
  }

  revalidatePath(reconPagePath(roId));
  revalidatePath("/parts/aftersales/repair-orders");
  revalidatePath(`/parts/aftersales/repair-orders/${roId}`);
  // 中古車庫存看板（T2 RS03B）即時更新
  revalidatePath("/sales/showroom/used-cars");
  revalidatePath("/usedcar/stock");

  return {
    ok: true,
    data: {
      ro_code: ro.ro_code as string,
      used_car_id: usedCarId,
      labor_cost: laborCost,
      parts_cost: partsCost,
      total_cost_after: totalCostAfter,
      status_after: statusAfter,
    },
  };
}

/** 給 detail page 判斷使用者能否核准（控制核准按鈕顯隱用） */
export async function canApproveRecon(): Promise<boolean> {
  return hasPermission(PERMISSIONS.RO_APPROVE);
}
