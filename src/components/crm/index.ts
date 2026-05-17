/**
 * CRM 模組共用元件 barrel export
 *
 * 用於第四輪 BDN Batch 1 / 2 / 3 落地：CRM01A/B、CRM03A/B、CRM04A/B 等
 * 卡片型 list 共用視覺，避免每頁重複手刻。
 *
 * Sandbox 預覽：/_dev/crm-components
 */

export { CrmSidebar } from "./crm-sidebar";
export type {
  CrmSidebarProps,
  CrmSidebarGroup,
  CrmSidebarItem,
  CrmSidebarQuickTool,
} from "./crm-sidebar";

export { CrmKpiCard } from "./crm-kpi-card";
export type { CrmKpiCardProps, CrmKpiAccent } from "./crm-kpi-card";

export { CrmQuickFilterBar } from "./crm-quick-filter-bar";
export type {
  CrmQuickFilterBarProps,
  CrmQuickFilterChip,
} from "./crm-quick-filter-bar";

export { CrmCustomerCard } from "./crm-customer-card";
export type {
  CrmCustomerCardProps,
  CrmCustomerCardChip,
  CrmCustomerCardField,
  CrmCustomerCardTraffic,
} from "./crm-customer-card";

export { CallTaskCard } from "./call-task-card";
export type {
  CallTaskCardProps,
  CallTaskCardStatus,
  CallTaskCardChip,
  CallTaskCardChipColor,
  CallTaskCardHistoryItem,
  CallTaskCardResultOption,
} from "./call-task-card";
