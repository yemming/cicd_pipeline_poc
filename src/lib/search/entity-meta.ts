// 各 entity_type 在搜尋結果裡的中文標籤、icon、配色
// CommandPalette 跟 TopbarSearch 共用這份單一事實來源
// 實際資料從 SEARCH_REGISTRY 推導,加新 entity 改 global-search-registry.ts 即可
import { SEARCH_REGISTRY } from "./global-search-registry";

export const ENTITY_META: Record<
  string,
  { label: string; icon: string; color: string }
> = Object.fromEntries(
  SEARCH_REGISTRY.map((s) => [
    s.entityType,
    { label: s.label, icon: s.icon, color: s.color },
  ]),
);

export function entityMeta(type: string) {
  return ENTITY_META[type] ?? { label: type, icon: "database", color: "#5A5955" };
}
