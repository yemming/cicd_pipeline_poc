/**
 * KanbanBoard — HTML5 drag-drop 看板。
 *
 * 不依賴 dnd-kit；列拖到別列觸發 `onMove(cardId, fromColumn, toColumn)`。
 * 拖曳中卡片 opacity-50；放置目標 column 加亮邊框。
 */

"use client";

import type { ReactNode } from "react";
import { useState, type DragEvent } from "react";
import { TONE_CLASSES, cn, type ToneKey } from "./tone";

export interface KanbanColumn {
  id: string;
  title: string;
  tone?: ToneKey;
}

export interface KanbanCard {
  id: string;
  columnId: string;
  content: ReactNode;
}

export interface KanbanBoardProps {
  columns: KanbanColumn[];
  cards: KanbanCard[];
  onMove?: (cardId: string, fromColumn: string, toColumn: string) => void | Promise<void>;
  className?: string;
}

export function KanbanBoard({ columns, cards, onMove, className }: KanbanBoardProps) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [overColId, setOverColId] = useState<string | null>(null);

  function handleDragStart(e: DragEvent<HTMLDivElement>, cardId: string) {
    setDraggingId(cardId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", cardId);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setOverColId(null);
  }

  function handleDragOver(e: DragEvent<HTMLDivElement>, colId: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overColId !== colId) setOverColId(colId);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>, toColId: string) {
    e.preventDefault();
    const cardId = e.dataTransfer.getData("text/plain") || draggingId;
    setDraggingId(null);
    setOverColId(null);
    if (!cardId) return;
    const card = cards.find((c) => c.id === cardId);
    if (!card) return;
    if (card.columnId === toColId) return;
    void onMove?.(cardId, card.columnId, toColId);
  }

  return (
    <div className={cn("flex gap-3 overflow-x-auto", className)}>
      {columns.map((col) => {
        const colCards = cards.filter((c) => c.columnId === col.id);
        const tone = col.tone ?? "gray";
        const t = TONE_CLASSES[tone];
        const isOver = overColId === col.id;
        return (
          <div
            key={col.id}
            className={cn(
              "min-w-[240px] w-[260px] shrink-0 rounded-lg border bg-tone-gray-50 flex flex-col",
              isOver ? cn(t.border500, "ring-2 ring-offset-1", t.shadowTone) : "border-tone-gray-100",
            )}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDrop={(e) => handleDrop(e, col.id)}
          >
            <div className={cn("px-3 py-2 flex items-center justify-between border-b border-tone-gray-100")}>
              <span className={cn("text-[12.5px] font-semibold", t.text700)}>{col.title}</span>
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded-md text-[11px] font-medium border",
                  t.bg50,
                  t.text700,
                  t.border100,
                )}
              >
                {colCards.length}
              </span>
            </div>
            <div className="p-2 flex flex-col gap-2 min-h-[80px]">
              {colCards.map((card) => (
                <div
                  key={card.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, card.id)}
                  onDragEnd={handleDragEnd}
                  className={cn(
                    "bg-white border border-tone-gray-100 rounded-md px-3 py-2 text-[12px] cursor-move hover-lift",
                    draggingId === card.id ? "opacity-50" : "",
                  )}
                >
                  {card.content}
                </div>
              ))}
              {colCards.length === 0 ? (
                <div className="text-[11px] text-tone-gray-500 text-center py-4">無卡片</div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default KanbanBoard;
