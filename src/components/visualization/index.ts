/**
 * Visualization 元件入口 — UI 一律從這支 re-export 拿。
 *
 * import { KpiCard, StatusDot, KanbanBoard, Timeline, FlowDiagram, HierarchyTree, MatrixSelector } from "@/components/visualization";
 */

export { KpiCard } from "./KpiCard";
export type { KpiCardProps } from "./KpiCard";

export { StatusDot } from "./StatusDot";
export type { StatusDotProps } from "./StatusDot";

export { KanbanBoard } from "./KanbanBoard";
export type { KanbanBoardProps, KanbanColumn, KanbanCard } from "./KanbanBoard";

export { Timeline } from "./Timeline";
export type { TimelineProps, TimelineEvent } from "./Timeline";

export { FlowDiagram } from "./FlowDiagram";
export type { FlowDiagramProps, FlowNode, FlowEdge } from "./FlowDiagram";

export { HierarchyTree } from "./HierarchyTree";
export type { HierarchyTreeProps, TreeNode } from "./HierarchyTree";

export { MatrixSelector } from "./MatrixSelector";
export type { MatrixSelectorProps } from "./MatrixSelector";

export type { ToneKey } from "./tone";
