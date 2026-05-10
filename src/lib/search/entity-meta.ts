// 各 entity_type 在搜尋結果裡的中文標籤、icon、配色
// CommandPalette 跟 TopbarSearch 共用這份單一事實來源
export const ENTITY_META: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  customer: { label: "客戶", icon: "person", color: "#1A3A5C" },
  customer_contact: { label: "聯絡人", icon: "contact_mail", color: "#185FA5" },
  customer_vehicle: { label: "車輛", icon: "two_wheeler", color: "#0F6E56" },
  employee: { label: "員工", icon: "badge", color: "#854F0B" },
  supplier: { label: "供應商", icon: "local_shipping", color: "#6B4FA0" },
  item: { label: "商品", icon: "inventory_2", color: "#3B6D11" },
  work_order: { label: "維修工單", icon: "build", color: "#CC0000" },
  purchase_order: { label: "採購單", icon: "shopping_cart", color: "#3B6D11" },
  pos_transaction: { label: "POS 發票", icon: "receipt_long", color: "#185FA5" },
};

export function entityMeta(type: string) {
  return ENTITY_META[type] ?? { label: type, icon: "database", color: "#5A5955" };
}
