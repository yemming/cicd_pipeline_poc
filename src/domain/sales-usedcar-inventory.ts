/**
 * 中古車庫存看板（RS03B）helper — server-only。
 *
 * 對應 nav_node 29a15d1b-a348-4508-8c39-c5446d968389（Indian / 中古車庫存）。
 * Day 1 走靜態 demo，未來轉 DB（used_car_inventory_units）替換 helper 內部即可。
 */

import "server-only";

import {
  USED_CAR_INVENTORY_UNITS,
  USED_CAR_KPI_SUMMARY,
  USED_CAR_GRADE_OPTIONS,
  USED_CAR_STATUS_OPTIONS,
  USED_CAR_KM_RANGE_OPTIONS,
} from "./sales-usedcar-inventory.constants";

export async function getUsedCarInventory() {
  return {
    units: USED_CAR_INVENTORY_UNITS,
    kpis: USED_CAR_KPI_SUMMARY,
    gradeOptions: USED_CAR_GRADE_OPTIONS,
    statusOptions: USED_CAR_STATUS_OPTIONS,
    kmRangeOptions: USED_CAR_KM_RANGE_OPTIONS,
  };
}

export type UsedCarInventoryData = Awaited<ReturnType<typeof getUsedCarInventory>>;
