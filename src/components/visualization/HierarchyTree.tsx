/**
 * HierarchyTree — file-explorer 風樹狀。
 *
 * ▶ / ▼ toggle、縮排每層 16px、選中 row 套 bg-tone-blue-50。
 * `defaultExpanded` 控制初始全展開或全收合。
 */

"use client";

import type { ReactNode } from "react";
import { useState } from "react";
import { cn } from "./tone";

export interface TreeNode {
  id: string;
  label: string;
  badge?: ReactNode;
  children?: TreeNode[];
}

export interface HierarchyTreeProps {
  data: TreeNode[];
  defaultExpanded?: boolean;
  onSelect?: (node: TreeNode) => void;
  selectedId?: string;
  className?: string;
}

function collectAllIds(nodes: TreeNode[]): string[] {
  const ids: string[] = [];
  function walk(arr: TreeNode[]) {
    for (const n of arr) {
      ids.push(n.id);
      if (n.children?.length) walk(n.children);
    }
  }
  walk(nodes);
  return ids;
}

export function HierarchyTree({
  data,
  defaultExpanded = true,
  onSelect,
  selectedId,
  className,
}: HierarchyTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() =>
    defaultExpanded ? new Set(collectAllIds(data)) : new Set(),
  );

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderNode(node: TreeNode, depth: number): ReactNode {
    const hasChildren = !!node.children?.length;
    const isOpen = expanded.has(node.id);
    const isSelected = selectedId === node.id;
    return (
      <div key={node.id}>
        <div
          className={cn(
            "flex items-center gap-1.5 py-1 px-2 rounded-md cursor-pointer hover:bg-tone-gray-50 text-[12.5px]",
            isSelected ? "bg-tone-blue-50 text-tone-blue-700" : "text-tone-gray-700",
          )}
          style={{ paddingLeft: depth * 16 + 8 }}
          onClick={() => onSelect?.(node)}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle(node.id);
              }}
              className="w-4 h-4 inline-flex items-center justify-center text-tone-gray-500 hover:text-tone-gray-700 shrink-0"
              aria-label={isOpen ? "收合" : "展開"}
            >
              <span className="text-[10px]">{isOpen ? "▼" : "▶"}</span>
            </button>
          ) : (
            <span className="w-4 h-4 shrink-0" />
          )}
          <span className="truncate">{node.label}</span>
          {node.badge ? <span className="ml-auto shrink-0">{node.badge}</span> : null}
        </div>
        {hasChildren && isOpen ? (
          <div>{node.children!.map((c) => renderNode(c, depth + 1))}</div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("bg-white rounded-md border border-tone-gray-100 p-1", className)}>
      {data.map((n) => renderNode(n, 0))}
    </div>
  );
}

export default HierarchyTree;
