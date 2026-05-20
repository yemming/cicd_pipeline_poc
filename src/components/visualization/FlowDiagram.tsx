/**
 * FlowDiagram — SVG 流程圖（無 auto-layout 演算法）。
 *
 * 按 nodes 順序均分位置；edges 用直線 + 箭頭。currentNodeId 套 pulse 視覺強調。
 * orientation = horizontal | vertical。
 */

"use client";

import { useMemo } from "react";
import { TONE_HEX, cn, type ToneKey } from "./tone";

export interface FlowNode {
  id: string;
  label: string;
  tone?: ToneKey;
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowDiagramProps {
  nodes: FlowNode[];
  edges: FlowEdge[];
  currentNodeId?: string;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

const NODE_W = 140;
const NODE_H = 48;
const GAP = 80;
const PAD = 24;

export function FlowDiagram({
  nodes,
  edges,
  currentNodeId,
  orientation = "horizontal",
  className,
}: FlowDiagramProps) {
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>();
    nodes.forEach((n, idx) => {
      if (orientation === "horizontal") {
        map.set(n.id, { x: PAD + idx * (NODE_W + GAP), y: PAD });
      } else {
        map.set(n.id, { x: PAD, y: PAD + idx * (NODE_H + GAP) });
      }
    });
    return map;
  }, [nodes, orientation]);

  const width =
    orientation === "horizontal"
      ? PAD * 2 + nodes.length * NODE_W + (nodes.length - 1) * GAP
      : PAD * 2 + NODE_W;
  const height =
    orientation === "horizontal"
      ? PAD * 2 + NODE_H + 16
      : PAD * 2 + nodes.length * NODE_H + (nodes.length - 1) * GAP;

  return (
    <div className={cn("overflow-x-auto", className)}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="block"
        role="img"
        aria-label="Flow diagram"
      >
        <defs>
          <marker
            id="flow-arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6B7280" />
          </marker>
        </defs>
        {/* edges */}
        {edges.map((e, idx) => {
          const from = positions.get(e.from);
          const to = positions.get(e.to);
          if (!from || !to) return null;
          let x1: number;
          let y1: number;
          let x2: number;
          let y2: number;
          if (orientation === "horizontal") {
            x1 = from.x + NODE_W;
            y1 = from.y + NODE_H / 2;
            x2 = to.x;
            y2 = to.y + NODE_H / 2;
          } else {
            x1 = from.x + NODE_W / 2;
            y1 = from.y + NODE_H;
            x2 = to.x + NODE_W / 2;
            y2 = to.y;
          }
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;
          return (
            <g key={`edge-${idx}`}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#9CA3AF"
                strokeWidth={1.5}
                markerEnd="url(#flow-arrow)"
              />
              {e.label ? (
                <text
                  x={midX}
                  y={midY - 6}
                  textAnchor="middle"
                  fontSize={11}
                  fill="#6B7280"
                  style={{ paintOrder: "stroke", stroke: "#fff", strokeWidth: 3 }}
                >
                  {e.label}
                </text>
              ) : null}
            </g>
          );
        })}
        {/* nodes */}
        {nodes.map((n) => {
          const pos = positions.get(n.id);
          if (!pos) return null;
          const tone = n.tone ?? "blue";
          const hex = TONE_HEX[tone];
          const isCurrent = currentNodeId === n.id;
          return (
            <g key={n.id} transform={`translate(${pos.x}, ${pos.y})`}>
              {isCurrent ? (
                <rect
                  x={-3}
                  y={-3}
                  width={NODE_W + 6}
                  height={NODE_H + 6}
                  rx={10}
                  ry={10}
                  fill="none"
                  stroke={hex.v500}
                  strokeWidth={2}
                  opacity={0.5}
                >
                  <animate
                    attributeName="opacity"
                    values="0.2;0.7;0.2"
                    dur="1.6s"
                    repeatCount="indefinite"
                  />
                </rect>
              ) : null}
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                ry={8}
                fill={isCurrent ? hex.v500 : hex.v50}
                stroke={hex.v500}
                strokeWidth={isCurrent ? 2 : 1}
              />
              <text
                x={NODE_W / 2}
                y={NODE_H / 2 + 4}
                textAnchor="middle"
                fontSize={12.5}
                fontWeight={600}
                fill={isCurrent ? "#FFFFFF" : hex.v700}
              >
                {n.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default FlowDiagram;
