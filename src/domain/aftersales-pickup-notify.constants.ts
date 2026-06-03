/**
 * 取車通知 — 5 節點 / 三態政策 常數（包F）
 *
 * 抽成獨立檔：aftersales-pickup-notify.ts 是 "use server"，不能匯出 const / sync function，
 * 故節點定義、政策標籤、純函式放這裡，給 domain 與 UI 共用。
 *
 * 對應 G-1 DDL pickup_notification_schedules.node_kind / policy / forced。
 */

// 5 個維修流程通知節點（CHECK: start_repair|safety_addon|general_addon|awaiting_parts|ro_completed）
export type NodeKind =
  | "start_repair"
  | "safety_addon"
  | "general_addon"
  | "awaiting_parts"
  | "ro_completed";

// 三態政策（CHECK: sa_decide|mandatory|off）
export type NotifyPolicy = "sa_decide" | "mandatory" | "off";

export const NODE_KIND_DEFS: {
  code: NodeKind;
  label: string;
  desc: string;
  /** 節點 2（安全相關追加）強制發送，不可關閉 */
  forced: boolean;
}[] = [
  { code: "start_repair", label: "① 開始維修", desc: "工單開工通知車主", forced: false },
  { code: "safety_addon", label: "② 安全相關追加", desc: "影響行車安全的追加項（強制通知，不可關閉）", forced: true },
  { code: "general_addon", label: "③ 一般追加", desc: "非安全的追加項，SA 可決定是否通知", forced: false },
  { code: "awaiting_parts", label: "④ 待料中", desc: "缺料等待，主動告知車主延後", forced: false },
  { code: "ro_completed", label: "⑤ 完工取車", desc: "維修完成可取車", forced: false },
];

export const POLICY_LABEL: Record<NotifyPolicy, string> = {
  sa_decide: "SA 自行決定",
  mandatory: "強制發送",
  off: "關閉",
};

export function nodeKindDef(code: string | null | undefined) {
  return NODE_KIND_DEFS.find((d) => d.code === code) ?? null;
}
