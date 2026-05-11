/**
 * Domain — RBAC constants（client + server 共用）
 *
 * 不能放在 src/domain/rbac.ts，因為該檔是 "use server" — 只能 export async function。
 */

/**
 * /parts/setup/item-permissions 的 9 個 capability key 對映 RBAC permission code。
 * 唯一定義在此（plan: image-5-image-6-idempotent-rabbit.md）
 */
export const ITEM_CAPABILITY_TO_RBAC: Record<string, string> = {
  view_items: "parts.item.view",
  create_item: "parts.item.create",
  update_item: "parts.item.update",
  archive_item: "parts.item.archive",
  view_price: "parts.pricing.view",
  update_store_price: "parts.pricing.edit",
  set_special_discount: "parts.pricing.discount",
  config_serial_tracking: "parts.serial.config",
  config_batch_tracking: "parts.batch.config",
};
