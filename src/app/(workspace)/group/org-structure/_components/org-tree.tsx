"use client";

/**
 * GRP20 輕量組織樹 — 純 React 展開/收合/選取（非 D3）。
 *
 * 唯讀：點節點 → onSelect(node)；有 children 的節點可展開。預設展開到法人層。
 */

import { useState } from "react";

import type { OrgNodeType, OrgTreeNode } from "@/domain/org-structure";

const TYPE_META: Record<OrgNodeType, { label: string; icon: string; color: string; bg: string }> = {
  group: { label: "集團", icon: "corporate_fare", color: "#1A3A5C", bg: "#EBF3FF" },
  subsidiary: { label: "法人", icon: "account_balance", color: "#185FA5", bg: "#EAF4FB" },
  region: { label: "區域", icon: "map", color: "#854F0B", bg: "#FDF3E3" },
  store: { label: "門店", icon: "storefront", color: "#0F6E56", bg: "#E8F5F0" },
  department: { label: "部門", icon: "groups", color: "#6B6A68", bg: "#F2F2F2" },
};

const BRAND_LABEL: Record<string, string> = { indian: "Indian", ducati: "Ducati" };

function TypeChip({ type }: { type: OrgNodeType }) {
  const m = TYPE_META[type];
  return (
    <span
      className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] whitespace-nowrap"
      style={{ background: m.bg, color: m.color }}
    >
      {m.label}
    </span>
  );
}

function BrandChip({ brandId }: { brandId: string }) {
  return (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#EEF4FB] text-[#185FA5] whitespace-nowrap">
      {BRAND_LABEL[brandId] ?? brandId}
    </span>
  );
}

function TreeRow({
  node,
  depth,
  selectedKey,
  onSelect,
}: {
  node: OrgTreeNode;
  depth: number;
  selectedKey: string | null;
  onSelect: (n: OrgTreeNode) => void;
}) {
  // 預設展開到區域層（集團/法人/區域），門店與部門即可見；其餘收合
  const [open, setOpen] = useState(depth <= 2);
  const hasChildren = node.children.length > 0;
  const selected = node.key === selectedKey;
  const m = TYPE_META[node.type];

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 rounded-md cursor-pointer pr-2 py-1.5 transition-colors ${
          selected ? "bg-[#1A3A5C] text-white" : "hover:bg-[#F8F7F4] text-[#2C2C2A]"
        }`}
        style={{ paddingLeft: 8 + depth * 16 }}
        onClick={() => onSelect(node)}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) setOpen((v) => !v);
          }}
          className={`shrink-0 w-4 h-4 flex items-center justify-center ${hasChildren ? "" : "invisible"}`}
          aria-label={open ? "收合" : "展開"}
        >
          <span className={`material-symbols-outlined text-[16px] ${selected ? "text-white" : "text-[#9A9890]"}`}>
            {open ? "expand_more" : "chevron_right"}
          </span>
        </button>
        <span
          className="material-symbols-outlined text-[16px] shrink-0"
          style={{ color: selected ? "#fff" : m.color }}
        >
          {m.icon}
        </span>
        <span className={`text-[12.5px] truncate ${selected ? "font-semibold" : ""}`}>{node.name}</span>
        {!selected && <TypeChip type={node.type} />}
        {!selected &&
          node.brandIds.map((b) => <BrandChip key={b} brandId={b} />)}
        {!selected && node.isActive === false && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] bg-[#F2F2F2] text-[#6B6A68]">
            停用
          </span>
        )}
      </div>
      {open &&
        node.children.map((c) => (
          <TreeRow key={c.key} node={c} depth={depth + 1} selectedKey={selectedKey} onSelect={onSelect} />
        ))}
    </div>
  );
}

export function OrgTree({
  tree,
  selectedKey,
  onSelect,
}: {
  tree: OrgTreeNode[];
  selectedKey: string | null;
  onSelect: (n: OrgTreeNode) => void;
}) {
  return (
    <div className="space-y-0.5">
      {tree.map((n) => (
        <TreeRow key={n.key} node={n} depth={0} selectedKey={selectedKey} onSelect={onSelect} />
      ))}
    </div>
  );
}

export { TYPE_META, BRAND_LABEL };
