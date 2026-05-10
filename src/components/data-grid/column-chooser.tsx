"use client";

import { useEffect, useRef, useState } from "react";

import type { DataGridColumn } from "./data-grid";
import type { ColumnVisibility } from "./use-column-state";

export function ColumnChooser<T>({
  columns,
  visibility,
  onChange,
}: {
  columns: DataGridColumn<T>[];
  visibility: ColumnVisibility;
  onChange: (next: ColumnVisibility) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onClick);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("mousedown", onClick);
      window.removeEventListener("keydown", onEsc);
    };
  }, [open]);

  const visibleCount = columns.filter((c) => visibility[c.id] !== false).length;
  const total = columns.length;

  const toggle = (id: string) => {
    const current = visibility[id] !== false;
    onChange({ ...visibility, [id]: !current });
  };

  const reset = () => {
    const next: ColumnVisibility = {};
    for (const c of columns) next[c.id] = !c.defaultHidden;
    onChange(next);
  };

  const showAll = () => {
    const next: ColumnVisibility = {};
    for (const c of columns) next[c.id] = true;
    onChange(next);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="h-[26px] px-2.5 rounded text-[11.5px] bg-white border border-[#D5D3CB] text-[#5A5955] hover:border-[#9A9890] inline-flex items-center gap-1.5"
        title="選擇要顯示的欄位"
      >
        <span aria-hidden>⚙</span>
        <span>欄位</span>
        <span className="text-[#9A9890]">
          ({visibleCount}/{total})
        </span>
      </button>
      {open && (
        <div className="absolute right-0 top-[30px] z-30 w-[240px] bg-white border border-[#EEECE6] rounded-lg shadow-lg">
          <div className="px-3 py-2 border-b border-[#EEECE6] flex items-center justify-between">
            <span className="text-[12px] font-semibold text-[#2C2C2A]">顯示欄位</span>
            <div className="flex items-center gap-2">
              <button
                onClick={showAll}
                className="text-[11px] text-[#185FA5] hover:underline"
                type="button"
              >
                全選
              </button>
              <button
                onClick={reset}
                className="text-[11px] text-[#185FA5] hover:underline"
                type="button"
              >
                重置
              </button>
            </div>
          </div>
          <div className="max-h-[320px] overflow-y-auto py-1">
            {columns.map((c) => {
              const hideable = c.hideable !== false;
              const checked = visibility[c.id] !== false;
              return (
                <label
                  key={c.id}
                  className={`flex items-center gap-2 px-3 py-1.5 text-[12px] ${
                    hideable
                      ? "cursor-pointer hover:bg-[#F8F7F4]"
                      : "opacity-50 cursor-not-allowed"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!hideable}
                    onChange={() => hideable && toggle(c.id)}
                    className="accent-[#1A3A5C]"
                  />
                  <span className="text-[#2C2C2A]">{c.header}</span>
                  {!hideable && (
                    <span className="ml-auto text-[10px] text-[#9A9890]">必顯</span>
                  )}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
