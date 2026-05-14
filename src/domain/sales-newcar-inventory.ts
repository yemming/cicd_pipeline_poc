/**
 * 新車庫存看板（RS03A）helper — server-only。
 *
 * 對應 nav_node f64c6a24-e3ee-444c-8103-1058e7d77dbf（Indian / 新車庫存）。
 * Day 1 走靜態 demo，未來轉 DB（new_car_inventory_units）替換 helper 內部即可。
 */

import "server-only";

import {
  NEW_CAR_INVENTORY_UNITS,
  NEW_CAR_KPI_SUMMARY,
  NEW_CAR_SERIES_OPTIONS,
  NEW_CAR_STATUS_OPTIONS,
  NEW_CAR_COLOR_OPTIONS,
} from "./sales-newcar-inventory.constants";

export async function getNewCarInventory() {
  return {
    units: NEW_CAR_INVENTORY_UNITS,
    kpis: NEW_CAR_KPI_SUMMARY,
    seriesOptions: NEW_CAR_SERIES_OPTIONS,
    statusOptions: NEW_CAR_STATUS_OPTIONS,
    colorOptions: NEW_CAR_COLOR_OPTIONS,
  };
}

export type NewCarInventoryData = Awaited<ReturnType<typeof getNewCarInventory>>;
