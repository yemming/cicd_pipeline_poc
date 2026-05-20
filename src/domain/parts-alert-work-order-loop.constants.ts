/**
 * 工單缺料閉環常數（M04L-8 A 級儀表板）
 *
 * 拆檔原因：domain/parts-alert-work-order-loop.ts 是 "use server"，禁止 export 非 async 值。
 * 給 client component（board.tsx）import 用。
 */

import type { ToneKey } from "@/components/visualization/tone";

export type LoopStageKey =
  | "sa_picking"
  | "shortage_alert"
  | "auto_demand"
  | "po_review"
  | "part_arrived"
  | "auto_closed";

export const LOOP_STAGE_ORDER: LoopStageKey[] = [
  "sa_picking",
  "shortage_alert",
  "auto_demand",
  "po_review",
  "part_arrived",
  "auto_closed",
];

export const LOOP_STAGE_LABELS: Record<LoopStageKey, string> = {
  sa_picking: "SA 領料",
  shortage_alert: "缺料告警",
  auto_demand: "自動建需求",
  po_review: "採購審核",
  part_arrived: "備件到庫",
  auto_closed: "自動解除",
};

export const LOOP_STAGE_TONES: Record<LoopStageKey, ToneKey> = {
  sa_picking: "blue",
  shortage_alert: "red",
  auto_demand: "amber",
  po_review: "purple",
  part_arrived: "teal",
  auto_closed: "green",
};

export const LOOP_STAGE_OPTIONS: Array<{ value: LoopStageKey | ""; label: string }> = [
  { value: "", label: "全部階段" },
  { value: "sa_picking", label: "SA 領料" },
  { value: "shortage_alert", label: "缺料告警" },
  { value: "auto_demand", label: "自動建需求" },
  { value: "po_review", label: "採購審核" },
  { value: "part_arrived", label: "備件到庫" },
  { value: "auto_closed", label: "自動解除" },
];

export const LOOP_STAGE_CHIP: Record<LoopStageKey, string> = {
  sa_picking: "bg-tone-blue-50 text-tone-blue-700 border-tone-blue-100",
  shortage_alert: "bg-tone-red-50 text-tone-red-700 border-tone-red-100",
  auto_demand: "bg-tone-amber-50 text-tone-amber-700 border-tone-amber-100",
  po_review: "bg-tone-purple-50 text-tone-purple-700 border-tone-purple-100",
  part_arrived: "bg-tone-teal-50 text-tone-teal-700 border-tone-teal-100",
  auto_closed: "bg-tone-green-50 text-tone-green-700 border-tone-green-100",
};
