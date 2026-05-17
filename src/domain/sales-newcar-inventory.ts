/**
 * 新車庫存看板（RS03A）helper — server-only。
 *
 * 對應 nav_node f64c6a24-e3ee-444c-8103-1058e7d77dbf（Indian / 新車庫存）。
 * Day 1 走靜態 demo，未來轉 DB（new_car_inventory_units）替換 helper 內部即可。
 *
 * Brand 隔離（2026-05-17, P0-#8）：靜態 demo 是 Ducati 車型（Panigale/Monster/...），
 * Indian 帳號回空清單避免顯示錯誤品牌資料；KPI 全歸零、options 仍提供（UI 篩選器照常顯示）。
 */

import "server-only";

import { getActiveScope } from "@/lib/scope/active-scope";

import {
  NEW_CAR_INVENTORY_UNITS,
  NEW_CAR_KPI_SUMMARY,
  NEW_CAR_SERIES_OPTIONS,
  NEW_CAR_STATUS_OPTIONS,
  NEW_CAR_COLOR_OPTIONS,
} from "./sales-newcar-inventory.constants";

export async function getNewCarInventory(options: { brandId?: string } = {}) {
  const scope = await getActiveScope();
  const brandId = options.brandId ?? scope.brand_id;

  const isDucati = brandId === "ducati";
  const units = isDucati ? NEW_CAR_INVENTORY_UNITS : [];
  const kpis = isDucati
    ? NEW_CAR_KPI_SUMMARY
    : NEW_CAR_KPI_SUMMARY.map((k) => ({ ...k, value: 0 }));

  return {
    units,
    kpis,
    seriesOptions: NEW_CAR_SERIES_OPTIONS,
    statusOptions: NEW_CAR_STATUS_OPTIONS,
    colorOptions: NEW_CAR_COLOR_OPTIONS,
  };
}

export type NewCarInventoryData = Awaited<ReturnType<typeof getNewCarInventory>>;
