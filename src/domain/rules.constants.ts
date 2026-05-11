/**
 * Domain — Business Rules constants（client + server 共用）
 *
 * 不能放在 src/domain/rules.ts，因為該檔是 "use server" — 只能 export async function。
 */

export const ITEM_PERMISSION_CAPABILITIES: Array<{
  key: string;
  label: string;
  section: "商品基礎資料" | "定價管理" | "序列號/批號";
}> = [
  { key: "view_items", label: "查看商品清單", section: "商品基礎資料" },
  { key: "create_item", label: "新增商品", section: "商品基礎資料" },
  { key: "update_item", label: "修改商品資訊", section: "商品基礎資料" },
  { key: "archive_item", label: "停用/刪除商品", section: "商品基礎資料" },
  { key: "view_price", label: "查看售價", section: "定價管理" },
  { key: "update_store_price", label: "修改門市定價", section: "定價管理" },
  { key: "set_special_discount", label: "設定特殊折扣", section: "定價管理" },
  { key: "config_serial_tracking", label: "序列號追蹤設定", section: "序列號/批號" },
  { key: "config_batch_tracking", label: "批號管理設定", section: "序列號/批號" },
];
