"use client";

import { useEffect, useMemo, useState } from "react";

import type { DataGridColumn } from "./data-grid";

export type ColumnVisibility = Record<string, boolean>;

const PREFIX = "data-grid:v1:";

function buildDefault<T>(columns: DataGridColumn<T>[]): ColumnVisibility {
  const m: ColumnVisibility = {};
  for (const c of columns) m[c.id] = !c.defaultHidden;
  return m;
}

export function useColumnVisibility<T>(
  persistKey: string,
  columns: DataGridColumn<T>[],
): [ColumnVisibility, (next: ColumnVisibility) => void] {
  const initial = useMemo(() => buildDefault(columns), [columns]);
  const [visibility, setVisibility] = useState<ColumnVisibility>(initial);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFIX + persistKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ColumnVisibility;
      const cleaned: ColumnVisibility = {};
      for (const c of columns) {
        cleaned[c.id] = parsed[c.id] ?? !c.defaultHidden;
      }
      setVisibility(cleaned);
    } catch {
      // Corrupt JSON or no localStorage; fall back to defaults
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [persistKey]);

  const update = (next: ColumnVisibility) => {
    setVisibility(next);
    try {
      window.localStorage.setItem(PREFIX + persistKey, JSON.stringify(next));
    } catch {
      // localStorage 滿 / 無權限 — 失敗時還是更新 in-memory state，刷頁會回到預設
    }
  };

  return [visibility, update];
}
